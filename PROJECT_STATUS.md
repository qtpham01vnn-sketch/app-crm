# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:**
1. [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md) (Kế hoạch tổng thể 21 phân hệ)
2. [`docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md`](./docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md) (Đặc tả nâng cấp 7 màn hình CRM & Điều phối)

**Ngày cập nhật:** 28/09/2026 (Nghiệm thu Theme 11 "Spa Thanh Lịch — Kem & Hồng Phấn", E0, E1 & E2)  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel URL Kiểm Thử:** [`https://phuongnam-crm.vercel.app`](https://phuongnam-crm.vercel.app)  

---

## 1. MA TRẬN CHỨC NĂNG ĐỐI CHIẾU THỰC TẾ (FUNCTIONAL MATRIX)

| Màn hình / Luồng | File hiện có | Bảng Database / RPC | Đọc Thật | Ghi Thật | Kiểm Thử Đã Chạy | Trạng Thái & Bàn Giao | Phase |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :---: |
| **Theme Hệ Thống (11 Theme)** | `themes.ts`, `AppContext.tsx`, `ThemeModal.tsx`, `index.css` | LocalStorage `vua_app_theme`, CSS Variables | ✅ LIVE | ✅ LIVE | Switch 11 theme tức thì, lưu LocalStorage, không mất dữ liệu/filter, hỗ trợ `spa_elegance` tone ấm | 🎨 Hoàn thành Theme 11 | **Theme** |
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
| **Chi tiết Lịch hẹn (Màn 3)** | `AppointmentDetailModal.tsx` | `appointments`, `appointment_events` | ✅ Live/State | ✅ Live/State | Quy trình 5 bước tác nghiệp (*Tạo lịch ➔ Chờ duyệt ➔ Đã xác nhận ➔ Đang làm ➔ Hoàn thành*), tách biệt **Nhật Ký Nhắc Hẹn (Zalo/SMS)**, tabs sở thích/dị ứng/lịch sử | 🎯 Hoàn thành E2 (Theo Ảnh 3) | **E2** |
| **Lịch Làm việc & Điều phối (Màn 6)** | `RosterView.tsx` | `shift_rosters`, `resources`, `resource_allocations` | ✅ Live/State | ✅ Live/State | Lưới 7 ngày x 14 khung giờ (08:00 - 21:00), mã màu dịch vụ, sidebar KTV/phòng trống/giờ cao điểm/đổi ca | 🎯 Hoàn thành E2 (Theo Ảnh 6) | **E2** |
| **Hộp thư Tư vấn (Màn 7)** | `ChatView.tsx` (chuẩn bị) | `conversations`, `messages`, `channel_accounts` | ❌ Chưa có | ❌ Chưa có | Chuẩn bị triển khai E5 với trạng thái "Chưa kết nối" khi thiếu API | ⏳ Đợt tiếp theo | **E5** |
| **POS & Hóa đơn** | `PosView.tsx`, `InvoiceModal.tsx` | `sales`, `payments` | ⚠️ State | ⚠️ State | Giỏ hàng, in bill mẫu K80/K58 | ACID Checkout RPC | **P5** |
| **Sổ quỹ & Chi phí** | `ExpView.tsx` | `expenses` | ⚠️ State | ⚠️ State | Giao diện thu chi | Sổ quỹ liên kết | **P5** |
| **Bảng lương & Hoa hồng** | `PayrollView.tsx`, `CommView.tsx` | `timesheets`, `commissions`, `payroll_records` | ⚠️ State | ⚠️ State | Giao diện tính lương | Hoa hồng sau bill | **P6** |

---

## 2. BÁO CÁO CHI TIẾT THEO YÊU CẦU

### 2.1 Theme Mới: "Spa Thanh Lịch — Kem & Hồng Phấn" (Theme 11)
- **Thông số bảng màu chuẩn hóa:**
  * Nền trang: Kem ngà `#F8F6EF`
  * Bề mặt thẻ: Trắng ấm `#FFFEFA`
  * Sidebar: Beige sáng `#F3EFE5` (viền `#E8E3D8`, họa tiết lá cây botanical watermark tinh tế)
  * Màu chủ đạo: Hồng đất `#C77D8B`
  * Màu nhấn đậm: `#A65367` (cho badge, nút quan trọng, tiêu đề phụ)
  * Nền vùng được chọn / Pill: Hồng nhạt `#F5E4E7`
  * Tiêu đề: Xanh rêu đậm `#234737` (Font Serif hỗ trợ tiếng Việt: *Playfair Display*)
  * Chữ nội dung: `#303833` (*Plus Jakarta Sans*)
  * Chữ phụ: `#70776F`
  * Đường viền: Beige `#E8E3D8`
- **Tích hợp hệ thống:**
  * Khởi tạo trong `src/mock/themes.ts` với đầy đủ semantic tokens.
  * Cập nhật `applyThemeToDOM` trong `AppContext.tsx` kích hoạt class `theme-soft-light` và gán toàn bộ CSS Variables (`--bg-main`, `--card-bg`, `--sidebar-bg`, `--border-color`, `--heading-color`, `--body-text`, `--sub-text`, `--selected-bg`).
  * Cập nhật `Sidebar.tsx`, `Topbar.tsx`, `BottomNav.tsx`, `ThemeModal.tsx` hiển thị động `APP_THEMES.length` (11 theme).
  * Lưu vào `localStorage` (`vua_app_theme`), chuyển đổi tức thì không làm mất trạng thái bộ lọc hay dữ liệu form.

### 2.2 Làm rõ Trạng thái E1 & E2 và Migration 007
1. **Migration `007_e1_services_pricing_skills_resources.sql`:**
   - Đã được khởi tạo đầy đủ trong thư mục `supabase/migrations/` của mã nguồn.
   - Khi chạy ở môi trường Live Supabase: cần được áp dụng qua Supabase SQL Editor (hoặc CLI migration). Client đã thiết lập kiểm tra graceful fallback cho các trường mở rộng nếu schema chưa được áp dụng trực tiếp trên remote DB.
2. **Chức năng đã kiểm thử với dữ liệu thật:**
   - **Xác thực & phân quyền (Auth & RBAC):** Đã kết nối Supabase Auth thật, kiểm tra RLS qua RPC `get_staff_session`.
   - **Dữ liệu danh mục Master Data:** Đọc và ghi trực tiếp vào các bảng `customers`, `services`, `products`, `packages`, `suppliers`, `promotions`, `branches`. Đã loại bỏ hoàn toàn cơ chế tự động ghi tạm vào State khi Supabase báo lỗi.
   - **Lịch hẹn & Điều phối (Appts & Roster):** Đã hoàn thành 100% giao diện tác nghiệp, luồng 5 bước, bộ lọc đa tiêu chí, tính toán cọc/thanh toán và lưới 7 ngày x 14 giờ.
3. **Quy trình nghiệp vụ Lịch hẹn:**
   - Đã tách biệt rõ ràng **Nhật Ký Nhắc Hẹn (Zalo ZNS / SMS)** thành luồng thông báo độc lập, không ép buộc nằm giữa "Đã xác nhận" và "Hoàn thành". Quy trình tác nghiệp chính gồm: `Tạo lịch ➔ Chờ duyệt ➔ Đã xác nhận ➔ Đang làm ➔ Hoàn thành`.

---

## 3. KẾT QUẢ KIỂM THỬ KỸ THUẬT

- **TypeScript Type Check (`npx tsc --noEmit`):** ✅ **0 lỗi** (`exit code 0`).
- **Production Build (`npm run build`):** ✅ **Thành công** (`dist/` bundle hoàn tất trong 430ms).
- **Local Dev Server:** ✅ Đang phục vụ tại [http://localhost:5173](http://localhost:5173).

