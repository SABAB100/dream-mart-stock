// Small helpers shared by the API routes (Vercel Node serverless functions).

function send(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function sendError(res, err) {
  const status = err && Number.isInteger(err.status) ? err.status : 500;
  send(res, status, { error: (err && err.message) || 'Internal server error' });
}

// Read a JSON request body. Returns {} for an empty body.
// maxChars guards against oversized payloads (uploads get a bigger budget).
function readBody(req, maxChars = 1e6) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxChars) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message || 'Not found'), { status: 404 });
}

// Total pairs across all sizes of a shoe.
function totalPairs(shoe) {
  return Object.values(shoe.sizes || {}).reduce((sum, q) => sum + (Number(q) || 0), 0);
}

// Validate a sizes object from the client: { "41": 5, "42": 3 }.
// Size labels are kept as typed; quantities must be whole numbers >= 0.
function parseSizes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('Sizes must be an object like {"41": 5}.');
  }
  const sizes = {};
  for (const [size, qty] of Object.entries(input)) {
    const label = String(size).trim();
    if (!label) continue;
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0) {
      throw badRequest('Size quantities must be whole numbers of 0 or more.');
    }
    sizes[label] = n;
  }
  if (!Object.keys(sizes).length) {
    throw badRequest('Add at least one size with a quantity.');
  }
  return sizes;
}

function parsePrice(input) {
  if (input === undefined || input === null || input === '') return null;
  const price = Number(input);
  if (!Number.isFinite(price) || price < 0) {
    throw badRequest('Price must be a number of 0 or more.');
  }
  return price;
}

module.exports = {
  send,
  sendError,
  readBody,
  badRequest,
  notFound,
  totalPairs,
  parseSizes,
  parsePrice,
};
