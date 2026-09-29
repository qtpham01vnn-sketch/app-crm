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
| **POS & Hóa đơn** | `PosView.tsx`, `InvoiceModal.tsx` | `sales`, `payments`, `sale_items`, `payment_allocations` | ✅ LIVE | ✅ LIVE | ACID Checkout RPC `rpc_pos_checkout`, trừ tồn kho, cọc ví, phân bổ đa nguồn | 🛡️ Hoàn tất Core P5 | **P5** |
| **Kho vận sau P5 (Đợt A - Nhập hàng/NCC)** | `PoView.tsx`, `SuppView.tsx`, `masterDataService.ts`, `AppContext.tsx` | `purchase_orders`, `purchase_order_items`, `goods_receipt_notes`, `goods_receipt_items`, `supplier_ledger`, `supplier_payments`, `supplier_advances`, `supplier_returns`, `inventory_lot_stocks`, `damaged_inventory_items` | ⏳ Chờ Migration | ⏳ Chờ Migration | 9 kịch bản nghiệp vụ đã viết (`p5_hardening_and_procurement_test.sql`), **chưa kiểm thử trên live database** (chờ áp dụng migration) | ⏳ **Đang triển khai Đợt A** (Chờ áp dụng SQL 012 & 013) | **Kho vận sau P5** |
| **Kho vận sau P5 (Đợt B - Điều chuyển)** | `InvView.tsx` (mở rộng) | `branch_transfers`, `transfer_items` | ⏳ Chờ Đợt B | ⏳ Chờ Đợt B | Xuất chuyển giảm tồn A -> In-transit -> Nhận từng phần tại B -> Chống hủy sai | ⏳ Kế hoạch Đợt B (Sau nghiệm thu Đợt A) | **Kho vận sau P5** |
| **Kho vận sau P5 (Đợt C - Kiểm kê)** | `InvView.tsx` (mở rộng) | `stocktakes`, `stocktake_items` | ⏳ Chờ Đợt C | ⏳ Chờ Đợt C | Mốc chốt số liệu -> Kiểm đếm thực tế -> Duyệt chênh lệch -> Bút toán điều chỉnh/hủy | ⏳ Kế hoạch Đợt C | **Kho vận sau P5** |
| **Kho vận sau P5 (Đợt D - Báo cáo kho)** | `ReportsView.tsx` | Sổ cái kho & tài chính | ⏳ Chờ Đợt D | ⏳ Chờ Đợt D | Đối chiếu: Tồn đầu + Nhập - Xuất ± Điều chỉnh = Tồn cuối; Khớp nợ NCC; Giá vốn WAC | ⏳ Kế hoạch Đợt D | **Kho vận sau P5** |
| **CRM Nâng cao (Lead & CSKH)** | `CustView.tsx` (mở rộng) | `leads`, `customer_loyalty`, `customer_care_logs` | ⏳ Bảo toàn | ⏳ Bảo toàn | Phân hạng hội viên, tích điểm, chăm sóc sau liệu trình, kết nối Zalo OA/SMS Brandname | ⏳ Giữ nguyên Master Plan | **CRM Nâng cao** |
| **Nhân sự & Bác sĩ/KTV** | `StaffView.tsx` | `staff_profiles`, `staff_skills` | ⏳ Bảo toàn | ⏳ Bảo toàn | Hồ sơ chứng chỉ, năng lực chuyên môn KTV/Bác sĩ, phân quyền tài khoản | ⏳ Giữ nguyên Master Plan | **HR** |
| **Phân ca & Chấm công** | `TimesView.tsx` | `timesheets`, `shift_assignments` | ⏳ Bảo toàn | ⏳ Bảo toàn | Check-in/Check-out GPS/WiFi, ca làm việc, tăng ca, phạt đi muộn/về sớm | ⏳ Giữ nguyên Master Plan | **Timesheet** |
| **Hoa hồng & Bảng lương** | `CommView.tsx`, `PayrollView.tsx` | `commissions`, `payroll_records` | ⏳ Bảo toàn | ⏳ Bảo toàn | Hoa hồng bán lẻ, hoa hồng làm tour, lương cơ bản, phụ cấp, chốt bảng lương | ⏳ Giữ nguyên Master Plan | **P6** |
| **Hộp thư Tư vấn (Màn 7)** | `ChatView.tsx` | `conversations`, `messages`, `channel_accounts` | ⏳ Bảo toàn | ⏳ Bảo toàn | Chatbox đa kênh Facebook/Zalo, trạng thái kết nối API, phân bổ hội thoại | ⏳ Giữ nguyên Master Plan | **E5** |
| **Sổ quỹ & Chi phí** | `ExpView.tsx` | `expenses` | ⚠️ State | ⚠️ State | Thu/chi quỹ tiền mặt, ngân hàng, liên kết bút toán thanh toán NCC (không ghi đè chi phí P&L) | Hoàn thiện theo Đợt A/D | **P5/Kho** |
| **Nghiệm thu Vận hành** | Toàn hệ thống | E2E Tests, Regression Suite | ⏳ Bảo toàn | ⏳ Bảo toàn | Nghiệm thu tích hợp toàn bộ 21 phân hệ và kịch bản vận hành thực tế | ⏳ Nghiệm thu cuối | **Final** |

---

## 2. KẾ HOẠCH ĐỢT: KHO VẬN SAU P5 (STAGED SUPPLY CHAIN ROLLOUT)

> [!IMPORTANT]
> **Quy tắc bất biến:** Không được xóa bỏ, thay thế hoặc tự động xem các phân hệ còn lại trong Master Plan (CRM nâng cao, Nhân sự, Phân ca/Chấm công, Hoa hồng/Lương, Hộp thư Chatbox, Báo cáo & Nghiệm thu vận hành) là đã hoàn thành. Module Kho vận được bổ sung thành đợt chuyên đề riêng mang tên **"Kho vận sau P5"** gồm 4 đợt triển khai tuần tự:
> - **Đợt A:** Nhập hàng & Nhà cung cấp (PO → GRN → Sổ cái công nợ NCC → Thanh toán NCC).
> - **Đợt B:** Điều chuyển chi nhánh (Xuất A → Hàng đang đi đường → Nhập B → Đối soát hao hụt).
> - **Đợt C:** Kiểm kê & Điều chỉnh kho (Chốt snapshot dữ liệu → Kiểm đếm → Duyệt chênh lệch → Xuất hủy có lý do).
> - **Đợt D:** Báo cáo đối chiếu tài chính & kho vận (Cân bằng Tồn đầu/cuối, Công nợ NCC, Giá vốn bình quân).

### 2.1 Các Chốt Chặn Bắt Buộc Đã Hoàn Thiện Trước Khi Nối Kho:
1. **Kiểm soát hoàn trả hàng (`rpc_refund_sale`)**:
   - Tách biệt rõ ràng giữa: Số lượng hoàn tiền, Số lượng thực nhận lại, và Số lượng đủ điều kiện nhập kho (`restockable_qty`).
   - Hàng hỏng/lỗi/hết hạn nhận lại được đưa vào kho cách ly (`damaged_inventory_items`), tuyệt đối **không cộng vào tồn kho khả dụng để bán**.
   - Hoàn tiền đối chiếu phương thức thanh toán gốc; trừ công nợ trước nếu đơn còn nợ; không hoàn vượt quá số tiền khách đã thực trả.
2. **Chuyển khoản VietQR chờ duyệt**:
   - Khoản tiền chờ duyệt (`pending_verification`) không tính vào doanh thu thực thu.
   - Chỉ xác nhận có quyền (`rpc_confirm_bank_payment`) mới ghi nhận thanh toán chính thức; có cơ chế chống xác nhận lặp (Idempotent).
3. **Quy tắc nhập hàng & công nợ nhà cung cấp (Đợt A)**:
   - Đơn đặt hàng (PO) chưa làm tăng tồn kho.
   - Phiếu nhận hàng (GRN) được xác nhận mới làm tăng tồn theo số thực nhận đủ tiêu chuẩn (`accepted_base_units`).
   - Hỗ trợ nhận nhiều lần cho 1 đơn PO (partial receipts).
   - Quy đổi đơn vị nhập và đơn vị bán nhất quán (thùng/lốc -> chai/hộp).
   - Sổ cái công nợ NCC (`supplier_ledger`) bất biến: mọi phát sinh mua/thanh toán đều có dòng đối soát, không chỉ sửa cột `debt_balance`.
   - Tính giá vốn bình quân gia quyền (Weighted Average Cost).
   - Tiền trả trước / đặt cọc có chứng từ thực tế (`supplier_advances`), kiểm tra hạn mức server-side, phân biệt dòng tiền ra với chi phí P&L.
   - Luồng xuất trả hàng NCC (`supplier_returns`) với nghiệp vụ đảo sổ cái rõ ràng, bảo toàn lịch sử kiểm toán.

### 2.2 Hiện Trạng Triển Khai & Kiểm Thử Đợt A:
- **Migration Files (Đã soạn thảo tại workspace local, CHƯA CHẠY trên Supabase Live DB):**
  - Thứ tự áp dụng bắt buộc (Không chạy song song):
    1. Chạy `supabase/migrations/012_p5_pos_hardening_and_procurement_a.sql` trước ➔ Kiểm tra tạo bảng PO/GRN, Sổ cái AP, Damaged items.
    2. Sau khi 012 thành công, chạy `supabase/migrations/013_inventory_phase_a_hardening.sql` ➔ Thêm WAC, Lot Stocks, Advances, Returns & Immutability.
- **Trạng thái kiểm thử:** ⚠️ **CHƯA KIỂM THỬ TRÊN REMOTE DATABASE** (Chờ áp dụng migration trên Supabase Dashboard).
- **Giao diện người dùng (Đã hoàn thiện & kiểm thử giao diện):**
  - `src/components/views/PoView.tsx`: 3 sub-tabs (PO, GRN, Sổ cái AP) + 6 Modals tác nghiệp.
  - **Modal 3 (Chi tiết PO):** Đã mở rộng hiển thị đầy đủ các cột nghiệp vụ (*Đã đặt, Giao đến, Đạt chuẩn vào kho, Từ chối cách ly, Còn chờ giao*) và bảng lịch sử các phiếu GRN liên kết.
  - **Modal 6 (Xuất trả NCC):** Phân loại rõ ràng 2 trường hợp nghiệp vụ: *Hàng lỗi giữ hộ từ chối lúc nhận (0đ giảm nợ NCC)* vs *Hàng đã mua phát hiện lỗi sau (Giảm nợ AP)*.
  - **Kiểm soát nhận hàng:** Chặn nhận vượt số lượng đặt của PO (`qtyAccepted > remainingQty`), bắt buộc nhập lý do hàng lỗi, kiểm tra hạn mức cấn trừ tiền cọc.
  - `src/components/views/SuppView.tsx`: Tra cứu lịch sử sổ cái AP và thanh toán nợ NCC trực tiếp.
  - **Xử lý lỗi server:** Giữ form mở nguyên vẹn dữ liệu đã nhập khi gặp lỗi server/RLS, hiển thị thông báo lỗi chi tiết, tuyệt đối không báo thành công giả.
  - Phân biệt rõ dữ liệu Live Mode và Demo Mode.
- **Bộ Kiểm Thử Nghiệp Vụ:** `supabase/tests/p5_hardening_and_procurement_test.sql` (9 kịch bản nghiệp vụ sẵn sàng chạy sau khi migration được áp dụng).

---

## 3. KẾT QUẢ KIỂM THỬ KỸ THUẬT

- **TypeScript Type Check (`npx tsc --noEmit`):** ✅ **0 lỗi** (`exit code 0`).
- **Production Build (`npm.cmd run build`):** ✅ **Thành công** (`dist/` bundle hoàn tất trong 410ms).
- **Local Dev Server:** ✅ Đang phục vụ tại [http://localhost:5173](http://localhost:5173).

