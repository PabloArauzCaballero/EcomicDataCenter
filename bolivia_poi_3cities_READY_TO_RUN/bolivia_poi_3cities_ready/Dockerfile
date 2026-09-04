FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY extract_bolivia_3cities_poi.py .
COPY entity_catalog.json .
COPY poi_schema.json .

RUN mkdir -p /app/output

CMD ["python", "extract_bolivia_3cities_poi.py",
     "--catalog", "entity_catalog.json",
     "--output", "output/bolivia-3cities-poi.json",
     "--min-confidence", "0.60",
     "--also-ndjson"]
