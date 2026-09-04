$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    py -3 -m venv .venv
}

& ".\.venv\Scripts\Activate.ps1"
python -m pip install --upgrade pip
pip install -r requirements.txt

New-Item -ItemType Directory -Force -Path "output" | Out-Null

python extract_bolivia_3cities_poi.py `
  --catalog entity_catalog.json `
  --output output/bolivia-3cities-poi.json `
  --min-confidence 0.60 `
  --also-ndjson

Write-Host ""
Write-Host "LISTO"
Write-Host "JSON: output/bolivia-3cities-poi.json"
Write-Host "NDJSON: output/bolivia-3cities-poi.ndjson"
Write-Host "Manifest: output/bolivia-3cities-poi.manifest.json"
