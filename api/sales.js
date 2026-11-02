// Sales history for the Dream Mart stock app.
// GET    /api/sales -> list sales (newest first)
// DELETE /api/sales -> delete one sale AND add its quantity back to that
//   shoe's size stock (only when the shoe still exists). Body: { id }
const { redis } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { send, sendError, readBody, badRequest } = require('./_lib/http');

async function listSales() {
  const raw = await redis('LRANGE', 'sales', 0, -1);
  return (Array.isArray(raw) ? raw : [])
    .map((v) => {
      try {
        return JSON.parse(v);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method === 'GET') {
      return send(res, 200, { sales: await listSales() });
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      if (!body.id) throw badRequest('Missing sale id.');
      const sales = await listSales();
      const sale = sales.find((s) => s.id === body.id);
      if (sale) {
        // Restore the sold quantity to the shoe's size stock.
        const raw = await redis('HGET', 'shoes', sale.shoeId);
        if (raw) {
          const shoe = JSON.parse(raw);
          if (shoe.sizes && shoe.sizes[sale.size] !== undefined) {
            shoe.sizes[sale.size] += sale.qty;
            await redis('HSET', 'shoes', shoe.id, JSON.stringify(shoe));
          }
        }
        // Rewrite the history without this sale, keeping newest-first order.
        const remaining = sales.filter((s) => s.id !== body.id);
        await redis('DEL', 'sales');
        for (let i = remaining.length - 1; i >= 0; i--) {
          await redis('RPUSH', 'sales', JSON.stringify(remaining[i]));
        }
      }
      return send(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'GET, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
};
