# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:**
1. [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md) (Kế hoạch tổng thể 21 phân hệ)
2. [`docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md`](./docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md) (Đặc tả nâng cấp 7 màn hình CRM & Điều phối)

**Ngày cập nhật:** 28/09/2026 (Hoàn thành Khắc phục Bố cục Lệch phải & Tối ưu Toàn diện Theme 11)  
**GitHub Commit Mới Nhất:** `4eea56e` (`main`)  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel URL Kiểm Thử:** [`https://phuongnam-crm.vercel.app`](https://phuongnam-crm.vercel.app)  

---

## 1. MA TRẬN CHỨC NĂNG ĐỐI CHIẾU THỰC TẾ (FUNCTIONAL MATRIX)

| Màn hình / Luồng | File hiện có | Bảng Database / RPC | Đọc Thật | Ghi Thật | Kiểm Thử Đã Chạy | Trạng Thái & Bàn Giao | Phase |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :---: |
| **Bố cục App Shell** | `App.tsx`, `Sidebar.tsx`, `Topbar.tsx` | Layout Flex / CSS Grid | ✅ LIVE | N/A | Khắc phục triệt để lỗi cộng dồn 2 lần padding (256px + 256px = 512px). Header và main thẳng hàng | 📐 Chuẩn hóa 100% | **Core** |
| **Theme Hệ Thống (11 Theme)** | `themes.ts`, `AppContext.tsx`, `ThemeModal.tsx`, `index.css` | LocalStorage `vua_app_theme`, CSS Variables | ✅ LIVE | ✅ LIVE | Switch 11 theme tức thì, lưu LocalStorage, không mất dữ liệu/filter, hỗ trợ `spa_elegance` tone ấm sáng | 🎨 Hoàn thành Theme 11 | **Theme** |
| **Xác thực & RBAC** | `src/services/authService.ts`, `LoginPage.tsx` | Supabase Auth, `staff_profiles`, `organization_memberships`, RPC `get_staff_session` | ✅ LIVE | ✅ LIVE | Unit test RLS, Login/Logout, Token refresh | 🛡️ Hoàn thành siết bảo mật | **P2** |
| **Chi nhánh** | `AppContext.tsx`, `Topbar.tsx` | `branches` | ✅ LIVE | Read-only | Đa chi nhánh isolation | ✅ Hoàn thành | **P2** |
| **Tổng quan (Dashboard Màn 1)** | `HomeView.tsx` | `sales`, `appointments`, `customers`, `inventory_stocks` | ✅ LIVE | N/A | Banner sáng sang trọng, 4 KPI co giãn 4/2/1 cột, empty state có nút tạo lịch, thao tác nhanh sáng | 🚀 Đã chuẩn hóa E0/E4 | **E0/E4** |
| **Khách hàng (CRM Màn 4)** | `CustView.tsx`, `masterDataService.ts` | `customers` | ✅ LIVE | ✅ LIVE | Bỏ màu xanh hardcode, nối theme tokens, định dạng tiền đầy đủ, responsive không tràn chữ | 🚀 Hoàn thành E0/E3 | **E0/E3** |
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

### 2.1 Khắc phục Bố cục Toàn Ứng Dụng (Layout Double Offset)
- **Nguyên nhân cốt lõi:** `Sidebar.tsx` đồng thời chứa `fixed` và `relative` trong danh sách class CSS khiến nó chiếm 256px trong flow flex của container cha, đồng thời container nội dung chính `div.flex-1` trong `App.tsx` lại có class `lg:pl-64` (256px). Do đó khoảng trống bị cộng 2 lần (256px + 256px = 512px).
- **Giải pháp dứt điểm:**
  1. Trên Desktop (`lg+`): Chuyển Sidebar thành phần tử flex tĩnh (`lg:static lg:w-64 lg:shrink-0`).
  2. Bỏ class `lg:pl-64` ở container chính. Header Topbar và Main content nằm chung trong flex column con chiếm trọn 100% diện tích còn lại, bắt đầu ngay tại cạnh phải Sidebar (256px).
  3. Trên Mobile (`< lg`): Sidebar là drawer off-canvas (`fixed inset-y-0 left-0 z-50`), nội dung chính chiếm 100% chiều rộng từ 0px đến mép phải.

### 2.2 Hoàn thiện Màu sắc & Thao tác Nhanh theo 7 Ảnh Tham Khảo
- **MockDataBanner:** Trong theme `spa_elegance`, đổi từ gradient xanh đen đậm sang tông sáng kem ngà `#EFE9DD`, viền `#E8E3D8`, chữ xanh rêu `#234737`, chip `#FFFEFA`.
- **Thao tác nhanh (Quick Shortcuts):** Đổi từ nền xanh đen `bg-slate-900` sang nền trắng ấm `#FFFEFA` viền `#E8E3D8`, các nút thao tác nền kem `#F8F6EF` hover `#F3EFE5` chữ `#303833`.
- **Empty State Lịch hẹn:** Thêm khối thông báo lịch sự khi chưa có lịch trong ngày kèm nút `+ Đặt Lịch Mới Ngay` nổi bật, không để ô trống vô nghĩa.
- **Rà soát Hardcoded Colors:** Loại bỏ triệt để các mã màu `text-sky-600`, `bg-sky-50`, `border-sky-200` ở Khách hàng (`CustView.tsx`), Dịch vụ (`SvcView.tsx`), Tổng quan (`HomeView.tsx`), thay bằng Semantic Tokens (`currentTheme.primaryColor`, `currentTheme.badgeBg`, `currentTheme.buttonBg`).

---

## 3. KẾT QUẢ KIỂM THỬ KỸ THUẬT

- **TypeScript Type Check (`npx tsc --noEmit`):** ✅ **0 lỗi** (`exit code 0`).
- **Production Build (`npm run build`):** ✅ **Thành công** (`dist/` bundle hoàn tất trong 409ms).
- **Local Dev Server:** ✅ Đang phục vụ tại [http://localhost:5173](http://localhost:5173).

