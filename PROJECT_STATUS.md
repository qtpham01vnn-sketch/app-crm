# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:** [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md)  
**Ngày cập nhật:** 27/09/2026  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel Project:** `qtpham01vnn-sketch/app-crm`  
**Môi trường chạy thử nghiệm:** Localhost (React 19 + TypeScript + Tailwind CSS v4 + Vite)  
**Cổng phục vụ Dev:** `http://localhost:5173/`

---

## 1. BẢNG TIẾN ĐỘ TỔNG THỂ (PHASE 0 ➔ PHASE 7)

| Giai đoạn | Trạng thái | Chi tiết nghiệm thu |
| :--- | :---: | :--- |
| **P0: Khảo sát, Đặc tả & ERD** | ✅ Hoàn thành | Đã đối chiếu 21 menu mã nguồn cũ, lập ERD, ma trận RBAC 4 vai trò. |
| **P1: Foundation & Responsive Shell** | ✅ Hoàn tất & Chốt P1.1 | 21 màn hình views, 10 Theme Accent, Dark Mode, Sidebar/Topbar/BottomNav không đè che. |
| **P2A: Thiết kế Schema SQL & RLS** | ✅ Đã viết Migration | Đã lập 4 migration files + 1 test suite trong `supabase/migrations/` và `supabase/tests/`. |
| **P2B: Kết nối Auth & Service** | ⏳ Sẵn sàng chờ kết nối | Đã tạo SDK wrapper `src/lib/supabase.ts`, `src/services/authService.ts` có Demo Fallback. |
| **P2C: Kiểm thử Quyền RLS & Multi-branch** | ⚠️ Chưa kiểm chứng | Đã viết kịch bản test `p2_security_and_rls_test.sql`; cần Database Supabase thật để chạy test. |
| **P3: Master Data & Catalog** | ⏸ Chờ duyệt P2 | Khách hàng, dịch vụ, bảng giá chi nhánh, tồn kho, NCC. |
| **P4: Lịch hẹn & Today Hub** | ⏸ Chờ duyệt P3 | Lưới lịch tuần, chống trùng phòng/ghế, 7 bộ lọc Today Hub, sync realtime. |
| **P5: POS Thu ngân, Kho & In Bill** | ⏸ Chờ duyệt P4 | ACID checkout RPC, VietQR, in nhiệt K80/K58, quản lý PO-GRN. |
| **P6: CRM Nâng cao & Lương/Hoa hồng** | ⏸ Chờ duyệt P5 | Thư viện ảnh Before/After (Signed URL), chấm công, bảng lương tự động. |
| **P7: Báo cáo Tài chính & Go-Live** | ⏸ Chờ duyệt P6 | Báo cáo 3 trụ cột, công cụ import JSON app cũ (Idempotent), sao lưu & khôi phục. |

---

## 2. CHỐT NGHIỆM THU CHI TIẾT P1.1 (CHECKLIST GIAO DIỆN & CHỨC NĂNG)

### 2.1. Đã khắc phục & Kiểm tra Bố cục (Layout Fixes)
- [x] **Banner Mock Data:** Đã điều chỉnh `z-index` và vị trí Top để không bị Sidebar Desktop che khuất thanh thông báo.
- [x] **Sidebar Desktop:** Chiều rộng cố định 256px (`w-64`), tự động co giãn từ dưới thanh Banner, không che lấp Topbar.
- [x] **Tràn ngang (Horizontal Overflow):** Toàn bộ container chính và các bảng dữ liệu đều được bao bọc trong `overflow-x-auto` và `min-w-0`, không gây hiện tượng thanh cuộn ngang toàn trang.
- [x] **Hỗ trợ Đa Thiết Bị:**
  - **Desktop (> 1024px):** Sidebar 21 menu phân nhóm rõ ràng, Topbar có 10 Theme Swatches bấm đổi tức thì, tìm kiếm nhanh và chọn chi nhánh/vai trò.
  - **iPad / Tablet (768px - 1024px):** Lưới chạm tối ưu 2 cột, hỗ trợ xoay ngang/dọc, mở Drawer trượt khi cần xem toàn bộ 21 menu.
  - **Mobile (< 768px):** Bottom Navigation Bar 5 tác vụ cốt lõi (Tổng quan, Thu ngân, Lịch hẹn, Đặt chỗ, Khách hàng) + Drawer phụ.

### 2.2. Đối chiếu Đầy đủ Nghiệp vụ trên Giao diện Hiện tại
1. **Tổng quan / Today Hub (`HomeView`):** Đã có widget KPI doanh thu ngày, lịch hẹn hôm nay, cảnh báo tồn kho sắp hết, nhắc sinh nhật khách. (P4 sẽ bổ sung thanh 7 tab lọc chuyên sâu).
2. **Thu ngân POS (`PosView`):** Giao diện 2 cột chuẩn quầy thu ngân, tìm kiếm món, chọn KTV thực hiện, nhập chiết khấu %, VAT, Tip, tính tiền khách đưa và tiền thối lại, nút mở popup in hóa đơn.
3. **Quản lý Lịch hẹn (`ApptsView`):** Lưới danh sách theo ngày/chi nhánh, phân loại trạng thái bằng màu sắc, cập nhật trạng thái nhanh.
4. **Đặt chỗ nhanh (`BookView`):** Form chọn khách hàng, chọn dịch vụ, chọn nhân viên và giờ phục vụ.
5. **Danh sách chờ (`WaitView`):** Hàng đợi khách vãng lai (walk-in), bộ đếm thời gian chờ, chuyển nhanh sang POS.
6. **Hồ sơ Khách hàng (`CustView`):** Xem chi tiết thông tin, hạng thẻ VIP, lịch sử mua hàng và ghi chú y tế/dị ứng (`medical_notes`).
7. **Gói Liệu trình (`CoursesView`):** Danh sách thẻ liệu trình, số buổi tổng / đã làm / còn lại, nút mở popup trừ buổi kèm chữ ký xác nhận (`SessionDeductModal`).
8. **Nhân sự & Phân ca (`StaffView`, `RosterView`, `TimesView`, `CommView`, `PayrollView`):** Quản lý bác sĩ/KTV, xếp ca tuần, chấm công vào/ra, bảng hoa hồng dịch vụ, bảng tính lương.
9. **Kho & Nhà cung cấp (`ProdView`, `SvcView`, `PkgView`, `InvView`, `SuppView`, `PoView`):** Danh mục sản phẩm, dịch vụ, combo, kiểm kê kho, nhà cung cấp, đơn đặt hàng PO và phiếu nhập kho GRN.
10. **Tài chính & Khuyến mãi (`ExpView`, `PromosView`, `ReportsView`):** Sổ chi phí vận hành, mã giảm giá, báo cáo doanh thu & công nợ.
11. **Cài đặt Giao diện (`ThemeModal`):** Xem danh sách và đổi ngay 10 bộ màu giao diện thương hiệu.

### 2.3. Đính chính Về Snapshot Giá trong Mã Nguồn Cũ
- **Thực tế mã nguồn `vua-app`:** App cũ **CÓ LƯU SNAPSHOT** chi tiết mặt hàng trong mảng `items` của bản ghi `sales` (`name`, `price`, `qty`).
- **Điểm hạn chế cần khắc phục ở hệ thống mới:** App cũ chưa lưu chi tiết `line_discount` từng dòng, và tỷ lệ hoa hồng KTV đọc động từ bảng dịch vụ hiện tại tại thời điểm thanh toán (`sv = get('services', it.refId)`) thay vì cố định tỷ lệ lúc giao việc.
- **Giải pháp trong Migration P2/P5:** Bảng `sale_items` đã được thiết kế đầy đủ các trường snapshot bất biến: `item_name`, `unit_price`, `quantity`, `line_discount`, `line_total`, `performer_staff_id`, `commission_pct`, `commission_amount`.

---

## 3. TIẾN ĐỘ GIAI ĐOẠN PHASE 2 (DATABASE, AUTH & RLS)

### 3.1. P2A — Schema SQL & Thứ Tự Migrations
Đã tạo trọn bộ các tệp Migration SQL chuẩn trong thư mục `supabase/migrations/`:
1. `001_core_organization_membership_rls.sql`: Tạo `organizations`, `branches`, `staff_profiles`, `organization_memberships`, `audit_events` và các hàm RLS helper (`get_current_user_org_id`, `get_current_user_role`, `has_branch_access`).
2. `002_master_data_and_catalogs.sql`: Tạo `customers`, `services`, `branch_service_prices`, `packages`, `products`, `inventory_stocks` (chặn tồn âm), `suppliers`, `promotions`.
3. `003_operations_pos_and_courses.sql`: Tạo `appointments`, `sales`, `sale_items` (snapshot giá/hoa hồng), `payments`, `payment_allocations`, `customer_courses`, `session_deductions` (Ledger bất biến), `purchase_orders`, `goods_receipt_notes`, `expenses`.
4. `004_rls_security_policies.sql`: Thiết lập Row Level Security trên toàn bộ 22 bảng dữ liệu, bảo vệ cô lập dữ liệu giữa các Chi nhánh và Tổ chức.

### 3.2. P2B — Client Integration & Auth Service
- Cài đặt thư viện `@supabase/supabase-js`.
- Tạo file wrapper [`src/lib/supabase.ts`](./src/lib/supabase.ts) có cơ chế tự phát hiện biến môi trường: nếu chưa có Supabase URL/Key, hệ thống tự động chạy ở chế độ **Demo Mock Data** an toàn, không gây crash ứng dụng.
- Tạo dịch vụ xác thực [`src/services/authService.ts`](./src/services/authService.ts) hỗ trợ `signInWithEmail`, `signOut` (xóa sạch token/cache), `fetchCurrentMembership`.
- Bộ chọn vai trò tự do trên Topbar được thiết kế riêng cho môi trường Preview/Demo.

### 3.3. P2C — Bộ Kịch Bản Kiểm Thử Quyền (Database Test Suite)
- Đã tạo tệp [`supabase/tests/p2_security_and_rls_test.sql`](./supabase/tests/p2_security_and_rls_test.sql) tự động kiểm tra:
  - `SEC-01`: Cô lập đa tổ chức và đa chi nhánh.
  - `ACID-01`: Tính bất biến của bảng nhật ký kiểm toán `audit_events` (chặn lệnh UPDATE/DELETE).
- **Trạng thái:** ⚠️ **CHƯA KIỂM CHỨNG TRÊN DATABASE THẬT** (do chưa kết nối tới dự án Supabase thực tế).

---

## 4. HƯỚNG DẪN ANH NGHIỆM THU VÀ BƯỚC TIẾP THEO

### Các bước anh kiểm tra trên Localhost (`http://localhost:5173/`):
1. **Kiểm tra Giao diện Đa thiết bị:**
   - Mở trình duyệt trên Desktop: Xem thanh Banner Mock Data màu cam ở trên cùng, Sidebar bên trái không che đè banner, Topbar có nút đổi 10 Theme bấm đổi màu tức thì.
   - Thử thu nhỏ màn hình (hoặc bấm F12 chọn chế độ iPad / iPhone): Thanh Sidebar thu vào Drawer trượt, xuất hiện thanh BottomNav 5 nút ở đáy màn hình.
2. **Kiểm tra 21 Màn hình:** Bấm chuyển từng menu từ Vận hành ➔ Khách hàng ➔ Kho ➔ Nhân sự ➔ Báo cáo để xác nhận không có màn hình nào bị lỗi trắng trang.
3. **Chuẩn bị Kết nối Supabase (Khi anh sẵn sàng):**
   - Tạo 1 project Supabase mới trên [supabase.com](https://supabase.com).
   - Copy mã SQL trong thư mục `supabase/migrations/` dán vào mục SQL Editor của Supabase để chạy tạo bảng.
   - Điền 2 biến môi trường vào file `.env.local` trong dự án:
     ```env
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```
   - *Lưu ý:* Tuyệt đối không gửi khóa bí mật (Service Role Key) vào chat. Chỉ dùng Anon Key an toàn.
