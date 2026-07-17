#!/bin/sh
set -eu

for command in yarn psql docker; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'BLOCKED: required command is unavailable: %s\n' "$command" >&2
    exit 2
  }
done

[ -f yarn.lock ] || { echo 'BLOCKED: yarn.lock is required' >&2; exit 2; }

yarn install --frozen-lockfile --non-interactive
yarn format:check
yarn lint
yarn typecheck
yarn quality:all
yarn test
yarn db:verify:migrations
yarn db:migrate
yarn db:verify:privileges
yarn db:seed:boot
yarn db:seed:boot
yarn db:seed:mock
yarn db:seed:mock
yarn db:seed:verify
yarn build
yarn openapi:export
python scripts/validate_openapi.py
python scripts/validate_contract_routes.py
python scripts/generate_postman.py
docker compose build api migrate
docker compose up -d postgres migrate api nginx
yarn smoke
printf 'PASS: release verification commands completed. Run load and restore gates separately.\n'
