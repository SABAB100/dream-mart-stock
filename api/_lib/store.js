// Minimal Upstash Redis (Vercel KV) REST client for the Dream Mart app.
//
// Configuration comes ONLY from these two environment variables, which you
// set in the Vercel dashboard when you create a KV store:
//   KV_REST_API_URL   - e.g. https://<id>.upstash.io
//   KV_REST_API_TOKEN - the store's REST token
// No credential is ever hardcoded in this file or anywhere else in the app.

function getConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const err = new Error(
      'KV store is not configured. In your Vercel project, create a KV store ' +
        '(Storage tab) and set the KV_REST_API_URL and KV_REST_API_TOKEN ' +
        'environment variables, then redeploy.'
    );
    err.status = 500;
    throw err;
  }
  return { url, token };
}

// Run one Redis command through the Upstash REST API.
// Example: redis('HGETALL', 'shoes') -> ['id1', '{...}', 'id2', '{...}']
async function redis(...args) {
  const { url, token } = getConfig();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    data = {};
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || `Upstash request failed with status ${res.status}`);
  }
  return data.result;
}

// Upstash HGETALL returns a flat array: [field, value, field, value, ...].
// Convert it into an object.
function hgetallToObject(result) {
  const obj = {};
  if (Array.isArray(result)) {
    for (let i = 0; i + 1 < result.length; i += 2) {
      obj[result[i]] = result[i + 1];
    }
  }
  return obj;
}

module.exports = { redis, hgetallToObject };
