#!/usr/bin/env python3
"""Extrae los lugares con nombre de un extracto .osm.pbf de Bolivia (Geofabrik).

    python extract_osm_places.py --pbf bolivia-latest.osm.pbf --out <dir> \
        --snapshot 2026-10-26T21:24:46Z --retrieved 2026-10-27T18:37:00Z

Tres pasadas sobre el pbf:
  1. relaciones: qué relaciones son lugares y qué miembros hacen falta para su centroide;
  2. todo, con ubicaciones y áreas (multipolígonos): lugares, calles con nombre,
     límites administrativos (niveles 4, 6 y 8), poblados (place=*);
  3. en memoria: centroides de relaciones, departamento/provincia/municipio por
     punto en polígono, localidad por poblado más cercano y dirección inferida por
     la calle con nombre más cercana a menos de 50 m.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path

import numpy as np
import osmium
import shapely
from shapely import wkb
from shapely.geometry import LineString, MultiPoint, Point, Polygon

PRIMARY_KEYS = ('amenity', 'shop', 'office', 'craft', 'healthcare', 'tourism', 'leisure',
                'emergency', 'public_transport', 'aeroway', 'industrial')
STREET_CLASSES = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
                  'residential', 'living_street', 'pedestrian', 'service', 'road',
                  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
SETTLEMENT_RADIUS_M = {'city': 15000, 'town': 6000, 'village': 3000, 'hamlet': 1500}
INFER_MAX_M = 50.0
EDIT_CUTOFF = '2026-09-24T00:00:00Z'  # «después del 2026-09-23»

DEPARTMENT_BY_ISO = {
    'BO-B': ('Beni', 'BENI'), 'BO-H': ('Chuquisaca', 'CHUQUISACA'), 'BO-C': ('Cochabamba', 'COCHABAMBA'),
    'BO-L': ('La Paz', 'LA_PAZ'), 'BO-O': ('Oruro', 'ORURO'), 'BO-N': ('Pando', 'PANDO'),
    'BO-P': ('Potosí', 'POTOSI'), 'BO-S': ('Santa Cruz', 'SANTA_CRUZ'), 'BO-T': ('Tarija', 'TARIJA'),
}


def place_name(tags) -> str | None:
    for key in ('name', 'name:es', 'official_name'):
        value = (tags.get(key) or '').strip()
        if value:
            return value
    return None


def categories(tags) -> list[str]:
    found = []
    for key in PRIMARY_KEYS:
        value = tags.get(key)
        if value:
            found.append(f'{key}={value}')
    if tags.get('railway') == 'station':
        found.append('railway=station')
    if tags.get('man_made') == 'works':
        found.append('man_made=works')
    if tags.get('building') and tags.get('building') != 'no':
        found.append(f"building={tags.get('building')}")
    return found


def is_place(tags) -> bool:
    if tags.get('boundary') == 'administrative':
        return False
    return bool(place_name(tags)) and bool(categories(tags))


def iso(ts) -> str:
    return ts.strftime('%Y-%m-%dT%H:%M:%SZ')


def way_coords(way):
    coords = []
    for node in way.nodes:
        try:
            coords.append((node.lon, node.lat))
        except osmium.InvalidLocationError:
            return None
    return coords


def way_centroid(coords):
    if not coords:
        return None, None
    if len(coords) >= 4 and coords[0] == coords[-1]:
        poly = Polygon(coords)
        if poly.is_valid and poly.area > 0:
            c = poly.centroid
            if not poly.contains(c):
                c = poly.representative_point()
            return (c.x, c.y), 'polygon'
    if len(coords) == 1:
        return coords[0], 'point'
    line = LineString(coords)
    c = line.centroid
    return (c.x, c.y), 'line'


def haversine_m(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * np.arcsin(np.sqrt(a))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--pbf', required=True)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--retrieved', required=True)
    parser.add_argument('--split-mb', type=float, default=90.0)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    log = lambda *a: print(*a, file=sys.stderr, flush=True)

    # ---- pasada 1: relaciones ----
    rel_members: dict[int, list[tuple[str, int]]] = {}
    need_nodes, need_ways = set(), set()
    admin8_rels: dict[int, str] = {}
    for rel in osmium.FileProcessor(args.pbf, osmium.osm.RELATION):
        if rel.tags.get('boundary') == 'administrative' and rel.tags.get('admin_level') == '8':
            admin8_rels[rel.id] = rel.tags.get('name')
        if is_place(rel.tags):
            members = [(m.type, m.ref) for m in rel.members if m.type in ('n', 'w')]
            rel_members[rel.id] = members
            for t, ref in members:
                (need_nodes if t == 'n' else need_ways).add(ref)
    log(f'relaciones-lugar: {len(rel_members)}')

    # ---- pasada 2: todo ----
    places: dict[tuple[str, int], dict] = {}
    member_pts: dict[tuple[str, int], tuple[float, float]] = {}
    area_centroid: dict[int, tuple[float, float]] = {}
    streets_geom, streets_meta = [], []
    settlements = []
    admin = {4: [], 6: [], 8: []}
    wkbfab = osmium.geom.WKBFactory()

    def record(kind, obj, lonlat, geom_kind):
        tags = {t.k: t.v for t in obj.tags}
        places[(kind, obj.id)] = {
            'osm_type': {'n': 'node', 'w': 'way', 'r': 'relation'}[kind],
            'osm_id': obj.id,
            'version': obj.version,
            'timestamp': iso(obj.timestamp),
            'tags': tags,
            'lonlat': lonlat,
            'geom_kind': geom_kind,
        }

    area_filter = osmium.filter.KeyFilter(*PRIMARY_KEYS, 'railway', 'man_made', 'building', 'boundary')
    storage = f'sparse_file_array,{args.out / "nodes.idx"}'
    fp = osmium.FileProcessor(args.pbf).with_locations(storage).with_areas(area_filter)
    n_seen = 0
    for obj in fp:
        n_seen += 1
        if n_seen % 5_000_000 == 0:
            log(f'  {n_seen:,} objetos')
        if obj.is_node():
            tags = obj.tags
            if is_place(tags):
                record('n', obj, (obj.location.lon, obj.location.lat), 'point')
            if obj.id in need_nodes:
                member_pts[('n', obj.id)] = (obj.location.lon, obj.location.lat)
            place = tags.get('place')
            if place in SETTLEMENT_RADIUS_M and tags.get('name'):
                settlements.append((tags.get('name'), place, obj.location.lon, obj.location.lat))
        elif obj.is_way():
            tags = obj.tags
            poi = is_place(tags)
            street = tags.get('highway') in STREET_CLASSES and bool(tags.get('name'))
            member = obj.id in need_ways
            if not (poi or street or member):
                continue
            coords = way_coords(obj)
            if not coords:
                continue
            if poi or member:
                centroid, kind = way_centroid(coords)
                if poi:
                    record('w', obj, centroid, kind)
                if member:
                    member_pts[('w', obj.id)] = centroid
            if street and len(coords) >= 2:
                streets_geom.append(LineString(coords))
                streets_meta.append((tags.get('name').strip(), obj.id, tags.get('highway')))
        elif obj.is_relation():
            if obj.id in rel_members:
                record('r', obj, None, None)
        elif obj.is_area():
            if obj.from_way():
                continue
            rid = obj.orig_id()
            tags = obj.tags
            is_admin = tags.get('boundary') == 'administrative' and tags.get('admin_level') in ('4', '6', '8')
            if rid not in rel_members and not is_admin:
                continue
            try:
                geom = wkb.loads(wkbfab.create_multipolygon(obj), hex=True)
            except Exception:
                continue
            if rid in rel_members:
                c = geom.centroid
                if not geom.contains(c):
                    c = geom.representative_point()
                area_centroid[rid] = (c.x, c.y)
            if is_admin:
                admin[int(tags.get('admin_level'))].append({
                    'rel': rid, 'name': tags.get('name'), 'iso': tags.get('ISO3166-2'),
                    'geom': geom,
                })
    log(f'objetos: {n_seen:,}; lugares: {len(places):,}; calles: {len(streets_geom):,}; '
        f'poblados: {len(settlements):,}; límites: { {k: len(v) for k, v in admin.items()} }')

    # ---- centroides de relaciones ----
    rel_without = 0
    for (kind, oid), row in places.items():
        if kind != 'r':
            continue
        if oid in area_centroid:
            row['lonlat'], row['geom_kind'] = area_centroid[oid], 'multipolygon'
            continue
        pts = [member_pts[m] for m in rel_members[oid] if m in member_pts and member_pts[m]]
        if pts:
            c = MultiPoint(pts).centroid
            row['lonlat'], row['geom_kind'] = (c.x, c.y), 'members'
        else:
            rel_without += 1
    log(f'relaciones sin geometría: {rel_without}')

    rows = [r for r in places.values() if r['lonlat']]
    keys = list(places)
    points = shapely.points([r['lonlat'] for r in rows])
    lon = np.array([r['lonlat'][0] for r in rows])
    lat = np.array([r['lonlat'][1] for r in rows])

    # ---- departamentos (ISO BO-*) ----
    deps = [d for d in admin[4] if (d['iso'] or '') in DEPARTMENT_BY_ISO]
    log('departamentos:', sorted(d['iso'] for d in deps))
    dep_union = shapely.union_all([d['geom'] for d in deps])
    dep_tree = shapely.STRtree([d['geom'] for d in deps])
    dep_idx = np.full(len(rows), -1)
    pi, gi = dep_tree.query(points, predicate='intersects')
    dep_idx[pi] = gi
    # Sin acercar al más cercano: los límites de Bolivia son de tierra y río, y a 1 km
    # del borde están Guajará-Mirim o Assis Brasil, que son del Brasil.
    inside_bo = dep_idx >= 0
    log(f'fuera de Bolivia: {(~inside_bo).sum()}')

    def assign(level):
        items = admin[level]
        items = [it for it in items if dep_union.intersects(it['geom'].representative_point())]
        tree = shapely.STRtree([it['geom'] for it in items])
        idx = np.full(len(rows), -1)
        a, b = tree.query(points, predicate='intersects')
        idx[a] = b
        return items, idx
    mun_items, mun_idx = assign(8)
    assembled = {it['rel'] for it in admin[8]}
    broken = sorted((name or '?', rid) for rid, name in admin8_rels.items() if rid not in assembled)
    log(f'municipios OSM sin polígono armable: {broken}')
    prov_items, prov_idx = assign(6)
    log(f'municipios: {len(mun_items)}; provincias: {len(prov_items)}')

    # ---- localidad por poblado más cercano ----
    set_pts = shapely.points([(s[2], s[3]) for s in settlements])
    set_tree = shapely.STRtree(set_pts)
    a, b = set_tree.query(points, predicate='dwithin', distance=0.15)
    d = haversine_m(lon[a], lat[a], np.array([s[2] for s in settlements])[b], np.array([s[3] for s in settlements])[b])
    radius = np.array([SETTLEMENT_RADIUS_M[settlements[j][1]] for j in b]) if len(b) else np.array([])
    ok = d <= radius
    score = d / np.where(radius > 0, radius, 1)
    best_loc = {}
    for i, j, s, okk, dist in zip(a, b, score, ok, d):
        if okk and (i not in best_loc or s < best_loc[i][1]):
            best_loc[i] = (j, s, dist)

    # ---- dirección inferida ----
    def has_addr(tags):
        return bool(tags.get('addr:street') or tags.get('addr:full'))
    need = np.array([i for i, r in enumerate(rows) if not has_addr(r['tags'])], dtype=int)
    st_tree = shapely.STRtree(streets_geom)
    a, b = st_tree.query(points[need], predicate='dwithin', distance=0.0008)
    lines = np.array(streets_geom, dtype=object)[b]
    short = shapely.shortest_line(lines, points[need][a])
    sc = shapely.get_coordinates(short).reshape(-1, 2, 2)
    dist = haversine_m(sc[:, 0, 0], sc[:, 0, 1], sc[:, 1, 0], sc[:, 1, 1]) if len(sc) else np.array([])
    inferred = {}
    for ai, bi, dm in zip(a, b, dist):
        i = need[ai]
        if dm <= INFER_MAX_M and (i not in inferred or dm < inferred[i][1]):
            inferred[i] = (bi, dm)
    log(f'sin dirección: {len(need):,}; inferida: {len(inferred):,}')

    # ---- salida ----
    stats = {
        'total': 0, 'outside_bolivia_dropped': int((~inside_bo).sum()),
        'relations_without_geometry': rel_without,
        'municipal_relations_not_assembled': [{'name': n, 'relation': r} for n, r in broken],
        'by_osm_type': collections.Counter(), 'by_department': collections.Counter(),
        'by_department_edited_after': collections.Counter(),
        'by_tag': collections.Counter(), 'by_primary_tag': collections.Counter(),
        'by_primary_key': collections.Counter(),
        'with_address_tagged': 0, 'with_address_inferred': 0, 'with_housenumber': 0,
        'with_hours': 0, 'with_phone': 0, 'with_website': 0, 'with_brand': 0, 'with_check_date': 0,
        'with_municipality': 0, 'with_locality': 0,
        'edited_after_cutoff': 0, 'created_after_cutoff': 0,
        'edited_after_by_primary_tag': collections.Counter(),
        'by_year_last_edit': collections.Counter(),
    }
    part, part_rows, part_bytes = 0, 0, 0
    files = []

    def open_part(p):
        path = args.out / f'osm-places-{p:03d}.ndjson.gz'
        files.append(path)
        return path, open(path, 'wb')
    path, raw_handle = open_part(part)
    gz = gzip.GzipFile(fileobj=raw_handle, mode='wb', compresslevel=9, mtime=0)
    limit = int(args.split_mb * 1024 * 1024)

    order = sorted(range(len(rows)), key=lambda i: ({'node': 0, 'way': 1, 'relation': 2}[rows[i]['osm_type']], rows[i]['osm_id']))
    for i in order:
        if not inside_bo[i]:
            continue
        r = rows[i]
        t = r['tags']
        cats = categories(t)
        dep_name, dep_code = DEPARTMENT_BY_ISO[deps[dep_idx[i]]['iso']]
        mun_osm = mun_items[mun_idx[i]]['name'] if mun_idx[i] >= 0 else None
        mun = re.sub(r'^Municipio\s+(de\s+)?', '', mun_osm) if mun_osm else None
        prov = prov_items[prov_idx[i]]['name'] if prov_idx[i] >= 0 else None
        street = t.get('addr:street') or None
        housenumber = t.get('addr:housenumber') or None
        address_inferred = False
        inferred_meta = None
        if t.get('addr:full') and not street:
            address = t['addr:full']
        elif street:
            address = f'{street} {housenumber}'.strip() if housenumber else street
        elif i in inferred:
            bi, dm = inferred[i]
            sname, sid, sclass = streets_meta[bi]
            address = sname
            address_inferred = True
            inferred_meta = {'street_osm_way_id': sid, 'street_highway': sclass, 'distance_m': round(float(dm), 1)}
        else:
            address = t.get('addr:place') or None
        locality, locality_source = None, None
        if t.get('addr:city'):
            locality, locality_source = t['addr:city'], 'addr:city'
        elif i in best_loc:
            j, _, dloc = best_loc[i]
            locality, locality_source = settlements[j][0], f'nearest place={settlements[j][1]} ({round(float(dloc))} m)'
        phone = t.get('phone') or t.get('contact:phone') or t.get('mobile') or t.get('contact:mobile') or None
        website = t.get('website') or t.get('contact:website') or t.get('url') or None
        hours = t.get('opening_hours') or None
        contact = {k: v for k, v in t.items() if k.startswith('contact:') or k in ('phone', 'mobile', 'email', 'fax', 'website', 'url')}
        lo, la = r['lonlat']
        src_id = f"{r['osm_type']}/{r['osm_id']}"
        out_row = {
            'source': 'openstreetmap',
            'source_id': src_id,
            'name': place_name(t),
            'category_raw': cats[0],
            'address': address,
            'locality': locality,
            'municipality': mun,
            'department': dep_name,
            'lat': round(la, 7),
            'lon': round(lo, 7),
            'phone': phone,
            'website': website,
            'hours': hours,
            'source_updated_at': r['timestamp'],
            'source_url': f'https://www.openstreetmap.org/{src_id}',
            'retrieved_at': args.retrieved,
            # campos propios de OSM
            'osm_type': r['osm_type'],
            'osm_id': r['osm_id'],
            'osm_version': r['version'],
            'categories_all': cats,
            'department_code': dep_code,
            'municipality_osm_name': mun_osm,
            'province': prov,
            'locality_source': locality_source,
            'addr_street': street,
            'addr_housenumber': housenumber,
            'addr_city': t.get('addr:city'),
            'addr_suburb': t.get('addr:suburb'),
            'addr_postcode': t.get('addr:postcode'),
            'address_inferred': address_inferred,
            'address_inferred_from': inferred_meta,
            'brand': t.get('brand'),
            'operator': t.get('operator'),
            'email': t.get('email') or t.get('contact:email'),
            'contact': contact or None,
            'check_date': t.get('check_date') or t.get('survey:date'),
            'geometry_kind': r['geom_kind'],
            'edited_after_2026_09_23': r['timestamp'] >= EDIT_CUTOFF,
            'snapshot_at': args.snapshot,
            'license': 'ODbL-1.0',
            'raw': {'type': r['osm_type'], 'id': r['osm_id'], 'version': r['version'],
                    'timestamp': r['timestamp'], 'tags': t},
        }
        line = (json.dumps(out_row, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        gz.write(line)
        part_rows += 1
        if raw_handle.tell() > limit:
            gz.close(); raw_handle.close()
            part += 1
            path, raw_handle = open_part(part)
            gz = gzip.GzipFile(fileobj=raw_handle, mode='wb', compresslevel=9, mtime=0)

        s = stats
        s['total'] += 1
        s['by_osm_type'][r['osm_type']] += 1
        s['by_department'][dep_name] += 1
        for c in cats:
            s['by_tag'][c] += 1
        s['by_primary_tag'][cats[0]] += 1
        s['by_primary_key'][cats[0].split('=')[0]] += 1
        s['with_address_tagged'] += bool(street or t.get('addr:full'))
        s['with_address_inferred'] += address_inferred
        s['with_housenumber'] += bool(housenumber)
        s['with_hours'] += bool(hours)
        s['with_phone'] += bool(phone)
        s['with_website'] += bool(website)
        s['with_brand'] += bool(t.get('brand'))
        s['with_check_date'] += bool(out_row['check_date'])
        s['with_municipality'] += bool(mun)
        s['with_locality'] += bool(locality)
        s['by_year_last_edit'][r['timestamp'][:4]] += 1
        if out_row['edited_after_2026_09_23']:
            s['edited_after_cutoff'] += 1
            s['by_department_edited_after'][dep_name] += 1
            s['edited_after_by_primary_tag'][cats[0]] += 1
            if r['version'] == 1:
                s['created_after_cutoff'] += 1
    gz.close(); raw_handle.close()

    for k, v in list(stats.items()):
        if isinstance(v, collections.Counter):
            stats[k] = dict(v.most_common())
    (args.out / 'stats.json').write_text(json.dumps(stats, ensure_ascii=False, indent=1), 'utf-8')
    log(json.dumps({k: v for k, v in stats.items() if not isinstance(v, dict)}, indent=1))
    log('archivos:', [str(f) for f in files])


if __name__ == '__main__':
    main()
