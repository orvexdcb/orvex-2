const { verifyTicket } = require('./_release-ticket');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin) {
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'origin_not_allowed' }); }
    catch { return res.status(403).json({ error: 'origin_not_allowed' }); }
  }
  const ticket = req.body && typeof req.body.ticket === 'string' ? req.body.ticket : '';
  let payload;
  try { payload = verifyTicket(ticket); } catch { payload = null; }
  if (!payload) return res.status(401).json({ error: 'invalid_or_expired_release_ticket' });
  const auth = String(req.headers.authorization || '');
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!auth.startsWith('Bearer ') || !supabaseUrl || !anonKey)
    return res.status(401).json({ error: 'authenticated_session_required' });
  try {
    const userResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: auth },
    });
    if (!userResponse.ok) return res.status(401).json({ error: 'session_invalid' });
    const user = await userResponse.json();
    if (!user || user.id !== payload.sub) return res.status(403).json({ error: 'ticket_user_mismatch' });
  } catch { return res.status(503).json({ error: 'session_verification_unavailable' }); }
  const maxAge = Math.max(0, Math.min(600, payload.exp - Math.floor(Date.now() / 1000)));
  const cookie = `orvex_release_ticket=${encodeURIComponent(ticket)}; Path=/__orvex/releases/${encodeURIComponent(payload.releaseId)}/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true, path: `/__orvex/releases/${encodeURIComponent(payload.releaseId)}/index.html`, expires_in: maxAge });
};
