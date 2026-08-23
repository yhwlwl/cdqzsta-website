const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? '';

const BUCKET = 'sta-web-images';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** 校验自定义后台会话（与 Postgres RPC 的 current_admin() 同一套令牌体系） */
async function adminOk(req: Request): Promise<boolean> {
  const tok = req.headers.get('x-admin-token') ?? '';
  if (!tok) return false;
  const url =
    `${SUPABASE_URL}/rest/v1/sta_web_admin_sessions?select=admin_id` +
    `&token=eq.${encodeURIComponent(tok)}&expires_at=gte.${new Date().toISOString()}`;
  try {
    const r = await fetch(url, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j) && j.length > 0;
  } catch (_) {
    return false;
  }
}

const sanitize = (name: string): string =>
  name.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40) || 'img';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, 405, { ok: false, error: 'Method Not Allowed' });
  }
  try {
    if (!(await adminOk(req))) {
      return json(req, 401, { ok: false, error: '未登录或会话已过期' });
    }

    const ct = req.headers.get('content-type') ?? '';
    if (!ct.includes('multipart/form-data')) {
      return json(req, 400, { ok: false, error: '需要 multipart/form-data' });
    }

    const form = await req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) {
      return json(req, 400, { ok: false, error: '缺少 file 字段' });
    }
    const ext = ALLOWED[f.type];
    if (!ext) {
      return json(req, 415, { ok: false, error: '仅支持 PNG / JPG / WebP / GIF 图片' });
    }
    if (f.size > MAX_BYTES) {
      return json(req, 413, { ok: false, error: '图片不能超过 5MB' });
    }

    const d = new Date();
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const path =
      `${ym}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitize(f.name)}.${ext}`;

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': f.type,
        'x-upsert': 'false',
      },
      body: await f.arrayBuffer(),
    });

    if (!up.ok) {
      const detail = (await up.text()).slice(0, 300);
      return json(req, 500, { ok: false, error: `存储写入失败：${detail}` });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return json(req, 200, { ok: true, url: publicUrl, path });
  } catch (e) {
    return json(req, 500, { ok: false, error: e instanceof Error ? e.message : '上传失败' });
  }
});
