const crypto = require('crypto');

function secret() {
  const value = process.env.ORVEX_RELEASE_TICKET_SECRET;
  if (!value || value.length < 32) throw new Error('ORVEX_RELEASE_TICKET_SECRET must contain at least 32 characters');
  return value;
}
function verifyTicket(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret()).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload !== 'object' || !payload.releaseId || !payload.sub || !payload.tenantId) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  let deployment;
  try { deployment = new URL(payload.deploymentUrl); } catch { return null; }
  if (deployment.protocol !== 'https:' || !deployment.hostname.endsWith('.vercel.app') || deployment.pathname !== '/' || deployment.search || deployment.hash) return null;
  return payload;
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; } }
  }
  return '';
}
module.exports = { verifyTicket, getCookie };
