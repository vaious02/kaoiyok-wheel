-- =========================================================
-- กงล้อลุ้นรางวัล เก้าอี้โยก — Supabase schema
-- รันไฟล์นี้ใน Supabase > SQL Editor (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
-- ทุกตารางขึ้นต้นด้วย wheel_ เพื่อไม่ชนกับงานอื่นในโปรเจกต์เดียวกัน
-- =========================================================

-- ---------- ตาราง ----------
create table if not exists public.wheel_prizes (
  id          bigint generated always as identity primary key,
  name        text    not null check (length(trim(name)) > 0),
  color       text    not null default '#FCE6D3',
  stock       integer not null default 0 check (stock >= 0),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.wheel_settings (
  id                   smallint primary key default 1 check (id = 1),
  consolation_name     text     not null default 'ลูกอม',
  lose_percent         smallint not null default 70 check (lose_percent between 0 and 100),
  is_open              boolean  not null default true,
  one_spin_per_device  boolean  not null default false,
  updated_at           timestamptz not null default now()
);
insert into public.wheel_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.wheel_spins (
  id              bigint generated always as identity primary key,
  prize_id        bigint references public.wheel_prizes(id) on delete set null,
  prize_name      text    not null,
  is_consolation  boolean not null,
  device_id       text,
  created_at      timestamptz not null default now()
);
create index if not exists wheel_spins_created_idx on public.wheel_spins (created_at desc);
create index if not exists wheel_spins_device_idx  on public.wheel_spins (device_id, created_at desc);

-- อีเมลที่เป็นแอดมินกงล้อ (บัญชีต้องสร้างใน Supabase Auth ก่อน)
create table if not exists public.wheel_admins (
  email text primary key
);

-- ---------- ตรวจสิทธิ์แอดมิน ----------
create or replace function public.wheel_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.wheel_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- หมุนกงล้อ: สุ่มฝั่งเซิร์ฟเวอร์ + ตัดสต็อก ----------
-- 1) มีโอกาส lose_percent% ที่จะได้รางวัลปลอบใจ
-- 2) ถ้าได้ของรางวัล จะสุ่มตามจำนวนคงเหลือ (ของที่เหลือเยอะออกบ่อยกว่า ทุกอย่างหมดพร้อม ๆ กัน)
-- 3) ของหมดทุกอย่าง = ได้รางวัลปลอบใจเสมอ
create or replace function public.wheel_spin(p_device_id text default null)
returns json
language plpgsql volatile security definer set search_path = public
as $$
declare
  s      public.wheel_settings;
  total  integer;
  roll   integer;
  acc    integer := 0;
  rec    record;
  picked public.wheel_prizes;
  prev   public.wheel_spins;
  spin   public.wheel_spins;
begin
  -- ล็อกแถวตั้งค่าไว้ ทำให้คนที่หมุนพร้อมกันเข้าคิวทีละคน ไม่ตัดสต็อกซ้อน
  select * into s from public.wheel_settings where id = 1 for update;

  if not s.is_open then
    return json_build_object('status', 'closed');
  end if;

  if s.one_spin_per_device and p_device_id is not null then
    select * into prev from public.wheel_spins
    where device_id = p_device_id
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
    order by created_at desc limit 1;
    if found then
      return json_build_object('status', 'already', 'spin_id', prev.id, 'prize_id', prev.prize_id,
        'name', prev.prize_name, 'consolation', prev.is_consolation, 'created_at', prev.created_at);
    end if;
  end if;

  select coalesce(sum(stock), 0) into total from public.wheel_prizes where active and stock > 0;

  if total = 0 or random() * 100 < s.lose_percent then
    insert into public.wheel_spins (prize_id, prize_name, is_consolation, device_id)
    values (null, s.consolation_name, true, p_device_id)
    returning * into spin;
  else
    roll := floor(random() * total)::integer;
    for rec in
      select * from public.wheel_prizes where active and stock > 0 order by sort_order, id
    loop
      acc := acc + rec.stock;
      if roll < acc then
        picked := rec;
        exit;
      end if;
    end loop;

    update public.wheel_prizes set stock = stock - 1 where id = picked.id;
    insert into public.wheel_spins (prize_id, prize_name, is_consolation, device_id)
    values (picked.id, picked.name, false, p_device_id)
    returning * into spin;
  end if;

  return json_build_object('status', 'ok', 'spin_id', spin.id, 'prize_id', spin.prize_id,
    'name', spin.prize_name, 'consolation', spin.is_consolation, 'created_at', spin.created_at);
end;
$$;

revoke all on function public.wheel_spin(text) from public;
grant execute on function public.wheel_spin(text) to anon, authenticated;
grant execute on function public.wheel_is_admin() to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.wheel_prizes   enable row level security;
alter table public.wheel_settings enable row level security;
alter table public.wheel_spins    enable row level security;
alter table public.wheel_admins   enable row level security;

drop policy if exists "prizes readable by everyone" on public.wheel_prizes;
create policy "prizes readable by everyone" on public.wheel_prizes
  for select using (true);
drop policy if exists "prizes managed by admins" on public.wheel_prizes;
create policy "prizes managed by admins" on public.wheel_prizes
  for all to authenticated using (public.wheel_is_admin()) with check (public.wheel_is_admin());

drop policy if exists "settings readable by everyone" on public.wheel_settings;
create policy "settings readable by everyone" on public.wheel_settings
  for select using (true);
drop policy if exists "settings managed by admins" on public.wheel_settings;
create policy "settings managed by admins" on public.wheel_settings
  for update to authenticated using (public.wheel_is_admin()) with check (public.wheel_is_admin());

-- ผลการหมุน: คนทั่วไปเขียนได้ผ่าน wheel_spin() เท่านั้น, แอดมินดู/ลบได้
drop policy if exists "spins readable by admins" on public.wheel_spins;
create policy "spins readable by admins" on public.wheel_spins
  for select to authenticated using (public.wheel_is_admin());
drop policy if exists "spins deletable by admins" on public.wheel_spins;
create policy "spins deletable by admins" on public.wheel_spins
  for delete to authenticated using (public.wheel_is_admin());

drop policy if exists "admins see admin list" on public.wheel_admins;
create policy "admins see admin list" on public.wheel_admins
  for select to authenticated using (public.wheel_is_admin());

-- ---------- ข้อมูลตั้งต้น (ใส่เฉพาะตอนตารางยังว่าง) ----------
insert into public.wheel_prizes (name, color, stock, sort_order)
select * from (values
  ('น้ำมันเหลือง',       '#F3D98B',  9, 1),
  ('น้ำมันเขียว',        '#C9CDB6', 29, 2),
  ('สบู่เหลว ข้าว',       '#EFE3C8', 19, 3),
  ('สบู่เหลว มังคุด',     '#D8B9C4', 19, 4),
  ('น้ำยาเอนกประสงค์',    '#BFD3D0', 14, 5),
  ('แชมพู',             '#FCE6D3', 14, 6),
  ('น้ำมันเหลืองจิ๋ว',     '#EBC77A',  9, 7),
  ('ยาดมสมุนไพรน้ำ',     '#D5C7A8', 11, 8)
) as v(name, color, stock, sort_order)
where not exists (select 1 from public.wheel_prizes);

-- ---------- เพิ่มแอดมิน ----------
-- 1) Supabase > Authentication > Users > Add user (อีเมล + รหัสผ่าน)
-- 2) เปลี่ยนอีเมลแล้วรันบรรทัดนี้:
-- insert into public.wheel_admins (email) values ('you@example.com') on conflict do nothing;
