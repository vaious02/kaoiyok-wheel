-- =========================================================
-- 003: ให้หน้าเว็บรู้ตั้งแต่เปิดหน้า ว่าเครื่องนี้หมุนไปแล้ววันนี้หรือยัง
-- รันหลัง schema.sql (และ 002_line_liff.sql ถ้ารันแล้ว) — รันซ้ำได้ ไม่ลบข้อมูลเดิม
-- =========================================================

-- เที่ยงคืนวันนี้ (เวลาไทย) — สร้างไว้ตรงนี้ด้วย เผื่อยังไม่ได้รัน 002
create or replace function public.wheel_today_start()
returns timestamptz language sql stable
as $$ select (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') $$;

-- ผลที่ "เครื่องนี้" หมุนไปแล้ววันนี้
-- คืนค่าว่าง = ยังหมุนได้ (ปิดโหมด 1 เครื่อง/วัน อยู่ หรือวันนี้ยังไม่เคยหมุน)
create or replace function public.wheel_device_status(p_device_id text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('status', 'already', 'spin_id', s.id, 'prize_id', s.prize_id,
    'name', s.prize_name, 'consolation', s.is_consolation, 'created_at', s.created_at)
  from public.wheel_spins s
  where p_device_id is not null
    and coalesce((select one_spin_per_device from public.wheel_settings where id = 1), false)
    and s.device_id = p_device_id
    and s.created_at >= public.wheel_today_start()
  order by s.created_at desc
  limit 1;
$$;

revoke all on function public.wheel_device_status(text) from public;
grant execute on function public.wheel_device_status(text) to anon, authenticated;
