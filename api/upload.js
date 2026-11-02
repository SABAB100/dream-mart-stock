// POST /api/upload -> store a shoe picture in Vercel Blob and return its URL.
//   Body: { dataUrl } — a base64 image data URL (the frontend compresses
//   pictures to JPEG, max 1200px, before sending, so payloads stay small).
// Requires the BLOB_READ_WRITE_TOKEN environment variable, which Vercel
// adds automatically when a Blob store is connected to the project.
const { requireAuth } = require('./_lib/auth');
const { send, sendError, readBody, badRequest } = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      const err = new Error(
        'Image storage is not configured. In your Vercel project, create a ' +
          'Blob store (Storage tab) and redeploy.'
      );
      err.status = 500;
      throw err;
    }
    const body = await readBody(req, 5e6);
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const match = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) throw badRequest('Picture must be a base64 image data URL.');
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > 3 * 1024 * 1024) {
      throw badRequest('Picture is too large (max 3 MB after compression).');
    }
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const pathname = `shoes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blobRes = await fetch(`https://blob.vercel.sh/${pathname}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-version': '7',
        'Content-Type': mime,
      },
      body: buffer,
    });
    const blobData = await blobRes.json().catch(() => ({}));
    if (!blobRes.ok || !blobData.url) {
      throw new Error(blobData.error || `Image upload failed with status ${blobRes.status}`);
    }
    return send(res, 200, { url: blobData.url });
  } catch (err) {
    return sendError(res, err);
  }
};
