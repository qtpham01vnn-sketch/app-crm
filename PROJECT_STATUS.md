# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:**
1. [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md) (Kế hoạch tổng thể 21 phân hệ)
2. [`docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md`](./docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md) (Đặc tả nâng cấp 7 màn hình CRM & Điều phối)

**Ngày cập nhật:** 28/09/2026 (Nghiệm thu Đợt E0, E1 & E2: Master Data, Quản lý Lịch hẹn & Lưới Điều phối)  
**GitHub Commit Mới Nhất:** `a1f7167` (`main`)  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel URL Kiểm Thử:** [`https://phuongnam-crm.vercel.app`](https://phuongnam-crm.vercel.app)  

---

## 1. MA TRẬN CHỨC NĂNG ĐỐI CHIẾU THỰC TẾ (FUNCTIONAL MATRIX)

| Màn hình / Luồng | File hiện có | Bảng Database / RPC | Đọc Thật | Ghi Thật | Kiểm Thử Đã Chạy | Trạng Thái & Bàn Giao | Phase |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :---: |
| **Xác thực & RBAC** | `src/services/authService.ts`, `LoginPage.tsx` | Supabase Auth, `staff_profiles`, `organization_memberships`, RPC `get_staff_session` | ✅ LIVE | ✅ LIVE | Unit test RLS, Login/Logout, Token refresh | 🛡️ Hoàn thành siết bảo mật | **P2** |
| **Chi nhánh** | `AppContext.tsx`, `Topbar.tsx` | `branches` | ✅ LIVE | Read-only | Đa chi nhánh isolation | ✅ Hoàn thành | **P2** |
| **Tổng quan (Dashboard Màn 1)** | `HomeView.tsx` | `sales`, `appointments`, `customers`, `inventory_stocks` | ✅ LIVE | N/A | KPI tính động theo ngày/chi nhánh, loại bỏ +18.5% cứng | 🚀 Đã chuẩn hóa E0 | **E0/E4** |
| **Khách hàng (CRM Màn 4)** | `CustView.tsx`, `masterDataService.ts` | `customers` | ✅ LIVE | ✅ LIVE | Thêm khách ghi Supabase, chặn lưu tạm khi lỗi, giữ form | 🚀 Chuẩn bị nâng cấp E3 | **E0/E3** |
| **Dịch vụ & Bảng giá (Màn 5)** | `SvcView.tsx`, `masterDataService.ts` | `services`, `service_price_versions`, `service_staff_skills`, `resources` | ✅ LIVE | ✅ LIVE | Giao diện 4 thẻ nhóm, bảng chi tiết KTV/lượt đặt/giá ưu đãi, modal thêm DV chuẩn, migration 007 | 🎯 Hoàn thành E1 (Theo Ảnh 5) | **E1** |
| **Sản phẩm & Kho** | `ProdView.tsx`, `InvView.tsx` | `products`, `inventory_stocks` | ✅ LIVE | ✅ LIVE (SP) | Đọc tồn kho thật theo chi nhánh, thêm SP lưu DB | 🚀 Hoàn thành E0 | **E0/P5** |
| **Gói / Combo** | `PkgView.tsx`, `masterDataService.ts` | `packages` | ✅ LIVE | ✅ LIVE | Thêm gói combo lưu Supabase | 🚀 Hoàn thành E0 | **E0/E1** |
| **Nhà cung cấp** | `SuppView.tsx`, `masterDataService.ts` | `suppliers` | ✅ LIVE | ✅ LIVE | Thêm nhà cung cấp lưu Supabase | 🚀 Hoàn thành E0 | **E0/P5** |
| **Khuyến mãi** | `PromosView.tsx`, `masterDataService.ts` | `promotions` | ✅ LIVE | ✅ LIVE | Tạo voucher lưu Supabase | 🚀 Hoàn thành E0 | **E0/E1** |
| **Danh sách Lịch hẹn (Màn 2)** | `ApptsView.tsx` | `appointments` | ✅ Live/State | ✅ Live/State | 5 KPI counters động, lọc ngày/trạng thái/KTV/search, sidebar khung giờ đông nhất & ghi chú | 🎯 Hoàn thành E2 (Theo Ảnh 2) | **E2** |
| **Chi tiết Lịch hẹn (Màn 3)** | `AppointmentDetailModal.tsx` | `appointments`, `appointment_events` | ✅ Live/State | ✅ Live/State | Quy trình 5 bước, form lịch hẹn, tabs lịch sử/sở thích/dị ứng, card VIP, panel tiền & cọc | 🎯 Hoàn thành E2 (Theo Ảnh 3) | **E2** |
| **Lịch Làm việc & Điều phối (Màn 6)** | `RosterView.tsx` | `shift_rosters`, `resources`, `resource_allocations` | ✅ Live/State | ✅ Live/State | Lưới 7 ngày x 14 khung giờ (08:00 - 21:00), mã màu dịch vụ, sidebar KTV/phòng trống/giờ cao điểm/đổi ca | 🎯 Hoàn thành E2 (Theo Ảnh 6) | **E2** |
| **Hộp thư Tư vấn (Màn 7)** | `ChatView.tsx` (chuẩn bị) | `conversations`, `messages`, `channel_accounts` | ❌ Chưa có | ❌ Chưa có | Chuẩn bị triển khai E5 với trạng thái "Chưa kết nối" khi thiếu API | ⏳ Đợt tiếp theo | **E5** |
| **POS & Hóa đơn** | `PosView.tsx`, `InvoiceModal.tsx` | `sales`, `payments` | ⚠️ State | ⚠️ State | Giỏ hàng, in bill mẫu K80/K58 | ACID Checkout RPC | **P5** |
| **Sổ quỹ & Chi phí** | `ExpView.tsx` | `expenses` | ⚠️ State | ⚠️ State | Giao diện thu chi | Sổ quỹ liên kết | **P5** |
| **Bảng lương & Hoa hồng** | `PayrollView.tsx`, `CommView.tsx` | `timesheets`, `commissions`, `payroll_records` | ⚠️ State | ⚠️ State | Giao diện tính lương | Hoa hồng sau bill | **P6** |

---

## 2. CHI TIẾT KẾT QUẢ TRIỂN KHAI ĐỢT E1 & E2

### 2.1 Đợt E1: Dịch vụ & Dữ liệu đầu vào (Ảnh 5 / P3)
- **Migration `007_e1_services_pricing_skills_resources.sql`:**
  * Bổ sung các cột mở rộng cho `services`: `image_url`, `description`, `buffer_minutes_before`, `buffer_minutes_after`, `allow_online_booking`, `is_featured`.
  * Tạo bảng `resources` (Phòng, Giường, Ghế, Thiết bị theo từng chi nhánh có sức chứa & trạng thái).
  * Tạo bảng `service_staff_skills` (Kỹ năng KTV liên kết dịch vụ kèm mức độ thành thạo và thời lượng riêng).
  * Tạo bảng `service_price_versions` (Bảng giá theo chi nhánh và hiệu lực thời gian `effective_from` / `effective_to`, giá ưu đãi kèm điều kiện).
  * Kích hoạt RLS bảo vệ phân quyền theo tổ chức và chi nhánh.
- **Màn hình Dịch vụ & Bảng giá (`SvcView.tsx`):**
  * 4 Thẻ nhóm dịch vụ tổng quan (*Massage, Chăm sóc da, Gội đầu dưỡng sinh, Combo trị liệu*) kèm thống kê đang áp dụng / tạm ẩn.
  * Bảng dữ liệu dịch vụ có Avatar KTV phù hợp, giá niêm yết, giá ưu đãi, lượt đặt trong tháng, badge trạng thái (*Đang áp dụng, Nổi bật, Tạm ẩn*).
  * Sidebar: Top 5 dịch vụ bán chạy, Gói combo nổi bật, Khuyến mãi flash đang áp dụng.
  * Modal Thêm dịch vụ mới đầy đủ cấu hình thời lượng, buffer trước/sau, online booking và giá ưu đãi.

### 2.2 Đợt E2: Quản lý Lịch hẹn, Chi tiết Lịch & Điều phối (Ảnh 2, 3, 6 / P4)
- **Màn hình Quản lý Lịch hẹn (`ApptsView.tsx` - Ảnh 2):**
  * 5 Thẻ KPI trạng thái: *Chờ xác nhận, Đã xác nhận, Hoàn thành, Hủy, Hôm nay*.
  * Bộ lọc đa tiêu chí: Tìm kiếm (Mã lịch, Tên, SĐT), Ngày chọn, Trạng thái, KTV.
  * Bảng danh sách chi tiết kèm nguồn đặt (*Website, Facebook, Zalo OA, Google, Khách quen*), thao tác Xem chi tiết & Xác nhận nhanh.
  * Sidebar: Thống kê hôm nay, Khung giờ đông nhất (có biểu đồ thanh tỷ lệ) và Ghi chú vận hành.
- **Modal Chi tiết Lịch hẹn (`AppointmentDetailModal.tsx` - Ảnh 3):**
  * Breadcrumb điều hướng chuyên nghiệp.
  * Form thông tin lịch hẹn đầy đủ (Họ tên, SĐT, Email, Ngày sinh, Dịch vụ, Ngày/Giờ hẹn, Số người 1..4+, KTV phụ trách, Ghi chú).
  * Quy trình xử lý 5 bước: *Tạo lịch ➔ Chờ xác nhận ➔ Đã xác nhận ➔ Đã nhắc lịch ➔ Hoàn thành*.
  * Tabs Lịch sử đặt hẹn, Sở thích và Dị ứng mỹ phẩm của khách hàng.
  * Card Khách hàng VIP với số lần đặt và tổng chi tiêu.
  * Panel Tổng thanh toán (Giá DV, Giảm giá, Cọc trước 20%, Còn lại phải thu).
  * Nút hành động: *Hủy lịch hẹn, Gửi nhắc lịch (Zalo), Xác nhận lịch, Lưu thay đổi*.
- **Màn hình Lịch Làm việc & Điều phối (`RosterView.tsx` - Ảnh 6):**
  * Bộ lọc Chi nhánh, Phòng trị liệu (*P. Sen 1, P. Sen 2, P. Trúc 1, P. Trúc 2, P. Mộc*), KTV, Loại dịch vụ, Tuần.
  * Nút chức năng: *+ Tạo ca làm, Chặn lịch, In lịch tuần*.
  * Lưới điều phối 7 ngày (Thứ 2 đến Chủ nhật) x 14 khung giờ (08:00 đến 21:00) với các thẻ lịch có mã màu chuẩn theo nhóm dịch vụ.
  * Sidebar: Trạng thái KTV đang làm ca, Danh sách phòng còn trống hôm nay kèm khung giờ trống, Khung giờ cao điểm và Yêu cầu đổi ca có nút phê duyệt.

---

## 3. KẾT QUẢ KIỂM THỬ KỸ THUẬT

- **TypeScript Type Check (`npx tsc --noEmit`):** ✅ **0 lỗi** (`exit code 0`).
- **Production Build (`npm run build`):** ✅ **Thành công** (`dist/` bundle hoàn tất trong 390ms).
- **Git Commit:** ✅ Commit `a1f7167` đã được lưu an toàn trên branch `main`.
- **Local Dev Server:** ✅ Đang phục vụ tại [http://localhost:5173](http://localhost:5173).
