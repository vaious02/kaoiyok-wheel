# กงล้อลุ้นรางวัล เก้าอี้โยก (KAO I YOK)

เว็บกงล้อสุ่มของรางวัลสำหรับบูธ ใช้เปิดจากลิงก์ใน LINE Official Account ได้ มีหลังบ้านให้แอดมินเข้าสู่ระบบเพื่อแก้ของรางวัล จำนวนคงเหลือ และโอกาสได้รางวัลปลอบใจ

- `index.html` หน้ากงล้อสำหรับลูกค้า (ออกแบบสำหรับมือถือ / LINE in-app browser)
- `admin.html` หลังบ้านสำหรับแอดมิน (Supabase Auth อีเมล + รหัสผ่าน)
- `supabase/schema.sql` ตาราง, RLS และฟังก์ชันสุ่ม `wheel_spin()`
- `supabase/002_line_liff.sql` โหมด LINE: 1 บัญชี LINE หมุนได้ 1 ครั้งต่อวัน
- `supabase/003_device_status.sql` ฟังก์ชัน `wheel_device_status()` ให้หน้าเว็บรู้ตั้งแต่เปิดหน้าว่าเครื่องนี้หมุนไปแล้ววันนี้
- `supabase/functions/wheel-line-spin/` Edge Function ยืนยันตัวตน LINE ฝั่งเซิร์ฟเวอร์
- เป็นไฟล์ static ล้วน ไม่ต้อง build

## การสุ่มทำงานอย่างไร

การสุ่มและตัดสต็อกทำในฐานข้อมูล (ฟังก์ชัน `wheel_spin`) ไม่ได้สุ่มในเบราว์เซอร์ จึงแก้ผลจากฝั่งหน้าเว็บไม่ได้ และของไม่ถูกแจกเกินจำนวน

1. ทุกครั้งที่หมุน มีโอกาส `lose_percent`% ได้รางวัลปลอบใจ (ค่าเริ่มต้น 70%)
2. ถ้าได้ของรางวัล ระบบสุ่มตามจำนวนที่เหลือ ของที่เหลือเยอะจะออกบ่อยกว่า ทำให้ของทุกอย่างทยอยหมดไปพร้อม ๆ กัน
3. ของหมดทุกอย่างแล้ว ทุกคนได้รางวัลปลอบใจ

ของรางวัลตั้งต้น 124 ชิ้น ที่ 70% จะหมดหลังมีคนหมุนราว 410 ครั้ง ในหน้าแอดมินใส่ "คาดว่าวันนี้จะมีคนหมุนอีกประมาณกี่ครั้ง" แล้วกด "ตั้งโอกาสให้ของพอทั้งวัน" ระบบจะคำนวณเปอร์เซ็นต์ให้ ปรับได้ระหว่างวันตามคนที่มาจริง

## ตั้งค่าครั้งแรก

1. **สร้างตาราง** — Supabase > SQL Editor > วางเนื้อหา `supabase/schema.sql` แล้วกด Run (ตารางขึ้นต้นด้วย `wheel_` ทั้งหมด ไม่ชนกับตารางคลังคำตอบแชทที่อยู่ในโปรเจกต์เดียวกัน)
2. **รันไฟล์เพิ่มเติม** — SQL Editor > รัน `supabase/002_line_liff.sql` แล้วตามด้วย `supabase/003_device_status.sql` (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
3. **สร้างบัญชีแอดมิน** — Authentication > Users > Add user ใส่อีเมลและรหัสผ่าน
4. **ให้สิทธิ์แอดมิน** — รันใน SQL Editor
   ```sql
   insert into public.wheel_admins (email) values ('อีเมลแอดมิน') on conflict do nothing;
   ```
   ผู้ใช้ที่ล็อกอินได้แต่ไม่มีอีเมลในตารางนี้ จะแก้ข้อมูลกงล้อไม่ได้
5. **ใส่ anon key** — เปิด `js/config.js` แล้วใส่ค่า anon public key จาก Project Settings > API (ห้ามใช้ service_role key)
6. **Deploy ขึ้น Netlify** — Add new site > Import from GitHub > เลือก repo นี้ ไม่ต้องตั้ง build command (ใช้ `netlify.toml` ที่มีอยู่)

## โหมด LINE (LIFF): 1 บัญชี LINE หมุนได้ 1 ครั้งต่อวัน

LIFF และ LINE Login ใช้ฟรี หน้าเว็บให้ลูกค้าล็อกอิน LINE แล้ว Edge Function จะเอา ID token ไปยืนยันกับ LINE ก่อนหมุน จึงปลอมบัญชีหรือหมุนซ้ำไม่ได้ ถ้าเปิด "ต้องแอดเพื่อน" ระบบจะเช็กกับ LINE ด้วยว่าแอดเพื่อน OA แล้วจริง

### 1. LINE Developers Console (https://developers.line.biz/console/)

1. ถ้า LINE OA ยังไม่เปิด Messaging API: LINE OA Manager > ตั้งค่า > Messaging API > เปิดใช้งาน แล้วเลือก Provider
2. ใน **Provider เดียวกัน** สร้าง channel ใหม่ประเภท **LINE Login** (App types เลือก Web app)
3. แท็บ Basic settings > **Linked LINE Official Account** เลือก OA ของศูนย์ (ต้องทำ ไม่งั้นเช็กการแอดเพื่อนไม่ได้) และจด **Channel ID**
4. แท็บ LIFF > Add
   - Size: **Full**
   - Endpoint URL: URL ของ Netlify เช่น `https://kaoiyok-wheel.netlify.app/`
   - Scopes: ติ๊ก **openid** และ **profile**
   - Add friend option: **On (Normal)**
   - กด Add แล้วจด **LIFF ID**
5. กดเปลี่ยนสถานะ channel จาก **Developing เป็น Published** (ถ้ายังเป็น Developing จะล็อกอินได้เฉพาะแอดมินของ channel ลูกค้าจะเข้าไม่ได้)

### 2. Supabase

1. SQL Editor > รัน `supabase/002_line_liff.sql`
2. สร้าง Edge Function จากโค้ดใน `supabase/functions/wheel-line-spin/index.ts`
   - ทางหน้าเว็บ: Edge Functions > Deploy a new function > Via Editor > วางโค้ด แล้ว **จดชื่อฟังก์ชันไว้** (Supabase ตั้งชื่อสุ่มให้ เช่น `hyper-responder` จะเปลี่ยนเป็น `wheel-line-spin` หรือใช้ชื่อสุ่มนั้นก็ได้)
   - หรือทาง CLI: `supabase functions deploy wheel-line-spin --project-ref cfmoqebpbzypkhplnqnr`
   - ใส่ชื่อที่ได้ลงใน `LINE_FUNCTION` ที่ `js/config.js` ให้ตรงกัน
3. Edge Functions > Secrets > เพิ่ม `LINE_CHANNEL_ID` = Channel ID จากข้อ 1.3
4. ถ้า key ใน `js/config.js` ขึ้นต้นด้วย `sb_publishable_` (key แบบใหม่) ให้ปิด **Enforce JWT verification** ของฟังก์ชันนี้ ถ้าเป็น anon key แบบเดิม (ขึ้นต้นด้วย `eyJ`) ไม่ต้องแก้

### 3. หน้าเว็บและหลังบ้าน

1. ใส่ LIFF ID ใน `js/config.js` (`LIFF_ID`) แล้ว push ขึ้น GitHub ให้ Netlify deploy ใหม่
2. หน้าแอดมิน > ตั้งค่ากงล้อ > เปิด **ต้องล็อกอิน LINE ก่อนหมุน** และ **ต้องแอดเพื่อน LINE OA ก่อนหมุน** ใส่ลิงก์แอดเพื่อน (LINE OA Manager > เพิ่มเพื่อน > ลิงก์ `https://lin.ee/...`) แล้วกดบันทึก
3. ใน Rich menu ของ OA ใช้ลิงก์ `https://liff.line.me/<LIFF_ID>` แทนลิงก์ Netlify

### แก้ปัญหาโหมด LINE

หน้ากงล้อจะขึ้นรหัสสั้น ๆ ต่อท้ายข้อความเมื่อเชื่อมต่อไม่สำเร็จ

| รหัส | แปลว่า | แก้ยังไง |
| --- | --- | --- |
| `LINE-404` | ไม่พบ Edge Function ชื่อที่ตั้งไว้ใน `LINE_FUNCTION` | Deploy ตามข้อ 2.2 หรือแก้ชื่อใน `js/config.js` ให้ตรง |
| `LINE-401` | คำขอถูกปฏิเสธก่อนถึงฟังก์ชัน | ถ้า key ใน `js/config.js` ขึ้นต้นด้วย `sb_publishable_` ให้ปิด Enforce JWT verification ของฟังก์ชัน |
| `LINE-500` | ฟังก์ชันรันแล้วพัง มักเพราะยังไม่ได้ตั้ง secret `LINE_CHANNEL_ID` หรือยังไม่ได้รัน `002_line_liff.sql` | ดูข้อ 2.1 และ 2.3 · ดู log ที่ Edge Functions > wheel-line-spin > Logs |
| `LINE-0` | เรียกฟังก์ชันไม่ถึงเลย มักเพราะชื่อใน `LINE_FUNCTION` ไม่ตรงกับที่ deploy ไว้ | เทียบชื่อที่ Supabase > Edge Functions แล้วแก้ `js/config.js` · กดปุ่ม "ทดสอบระบบ LINE" ในหน้าแอดมินดูผลได้ |

ระหว่างที่ยังแก้ไม่ได้ ปิดสวิตช์ "ต้องล็อกอิน LINE ก่อนหมุน" ในหน้าแอดมิน กงล้อจะกลับมาหมุนได้ทันที (ใช้โหมด 1 เครื่อง/วัน แทนไปก่อน)

เมื่อเปิดโหมด LINE แล้ว การหมุนแบบไม่ล็อกอินจะถูกปิดที่ฐานข้อมูลทันที ในหน้าแอดมินรายการผลการหมุนจะแสดงชื่อ LINE ของลูกค้า ใช้เทียบตอนแจกของได้ ถ้าต้องการปิดโหมด LINE ชั่วคราว (เช่น LINE ขัดข้องหน้างาน) ปิดสวิตช์ในหน้าแอดมินได้เลย กงล้อจะกลับเป็นแบบเปิดลิงก์แล้วหมุนได้

## ใส่ใน LINE Official Account (กรณีไม่ใช้โหมด LINE)

LINE Official Account Manager > Rich menu (หรือข้อความ / บัตรข้อความ) > เลือก action เป็น "ลิงก์" แล้วใส่ URL ของ Netlify เช่น `https://kaoiyok-wheel.netlify.app` หน้าเว็บจะเปิดใน browser ของ LINE ซึ่งรองรับไว้แล้ว

## ใช้งานหน้าบูธ

- ลูกค้าหมุนแล้วหน้าจอจะขึ้นชื่อรางวัล พร้อม **รหัส KY-xxxx และเวลา** ให้เจ้าหน้าที่เทียบกับ "ผลการหมุนล่าสุด" ในหน้าแอดมิน กันการเอาภาพหน้าจอเก่ามาแลก
- ถ้าลูกค้าหมุนเองจากมือถือ แนะนำโหมด LINE ด้านบน ถ้าไม่ใช้โหมด LINE อย่างน้อยควรเปิด "1 เครื่องหมุนได้ 1 ครั้งต่อวัน" ในหน้าแอดมิน **ต้องติ๊กเปิดเอง** ค่าเริ่มต้นคือปิดอยู่ ทุกคนจึงหมุนได้ไม่จำกัด (ข้อจำกัด: ลูกค้าล้างข้อมูล browser หรือเปลี่ยนเครื่องแล้วหมุนใหม่ได้)
- เมื่อเปิดสวิตช์นี้แล้ว คนที่หมุนไปแล้ววันนี้จะเห็นปุ่มเป็น "ดูรางวัลของฉัน" ตั้งแต่เปิดหน้า และเซิร์ฟเวอร์จะไม่ตัดสต็อกให้ซ้ำแม้กดหมุนอีก
- ปิดสวิตช์ "เปิดให้หมุน" ตอนปิดบูธ หน้ากงล้อจะหมุนไม่ได้
- แก้จำนวนคงเหลือได้ตลอด เช่น นับของจริงแล้วไม่ตรง

## รันบนเครื่อง

```bash
npx serve .
# หรือ
python3 -m http.server 5173
```
