// Shared-password gate for every API route (Vercel Node serverless functions).
//
// The ONE shared password comes ONLY from the server-side environment
// variable APP_PASSWORD. It is never hardcoded here, never sent to the
// frontend, never logged, and never returned in any API response.
//
//   - APP_PASSWORD not set at all  -> 401 "password not configured"
//     (fail closed: no open access is ever allowed).
//   - Header missing or wrong       -> 401 with a generic message and no
//     hint about the correct value.
//
// The frontend sends the password the user typed as the `x-app-password`
// request header on every API call.

const crypto = require('crypto');
const { send } = require('./http');

// Timing-safe string comparison: hash both sides first so the comparison
// itself never leaks the expected length.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Verify the request. Returns true when authorized. When not authorized it
// sends the 401 response itself and returns false, so routes can simply do:
//   if (!requireAuth(req, res)) return;
function requireAuth(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    send(res, 401, {
      error:
        'App password is not configured. Set the APP_PASSWORD environment ' +
        'variable in your Vercel project settings, then redeploy.',
      notConfigured: true,
    });
    return false;
  }
  const given = req.headers && req.headers['x-app-password'];
  if (typeof given !== 'string' || !safeEqual(given, expected)) {
    send(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { requireAuth };
