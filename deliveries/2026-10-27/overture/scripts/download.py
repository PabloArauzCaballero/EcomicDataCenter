"""Baja de S3 los extractos crudos de Overture para Bolivia (caja amplia; el recorte por país va despues)."""
import sys, time, duckdb

OUT = sys.argv[1]
what = sys.argv[2:]
BB = 'bbox.xmin <= -57.40 AND bbox.xmax >= -69.70 AND bbox.ymin <= -9.60 AND bbox.ymax >= -22.95'
c = duckdb.connect()
c.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2'; SET enable_progress_bar=false; SET memory_limit='1500MB'; SET threads=6; SET preserve_insertion_order=false;")

def dump(sql, path):
    t = time.time()
    c.execute(f"COPY ({sql}) TO '{path}' (FORMAT parquet, COMPRESSION zstd)")
    n = c.execute(f"SELECT count(*) FROM read_parquet('{path}')").fetchone()[0]
    print(path, n, round(time.time() - t), 's', flush=True)

for item in what:
    rel, theme = item.split(':')
    base = f's3://overturemaps-us-west-2/release/{rel}'
    if theme == 'places':
        dump(f"SELECT * FROM read_parquet('{base}/theme=places/type=place/*.parquet') WHERE {BB}",
             f'{OUT}/places_bbox_{rel}.parquet')
    elif theme == 'addresses':
        dump(f"SELECT * FROM read_parquet('{base}/theme=addresses/type=address/*.parquet') WHERE {BB}",
             f'{OUT}/addresses_bbox_{rel}.parquet')
    elif theme == 'divisions':
        dump(f"SELECT * FROM read_parquet('{base}/theme=divisions/type=division_area/*.parquet') WHERE country = 'BO'",
             f'{OUT}/division_area_BO_{rel}.parquet')
