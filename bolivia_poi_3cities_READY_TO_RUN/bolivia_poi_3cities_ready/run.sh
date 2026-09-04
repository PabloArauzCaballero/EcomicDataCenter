#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "ERROR: python3 no está instalado."
  exit 1
fi

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

mkdir -p output

python extract_bolivia_3cities_poi.py   --catalog entity_catalog.json   --output output/bolivia-3cities-poi.json   --min-confidence 0.60   --also-ndjson

echo ""
echo "LISTO"
echo "JSON:   output/bolivia-3cities-poi.json"
echo "NDJSON: output/bolivia-3cities-poi.ndjson"
echo "Manifest: output/bolivia-3cities-poi.manifest.json"
