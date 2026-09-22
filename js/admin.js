import { sb, configured } from './supabase.js';
import { LINE_FUNCTION } from './config.js';

const $ = (id) => document.getElementById(id);
let prizes = [];
let spins = [];
let settings = null;

// ---------- ทั่วไป ----------
let toastTimer;
function toast(msg, isErr = false) {
  const t = $('toast');
  t.textContent = msg; t.classList.toggle('err', isErr); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function show(which) {
  $('loginPanel').hidden = which !== 'login';
  $('notAdmin').hidden = which !== 'notAdmin';
  $('app').hidden = which !== 'app';
}
const bkkTime = (iso) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
function startOfTodayBkk() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const offset = Date.now() - d.getTime();       // ส่วนต่างเวลาเครื่องกับเวลาไทย
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + offset);
}

// ---------- เข้าสู่ระบบ ----------
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('login');
  $('who').textContent = session.user.email;
  const { data: isAdmin, error } = await sb.rpc('wheel_is_admin');
  if (error || !isAdmin) return show('notAdmin');
  show('app');
  await loadAll();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').textContent = '';
  $('loginBtn').disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  $('loginBtn').disabled = false;
  if (error) { $('loginErr').textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'; return; }
  $('password').value = '';
  checkSession();
});
document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
  await sb.auth.signOut(); $('who').textContent = ''; show('login');
}));

// ---------- โหลดข้อมูล ----------
async function loadAll(auto = false) {
  const [p, s, sp] = await Promise.all([
    sb.from('wheel_prizes').select('*').order('sort_order').order('id'),
    sb.from('wheel_settings').select('*').eq('id', 1).single(),
    sb.from('wheel_spins').select('*').order('created_at', { ascending: false }).limit(3000),
  ]);
  const bad = [p, s, sp].find((r) => r.error);
  if (bad) { toast(`โหลดข้อมูลไม่สำเร็จ: ${bad.error.message}`, true); return; }
  prizes = p.data; settings = s.data; spins = sp.data;
  renderStats(); renderLog();
  // ตอนรีเฟรชอัตโนมัติ ไม่ทับค่าที่แอดมินกำลังแก้อยู่
  const editing = document.activeElement && document.activeElement.closest('.panel');
  if (!auto) renderSettings(); else renderEstimate();
  if (!auto || !editing) renderPrizes();
  $('updatedAt').textContent = `อัปเดตล่าสุด ${bkkTime(new Date().toISOString())} น.`;
}
$('refresh').addEventListener('click', () => loadAll());

// ---------- สรุป ----------
function renderStats() {
  const since = startOfTodayBkk();
  const today = spins.filter((s) => new Date(s.created_at) >= since);
  $('sSpins').textContent = today.length;
  $('sWins').textContent = today.filter((s) => !s.is_consolation).length;
  $('sCandy').textContent = today.filter((s) => s.is_consolation).length;
}

// ---------- ตั้งค่า ----------
function remainingStock() {
  return prizes.filter((p) => p.active).reduce((a, p) => a + p.stock, 0);
}
function renderEstimate() {
  const lose = Number($('lose').value);
  $('loseOut').textContent = `${lose}%`;
  const left = remainingStock();
  const winRate = (100 - lose) / 100;
  $('estimate').textContent = left === 0
    ? 'ของรางวัลหมดแล้ว ทุกคนจะได้รางวัลปลอบใจ'
    : `หมุน 10 ครั้ง ได้ของรางวัลประมาณ ${Math.round(winRate * 10)} ครั้ง · ของที่เหลือ ${left} ชิ้น จะหมดหลังหมุนราว ${Math.round(left / winRate).toLocaleString('th-TH')} ครั้ง`;
}
// คอลัมน์โหมด LINE มีเฉพาะเมื่อรัน supabase/002_line_liff.sql แล้ว
const hasLineColumns = () => !!settings && 'require_line' in settings;

function renderSettings() {
  const line = hasLineColumns();
  ['requireLine', 'requireFriend', 'friendUrl'].forEach((id) => { $(id).disabled = !line; });
  $('lineSetupNote').hidden = line;
  $('lose').value = settings.lose_percent;
  $('candyName').value = settings.consolation_name;
  $('isOpen').checked = settings.is_open;
  $('onePerDevice').checked = settings.one_spin_per_device;
  $('requireLine').checked = !!settings.require_line;
  $('requireFriend').checked = settings.require_friend !== false;
  $('friendUrl').value = settings.line_add_friend_url || '';
  try { $('expected').value = localStorage.getItem('kaoiyok-expected') || ''; } catch {}
  renderEstimate();
}
$('lose').addEventListener('input', renderEstimate);
$('suggest').addEventListener('click', () => {
  const n = Number($('expected').value);
  if (!n || n < 1) { toast('ใส่จำนวนครั้งที่คาดว่าจะมีคนหมุนก่อน', true); return; }
  try { localStorage.setItem('kaoiyok-expected', String(n)); } catch {}
  const left = remainingStock();
  const lose = Math.min(95, Math.max(0, Math.ceil((1 - left / n) * 100 / 5) * 5));
  $('lose').value = lose; renderEstimate();
  toast(`ตั้งเป็น ${lose}% แล้ว กดบันทึกการตั้งค่าเพื่อใช้งาน`);
});
$('saveSettings').addEventListener('click', async () => {
  const patch = {
    lose_percent: Number($('lose').value),
    consolation_name: $('candyName').value.trim() || 'ลูกอม',
    is_open: $('isOpen').checked,
    one_spin_per_device: $('onePerDevice').checked,
    updated_at: new Date().toISOString(),
  };
  if (hasLineColumns()) {
    patch.require_line = $('requireLine').checked;
    patch.require_friend = $('requireFriend').checked;
    patch.line_add_friend_url = $('friendUrl').value.trim() || null;
    if (patch.require_friend && patch.require_line && !patch.line_add_friend_url) {
      return toast('ใส่ลิงก์แอดเพื่อน LINE OA ก่อน ลูกค้าจะได้กดแอดได้', true);
    }
  }
  const { error } = await sb.from('wheel_settings').update(patch).eq('id', 1);
  if (error) return toast(`บันทึกไม่สำเร็จ: ${error.message}`, true);
  settings = { ...settings, ...patch };
  toast('บันทึกการตั้งค่าแล้ว');
});

// ---------- ทดสอบว่า Edge Function wheel-line-spin พร้อมใช้งานไหม ----------
// เรียกโดยไม่มี LINE token ถ้าฟังก์ชันมีชีวิตจะตอบ token_invalid กลับมา
$('testLine').addEventListener('click', async () => {
  const btn = $('testLine');
  const out = $('lineTestResult');
  btn.disabled = true;
  out.textContent = 'กำลังทดสอบ…';
  try {
    const { data, error } = await sb.functions.invoke(LINE_FUNCTION, { body: { action: 'status' } });
    if (!error) { out.textContent = `✅ ฟังก์ชันทำงานอยู่ (ตอบ ${data?.status || 'ok'})`; return; }
    const code = error.context?.status;
    const body = await error.context?.json?.().catch(() => null);
    console.error(`${LINE_FUNCTION} test`, code, body, error);
    if (body?.status === 'token_invalid') {
      out.textContent = '✅ ฟังก์ชันพร้อมใช้งาน (ตอบ token_invalid ถูกต้องแล้ว เพราะทดสอบจากหน้าแอดมินไม่มี LINE token)';
    } else if (body?.message?.includes('LINE_CHANNEL_ID')) {
      out.textContent = '⚠️ ติดตั้งฟังก์ชันแล้ว แต่ยังไม่ได้ตั้ง secret LINE_CHANNEL_ID (Edge Functions > Secrets)';
    } else if (code === 404) {
      out.textContent = `❌ ไม่พบฟังก์ชันชื่อ "${LINE_FUNCTION}" ใน Supabase > Edge Functions (แก้ชื่อได้ที่ LINE_FUNCTION ใน js/config.js)`;
    } else if (!code) {
      out.textContent = `❌ เรียกฟังก์ชัน "${LINE_FUNCTION}" ไม่ถึงเลย — ชื่อไม่ตรงกับที่ deploy ไว้ หรือถูกบล็อกก่อนถึงฟังก์ชัน`;
    } else {
      out.textContent = `❌ ฟังก์ชันตอบ ${code}: ${body?.message || error.message}`;
    }
  } catch (e) {
    out.textContent = `❌ ทดสอบไม่สำเร็จ: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- ของรางวัล ----------
function givenCount(id) { return spins.filter((s) => s.prize_id === id).length; }

async function savePrize(id, patch, quiet = false) {
  const { error } = await sb.from('wheel_prizes').update(patch).eq('id', id);
  if (error) { toast('บันทึกไม่สำเร็จ', true); return false; }
  Object.assign(prizes.find((p) => p.id === id), patch);
  renderEstimate();
  if (!quiet) toast('บันทึกแล้ว');
  return true;
}

function renderPrizes() {
  const ul = $('prizeRows');
  ul.innerHTML = '';
  prizes.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = p.active ? '' : 'off';
    li.innerHTML = `
      <input class="c" type="color" aria-label="สีช่อง">
      <input class="input n" aria-label="ชื่อของรางวัล" maxlength="40">
      <div class="stepper">
        <button class="btn minus" type="button" aria-label="ลดจำนวน">−</button>
        <input class="input s" type="number" min="0" inputmode="numeric" aria-label="จำนวนคงเหลือ">
        <button class="btn plus" type="button" aria-label="เพิ่มจำนวน">+</button>
        <span class="given"></span>
      </div>
      <div class="acts">
        <button class="btn up" type="button" aria-label="เลื่อนขึ้น">↑</button>
        <button class="btn toggle" type="button"></button>
        <button class="btn danger del" type="button">ลบ</button>
      </div>`;
    const c = li.querySelector('.c'), n = li.querySelector('.n'), s = li.querySelector('.s');
    c.value = p.color; n.value = p.name; s.value = p.stock;
    li.querySelector('.given').textContent = `แจกแล้ว ${givenCount(p.id)}`;
    li.querySelector('.toggle').textContent = p.active ? 'ซ่อน' : 'แสดง';
    li.querySelector('.up').disabled = i === 0;

    c.addEventListener('change', () => savePrize(p.id, { color: c.value }));
    n.addEventListener('change', () => {
      const v = n.value.trim();
      if (!v) { n.value = p.name; return toast('ชื่อของรางวัลต้องไม่ว่าง', true); }
      savePrize(p.id, { name: v });
    });
    let t;
    const queueStock = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = Math.max(0, Math.floor(Number(s.value) || 0));
        s.value = v; savePrize(p.id, { stock: v });
      }, 600);
    };
    s.addEventListener('input', queueStock);
    li.querySelector('.minus').addEventListener('click', () => { s.value = Math.max(0, Number(s.value) - 1); queueStock(); });
    li.querySelector('.plus').addEventListener('click', () => { s.value = Number(s.value) + 1; queueStock(); });
    li.querySelector('.toggle').addEventListener('click', async () => {
      if (await savePrize(p.id, { active: !p.active })) renderPrizes();
    });
    li.querySelector('.up').addEventListener('click', async () => {
      const prev = prizes[i - 1];
      const a = prev.sort_order, b = p.sort_order === a ? a + 1 : p.sort_order;
      await Promise.all([savePrize(p.id, { sort_order: a }, true), savePrize(prev.id, { sort_order: b }, true)]);
      prizes.sort((x, y) => x.sort_order - y.sort_order || x.id - y.id);
      renderPrizes();
    });
    li.querySelector('.del').addEventListener('click', async () => {
      if (!confirm(`ลบ "${p.name}" ออกจากกงล้อ?`)) return;
      const { error } = await sb.from('wheel_prizes').delete().eq('id', p.id);
      if (error) return toast('ลบไม่สำเร็จ', true);
      prizes = prizes.filter((x) => x.id !== p.id);
      renderPrizes(); renderEstimate(); toast('ลบแล้ว');
    });
    ul.appendChild(li);
  });
}

const PALETTE = ['#F3D98B', '#C9CDB6', '#EFE3C8', '#D8B9C4', '#BFD3D0', '#FCE6D3', '#EBC77A', '#D5C7A8'];
$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('newName').value.trim();
  const stock = Math.max(0, Math.floor(Number($('newStock').value) || 0));
  if (!name) return;
  const row = {
    name, stock,
    color: PALETTE[prizes.length % PALETTE.length],
    sort_order: prizes.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1,
  };
  const { data, error } = await sb.from('wheel_prizes').insert(row).select().single();
  if (error) return toast('เพิ่มไม่สำเร็จ', true);
  prizes.push(data); renderPrizes(); renderEstimate();
  $('newName').value = ''; $('newStock').value = '';
  toast(`เพิ่ม "${name}" แล้ว`);
});

// ---------- ประวัติ ----------
function renderLog() {
  const ul = $('log');
  ul.innerHTML = '';
  if (!spins.length) { ul.innerHTML = '<li>ยังไม่มีการหมุน</li>'; return; }
  spins.slice(0, 100).forEach((s) => {
    const li = document.createElement('li');
    li.innerHTML = '<time></time><span class="nm"></span><span class="code"></span>';
    li.querySelector('time').textContent = bkkTime(s.created_at);
    const who = s.line_name ? ` · ${s.line_name}` : '';
    li.querySelector('.nm').textContent = (s.is_consolation ? `🍬 ${s.prize_name}` : `🎁 ${s.prize_name}`) + who;
    li.querySelector('.code').textContent = `KY-${String(s.id).padStart(4, '0')}`;
    ul.appendChild(li);
  });
}
$('clearLog').addEventListener('click', async () => {
  if (!confirm('ล้างประวัติการหมุนทั้งหมด? จำนวนคงเหลือของรางวัลจะไม่เปลี่ยน')) return;
  const { error } = await sb.from('wheel_spins').delete().gt('id', 0);
  if (error) return toast('ล้างไม่สำเร็จ', true);
  spins = []; renderStats(); renderLog(); renderPrizes(); toast('ล้างประวัติแล้ว');
});

// ---------- เริ่มต้น ----------
if (!configured) {
  show('login');
  $('loginErr').textContent = 'ยังไม่ได้ใส่ Supabase anon key ใน js/config.js';
  $('loginBtn').disabled = true;
} else {
  checkSession();
  setInterval(() => { if (!$('app').hidden && document.visibilityState === 'visible') loadAll(true); }, 60000);
}
