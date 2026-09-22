// Supabase Edge Function: wheel-line-spin
// ยืนยันตัวตน LINE จาก LIFF ฝั่งเซิร์ฟเวอร์ แล้วค่อยหมุน/เช็กผล
// ต้องตั้ง secret: LINE_CHANNEL_ID (Channel ID ของ LINE Login channel ที่มี LIFF app)
import { createClient } from 'npm:@supabase/supabase-js@2';

const LINE_CHANNEL_ID = Deno.env.get('2011700777') ?? '';
const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ยืนยัน ID token กับ LINE → ได้ userId (sub) และชื่อ
async function verifyIdToken(idToken: string) {
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: LINE_CHANNEL_ID }),
  });
  if (!r.ok) return null;
  const c = await r.json();
  return c.sub ? { userId: c.sub as string, name: (c.name as string) ?? null } : null;
}

// เช็กว่าแอดเพื่อน OA แล้วหรือยัง
// 'invalid' = access token ไม่ใช่ของ channel เรา, 'error' = เรียก friendship API ไม่ได้ (มักเพราะยังไม่ได้ลิงก์ OA กับ LINE Login channel)
async function friendStatus(accessToken: string): Promise<boolean | 'invalid' | 'error'> {
  const v = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`);
  if (!v.ok) return 'invalid';
  const info = await v.json();
  if (String(info.client_id) !== LINE_CHANNEL_ID) return 'invalid';
  const f = await fetch('https://api.line.me/friendship/v1/status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!f.ok) return 'error';
  return Boolean((await f.json()).friendFlag);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ status: 'error', message: 'method not allowed' }, 405);
  if (!LINE_CHANNEL_ID) return reply({ status: 'error', message: 'LINE_CHANNEL_ID is not set' }, 500);

  let body: { action?: string; idToken?: string; accessToken?: string };
  try { body = await req.json(); } catch { return reply({ status: 'error', message: 'bad json' }, 400); }
  const { action = 'spin', idToken, accessToken } = body;
  if (!idToken) return reply({ status: 'token_invalid' }, 401);

  const user = await verifyIdToken(idToken);
  if (!user) return reply({ status: 'token_invalid' }, 401);

  if (action === 'status') {
    const { data, error } = await sb.rpc('wheel_line_status', { p_line_user_id: user.userId });
    if (error) return reply({ status: 'error', message: error.message }, 500);
    return reply(data ?? { status: 'none' });
  }

  if (action !== 'spin') return reply({ status: 'error', message: 'unknown action' }, 400);

  const { data: s, error: se } = await sb.from('wheel_settings').select('require_friend').eq('id', 1).single();
  if (se) return reply({ status: 'error', message: se.message }, 500);
  if (s.require_friend) {
    if (!accessToken) return reply({ status: 'token_invalid' }, 401);
    const friend = await friendStatus(accessToken);
    if (friend === 'invalid') return reply({ status: 'token_invalid' }, 401);
    if (friend === 'error') return reply({ status: 'friend_check_failed' });
    if (!friend) return reply({ status: 'not_friend' });
  }

  const { data, error } = await sb.rpc('wheel_spin_core', {
    p_device_id: null, p_line_user_id: user.userId, p_line_name: user.name,
  });
  if (error) return reply({ status: 'error', message: error.message }, 500);
  return reply(data);
});
