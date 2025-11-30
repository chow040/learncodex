// Simple smoke script to exercise personalized dashboard endpoints without auth.
// Run with: node scripts/dashboardSmoke.js

const endpoints = [
  { method: 'GET', url: 'http://localhost:4000/api/dashboard', expect: 401 },
  { method: 'GET', url: 'http://localhost:4000/api/reports/non-existent', expect: 401 },
  { method: 'POST', url: 'http://localhost:4000/api/bookmarks', expect: 401, body: { targetId: 'foo' } }
];

const run = async () => {
  for (const ep of endpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    const ok = res.status === ep.expect;
    console.log(`${ep.method} ${ep.url} -> ${res.status} (${ok ? 'OK' : `expected ${ep.expect}`})`);
  }
};

run().catch((err) => {
  console.error('Smoke script failed', err);
  process.exit(1);
});
