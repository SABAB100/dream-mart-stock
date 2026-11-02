// Shoe routes for the Dream Mart stock app (same shape as the vegetable app).
// GET    /api/shoes -> list all shoes (oldest first)
// POST   /api/shoes -> add a shoe
//   Body: { name, price?: number | null, imageUrl?: string | null,
//           sizes: { "41": 5, "42": 3 } }
// PUT    /api/shoes -> edit a shoe (replaces name, price, imageUrl, sizes)
//   Body: { id, name, price, imageUrl, sizes }
// DELETE /api/shoes -> delete a shoe (its sales history stays)
//   Body: { id }
//
// There is NO daily reset and NO automatic deletion anywhere in this app:
// whatever is saved stays exactly as entered until the user changes it.
const { redis, hgetallToObject } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const {
  send,
  sendError,
  readBody,
  badRequest,
  notFound,
  parseSizes,
  parsePrice,
} = require('./_lib/http');

async function listShoes() {
  const raw = hgetallToObject(await redis('HGETALL', 'shoes'));
  return Object.values(raw)
    .map((v) => {
      try {
        return JSON.parse(v);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method === 'GET') {
      return send(res, 200, { shoes: await listShoes() });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) throw badRequest('Shoe name is required.');
      const sizes = parseSizes(body.sizes);
      const price = parsePrice(body.price);
      let imageUrl = null;
      if (typeof body.imageUrl === 'string' && body.imageUrl) imageUrl = body.imageUrl;
      const colour = typeof body.colour === 'string' && body.colour.trim() ? body.colour.trim() : null;
      const shoe = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        price,
        colour,
        imageUrl,
        sizes,
        createdAt: Date.now(),
      };
      await redis('HSET', 'shoes', shoe.id, JSON.stringify(shoe));
      return send(res, 201, { shoe });
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!body.id) throw badRequest('Missing shoe id.');
      const raw = await redis('HGET', 'shoes', body.id);
      if (!raw) throw notFound('Shoe not found.');
      const shoe = JSON.parse(raw);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) throw badRequest('Shoe name is required.');
      shoe.name = name;
      shoe.price = parsePrice(body.price);
      shoe.colour = typeof body.colour === 'string' && body.colour.trim() ? body.colour.trim() : null;
      shoe.sizes = parseSizes(body.sizes);
      // imageUrl is replaced when the key is present (null clears the picture).
      if ('imageUrl' in body) {
        shoe.imageUrl = typeof body.imageUrl === 'string' && body.imageUrl ? body.imageUrl : null;
      }
      await redis('HSET', 'shoes', shoe.id, JSON.stringify(shoe));
      return send(res, 200, { shoe });
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      if (!body.id) throw badRequest('Missing shoe id.');
      await redis('HDEL', 'shoes', body.id);
      return send(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports.listShoes = listShoes;
