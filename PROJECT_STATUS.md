# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:**
1. [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md) (Kế hoạch tổng thể 21 phân hệ)
2. [`docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md`](./docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md) (Đặc tả nâng cấp 7 màn hình CRM & Điều phối)

**Ngày cập nhật:** 28/09/2026 (Nghiệm thu Đợt E0: Đóng lỗi nền tảng, Xóa bỏ Fallback Mock, Chuẩn hóa KPI & Lọc ngày)  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git) (Branch: `main`)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel URL Kiểm Thử:** [`https://phuongnam-crm.vercel.app`](https://phuongnam-crm.vercel.app)  

---

## 1. MA TRẬN CHỨC NĂNG ĐỐI CHIẾU THỰC TẾ (FUNCTIONAL MATRIX)

| Màn hình / Luồng | File hiện có | Bảng Database / RPC | Đọc Thật | Ghi Thật | Kiểm Thử Đã Chạy | Phần Còn Thiếu | Phase |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :---: |
| **Xác thực & RBAC** | `src/services/authService.ts`, `LoginPage.tsx` | Supabase Auth, `staff_profiles`, `organization_memberships`, RPC `get_staff_session` | ✅ LIVE | ✅ LIVE | Unit test RLS, Login/Logout, Token refresh | Admin gán tài khoản qua UI | **P2** (Xong) |
| **Chi nhánh** | `AppContext.tsx`, `Topbar.tsx` | `branches` | ✅ LIVE | Read-only | Truy vấn danh sách chi nhánh đa cơ sở | Quản lý thêm/sửa chi nhánh | **P2** (Xong) |
| **Tổng quan (Dashboard Màn 1)** | `HomeView.tsx` | `sales`, `appointments`, `customers`, `inventory_stocks` | ✅ LIVE | N/A | KPI tính động theo ngày/chi nhánh, loại bỏ +18.5% cứng | Widget so sánh kỳ trước, mini-calendar booking slot | **E0** (Đã sửa) / **E4** |
| **Khách hàng (CRM Màn 4)** | `CustView.tsx`, `masterDataService.ts` | `customers` | ✅ LIVE | ✅ LIVE | Thêm khách ghi Supabase, chặn lưu tạm khi lỗi, giữ form thử lại | Phân nhóm tự động, sinh nhật 29/02, tag links | **E0** (Đã sửa) / **E3** |
| **Dịch vụ & Bảng giá (Màn 5)** | `SvcView.tsx`, `masterDataService.ts` | `services` | ✅ LIVE | ✅ LIVE | Thêm dịch vụ ghi Supabase, chặn fallback mock | Bảng giá theo chi nhánh/thời gian, kỹ năng KTV, nguồn lực | **E0** (Đã sửa) / **E1** |
| **Sản phẩm & Kho** | `ProdView.tsx`, `InvView.tsx` | `products`, `inventory_stocks` | ✅ LIVE | ✅ LIVE (SP) | Đọc tồn kho thật theo chi nhánh, thêm SP lưu DB | Trừ kho ACID khi thanh toán POS | **E0** (Đã sửa) / **P5** |
| **Gói / Combo** | `PkgView.tsx`, `masterDataService.ts` | `packages` | ✅ LIVE | ✅ LIVE | Thêm gói combo lưu Supabase | Combo nhiều dịch vụ song song vs gói nhiều buổi | **E0** (Đã sửa) / **E1** |
| **Nhà cung cấp** | `SuppView.tsx`, `masterDataService.ts` | `suppliers` | ✅ LIVE | ✅ LIVE | Thêm nhà cung cấp lưu Supabase | Phiếu nhập kho PO liên kết công nợ | **E0** (Đã sửa) / **P5** |
| **Khuyến mãi** | `PromosView.tsx`, `masterDataService.ts` | `promotions` | ✅ LIVE | ✅ LIVE | Tạo voucher lưu Supabase | Áp dụng mã tự động tại POS | **E0** (Đã sửa) / **E1** |
| **Hồ sơ Nhân sự** | `StaffView.tsx`, `masterDataService.ts` | `staff_profiles`, `memberships` | ✅ LIVE | Read-only | Đọc nhân viên theo membership | Ma trận kỹ năng dịch vụ (`service_staff_skills`) | **E0** / **E1** |
| **Danh sách Lịch hẹn (Màn 2)** | `ApptsView.tsx` | `appointments` | ⚠️ State | ⚠️ State | Đã nối bộ lọc `selectedDate`, đếm KPI động | Lưu `appointments` Supabase + Exclusion Constraint | **E0** (Đã sửa lọc) / **E2** |
| **Chi tiết Lịch hẹn (Màn 3)** | `NewApptModal.tsx` | `appointments`, `appointment_events` | ⚠️ State | ⚠️ State | Giao diện form cơ bản | Modal chi tiết 5 bước, panel tiền đọc giao dịch | **E2** |
| **Lịch Điều phối & Xếp ca (Màn 6)** | `RosterView.tsx`, `TimesView.tsx` | `shift_rosters`, `resource_allocations` | ⚠️ State | ⚠️ State | Giao diện lưới tuần | Lưới điều phối KTV/Phòng/Ghế thật, chống trùng giờ | **E2** |
| **Hộp thư Tư vấn (Màn 7)** | Chưa tạo view | `conversations`, `messages`, `channel_accounts` | ❌ Chưa có | ❌ Chưa có | N/A | UI 3 vùng, Webhook adapter (Zalo OA/FB/Web) | **E5** |
| **POS & Hóa đơn** | `PosView.tsx`, `InvoiceModal.tsx` | `sales`, `payments` | ⚠️ State | ⚠️ State | Giỏ hàng, in bill mẫu K80/K58 | ACID Checkout RPC, VietQR động | **P5** |
| **Sổ quỹ & Chi phí** | `ExpView.tsx` | `expenses` | ⚠️ State | ⚠️ State | Giao diện thu chi | Sổ quỹ liên kết tài khoản ngân hàng/tiền mặt | **P5** / **P7** |
| **Bảng lương & Hoa hồng** | `PayrollView.tsx`, `CommView.tsx` | `timesheets`, `commissions`, `payroll_records` | ⚠️ State | ⚠️ State | Giao diện tính lương mẫu | Tự động chốt hoa hồng sau hóa đơn hoàn tất | **P6** |

---

## 2. KẾT QUẢ THỰC THI & NGHIỆM THU ĐỢT E0 (ĐÓNG LỖI NỀN TẢNG)

### 2.1 Các lỗi đã phát hiện và xử lý dứt điểm:
1. **Lỗi Fallback "Lưu tạm" trong Live Mode:**
   - *Nguyên nhân:* Trước đây trong `CustView.tsx`, `SvcView.tsx`, `ProdView.tsx`, `PkgView.tsx`, `SuppView.tsx`, `PromosView.tsx` đều có khối `try { ... } catch (sbErr) { ... } if (!created) { fallback to local state + toast "lưu bộ nhớ tạm" }`. Khi Supabase gặp lỗi (hoặc mất mạng), hệ thống âm thầm tạo bản ghi giả vào React State khiến người dùng tưởng đã lưu thành công.
   - *Giải pháp:* Đã loại bỏ hoàn toàn cơ chế fallback nuốt lỗi trong Live Mode. Khi có lỗi từ Supabase, hệ thống hiển thị thông báo lỗi chi tiết qua Toast, giữ nguyên dữ liệu trong form để người dùng kiểm tra và bấm thử lại, tuyệt đối không tạo bản ghi rác.
   - *Demo Mode:* Tách riêng luồng sandbox thử nghiệm có gắn nhãn `[Demo Mode]` rõ ràng.

2. **Khắc phục Hardcoded Fallback UUIDs:**
   - *Nguyên nhân:* `CustView` dùng UUID cứng `'11111111-1111-...'` và `'22222222-2222-...'` khi thiếu chi nhánh.
   - *Giải pháp:* Kiểm tra nghiêm ngặt `currentBranch.orgId` và `currentBranch.id` từ phiên đăng nhập thực tế; nếu thiếu sẽ báo lỗi ngữ cảnh rõ ràng thay vì gửi ID giả gây lỗi RLS/Foreign Key.

3. **KPI ghi cứng & Thiếu liên kết Ngày trong HomeView & ApptsView:**
   - *HomeView:* Đã xóa bỏ chỉ số tăng trưởng giả `+18.5% so với hôm qua`. Doanh thu và Lịch hẹn chuyển sang tính toán động: Doanh thu thực thu hôm nay tính từ các hóa đơn có `createdAt` trong ngày, Lịch hẹn hôm nay lọc theo ngày hiện tại của chi nhánh đang chọn.
   - *ApptsView:* Đã sửa lỗi biến `selectedDate` bị bỏ qua. Bộ lọc lịch hẹn giờ đây áp dụng đồng thời: Chi nhánh + Ngày chọn (`selectedDate`) + Trạng thái. Bổ sung nút chuyển đổi nhanh *"Tất cả ngày"* / *"Xem theo ngày"*. Toàn bộ các thẻ KPI đếm trạng thái (*Tất cả, Đang làm, Đã xác nhận, Hoàn thành, Đã hủy*) đều tự động cập nhật theo đúng tập dữ liệu đang lọc.

### 2.2 Kết quả kiểm thử kỹ thuật:
- **TypeScript Type-Check (`npx tsc --noEmit`):** ✅ Exit Code 0 (Không còn lỗi kiểu dữ liệu hay biến thừa).
- **Vite Production Build (`npm run build`):** ✅ Thành công 100% (`dist/` bundle hoàn tất trong 646ms).
- **Local Dev Server:** ✅ Đang chạy tại `http://localhost:5173`.

---

## 3. KẾ HOẠCH BƯỚC TIẾP THEO (ĐỢT E1: DỊCH VỤ & DỮ LIỆU ĐẦU VÀO)

Sẵn sàng triển khai theo yêu cầu Màn hình 5 (Ảnh 5) & Mục 4 trong `PROMPT_BO_SUNG_CRM_7_MAN_HINH.md`:
1. **Dịch vụ & Bảng giá nâng cao:**
   - Bảng giá hiệu lực theo chi nhánh và khoảng thời gian (`service_price_versions`).
   - Phân biệt giá niêm yết, giá ưu đãi có điều kiện thời gian.
   - Thuộc tính riêng: Thời lượng, buffer trước/sau, trạng thái hoạt động, đặt online, nổi bật.
2. **Kỹ năng & Nguồn lực điều phối:**
   - Liên kết KTV đủ kỹ năng thực hiện (`service_staff_skills`).
   - Danh mục phòng, giường, ghế, thiết bị trị liệu (`resources`).
3. **Phân biệt Combo & Gói nhiều buổi:**
   - Combo nhiều dịch vụ trong 1 lần đến (nối tiếp/song song).
   - Gói quyền lợi nhiều buổi tích lũy (`customer_courses`).
