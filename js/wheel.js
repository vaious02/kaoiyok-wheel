import { sb, configured, CANDY_COLOR } from './supabase.js';
import { LIFF_ID } from './config.js';

const $ = (id) => document.getElementById(id);
const canvas = $('wheel');
const ctx = canvas.getContext('2d');
const SIZE = canvas.width;
const R = SIZE / 2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let prizes = [];          // ของรางวัลที่ยังมีของ
let settings = { consolation_name: 'ลูกอม', is_open: true };
let slices = [];          // ช่องบนกงล้อ: { prize | null(=ลูกอม), color, label }
let rot = 0;
let spinning = false;
let audio = null;
let lineMode = false;     // โหมด LINE: 1 บัญชีหมุนได้ 1 ครั้งต่อวัน
let myResult = null;      // ผลของบัญชีนี้วันนี้ (โหมด LINE)
let blocked = null;       // ข้อความเมื่อยังหมุนไม่ได้ (เช่น ยังไม่แอดเพื่อน)

// ---------- รหัสเครื่อง (ใช้เมื่อเปิดโหมด 1 เครื่องหมุนได้ 1 ครั้ง/วัน) ----------
function deviceId() {
  try {
    let id = localStorage.getItem('kaoiyok-device');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
      localStorage.setItem('kaoiyok-device', id);
    }
    return id;
  } catch { return null; }
}

// ---------- โหลดข้อมูล ----------
async function load(includeId = null) {
  let q = sb.from('wheel_prizes').select('id,name,color,stock,sort_order')
    .eq('active', true).order('sort_order').order('id');
  q = includeId ? q.or(`stock.gt.0,id.eq.${includeId}`) : q.gt('stock', 0);
  const [{ data: p, error: e1 }, { data: s, error: e2 }] = await Promise.all([
    q, sb.from('wheel_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (e1 || e2) throw e1 || e2;
  prizes = p || [];
  if (s) settings = s;
  buildSlices();
  draw();
  setIdleStatus();
}

// ของรางวัล 1 ช่อง สลับกับลูกอม 1 ช่อง — กงล้อดูมีลูกอมครึ่งหนึ่ง (โอกาสจริงกำหนดที่หลังบ้าน)
function buildSlices() {
  const candy = () => ({ prize: null, color: CANDY_COLOR, label: settings.consolation_name || 'ลูกอม' });
  slices = [];
  if (prizes.length === 0) {
    for (let i = 0; i < 6; i++) slices.push(candy());
    return;
  }
  const list = prizes.length < 3 ? [...prizes, ...prizes, ...prizes].slice(0, 3) : prizes;
  list.forEach((p) => {
    slices.push({ prize: p, color: p.color || '#FCE6D3', label: p.name });
    slices.push(candy());
  });
}

function setIdleStatus() {
  if (spinning) return;
  if (myResult) {
    $('spin').disabled = false; $('hub').disabled = true;
    $('spin').textContent = 'ดูรางวัลของฉัน';
    $('status').textContent = 'วันนี้คุณหมุนไปแล้ว พรุ่งนี้มาลุ้นใหม่นะ';
    return;
  }
  $('spin').textContent = 'หมุนกงล้อ';
  if (blocked) {
    $('spin').disabled = $('hub').disabled = true;
    $('status').textContent = blocked;
    return;
  }
  const closed = !settings.is_open;
  $('spin').disabled = $('hub').disabled = closed;
  $('status').textContent = closed
    ? 'ตอนนี้ปิดการหมุนชั่วคราว'
    : prizes.some((p) => p.stock > 0) ? 'กดปุ่มเพื่อหมุนได้เลย' : 'ของรางวัลหมดแล้ว หมุนรับลูกอมได้นะ';
}

// ---------- วาดกงล้อ ----------
function fitLines(text, maxW, startSize, minSize) {
  let size = startSize;
  const split = (t) => (t.includes(' ') ? t.split(' ') : [t]);
  let lines = [text];
  for (; size >= minSize; size -= 2) {
    ctx.font = `700 ${size}px Mali, sans-serif`;
    lines = ctx.measureText(text).width <= maxW ? [text] : split(text);
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= maxW) break;
  }
  return { lines, size: Math.max(size, minSize) };
}

function draw() {
  const n = slices.length;
  const seg = (Math.PI * 2) / n;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.translate(R, R);
  ctx.rotate((rot * Math.PI) / 180);
  const textR = R - 40;
  const maxW = R * 0.62;
  const arcH = 2 * Math.sin(seg / 2) * (R * 0.62);   // ความสูงช่องที่ตำแหน่งตัวหนังสือ
  const startSize = Math.min(44, Math.floor(arcH / 2.3));

  for (let i = 0; i < n; i++) {
    const a0 = i * seg - Math.PI / 2;
    const a1 = a0 + seg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
    ctx.fillStyle = slices[i].color; ctx.fill();
    ctx.strokeStyle = '#9A5B2A'; ctx.lineWidth = 4; ctx.stroke();

    ctx.save();
    ctx.rotate(a0 + seg / 2);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#4A2E17';
    const label = slices[i].prize ? slices[i].label : `🍬 ${slices[i].label}`;
    const { lines, size } = fitLines(label, maxW, startSize, 22);
    ctx.font = `700 ${size}px Mali, sans-serif`;
    const lh = size * 1.12;
    lines.forEach((l, k) => ctx.fillText(l, textR, (k - (lines.length - 1) / 2) * lh));
    ctx.restore();
  }
  for (let i = 0; i < n; i++) {
    const a = i * seg - Math.PI / 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * (R - 15), Math.sin(a) * (R - 15), 8, 0, Math.PI * 2);
    ctx.fillStyle = '#FCE6D3'; ctx.fill(); ctx.strokeStyle = '#5E3A1E'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
}

// ---------- เสียง ----------
function tone(freq, at, len, vol, type = 'sine') {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  const o = audio.createOscillator(); const g = audio.createGain();
  const t = audio.currentTime + at;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + len + 0.02);
}
const tick = () => { try { tone(950, 0, 0.05, 0.1, 'triangle'); } catch {} };
const chime = (win) => { try { (win ? [523, 659, 784, 1047] : [523, 440]).forEach((f, k) => tone(f, k * 0.12, 0.4, 0.18)); } catch {} };

const pointer = $('pointer');
function bump() { pointer.classList.remove('bump'); void pointer.offsetWidth; pointer.classList.add('bump'); }

// ผลที่เครื่องนี้หมุนไปแล้ววันนี้ (โหมด 1 เครื่องหมุนได้ 1 ครั้ง/วัน)
async function checkDevice() {
  if (lineMode || myResult || !settings.one_spin_per_device) return;
  const id = deviceId();
  if (!id) return;
  try {
    const { data, error } = await sb.rpc('wheel_device_status', { p_device_id: id });
    if (!error && data && data.status === 'already') myResult = data;
  } catch (e) { console.error(e); }
}

// ---------- หมุน ----------
async function spin() {
  if (myResult) { showResult(myResult); return; }
  if (spinning || !configured || blocked) return;
  spinning = true;
  $('spin').disabled = $('hub').disabled = true;
  $('status').textContent = 'กำลังสุ่ม…';
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}

  let res;
  try {
    if (lineMode) {
      res = await lineCall('spin');
    } else {
      const { data, error } = await sb.rpc('wheel_spin', { p_device_id: deviceId() });
      if (error) throw error;
      res = data;
    }
  } catch (err) {
    console.error(err);
    spinning = false; setIdleStatus();
    $('status').textContent = 'เชื่อมต่อไม่สำเร็จ ลองกดหมุนอีกครั้ง';
    return;
  }

  if (res.status === 'closed') {
    settings.is_open = false; spinning = false; setIdleStatus();
    return;
  }
  if (res.status === 'line_required') { location.reload(); return; }
  if (res.status === 'token_invalid') { spinning = false; relogin(); return; }
  if (res.status === 'not_friend') { spinning = false; showGate(true); setIdleStatus(); return; }
  if (res.status === 'friend_check_failed' || res.status === 'error') {
    spinning = false; setIdleStatus();
    $('status').textContent = 'ระบบตรวจสอบ LINE ขัดข้อง แจ้งเจ้าหน้าที่ที่บูธได้เลย';
    return;
  }
  if (res.status === 'already') {
    spinning = false; myResult = res;
    setIdleStatus(); showResult(res);
    return;
  }

  // หาช่องที่ตรงกับผล (ถ้าของชิ้นนี้ไม่อยู่บนกงล้อ ให้โหลดใหม่โดยรวมชิ้นนี้ไว้)
  let matches = matchSlices(res);
  if (!matches.length) {
    try { await load(res.prize_id); } catch {}
    matches = matchSlices(res);
  }
  const idx = matches.length ? matches[Math.floor(Math.random() * matches.length)] : 0;
  $('status').textContent = 'ลุ้น…';
  await animateTo(idx);
  spinning = false;
  showResult(res);
  if (lineMode) { myResult = { ...res, status: 'already' }; setIdleStatus(); }
}

function matchSlices(res) {
  return slices.map((s, i) => ({ s, i }))
    .filter(({ s }) => (res.consolation ? s.prize === null : s.prize && s.prize.id === res.prize_id))
    .map(({ i }) => i);
}

function animateTo(idx) {
  return new Promise((resolve) => {
    const n = slices.length; const segDeg = 360 / n;
    const jitter = (Math.random() - 0.5) * segDeg * 0.7;
    const targetMod = (((360 - (idx * segDeg + segDeg / 2 + jitter)) % 360) + 360) % 360;
    const cur = ((rot % 360) + 360) % 360;
    let delta = targetMod - cur; if (delta < 0) delta += 360;
    const turns = reduced ? 1 : 6 + Math.floor(Math.random() * 3);
    const start = rot; const end = rot + turns * 360 + delta;
    const dur = reduced ? 900 : 5000 + Math.random() * 1200;
    const t0 = performance.now();
    const segAt = (r) => Math.floor(((((360 - r) % 360) + 360) % 360) / segDeg);
    let last = segAt(rot);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      rot = start + (end - start) * (1 - Math.pow(1 - t, 4));
      draw();
      const s = segAt(rot);
      if (s !== last) { last = s; tick(); bump(); }
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

function showResult(res) {
  const time = new Date(res.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  const code = `KY-${String(res.spin_id).padStart(4, '0')}`;
  const already = res.status === 'already';
  if (res.consolation) {
    $('rEmoji').textContent = '🍬';
    $('rLead').textContent = already ? 'วันนี้คุณหมุนไปแล้ว ผลของคุณคือ' : 'รอบนี้ยังไม่ได้ของรางวัล';
    $('rPrize').textContent = already ? settings.consolation_name : `รับ${settings.consolation_name}ไปก่อนนะ`;
    $('rOk').textContent = 'ตกลง';
    if (!already) chime(false);
  } else {
    $('rEmoji').textContent = '🎉';
    $('rLead').textContent = already ? 'วันนี้คุณหมุนไปแล้ว ผลของคุณคือ' : 'ยินดีด้วย! คุณได้รับ';
    $('rPrize').textContent = res.name;
    $('rOk').textContent = 'ตกลง';
    if (!already) { chime(true); if (!reduced) confetti(); }
  }
  $('rClaim').innerHTML = `แสดงหน้านี้กับเจ้าหน้าที่เพื่อรับของ<br>รหัส <strong>${code}</strong> · ${time} น.`;
  $('overlay').classList.add('show');
  $('rOk').focus();
}

function closeResult() {
  $('overlay').classList.remove('show');
  load().catch(() => setIdleStatus());
}
$('rOk').addEventListener('click', closeResult);

// ---------- พลุ ----------
function confetti() {
  const cf = $('confetti'); const cc = cf.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cf.width = innerWidth * dpr; cf.height = innerHeight * dpr; cc.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#9A5B2A', '#A3A594', '#B8A77E', '#FCE6D3', '#D8B9C4', '#EBC77A'];
  const parts = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 100, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 8, h: 10 + Math.random() * 10,
    c: cols[Math.floor(Math.random() * cols.length)], leaf: Math.random() < 0.35,
  }));
  const t0 = performance.now();
  (function loop(now) {
    cc.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cc.save(); cc.translate(p.x, p.y); cc.rotate(p.r); cc.fillStyle = p.c;
      if (p.leaf) { cc.beginPath(); cc.ellipse(0, 0, p.w, p.w / 2.4, 0, 0, Math.PI * 2); cc.fill(); }
      else cc.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cc.restore();
    });
    if (now - t0 < 3000) requestAnimationFrame(loop); else cc.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

// ---------- LINE (LIFF) ----------
async function lineCall(action) {
  const { data, error } = await sb.functions.invoke('wheel-line-spin', {
    body: { action, idToken: liff.getIDToken(), accessToken: liff.getAccessToken() },
  });
  if (error) {
    // ฟังก์ชันตอบ 4xx/5xx พร้อม body ที่บอกสถานะ
    const body = await error.context?.json?.().catch(() => null);
    if (body && body.status) return body;
    throw error;
  }
  return data;
}

function relogin() {
  // กันวนล็อกอินไม่รู้จบ ถ้าเพิ่งล็อกอินไปไม่ถึง 30 วินาทีแล้วยังไม่ผ่าน ให้หยุด
  let last = 0;
  try { last = Number(sessionStorage.getItem('kaoiyok-relogin') || 0); } catch {}
  if (Date.now() - last < 30000) {
    blocked = 'ยืนยันบัญชี LINE ไม่สำเร็จ ลองปิดแล้วเปิดหน้านี้ใหม่';
    setIdleStatus();
    return;
  }
  try { sessionStorage.setItem('kaoiyok-relogin', String(Date.now())); } catch {}
  if (liff.isLoggedIn()) liff.logout();
  liff.login({ redirectUri: location.href });
}

function showGate(show) {
  $('friendGate').hidden = !show;
  const url = settings.line_add_friend_url;
  $('addFriend').hidden = !url;
  if (url) $('addFriend').href = url;
  blocked = show ? 'แอดเพื่อน LINE ก่อน แล้วกดตรวจสอบอีกครั้ง' : null;
}

async function checkFriend() {
  if (!settings.require_friend) { showGate(false); return; }
  try {
    const { friendFlag } = await liff.getFriendship();
    showGate(!friendFlag);
  } catch {
    showGate(false);   // เช็กในแอปไม่ได้ ให้เซิร์ฟเวอร์เป็นคนตัดสินตอนหมุน
  }
}

async function startLine() {
  lineMode = true;
  if (!LIFF_ID || !window.liff) {
    blocked = 'ยังไม่ได้ตั้งค่า LINE สำหรับกงล้อ แจ้งเจ้าหน้าที่ที่บูธได้เลย';
    setIdleStatus();
    return;
  }
  blocked = 'กำลังเชื่อมต่อ LINE…';
  setIdleStatus();
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }

  try {
    const p = await liff.getProfile();
    $('greet').textContent = `สวัสดีคุณ ${p.displayName}`;
    $('greet').hidden = false;
  } catch {}

  const st = await lineCall('status');
  if (st.status === 'token_invalid') { relogin(); return; }
  try { sessionStorage.removeItem('kaoiyok-relogin'); } catch {}
  blocked = null;
  if (st.status === 'already') myResult = st;
  else await checkFriend();
  setIdleStatus();
}

$('recheck').addEventListener('click', async () => {
  $('recheck').disabled = true;
  await checkFriend();
  $('recheck').disabled = false;
  setIdleStatus();
});

// ---------- เริ่มต้น ----------
$('spin').addEventListener('click', spin);
$('hub').addEventListener('click', spin);

buildSlices(); draw();
if (!configured) {
  $('setupNote').hidden = false;
  $('status').textContent = '';
  $('spin').disabled = $('hub').disabled = true;
} else {
  const fontReady = document.fonts?.load ? document.fonts.load('700 40px Mali') : Promise.resolve();
  Promise.all([fontReady, load()])
    .then(async () => {
      if (settings.require_line) return startLine();
      await checkDevice();
      setIdleStatus();
    })
    .catch((e) => {
      console.error(e);
      $('status').textContent = lineMode
        ? 'เชื่อมต่อ LINE ไม่สำเร็จ ลองปิดแล้วเปิดหน้านี้ใหม่'
        : 'โหลดของรางวัลไม่สำเร็จ ลองรีเฟรชหน้านี้';
    })
    .finally(draw);
  // อัปเดตจำนวนคงเหลือทุก 30 วินาที (ตอนไม่ได้หมุนอยู่)
  setInterval(() => { if (!spinning && !$('overlay').classList.contains('show')) load().catch(() => {}); }, 30000);
}
