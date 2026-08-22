const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const BOTS = /bot|spider|crawl|slurp|bingpreview|facebookexternalhit|headless/i;

function parseUA(ua: string): { device: string; os: string; browser: string } {
  const device = BOTS.test(ua)
    ? 'Bot'
    : /iPad|Tablet/i.test(ua)
      ? 'Tablet'
      : /Mobi|iPhone|Android.*Mobile/i.test(ua)
        ? 'Mobile'
        : 'Desktop';
  const os = /Windows NT/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua)
        ? 'iOS'
        : /Mac OS X/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other';
  let browser = 'Other';
  if (BOTS.test(ua)) browser = 'Bot';
  else if (/MicroMessenger/i.test(ua)) browser = 'WeChat';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return { device, os, browser };
}

const isPrivate = (ip: string) =>
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|::1$|localhost$|f[cd][0-9a-f]{2}:)/i.test(ip);

const s = (v: unknown, n: number): string | null =>
  typeof v === 'string' && v.length ? v.slice(0, n) : null;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }
  try {
    const b = await req.json();

    const xff = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
    const ip = xff.split(',')[0].trim();

    let country: string | null = null;
    let region: string | null = null;
    let city: string | null = null;
    if (ip && !isPrivate(ip)) {
      try {
        const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
          headers: { 'User-Agent': 'sta-website-logger' },
        });
        const j = await r.json();
        if (j && j.success !== false) {
          country = j.country ?? null;
          region = j.region ?? null;
          city = j.city ?? null;
        }
      } catch (_) {
        /* geo lookup is best-effort */
      }
    }

    const ua = req.headers.get('user-agent') ?? '';
    const { device, os, browser } = parseUA(ua);

    const row = {
      kind: s(b.kind, 20) ?? 'pageview',
      visitor_id: s(b.visitor_id, 64) ?? 'unknown',
      path: s(b.path, 200),
      section: s(b.section, 60),
      referrer: s(b.referrer, 300),
      screen: s(b.screen, 20),
      lang: s(b.lang, 20),
      ua: ua.slice(0, 400) || null,
      device,
      os,
      browser,
      ip: ip || null,
      country,
      region,
      city,
    };

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/sta_web_visit_logs`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    return new Response(JSON.stringify({ ok: ins.ok }), {
      status: 202,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (_) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
