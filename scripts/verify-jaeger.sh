#!/bin/sh
# Verifies the tracing pipeline end to end: backend -> OTLP -> Jaeger.
#
# Requires only `curl`, already used by the other verification scripts. It makes
# one read-only request against a running backend and reads the trace back from
# the Jaeger query API.
#
#   yarn jaeger:up
#   OTEL_ENABLED=true yarn start
#   yarn jaeger:verify
#
# Override with environment variables:
#   BASE_URL      backend base URL              (default http://127.0.0.1:3000)
#   JAEGER_URL    Jaeger query API              (default http://127.0.0.1:16686)
#   VERIFY_PATH   traced, read-only endpoint    (default /api/v1/provenance/organizations)
#   SERVICE_NAME  expected service.name         (default observatorio-economico-api)
#   AUTH_HEADER   full Authorization header     (default empty)
#   SETTLE_SECONDS wait for the batch export    (default 10)
set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAEGER_URL="${JAEGER_URL:-http://127.0.0.1:16686}"
VERIFY_PATH="${VERIFY_PATH:-/api/v1/provenance/organizations}"
SERVICE_NAME="${SERVICE_NAME:-observatorio-economico-api}"
AUTH_HEADER="${AUTH_HEADER:-}"
SETTLE_SECONDS="${SETTLE_SECONDS:-10}"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

echo "1/5 Jaeger reachable at ${JAEGER_URL}"
curl -sf -o /dev/null "${JAEGER_URL}/api/services" ||
  fail "Jaeger query API did not answer. Start it with: yarn jaeger:up"

echo "2/5 Backend reachable at ${BASE_URL}"
curl -sf -o /dev/null "${BASE_URL}/health" ||
  fail "The backend did not answer /health. Start it before verifying."

echo "3/5 Issuing a traced request to ${VERIFY_PATH}"
HEADERS_FILE="$(mktemp)"
trap 'rm -f "${HEADERS_FILE}"' EXIT
if [ -n "${AUTH_HEADER}" ]; then
  curl -s -o /dev/null -D "${HEADERS_FILE}" -H "Authorization: ${AUTH_HEADER}" \
    "${BASE_URL}${VERIFY_PATH}"
else
  curl -s -o /dev/null -D "${HEADERS_FILE}" "${BASE_URL}${VERIFY_PATH}"
fi

TRACE_ID="$(tr -d '\r' <"${HEADERS_FILE}" | awk 'tolower($1) == "x-trace-id:" { print $2 }')"
[ -n "${TRACE_ID}" ] ||
  fail "The response carried no x-trace-id. Check that OTEL_ENABLED=true and that ${VERIFY_PATH} is not an excluded path."
echo "    trace id: ${TRACE_ID}"

echo "4/5 Waiting ${SETTLE_SECONDS}s for the batch exporter"
sleep "${SETTLE_SECONDS}"

echo "5/5 Reading the trace back from Jaeger"
curl -sf "${JAEGER_URL}/api/services" | grep -q "\"${SERVICE_NAME}\"" ||
  fail "Jaeger does not know the service ${SERVICE_NAME}. Check OTEL_SERVICE_NAME and OTEL_EXPORTER_OTLP_TRACES_ENDPOINT."

TRACE_BODY="$(curl -sf "${JAEGER_URL}/api/traces/${TRACE_ID}")" ||
  fail "The Jaeger query API rejected the request for trace ${TRACE_ID}"
echo "${TRACE_BODY}" | grep -q "\"traceID\":\"${TRACE_ID}\"" ||
  fail "Trace ${TRACE_ID} did not reach Jaeger. Check the exporter endpoint, the sampler ratio and network reachability."

SPAN_COUNT="$(echo "${TRACE_BODY}" | tr ',' '\n' | grep -c '"spanID"' || true)"
echo "PASS: trace ${TRACE_ID} is in Jaeger with ${SPAN_COUNT} spans."
echo "      ${JAEGER_URL}/trace/${TRACE_ID}"
