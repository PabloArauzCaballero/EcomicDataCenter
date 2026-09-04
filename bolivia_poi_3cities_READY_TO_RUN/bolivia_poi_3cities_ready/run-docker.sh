#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p output
docker build -t bolivia-poi-3cities .
docker run --rm -v "$(pwd)/output:/app/output" bolivia-poi-3cities
