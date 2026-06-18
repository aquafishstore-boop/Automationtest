/**
 * Load Testing Suite — k6 Script Generator
 * Converts UAT test scripts into k6-compatible JavaScript for load testing.
 *
 * Generates realistic concurrent user simulation scripts targeting LIS systems.
 */

export function generateK6Script(script, options = {}) {
  const { vus = 10, duration = "30s", rampUp = "10s" } = options;
  const name = (script.name || "LoadTest").replace(/[^a-zA-Z0-9]/g, "_");
  const baseUrl = options.baseUrl || "http://localhost:3002";

  let steps = (script.steps || []).map((s, i) => {
    switch (s.action) {
      case "navigate":
        return `
  // Step ${i + 1}: ${s.description}
  {
    const res = http.get('${s.url || baseUrl}');
    check(res, { '${s.description}': (r) => r.status === 200 });
    sleep(1);
  }`;
      case "click":
        return `
  // Step ${i + 1}: ${s.description}
  {
    const res = http.get('${baseUrl}/api/runs');
    check(res, { '${s.description}': (r) => r.status === 200 });
    sleep(0.5);
  }`;
      case "type":
      case "select":
        return `
  // Step ${i + 1}: ${s.description}
  {
    const payload = JSON.stringify({ value: '${s.value || "test"}' });
    const res = http.post('${baseUrl}/api/run', payload, { headers: { 'Content-Type': 'application/json' } });
    check(res, { '${s.description}': (r) => r.status === 200 || r.status === 201 });
    sleep(0.5);
  }`;
      case "wait":
        return `
  // Step ${i + 1}: ${s.description}
  sleep(${Math.max(1, Math.round((parseInt(s.value) || 3000) / 1000))});`;
      case "screenshot":
      case "verify":
      case "assert":
        return `
  // Step ${i + 1}: ${s.description}
  {
    const res = http.get('${baseUrl}/api/runs');
    check(res, { '${s.description}': (r) => r.status === 200 });
  }`;
      default:
        return `
  // Step ${i + 1}: ${s.description}
  sleep(1);`;
    }
  }).join("\n");

  return `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failRate = new Rate('failed_requests');
const stepDuration = new Trend('step_duration');

export const options = {
  stages: [
    { duration: '${rampUp}', target: ${vus} },
    { duration: '${duration}', target: ${vus} },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    failed_requests: ['rate<0.1'],
    http_req_duration: ['p(95)<5000'],
  },
};

const BASE_URL = '${baseUrl}';

export default function () {
  const startTime = Date.now();

${steps}

  const totalTime = Date.now() - startTime;
  stepDuration.add(totalTime);
}
`;
}

export function generateArtilleryScript(script, options = {}) {
  const { vus = 10, duration = 30 } = options;
  const baseUrl = options.baseUrl || "http://localhost:3002";

  const flows = (script.steps || []).map((s, i) => {
    const flow = { name: `Step ${i + 1}: ${s.description}` };
    switch (s.action) {
      case "navigate":
        flow.get = { url: s.url || baseUrl };
        break;
      case "click":
        flow.get = { url: `${baseUrl}/api/runs` };
        break;
      case "type":
      case "select":
        flow.post = { url: `${baseUrl}/api/run`, json: { value: s.value || "test" } };
        break;
      default:
        flow.get = { url: baseUrl };
    }
    return flow;
  });

  return JSON.stringify({
    config: {
      target: baseUrl,
      phases: [{ duration, arrivalRate: Math.ceil(vus / duration) }],
      defaults: { headers: { "Content-Type": "application/json" } }
    },
    scenarios: [{ name: script.name || "UAT Load Test", flow: flows }]
  }, null, 2);
}

export function getLoadTestConfigs() {
  return {
    available: ["k6", "artillery"],
    defaultVUs: 10,
    defaultDuration: "30s",
    defaultRampUp: "10s",
    thresholds: { passRate: ">90%", p95Latency: "<5s" }
  };
}
