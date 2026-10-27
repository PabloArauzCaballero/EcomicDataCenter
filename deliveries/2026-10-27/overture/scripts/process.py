"""Recorta Overture a Bolivia por poligono, normaliza, compara con la entrega anterior y escribe NDJSON.gz.

python -P process.py <data_dir> <codab_dir> <municipalities_catalogue.json> <out_dir>
"""
import collections, csv, datetime as dt, gzip, json, os, sys
import duckdb, numpy as np, shapely
from shapely import wkb

DATA, CODAB, MUNICAT, OUT = sys.argv[1:5]
REL, PREV = '2026-10-21.0', '2026-09-23.0'
REL_URI = f's3://overturemaps-us-west-2/release/{REL}/theme=places/type=place/'
PREV_URI = f's3://overturemaps-us-west-2/release/{PREV}/theme=places/type=place/'
MATCH_M = 150


def mtime_utc(path):
    return dt.datetime.fromtimestamp(os.path.getmtime(path), dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


c = duckdb.connect()
c.execute("LOAD spatial; SET memory_limit='2GB'; SET threads=6; SET enable_progress_bar=false;")
c.execute(f"CREATE TABLE div AS SELECT * FROM read_parquet('{DATA}/division_area_BO_{REL}.parquet')")
c.execute(f"CREATE TABLE cur_raw AS SELECT * FROM read_parquet('{DATA}/places_bbox_{REL}.parquet')")
c.execute(f"CREATE TABLE prev_raw AS SELECT * FROM read_parquet('{DATA}/places_bbox_{PREV}.parquet')")
c.execute(f"CREATE TABLE addr_raw AS SELECT * FROM read_parquet('{DATA}/addresses_bbox_{REL}.parquet')")
RETRIEVED = {'cur': mtime_utc(f'{DATA}/places_bbox_{REL}.parquet'),
             'prev': mtime_utc(f'{DATA}/places_bbox_{PREV}.parquet'),
             'addr': mtime_utc(f'{DATA}/addresses_bbox_{REL}.parquet')}

# --- poligonos -------------------------------------------------------------
country = wkb.loads(bytes(c.execute("SELECT ST_AsWKB(geometry) FROM div WHERE subtype='country'").fetchone()[0]))
shapely.prepare(country)
regions = c.execute("SELECT names.primary, region, ST_AsWKB(geometry) FROM div WHERE subtype='region' ORDER BY region").fetchall()
reg_geoms = [wkb.loads(bytes(g)) for _, _, g in regions]
for g in reg_geoms:
    shapely.prepare(g)
adm3 = c.execute(f"SELECT adm3_name, adm3_pcode, adm2_name, adm1_name, ST_AsWKB(geom) FROM ST_Read('{CODAB}/bol_admin3.geojson') ORDER BY adm3_pcode").fetchall()
adm3_geoms = np.array([wkb.loads(bytes(r[4])) for r in adm3])
tree = shapely.STRtree(adm3_geoms)
catalogue = {m['code']: m for m in json.load(open(MUNICAT, encoding='utf-8'))['municipalities']}


def locate(table, key):
    rows = c.execute(f"SELECT id, ST_X(geometry), ST_Y(geometry) FROM {table}").fetchall()
    ids = [r[0] for r in rows]
    xs = np.array([r[1] for r in rows], dtype=float)
    ys = np.array([r[2] for r in rows], dtype=float)
    inside = shapely.contains_xy(country, xs, ys)
    pts = shapely.points(xs, ys)
    muni = np.full(len(ids), -1)
    method = np.array([''] * len(ids), dtype=object)
    sel = np.nonzero(inside)[0]
    pi, gi = tree.query(pts[sel], predicate='within')
    for a, b in zip(pi[::-1], gi[::-1]):
        muni[sel[a]] = b
    method[sel[pi]] = 'poligono_cod_ab'
    miss = sel[muni[sel] < 0]
    if len(miss):
        qi, qg = tree.query_nearest(pts[miss], max_distance=0.03)
        for a, b in zip(qi, qg):
            if muni[miss[a]] < 0:
                muni[miss[a]] = b
                method[miss[a]] = 'cod_ab_mas_cercano_3km'
    region = np.full(len(ids), -1)
    for k, g in enumerate(reg_geoms):
        hit = sel[shapely.contains_xy(g, xs[sel], ys[sel])]
        region[hit] = k
    path = f'{DATA}/loc_{key}.csv'
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['id', 'inside', 'lon', 'lat', 'municipality', 'municipality_code', 'municipality_layer_name',
                    'province', 'department_codab', 'department_overture', 'department_iso', 'location_method'])
        for i, pid in enumerate(ids):
            m = adm3[muni[i]] if muni[i] >= 0 else None
            code = m[1][2:] if m else None
            cat = catalogue.get(code) if code else None
            r = regions[region[i]] if region[i] >= 0 else None
            w.writerow([pid, bool(inside[i]), repr(float(xs[i])), repr(float(ys[i])),
                        (cat['name'] if cat else (m[0] if m else '')), code or '', m[0] if m else '',
                        m[2] if m else '', m[3] if m else '', r[0] if r else '', r[1] if r else '', method[i]])
    c.execute(f"CREATE TABLE loc_{key} AS SELECT * FROM read_csv('{path}', header=true, all_varchar=true)")
    c.execute(f"ALTER TABLE loc_{key} ALTER inside TYPE BOOLEAN USING inside::BOOLEAN")
    print(key, len(ids), 'dentro', int(inside.sum()), flush=True)


locate('cur_raw', 'cur')
locate('prev_raw', 'prev')
locate('addr_raw', 'addr')

for t in ('cur_raw', 'prev_raw'):
    c.execute(f"CREATE TABLE {t}_ng AS SELECT * EXCLUDE (geometry) FROM {t}")

addr_inside = c.execute("SELECT count(*) FROM loc_addr WHERE inside").fetchone()[0]

# --- normalizacion --------------------------------------------------------
c.execute(r"""
CREATE MACRO nn(x) AS trim(regexp_replace(lower(strip_accents(coalesce(x, ''))), '[^a-z0-9]+', ' ', 'g'));
CREATE MACRO blank(x) AS CASE WHEN x IS NULL OR trim(x) = '' OR lower(trim(x)) IN ('unnamed road', 'null', 'none') THEN NULL ELSE trim(x) END;
CREATE MACRO hav(la1, lo1, la2, lo2) AS 2 * 6371008.8 * asin(sqrt(
  pow(sin(radians(la2 - la1) / 2), 2) + cos(radians(la1)) * cos(radians(la2)) * pow(sin(radians(lo2 - lo1) / 2), 2)));
""")
for key, src in (('cur', 'cur_raw'), ('prev', 'prev_raw')):
    c.execute(f"""
    CREATE TABLE {key} AS
    SELECT r.id, r.names.primary AS name, nn(r.names.primary) AS name_norm,
           r.taxonomy.primary AS category_raw, r.confidence,
           blank(r.addresses[1].freeform) AS address, blank(r.addresses[1].locality) AS locality,
           nn(coalesce(blank(r.addresses[1].freeform), '') || ' ' || coalesce(blank(r.addresses[1].locality), '')) AS addr_norm,
           l.inside, l.lon::DOUBLE AS lon, l.lat::DOUBLE AS lat
    FROM {src} r JOIN loc_{key} l USING (id)
    """)

# pares: mismo id, o mismo nombre normalizado a menos de 150 m
c.execute(f"""
CREATE TABLE pairs AS
WITH a AS (SELECT * FROM cur WHERE inside), b AS (SELECT * FROM prev WHERE inside)
SELECT a.id AS cid, b.id AS pid, (a.id = b.id) AS same_id, hav(a.lat, a.lon, b.lat, b.lon) AS dist
FROM a JOIN b ON a.id = b.id
UNION
SELECT a.id, b.id, (a.id = b.id), hav(a.lat, a.lon, b.lat, b.lon)
FROM a JOIN b ON a.name_norm = b.name_norm AND a.name_norm <> ''
 AND abs(a.lat - b.lat) < 0.0014 AND abs(a.lon - b.lon) < 0.0016
WHERE hav(a.lat, a.lon, b.lat, b.lon) < {MATCH_M}
""")
c.execute("""
CREATE TABLE best AS
SELECT * FROM (
  SELECT p.*, row_number() OVER (PARTITION BY cid ORDER BY same_id DESC, dist, pid) AS rk FROM pairs p) WHERE rk = 1
""")
c.execute("""
CREATE TABLE cmp AS
SELECT a.id,
  CASE WHEN b.cid IS NULL THEN 'nuevo' WHEN b.same_id THEN 'mismo_id' ELSE 'mismo_nombre_menos_150m' END AS status,
  b.pid AS prev_id, round(b.dist, 1) AS prev_distance_m,
  CASE WHEN b.cid IS NULL THEN NULL ELSE coalesce(a.addr_norm, '') <> coalesce(p.addr_norm, '') END AS address_changed,
  CASE WHEN b.cid IS NULL THEN NULL ELSE coalesce(a.category_raw, '') <> coalesce(p.category_raw, '') END AS category_changed,
  CASE WHEN b.cid IS NULL THEN NULL ELSE coalesce(a.name, '') <> coalesce(p.name, '') END AS name_changed,
  p.address AS prev_address, p.category_raw AS prev_category, p.name AS prev_name
FROM cur a LEFT JOIN best b ON a.id = b.cid LEFT JOIN prev p ON p.id = b.pid
WHERE a.inside
""")
c.execute("CREATE TABLE gone AS SELECT b.id FROM prev b WHERE b.inside AND b.id NOT IN (SELECT pid FROM pairs)")

# --- escritura ------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
PART_ROWS = 10**9  # se parte despues si pasa de 90 MB


def rows_for(key, src, uri, where, extra_join=''):
    q = f"""
    SELECT r.id, r.names.primary, r.taxonomy, r.basic_category, r.confidence, r.addresses, r.phones, r.websites,
           r.socials, r.emails, r.brand, r.sources, r.operating_status, l.*,
           to_json(ng) AS raw
           {', cmp.*' if extra_join else ''}
    FROM {src} r JOIN loc_{key} l USING (id) JOIN {src}_ng ng ON ng.id = r.id {extra_join}
    WHERE {where} ORDER BY r.id
    """
    return q


def norm(v):
    if v is None:
        return None
    v = str(v).strip()
    return None if v == '' or v.lower() in ('unnamed road', 'null', 'none', '<<not-applicable>>') else v


def build(rec, uri, retrieved, release):
    (pid, name, tax, basic, conf, addrs, phones, webs, socials, emails, brand, sources, opstat) = rec[:13]
    loc = rec[13:25]
    raw = json.loads(rec[25])
    a0 = addrs[0] if addrs else {}
    srcs = [s for s in (sources or [])]
    upstream = [s for s in srcs if s.get('dataset') != 'Overture']
    times = [s.get('update_time') for s in (upstream or srcs) if s.get('update_time')]
    tax = tax or {}
    brand = brand or {}
    return {
        'source': 'overture_places',
        'source_id': pid,
        'name': norm(name),
        'category_raw': tax.get('primary'),
        'address': norm(a0.get('freeform')),
        'locality': norm(a0.get('locality')),
        'municipality': loc[4] or None,
        'department': (loc[8] or loc[9]) or None,
        'lat': round(float(loc[3]), 7),
        'lon': round(float(loc[2]), 7),
        'phone': (phones or [None])[0],
        'website': (webs or [None])[0],
        'hours': None,
        'source_updated_at': max(times) if times else None,
        'source_url': uri,
        'retrieved_at': retrieved,
        'release': release,
        'confidence': conf,
        'category_hierarchy': tax.get('hierarchy'),
        'category_alternates': tax.get('alternates'),
        'basic_category': basic,
        'declared_region': norm(a0.get('region')),
        'declared_postcode': norm(a0.get('postcode')),
        'declared_country': norm(a0.get('country')),
        'addresses': addrs,
        'phones': phones,
        'websites': webs,
        'socials': socials,
        'emails': emails,
        'brand_name': ((brand.get('names') or {}).get('primary')),
        'brand_wikidata': brand.get('wikidata'),
        'operating_status': opstat,
        'sources': [{k: s.get(k) for k in ('dataset', 'record_id', 'update_time', 'confidence', 'license')} for s in srcs],
        'source_datasets': sorted({s.get('dataset') for s in upstream if s.get('dataset')}),
        'municipality_code': loc[5] or None,
        'municipality_layer_name': loc[6] or None,
        'province': loc[7] or None,
        'department_overture': loc[9] or None,
        'department_iso': loc[10] or None,
        'location_method': loc[11] or None,
        'raw': raw,
    }


def write(path, q, uri, retrieved, release, with_cmp=False, status=None):
    n = 0
    with open(path, 'wb') as fb, gzip.GzipFile(filename='', mode='wb', fileobj=fb, mtime=0, compresslevel=9) as gz:
        cur = c.execute(q)
        while True:
            batch = cur.fetchmany(5000)
            if not batch:
                break
            for rec in batch:
                row = build(rec, uri, retrieved, release)
                if with_cmp:
                    cm = rec[26:]
                    row['compare_prev'] = {
                        'release': PREV, 'status': cm[1], 'prev_id': cm[2], 'distance_m': cm[3],
                        'address_changed': cm[4], 'category_changed': cm[5], 'name_changed': cm[6],
                        'prev_address': cm[7], 'prev_category': cm[8], 'prev_name': cm[9]}
                if status:
                    row['compare_status'] = status
                gz.write((json.dumps(row, ensure_ascii=False, separators=(',', ':'), default=str) + '\n').encode('utf-8'))
                n += 1
    print(path, n, os.path.getsize(path), flush=True)
    return n


n_cur = write(f'{OUT}/overture-places-bolivia-{REL}.ndjson.gz',
              rows_for('cur', 'cur_raw', REL_URI, 'l.inside', 'JOIN cmp ON cmp.id = r.id'),
              REL_URI, RETRIEVED['cur'], REL, with_cmp=True)
n_gone = write(f'{OUT}/overture-places-desaparecidos-{PREV}.ndjson.gz',
               rows_for('prev', 'prev_raw', PREV_URI, 'l.inside AND r.id IN (SELECT id FROM gone)'),
               PREV_URI, RETRIEVED['prev'], PREV, status='desaparecido_en_' + REL)

# --- estadisticas ---------------------------------------------------------
S = {}
q1 = lambda s: c.execute(s).fetchone()
q = lambda s: c.execute(s).fetchall()
S['release'] = REL
S['previous_release'] = PREV
S['retrieved_at'] = RETRIEVED
S['bbox_rows'] = q1("SELECT count(*) FROM cur_raw")[0]
S['inside'] = q1("SELECT count(*) FROM loc_cur WHERE inside")[0]
S['outside'] = q1("SELECT count(*) FROM loc_cur WHERE NOT inside")[0]
S['outside_by_declared_country'] = q("SELECT coalesce(r.addresses[1].country,'(sin)'), count(*) FROM cur_raw r JOIN loc_cur l USING(id) WHERE NOT l.inside GROUP BY 1 ORDER BY 2 DESC")
S['inside_by_declared_country'] = q("SELECT coalesce(r.addresses[1].country,'(sin)'), count(*) FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside GROUP BY 1 ORDER BY 2 DESC")
S['prev_bbox_rows'] = q1("SELECT count(*) FROM prev_raw")[0]
S['prev_inside'] = q1("SELECT count(*) FROM loc_prev WHERE inside")[0]
S['location_method'] = q("SELECT location_method, count(*) FROM loc_cur WHERE inside GROUP BY 1 ORDER BY 2 DESC")
S['dept_disagree_codab_vs_overture'] = q1("SELECT count(*) FROM loc_cur WHERE inside AND department_codab <> '' AND department_overture <> '' AND department_codab <> department_overture")[0]
S['by_department'] = q("""SELECT coalesce(nullif(l.department_codab,''), nullif(l.department_overture,''), '(sin)') d, count(*),
   count(*) FILTER (WHERE r.confidence >= 0.3), count(*) FILTER (WHERE c.status='nuevo') FROM cur_raw r JOIN loc_cur l USING(id) JOIN cmp c ON c.id=r.id WHERE l.inside GROUP BY 1 ORDER BY 2 DESC""")
S['n_categories'] = q1("SELECT count(DISTINCT taxonomy.primary) FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside")[0]
S['by_category_top50'] = q("SELECT coalesce(taxonomy.primary,'(sin)'), count(*) FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50")
S['by_top_level'] = q("SELECT coalesce(taxonomy.hierarchy[1],'(sin)'), count(*) FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside GROUP BY 1 ORDER BY 2 DESC")
S['by_confidence'] = q("""SELECT CASE WHEN confidence < 0.3 THEN 'a <0,3' WHEN confidence < 0.5 THEN 'b 0,3-0,5' WHEN confidence < 0.7 THEN 'c 0,5-0,7' ELSE 'd >=0,7' END b,
   count(*), count(*) FILTER (WHERE c.status='nuevo') FROM cur_raw r JOIN loc_cur l USING(id) JOIN cmp c ON c.id=r.id WHERE l.inside GROUP BY 1 ORDER BY 1""")
S['coverage'] = dict(zip(['total', 'address', 'locality', 'phone', 'website', 'socials', 'email', 'brand', 'operating_status', 'name', 'category'], q1("""
SELECT count(*), count(*) FILTER (WHERE blank(addresses[1].freeform) IS NOT NULL), count(*) FILTER (WHERE blank(addresses[1].locality) IS NOT NULL),
  count(*) FILTER (WHERE len(phones) > 0), count(*) FILTER (WHERE len(websites) > 0), count(*) FILTER (WHERE len(socials) > 0),
  count(*) FILTER (WHERE len(emails) > 0), count(*) FILTER (WHERE brand.names.primary IS NOT NULL), count(*) FILTER (WHERE operating_status IS NOT NULL),
  count(*) FILTER (WHERE blank(names.primary) IS NOT NULL), count(*) FILTER (WHERE taxonomy.primary IS NOT NULL)
FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside""")))
S['unnamed_road_only'] = q1("SELECT count(*) FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside AND lower(trim(addresses[1].freeform))='unnamed road'")[0]
S['datasets'] = q("SELECT s.dataset, count(DISTINCT id) FROM (SELECT r.id, unnest(r.sources) s FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside) GROUP BY 1 ORDER BY 2 DESC")
S['operating_status'] = q("SELECT operating_status, count(*) FROM cur_raw r JOIN loc_cur l USING(id) WHERE l.inside GROUP BY 1")
S['compare_status'] = q("SELECT status, count(*) FROM cmp GROUP BY 1 ORDER BY 2 DESC")
S['new_conf_ge_03'] = q1("SELECT count(*) FROM cmp JOIN cur USING(id) WHERE status='nuevo' AND confidence >= 0.3")[0]
S['matched_changed_id'] = q1("SELECT count(*) FROM cmp WHERE status='mismo_nombre_menos_150m'")[0]
S['changed_address'] = q1("SELECT count(*) FROM cmp WHERE address_changed")[0]
S['changed_category'] = q1("SELECT count(*) FROM cmp WHERE category_changed")[0]
S['changed_name_same_id'] = q1("SELECT count(*) FROM cmp WHERE name_changed AND status='mismo_id'")[0]
S['gone'] = q1("SELECT count(*) FROM gone")[0]
S['gone_conf_ge_03'] = q1("SELECT count(*) FROM gone JOIN prev USING(id) WHERE confidence >= 0.3")[0]
S['prev_ids_matched_twice'] = q1("SELECT count(*) FROM (SELECT pid FROM best GROUP BY pid HAVING count(*) > 1)")[0]
S['addresses_bbox_rows'] = q1("SELECT count(*) FROM addr_raw")[0]
S['addresses_by_country'] = q("SELECT country, count(*) FROM addr_raw GROUP BY 1 ORDER BY 2 DESC")
S['addresses_inside_bolivia'] = addr_inside
S['files'] = {'cur': n_cur, 'gone': n_gone}
json.dump(S, open(f'{DATA}/stats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
print(json.dumps(S, ensure_ascii=False, indent=1, default=str))
