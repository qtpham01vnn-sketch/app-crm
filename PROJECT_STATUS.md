# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:** [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md)  
**Ngày cập nhật:** 27/09/2026 (Bàn giao Đợt 1: Bảo mật Auth, Tách Mock/Live & Chuẩn bị P3/P4)  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git) (Branch: `main`)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel URL Kiểm Thử:** [`https://phuongnam-crm.vercel.app`](https://phuongnam-crm.vercel.app)  

---

## 1. TỔNG QUAN TIẾN ĐỘ & TRẠNG THÁI TỪNG PHASE

| Giai đoạn | Trạng thái | Đánh giá thực tế |
| :--- | :---: | :--- |
| **P0: Khảo sát & ERD** | ✅ Hoàn thành | ERD 23 bảng, RBAC 4 vai trò, ma trận phân quyền hoàn chỉnh. |
| **P1: Shell Responsive & Theme** | ✅ Hoàn thành | 21 màn hình, 10 Theme Accent, Topbar & BottomNav đáp ứng đa thiết bị. |
| **P2: Auth, Multi-tenant, RLS & Audit** | 🛡️ Đã siết bảo mật | Đã loại bỏ hoàn toàn auto-login/hardcoded credentials, chặn auto-link email tùy tiện, áp dụng `006_auth_security_hardening.sql`. RLS cô lập tổ chức & chi nhánh. |
| **P3: Master Data & Catalog Live** | 🚀 Đang hoàn thiện | Tạo/sửa Khách hàng đã ghi vào Supabase thật, đọc Master Data từ Supabase (Chi nhánh, Dịch vụ, Sản phẩm, Combo, Nhà cung cấp, Khuyến mãi, Nhân sự). Các phân hệ chưa có backend ghi rõ trạng thái mô phỏng. |
| **P4: Lịch hẹn & Today Hub** | ⏳ Chốt đặc tả | Đã chỉnh đặc tả kỹ thuật: Chống chồng chéo khoảng thời gian (PostgreSQL Range Exclusion), máy trạng thái hữu hạn (State Machine) chuyển hợp lệ, tra cứu hồ sơ có xác thực. |
| **P5: POS Thu ngân, Kho & In Bill** | ⏸ Chờ duyệt P4 | ACID checkout RPC, VietQR, in nhiệt K80/K58, quản lý PO-GRN. |
| **P6: CRM Nâng cao & Lương/Hoa hồng** | ⏸ Chờ duyệt P5 | Thư viện ảnh Before/After (Signed URL), chấm công, bảng lương tự động. |
| **P7: Báo cáo Tài chính & Go-Live** | ⏸ Chờ duyệt P6 | Báo cáo 3 trụ cột, công cụ import JSON app cũ (Idempotent), sao lưu & khôi phục. |

---

## 2. BẢNG TRẠNG THÁI KẾT NỐI TỪNG MODULE (LIVE vs MOCK)

| Phân hệ / Màn hình | Đọc Dữ Liệu | Ghi Dữ Liệu | Trạng Thái Backend |
| :--- | :---: | :---: | :--- |
| **Xác thực (Auth / Login)** | Supabase Auth + RPC | Supabase Auth (`signInWithPassword`) | ✅ LIVE THẬT (Chặn nặc danh, không fallback) |
| **Chi nhánh (`branches`)** | Supabase DB | Read-only | ✅ LIVE THẬT |
| **Khách hàng (`customers`)** | Supabase DB | Supabase DB (`INSERT`) | ✅ LIVE THẬT (Đã fix UUID & lỗi 400, F5 vẫn còn) |
| **Dịch vụ (`services`)** | Supabase DB | Form UI P3 | ✅ Đọc LIVE THẬT, Ghi đang hoàn thiện |
| **Sản phẩm & Tồn kho (`products`, `inventory_stocks`)** | Supabase DB | React State | ✅ Đọc LIVE THẬT (Tách biệt tồn kho thật, không merge mock) |
| **Combo / Gói (`packages`)** | Supabase DB | Form UI P3 | ✅ Đọc LIVE THẬT |
| **Nhà cung cấp (`suppliers`)** | Supabase DB | Form UI P3 | ✅ Đọc LIVE THẬT |
| **Khuyến mãi (`promotions`)** | Supabase DB | Form UI P3 | ✅ Đọc LIVE THẬT |
| **Hồ sơ Nhân sự (`staff_profiles`, `memberships`)** | Supabase DB | Read-only | ✅ LIVE THẬT (Quyền đọc từ membership) |
| **Lịch hẹn (`appointments`)** | React State | React State | ⚠️ MÔ PHỎNG (Chờ P4 kết nối Database + Exclusion Constraint) |
| **Gói liệu trình & Trừ buổi (`customer_courses`, `deductions`)** | React State | React State | ⚠️ MÔ PHỎNG (Giao diện P1/P3, chưa nối RPC trừ buổi) |
| **POS & Hóa đơn (`sales`, `payments`)** | React State | React State | ⚠️ MÔ PHỎNG (Chờ P5 ACID Checkout RPC) |
| **Phiếu PO / Nhập kho GRN** | React State | React State | ⚠️ MÔ PHỎNG (Chờ P5) |
| **Sổ quỹ & Chi phí (`expenses`)** | React State | React State | ⚠️ MÔ PHỎNG |
| **Phân ca, Chấm công, Hoa hồng, Bảng lương** | React State | React State | ⚠️ MÔ PHỎNG (Chờ P6) |

---

## 3. CÁC BIỆN PHÁP BẢO MẬT ĐÃ TRIỂN KHAI (ĐỢT 1)

1. **Xóa bỏ hoàn toàn Hardcoded Credentials & Demo Role Switcher khỏi Frontend:**
   - Đã xóa đối tượng `TEST_ROLE_CREDENTIALS` và logic tự động `signUp` / `switchRole` khỏi `authService.ts`.
   - Bộ chọn vai trò tự do trên Topbar đã chuyển thành **Role Badge chỉ đọc** (Hiển thị vai trò thực tế lấy từ `organization_memberships`).
   - Cổng xác thực `AuthGate` bắt buộc: Khi chưa đăng nhập hoặc không có membership hợp lệ, hệ thống từ chối quyền truy cập và hiển thị màn hình Đăng nhập.

2. **Migration Bảo Mật `006_auth_security_hardening.sql`:**
   - **Xóa Trigger nguy hiểm:** Đã gỡ bỏ trigger `on_auth_user_created_link_staff` (vốn tự động gán `auth_user_id` khi trùng email).
   - **Thay thế RPC:** Thay `claim_or_sync_staff_session()` bằng `get_staff_session()` ở chế độ **CHỈ ĐỌC** (`STABLE SECURITY DEFINER SET search_path = public`).
   - **Thu hồi quyền PUBLIC / anon:** `REVOKE EXECUTE` toàn bộ hàm helper (`get_staff_session`, `get_current_user_org_id`, `get_current_user_role`, `has_branch_access`) khỏi `anon` và `PUBLIC`, chỉ cấp cho `authenticated`.
   - **Quy trình Liên kết Tài khoản an toàn:** Cung cấp hàm `admin_link_staff_to_auth_user()` chỉ cho phép `owner_admin` liên kết tài khoản sau khi đã kiểm tra tổ chức.

3. **Cập nhật Schema Gốc:** Đồng bộ `supabase/full_schema_setup.sql` với toàn bộ cải tiến của Migration 006.

---

## 4. HƯỚNG DẪN THAO TÁC TRÊN SUPABASE DASHBOARD DÀNH CHO ANH

Để đảm bảo an toàn tuyệt đối cho 4 tài khoản thử nghiệm đã xác định bị lộ thông tin trước đây:

1. **Đăng nhập Supabase Dashboard:** Truy cập [https://supabase.com/dashboard/project/lskrcerzxltlrcewigrw](https://supabase.com/dashboard/project/lskrcerzxltlrcewigrw).
2. **Đổi Mật Khẩu (Reset Password):**
   - Vào mục **Authentication** ➔ **Users**.
   - Tìm lần lượt 4 tài khoản test (`admin@phuongnam.vn`, `manager.q1@phuongnam.vn`, `reception.q1@phuongnam.vn`, `doctor.lan@phuongnam.vn`).
   - Bấm vào menu ba chấm `...` ở bên phải từng tài khoản ➔ Chọn **Send Password Reset Email** (hoặc **Change Password** và tự nhập mật khẩu mới riêng của anh).
   - *Lưu ý:* Không gửi mật khẩu mới vào kênh chat.
3. **Thu hồi phiên đăng nhập cũ (Revoke Session):**
   - Tại dòng của từng tài khoản ➔ Chọn **Log out user** (hoặc **Delete User Sessions**) để hủy bỏ token/phiên đăng nhập cũ còn lưu trên các trình duyệt khác.
4. **Chạy Migration 006 (nếu chưa chạy qua CLI):**
   - Vào mục **SQL Editor** ➔ Mở tệp `supabase/migrations/006_auth_security_hardening.sql` ➔ Bấm **Run** để áp dụng các thiết lập bảo mật.

---

## 5. ĐẶC TẢ CHI TIẾT PHASE 4 (LỊCH HẸN & TODAY HUB)

Trước khi bắt tay vào triển khai P4, các quy chuẩn kỹ thuật đã được thống nhất và hoàn thiện:

1. **Chống trùng lịch (Anti Double-Booking) tại cấp độ Database:**
   - Không chỉ dựa vào kiểm tra ở frontend hoặc `UNIQUE (start_time)`.
   - Sử dụng kiểu dữ liệu dải thời gian `tstzrange` kết hợp **PostgreSQL Exclusion Constraint (`EXCLUDE USING gist`)** để chặn triệt để tình trạng 2 lịch hẹn trùng khoảng thời gian trên cùng 1 Nhân viên hoặc 1 Nguồn lực (Phòng/Ghế) ngay cả khi có request đồng thời:
     ```sql
     ALTER TABLE appointments ADD CONSTRAINT no_overlapping_staff_booking
     EXCLUDE USING gist (
       staff_id WITH =,
       tstzrange(start_time, end_time) WITH &&
     ) WHERE (status NOT IN ('cancelled', 'no_show'));
     ```
2. **Máy trạng thái Hữu hạn (State Machine) cho Lịch hẹn:**
   - Trạng thái lịch là các nhánh chuyển tiếp có điều kiện hợp lệ:
     - `pending` (Chờ duyệt) ➔ `confirmed` (Đã xác nhận) ➔ `in_service` (Đang phục vụ) ➔ `completed` (Hoàn thành) ➔ `billed` (Đã thanh toán POS).
     - Hủy/Vắng mặt: `pending`/`confirmed` ➔ `cancelled` (Hủy hẹn kèm lý do) hoặc `no_show` (Khách vắng).
     - Không cho phép chuỗi chuyển vô lý như `completed` ➔ `cancelled` ➔ `no_show`.
3. **Tra cứu Hồ sơ Cá nhân có Xác thực:**
   - Tuyệt đối không dùng cơ chế "Mã khách + Số điện thoại" để cấp quyền đọc toàn bộ bệnh án/lịch sử.
   - Tra cứu cần qua phiên đăng nhập được phân quyền hoặc cơ chế mã OTP gửi qua tin nhắn.
   - Mã QR khách hàng đóng vai trò là **Mã nhận diện (Identifier Token)** để quét nhanh tại quầy lễ tân, không phải là Auth Token mở toàn bộ hồ sơ bí mật.
4. **Tích hợp Google Calendar:**
   - Chốt mô hình đồng bộ 2 chiều qua Webhook/OAuth2 riêng biệt cho từng KTV/Bác sĩ.
   - Khi chưa kết nối hoặc chưa cấu hình OAuth, giao diện hiển thị trạng thái *"Chưa cấu hình tích hợp Google Calendar"*, không sử dụng stub giả lập để báo đã hoàn thành.
