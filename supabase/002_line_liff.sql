-- =========================================================
-- 002: โหมด LINE (LIFF) — 1 บัญชี LINE หมุนได้ 1 ครั้งต่อวัน
-- รันหลัง schema.sql (รันซ้ำได้)
-- =========================================================

alter table public.wheel_settings
  add column if not exists require_line        boolean not null default false,
  add column if not exists require_friend      boolean not null default true,
  add column if not exists line_add_friend_url text;

alter table public.wheel_spins
  add column if not exists line_user_id text,
  add column if not exists line_name    text;

create index if not exists wheel_spins_line_idx on public.wheel_spins (line_user_id, created_at desc);

-- เที่ยงคืนวันนี้ (เวลาไทย)
create or replace function public.wheel_today_start()
returns timestamptz language sql stable
as $$ select (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') $$;

-- ---------- แกนการสุ่ม (เรียกได้เฉพาะเซิร์ฟเวอร์: wheel_spin และ Edge Function) ----------
create or replace function public.wheel_spin_core(p_device_id text, p_line_user_id text, p_line_name text)
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
  -- ล็อกแถวตั้งค่า: คนหมุนพร้อมกันเข้าคิวทีละคน กันตัดสต็อกซ้อนและกันกดรัวจากบัญชีเดียว
  select * into s from public.wheel_settings where id = 1 for update;

  if not s.is_open then
    return json_build_object('status', 'closed');
  end if;

  if p_line_user_id is not null then
    select * into prev from public.wheel_spins
    where line_user_id = p_line_user_id and created_at >= public.wheel_today_start()
    order by created_at desc limit 1;
  elsif s.one_spin_per_device and p_device_id is not null then
    select * into prev from public.wheel_spins
    where device_id = p_device_id and created_at >= public.wheel_today_start()
    order by created_at desc limit 1;
  end if;
  if prev.id is not null then
    return json_build_object('status', 'already', 'spin_id', prev.id, 'prize_id', prev.prize_id,
      'name', prev.prize_name, 'consolation', prev.is_consolation, 'created_at', prev.created_at);
  end if;

  select coalesce(sum(stock), 0) into total from public.wheel_prizes where active and stock > 0;

  if total = 0 or random() * 100 < s.lose_percent then
    insert into public.wheel_spins (prize_id, prize_name, is_consolation, device_id, line_user_id, line_name)
    values (null, s.consolation_name, true, p_device_id, p_line_user_id, p_line_name)
    returning * into spin;
  else
    roll := floor(random() * total)::integer;
    for rec in
      select * from public.wheel_prizes where active and stock > 0 order by sort_order, id
    loop
      acc := acc + rec.stock;
      if roll < acc then picked := rec; exit; end if;
    end loop;

    update public.wheel_prizes set stock = stock - 1 where id = picked.id;
    insert into public.wheel_spins (prize_id, prize_name, is_consolation, device_id, line_user_id, line_name)
    values (picked.id, picked.name, false, p_device_id, p_line_user_id, p_line_name)
    returning * into spin;
  end if;

  return json_build_object('status', 'ok', 'spin_id', spin.id, 'prize_id', spin.prize_id,
    'name', spin.prize_name, 'consolation', spin.is_consolation, 'created_at', spin.created_at);
end;
$$;

-- ---------- หมุนจากหน้าเว็บตรง ๆ (ถูกปิดเมื่อเปิดโหมด LINE) ----------
create or replace function public.wheel_spin(p_device_id text default null)
returns json
language plpgsql volatile security definer set search_path = public
as $$
begin
  if (select require_line from public.wheel_settings where id = 1) then
    return json_build_object('status', 'line_required');
  end if;
  return public.wheel_spin_core(p_device_id, null, null);
end;
$$;

-- ---------- ผลที่บัญชี LINE นี้หมุนไปแล้ววันนี้ (null = ยังไม่หมุน) ----------
create or replace function public.wheel_line_status(p_line_user_id text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('status', 'already', 'spin_id', id, 'prize_id', prize_id,
    'name', prize_name, 'consolation', is_consolation, 'created_at', created_at)
  from public.wheel_spins
  where line_user_id = p_line_user_id and created_at >= public.wheel_today_start()
  order by created_at desc limit 1;
$$;

revoke all on function public.wheel_spin_core(text, text, text) from public, anon, authenticated;
revoke all on function public.wheel_line_status(text) from public, anon, authenticated;
grant execute on function public.wheel_spin_core(text, text, text) to service_role;
grant execute on function public.wheel_line_status(text) to service_role;
revoke all on function public.wheel_spin(text) from public;
grant execute on function public.wheel_spin(text) to anon, authenticated;
