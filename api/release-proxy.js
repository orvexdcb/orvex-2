const { verifyTicket, getCookie } = require('./_release-ticket');

async function reportFailure(ticket, status, path) {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.ORVEX_RELEASE_TICKET_SECRET;
  if (!url || !secret) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/orvex-release-monitor`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-orvex-monitor-secret': secret, 'apikey': process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '' },
      body: JSON.stringify({ action: 'report_proxy_failure', ticket, upstream_status: status, path }),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function typeIsHtml(value) { return String(value || '').includes('text/html'); }

async function fetchReleaseAsset(initialUrl, headers, method) {
  const expectedOrigin = new URL(initialUrl).origin;
  let current = new URL(initialUrl);
  for (let hop = 0; hop <= 3; hop++) {
    if (current.protocol !== 'https:' || current.origin !== expectedOrigin) throw new Error('release_redirect_origin_rejected');
    const response = await fetch(current, { method, redirect: 'manual', headers });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || hop === 3) throw new Error('release_redirect_limit');
    const next = new URL(location, current);
    if (next.protocol !== 'https:' || next.origin !== expectedOrigin) throw new Error('release_redirect_origin_rejected');
    current = next;
  }
  throw new Error('release_redirect_limit');
}

module.exports = async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end('Method Not Allowed');
  const releaseId = String(req.query.releaseId || '');
  const ticket = getCookie(req, 'orvex_release_ticket');
  let payload;
  try { payload = verifyTicket(ticket); } catch { payload = null; }
  if (!payload || payload.releaseId !== releaseId) {
    if (String(req.query.path || '') === 'index.html' || String(req.headers.accept || '').includes('text/html')) return res.redirect(302, '/');
    return res.status(401).end('Release access expired');
  }
  let path = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path || 'index.html');
  try { path = decodeURIComponent(path); } catch { return res.status(400).end('Invalid path'); }
  const segments = path.split('/');
  if (!path || path.startsWith('/') || path.includes('\\') || segments.some(s => !s || s === '.' || s === '..' || s.includes('\0'))) return res.status(400).end('Invalid path');
  let upstreamUrl;
  try { upstreamUrl = new URL(segments.map(encodeURIComponent).join('/'), payload.deploymentUrl + '/'); }
  catch { return res.status(400).end('Invalid upstream'); }
  if (upstreamUrl.origin !== new URL(payload.deploymentUrl).origin) return res.status(400).end('Invalid upstream');
  try {
    const upstreamHeaders = req.headers.range ? { Range: req.headers.range } : {};
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) upstreamHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const upstream = await fetchReleaseAsset(upstreamUrl, upstreamHeaders, req.method);
    if (upstream.url && new URL(upstream.url).origin !== new URL(payload.deploymentUrl).origin) {
      await reportFailure(ticket, 502, path); return res.status(502).end('Release origin mismatch');
    }
    if (upstream.status >= 500) {
      const report = await reportFailure(ticket, upstream.status, path);
      if (report && report.quarantined) {
        res.setHeader('Cache-Control', 'no-store');
        if (typeIsHtml(upstream.headers.get('content-type')) || String(req.headers.accept || '').includes('text/html')) return res.redirect(302, '/');
        return res.status(503).end('This ORVEX release has been quarantined');
      }
    }
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', type); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', type.includes('text/html') ? 'private, no-store' : 'private, max-age=300, immutable');
    const etag = upstream.headers.get('etag'); if (etag) res.setHeader('ETag', etag);
    const modified = upstream.headers.get('last-modified'); if (modified) res.setHeader('Last-Modified', modified);
    if (upstream.status === 206) {
      const range = upstream.headers.get('content-range'); if (range) res.setHeader('Content-Range', range);
      const accept = upstream.headers.get('accept-ranges'); if (accept) res.setHeader('Accept-Ranges', accept);
    }
    if (req.method === 'HEAD') return res.status(upstream.status).end();
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > 4 * 1024 * 1024) return res.status(413).end('Release asset too large for proxy');
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error('[ORVEX release proxy]', error && error.message);
    await reportFailure(ticket, 502, path); return res.status(502).end('Release asset temporarily unavailable');
  }
};
module.exports.fetchReleaseAsset = fetchReleaseAsset;
