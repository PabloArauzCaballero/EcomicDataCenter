#!/usr/bin/env bash
# Deja constancia de un fallo en un issue abierto, uno solo para todos los
# fallos seguidos. Un run rojo de un cron no lo mira nadie: el 2026-09-26 la
# ingesta estuvo caida seis corridas sin que nadie se enterara. Un issue llega
# por correo y por la app, y se queda abierto hasta que alguien lo cierra.
#
# Uso: avisar-ingesta-caida.sh "<que fallo>"
# Requiere GH_TOKEN con `issues: write` y GITHUB_REPOSITORY/GITHUB_RUN_ID.
set -euo pipefail

what="${1:-un workflow}"
label="ingesta-caida"
run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
body="Fallo **${what}** ($(date -u +%Y-%m-%dT%H:%MZ)): ${run_url}

Las lecturas de este run no llegaron a la base. Mirar el log del run; si dice
\`node quota reached on this tailnet\`, correr el workflow \`tailnet-janitor\`."

gh label create "$label" --color B60205 --description "La ingesta o el despliegue dejaron de llegar al servidor" >/dev/null 2>&1 || true

open=$(gh issue list --label "$label" --state open --json number --jq '.[0].number // empty')
if [ -n "$open" ]; then
  gh issue comment "$open" --body "$body"
else
  gh issue create --title "Ingesta caida: ${what}" --label "$label" --body "$body"
fi
