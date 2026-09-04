#!/usr/bin/env python3
import argparse, json, subprocess, sys
from pathlib import Path

RELEASE = "2026-08-19.0"
PLACES = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"
DIVISIONS = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=divisions/type=division_area/*"

CITIES = [
    ("Santa Cruz de la Sierra","Santa Cruz",["santa cruz de la sierra","santa cruz"],(-63.32,-17.96,-63.00,-17.60)),
    ("La Paz","La Paz",["la paz","nuestra señora de la paz","nuestra senora de la paz"],(-68.23,-16.66,-68.00,-16.38)),
    ("Cochabamba","Cochabamba",["cochabamba"],(-66.32,-17.55,-66.00,-17.26)),
]

def ensure_duckdb():
    try:
        import duckdb  # noqa
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "duckdb>=1.3,<2"])

def q(s): return "'" + str(s).replace("'", "''") + "'"

def build_cases(families, field):
    parts = ["CASE"]
    blob = """lower(
        coalesce(taxonomy.primary,'') || ' ' ||
        coalesce(basic_category,'') || ' ' ||
        coalesce(array_to_string(taxonomy.hierarchy, ' '),'')
    )"""
    for f in families:
        regex = q(f["match_regex"])
        value = f.get(field)
        if value is None:
            continue
        if isinstance(value, bool):
            value_sql = "TRUE" if value else "FALSE"
        else:
            value_sql = q(value)
        parts.append(f"WHEN regexp_matches({blob}, {regex}) THEN {value_sql}")
    if field == "code":
        parts.append("ELSE 'OTRA_ENTIDAD'")
    elif field == "group":
        parts.append("ELSE upper(coalesce(taxonomy.hierarchy[1], 'OTROS'))")
    elif field == "commercial_role":
        parts.append("ELSE 'OTHER'")
    elif field == "is_regulated":
        parts.append("ELSE FALSE")
    elif field == "official_validation_source":
        parts.append("ELSE NULL")
    parts.append("END")
    return "\n".join(parts)

def resolve_city_areas(con, allow_bbox_fallback=False):
    con.execute("""CREATE TEMP TABLE city_areas(
        city VARCHAR, department VARCHAR, geometry GEOMETRY,
        xmin DOUBLE, ymin DOUBLE, xmax DOUBLE, ymax DOUBLE, geofence_method VARCHAR
    )""")
    unresolved=[]
    for city,dept,aliases,bbox in CITIES:
        a=", ".join(q(x) for x in aliases)
        w,s,e,n=bbox
        row=con.execute(f"""
            SELECT geometry,bbox.xmin,bbox.ymin,bbox.xmax,bbox.ymax
            FROM read_parquet('{DIVISIONS}', hive_partitioning=1)
            WHERE country='BO' AND subtype IN ('localadmin','locality')
              AND lower(names.primary) IN ({a})
              AND bbox.xmax >= {w} AND bbox.xmin <= {e}
              AND bbox.ymax >= {s} AND bbox.ymin <= {n}
              AND coalesce(is_land, TRUE)
            ORDER BY CASE WHEN subtype='localadmin' THEN 0 ELSE 1 END,
                     ((bbox.xmax-bbox.xmin)*(bbox.ymax-bbox.ymin)) ASC
            LIMIT 1
        """).fetchone()
        if row:
            geom,xmin,ymin,xmax,ymax=row
            con.execute("INSERT INTO city_areas VALUES (?,?,ST_GeomFromWKB(?),?,?,?,?,?)",
                        [city,dept,bytes(geom),xmin,ymin,xmax,ymax,"overture_division_area"])
        else:
            unresolved.append((city,dept,bbox))
    if unresolved and not allow_bbox_fallback:
        raise SystemExit("No se resolvieron límites fiables para: " + ", ".join(x[0] for x in unresolved))
    for city,dept,(w,s,e,n) in unresolved:
        poly=f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
        con.execute("INSERT INTO city_areas VALUES (?,?,ST_GeomFromText(?),?,?,?,?,?)",
                    [city,dept,poly,w,s,e,n,"explicit_bbox_fallback"])

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--catalog", default=str(Path(__file__).with_name("bolivia_3cities_entity_catalog_v2.json")))
    ap.add_argument("--output", default="bolivia-3cities-poi-v2.json")
    ap.add_argument("--min-confidence", type=float, default=0.60)
    ap.add_argument("--allow-bbox-fallback", action="store_true")
    ap.add_argument("--also-ndjson", action="store_true")
    args=ap.parse_args()

    ensure_duckdb()
    import duckdb
    catalog=json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    families=catalog["families"]

    fam_case=build_cases(families,"code")
    group_case=build_cases(families,"group")
    role_case=build_cases(families,"commercial_role")
    reg_case=build_cases(families,"is_regulated")
    source_case=build_cases(families,"official_validation_source")

    con=duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2'; SET threads=8; SET preserve_insertion_order=false;")
    resolve_city_areas(con,args.allow_bbox_fallback)

    # Zonas: si no existe polígono de barrio, el campo queda NULL.
    con.execute(f"""
        CREATE TEMP TABLE zones AS
        SELECT names.primary AS zone_name, subtype AS zone_type, geometry
        FROM read_parquet('{DIVISIONS}', hive_partitioning=1)
        WHERE country='BO'
          AND subtype IN ('borough','macrohood','neighborhood','microhood')
          AND bbox.xmax >= -68.30 AND bbox.xmin <= -62.95
          AND bbox.ymax >= -18.00 AND bbox.ymin <= -16.20
          AND coalesce(is_land, TRUE)
    """)

    query=f"""
    WITH scoped AS (
      SELECT p.*, c.city, c.department, c.geofence_method
      FROM city_areas c
      JOIN read_parquet('{PLACES}', hive_partitioning=1) p
        ON p.bbox.xmax >= c.xmin AND p.bbox.xmin <= c.xmax
       AND p.bbox.ymax >= c.ymin AND p.bbox.ymin <= c.ymax
       AND ST_Within(p.geometry,c.geometry)
      WHERE p.geometry IS NOT NULL
        AND p.names.primary IS NOT NULL
        AND coalesce(p.operating_status,'open') <> 'permanently_closed'
        AND (p.confidence IS NULL OR p.confidence >= {args.min_confidence})
    ),
    classified AS (
      SELECT *,
        {fam_case} AS entity_family,
        {group_case} AS entity_group,
        {role_case} AS commercial_role,
        {reg_case} AS is_regulated,
        {source_case} AS official_validation_source
      FROM scoped
    ),
    zoned AS (
      SELECT p.*, z.zone_name, z.zone_type,
        row_number() over(
          partition by p.id
          order by case z.zone_type
            when 'microhood' then 1 when 'neighborhood' then 2
            when 'macrohood' then 3 when 'borough' then 4 else 9 end
        ) zone_rank
      FROM classified p
      LEFT JOIN zones z ON ST_Within(p.geometry,z.geometry)
    )
    SELECT
      id,
      names.primary AS name,
      names.common AS common_names,
      city, department,
      zone_name AS zone, zone_type,
      CASE WHEN zone_name IS NULL THEN NULL ELSE 'Overture divisions' END AS zone_source,
      ST_Y(geometry) AS latitude, ST_X(geometry) AS longitude,

      entity_group, entity_family, commercial_role, is_regulated,
      taxonomy.primary AS type,
      basic_category,
      taxonomy.hierarchy AS taxonomy_hierarchy,
      taxonomy.alternates AS taxonomy_alternates,

      operating_status, confidence,
      CASE
        WHEN confidence >= .85 AND
             (addresses[1].freeform IS NOT NULL OR phones IS NOT NULL OR websites IS NOT NULL OR emails IS NOT NULL)
          THEN 'A'
        WHEN confidence >= .70 THEN 'B'
        ELSE 'C'
      END AS quality_grade,

      addresses[1].freeform AS address,
      addresses[1].locality AS locality_from_source,
      addresses[1].region AS region_from_source,
      addresses[1].postcode AS postcode,
      addresses[1].country AS country_code,
      phones, emails, websites, socials, brand, sources,
      array_length(sources) AS source_count,

      official_validation_source,
      CASE WHEN is_regulated THEN 'HIGH' ELSE 'NORMAL' END AS validation_priority,

      regexp_replace(lower(coalesce(names.primary,'')),'[^a-z0-9áéíóúñ]+','','g')
        || ':' || CAST(round(ST_Y(geometry),4) AS VARCHAR)
        || ':' || CAST(round(ST_X(geometry),4) AS VARCHAR)
        AS duplicate_candidate_key,

      geofence_method,
      'Overture Maps Foundation' AS source_dataset,
      '{RELEASE}' AS source_release
    FROM zoned
    WHERE zone_rank=1
    """

    out=Path(args.output).resolve()
    nd=out.with_suffix(".ndjson")
    manifest=out.with_name(out.stem+".manifest.json")
    con.execute(f"COPY ({query}) TO {q(nd.as_posix())} (FORMAT JSON, ARRAY false, COMPRESSION none)")

    count=0
    with nd.open("r",encoding="utf-8") as src,out.open("w",encoding="utf-8") as dst:
        dst.write("[")
        first=True
        for line in src:
            if not line.strip(): continue
            if not first: dst.write(",")
            dst.write(line.strip()); first=False; count+=1
        dst.write("]")

    city_counts=dict(con.execute(f"SELECT city,count(*) FROM ({query}) q GROUP BY city").fetchall())
    family_counts=dict(con.execute(f"SELECT entity_family,count(*) FROM ({query}) q GROUP BY entity_family ORDER BY count(*) DESC").fetchall())
    manifest.write_text(json.dumps({
        "dataset":"bolivia-3cities-poi-v2",
        "record_count":count,
        "release":RELEASE,
        "cities":city_counts,
        "family_counts":family_counts,
        "catalog_family_count":len(families),
        "minimum_confidence":args.min_confidence,
        "notes":[
          "No sampling is used.",
          "Unmatched POIs are retained as OTRA_ENTIDAD and keep native Overture taxonomy.",
          "Official validation source is a recommendation, not proof that a record has already been verified.",
          "Regulated entities should be cross-checked against their Bolivian regulator."
        ]
    },ensure_ascii=False,indent=2),encoding="utf-8")

    if not args.also_ndjson: nd.unlink(missing_ok=True)
    print(f"OK {count:,} registros -> {out}")
    print(f"Catálogo: {len(families)} familias")
    print("Por ciudad:",city_counts)

if __name__=="__main__":
    main()
