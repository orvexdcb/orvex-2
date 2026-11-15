module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const secret = process.env.ORVEX_RELEASE_TICKET_SECRET || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const baseConfigured = secret.length >= 32 && !!supabaseUrl && !!(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!baseConfigured) return res.status(200).json({ enabled: false, monitor_enabled: false });
  let monitorEnabled = false;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/orvex-release-monitor`, {
      headers: { 'x-orvex-monitor-secret': secret, 'apikey': process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY }, signal: controller.signal,
    });
    monitorEnabled = response.ok && (await response.json()).enabled === true;
  } catch { monitorEnabled = false; }
  finally { clearTimeout(timer); }
  return res.status(200).json({ enabled: monitorEnabled, monitor_enabled: monitorEnabled });
};
