import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    query_baseline: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 5),
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';
const token = __ENV.ACCESS_TOKEN;
const datasetVersionId = __ENV.DATASET_VERSION_ID;

export default function queryBaseline() {
  if (!token || !datasetVersionId) {
    throw new Error('ACCESS_TOKEN and DATASET_VERSION_ID are required');
  }
  const response = http.post(
    `${baseUrl}/api/v1/data/query`,
    JSON.stringify({ datasetVersionId, page: 1, pageSize: 50 }),
    {
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    },
  );
  check(response, { 'query returned 200': (result) => result.status === 200 });
  sleep(0.2);
}
