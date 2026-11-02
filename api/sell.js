// POST /api/sell -> record a shoe sale and deduct it from that size's stock
//   Body: { shoeId, size, qty }
//   - qty must be a whole number of 1 or more.
//   - A sale larger than the remaining stock for that size is rejected (400).
//   - The sale is appended to the sales history.
const { redis } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const {
  send,
  sendError,
  readBody,
  badRequest,
  notFound,
  totalPairs,
} = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const body = await readBody(req);
    if (!body.shoeId) throw badRequest('Missing shoe id.');
    const size = typeof body.size === 'string' ? body.size.trim() : '';
    if (!size) throw badRequest('Missing size.');
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty < 1) {
      throw badRequest('Sale quantity must be a whole number of 1 or more.');
    }
    const raw = await redis('HGET', 'shoes', body.shoeId);
    if (!raw) throw notFound('Shoe not found.');
    const shoe = JSON.parse(raw);
    if (!shoe.sizes || shoe.sizes[size] === undefined) {
      throw badRequest(`Size ${size} does not exist for this shoe.`);
    }
    if (qty > shoe.sizes[size]) {
      throw badRequest(
        `That is more than you have — only ${shoe.sizes[size]} pair(s) of size ${size} left.`
      );
    }

    shoe.sizes[size] -= qty;
    await redis('HSET', 'shoes', shoe.id, JSON.stringify(shoe));

    let totalPrice = null;
    if (shoe.price !== null && shoe.price !== undefined) {
      totalPrice = Math.round(qty * shoe.price * 100) / 100;
    }

    const sale = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      shoeId: shoe.id,
      shoeName: shoe.name,
      size,
      qty,
      totalPrice,
      at: Date.now(),
    };
    await redis('LPUSH', 'sales', JSON.stringify(sale));
    await redis('LTRIM', 'sales', 0, 199);

    return send(res, 200, { shoe, sale, left: `${totalPairs(shoe)} pairs` });
  } catch (err) {
    return sendError(res, err);
  }
};
