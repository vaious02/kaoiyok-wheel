// ค่าเชื่อมต่อ Supabase
// anon key เปิดเผยในหน้าเว็บได้ (สิทธิ์ถูกคุมด้วย RLS ใน supabase/schema.sql)
// ห้ามใส่ service_role key ในไฟล์นี้เด็ดขาด
export const SUPABASE_URL = 'https://cfmoqebpbzypkhplnqnr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbW9xZWJwYnp5cGtocGxucW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUzNTcsImV4cCI6MjEwMjgwMTM1N30.mWo1nM7Pyo4sQ-ALq6qDhu4wl9oa_yzHvDepCfIhhRA'; // Supabase > Project Settings > API > anon public

// ชื่อ Edge Function ที่ deploy ไว้ใน Supabase (Edge Functions > ชื่อที่เห็นในลิสต์)
// ตอนสร้างผ่านหน้าเว็บ Supabase จะตั้งชื่อสุ่มให้ เช่น hyper-responder ถ้าไม่ได้เปลี่ยนชื่อ ให้ใส่ชื่อนั้นตรงนี้
export const LINE_FUNCTION = 'hyper-responder';

// LIFF ID จาก LINE Developers > LINE Login channel > LIFF (ใช้เมื่อเปิดโหมด "ต้องล็อกอิน LINE" ในหน้าแอดมิน)
export const LIFF_ID = '2011700777-REHXLSqL';
