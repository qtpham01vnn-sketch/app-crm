# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN — APP CRM SPA & NHA KHOA ĐA CHI NHÁNH

**Tài liệu tham chiếu chuẩn:**
1. [`docs/PLAN_VUA_APP_ANTIGRAVITY.md`](./docs/PLAN_VUA_APP_ANTIGRAVITY.md) (Kế hoạch tổng thể 21 phân hệ)
2. [`docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md`](./docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md) (Đặc tả nâng cấp 7 màn hình CRM & Điều phối)

**Ngày cập nhật:** 02/10/2026 (Khôi phục và đồng bộ toàn diện hiện trạng thực tế từ P0 đến P10 Mốc B)  
**GitHub Commit Mới Nhất:** `b3edde4` (`main`)  
**GitHub Repo:** [`https://github.com/qtpham01vnn-sketch/app-crm.git`](https://github.com/qtpham01vnn-sketch/app-crm.git)  
**Supabase Project:** `lskrcerzxltlrcewigrw` (`https://lskrcerzxltlrcewigrw.supabase.co`) — Region: `ap-southeast-1`  
**Vercel URL Kiểm Thử:** [`https://phuongnam-crm.vercel.app`](https://phuongnam-crm.vercel.app)  

---

## 1. MA TRẬN CHỨC NĂNG ĐỐI CHIẾU THỰC TẾ (FUNCTIONAL EVIDENCE MATRIX)

| Phân hệ / Màn hình | File Code Giao Diện | Migration Database / RPC | Đọc Thật | Ghi Thật | Bằng Chứng Kiểm Thử Đã Chạy | Trạng Thái Phân Loại | Phase / Mốc |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :---: |
| **Bố cục App Shell** | `App.tsx`, `Sidebar.tsx`, `Topbar.tsx` | Layout Flex / CSS Grid | ✅ LIVE | N/A | Khắc phục lỗi cộng dồn padding; Header/Sidebar chuẩn | 🚀 Đã triển khai | **P1 Core** |
| **Theme Hệ Thống (11 Theme)** | `themes.ts`, `ThemeModal.tsx`, `index.css` | LocalStorage, CSS Variables | ✅ LIVE | ✅ LIVE | Chuyển đổi 11 theme tức thì, lưu LocalStorage | 🚀 Đã triển khai | **P1 Theme** |
| **Xác thực & RBAC** | `authService.ts`, `LoginPage.tsx` | `001`, `004`, `006` (`staff_profiles`, `memberships`) | ✅ LIVE | ✅ LIVE | `p2_security_and_rls_test.sql`, Auth Gate | 🛡️ Đã áp dụng DB & Kiểm thử | **P2** |
| **Chi nhánh & Multi-branch** | `AppContext.tsx`, `Topbar.tsx` | `001`, `008` (`branches`) | ✅ LIVE | Read-only | Multi-branch tenant isolation test PASS | 🛡️ Đã áp dụng DB & Kiểm thử | **P2** |
| **Tổng quan (Dashboard)** | `HomeView.tsx` | `sales`, `appointments`, `customers`, `inventory_stocks` | ✅ LIVE | N/A | 4 KPI cards động, Quick Action | 🚀 Đã triển khai | **P3/P4/P7** |
| **Khách hàng (CRM)** | `CustView.tsx`, `masterDataService.ts` | `002` (`customers`) | ✅ LIVE | ✅ LIVE | `debug_customer_insert.js`, `CustView` CRUD | 🚀 Đã triển khai | **P3** |
| **Dịch vụ & Bảng giá** | `SvcView.tsx`, `masterDataService.ts` | `002`, `007` (`services`, `service_price_versions`) | ✅ LIVE | ✅ LIVE | `007_e1_services_pricing_skills_resources.sql` | 🚀 Đã triển khai | **P3** |
| **Sản phẩm & Danh mục** | `ProdView.tsx`, `masterDataService.ts` | `002` (`products`) | ✅ LIVE | ✅ LIVE | `ProdView` CRUD, quản lý danh mục | 🚀 Đã triển khai | **P3** |
| **Gói / Combo & Khuyến mãi** | `PkgView.tsx`, `PromosView.tsx` | `002` (`packages`, `promotions`) | ✅ LIVE | ✅ LIVE | Thêm gói và tạo voucher lưu DB | 🚀 Đã triển khai | **P3** |
| **Lịch hẹn & Điều phối** | `ApptsView.tsx`, `RosterView.tsx` | `003`, `009` (`appointments`, `shift_rosters`) | ✅ LIVE | ✅ LIVE | `p4_appointment_concurrency_test.sql` | 🎯 Đã kiểm thử | **P4** |
| **POS & Hóa đơn ACID** | `PosView.tsx`, `InvoiceModal.tsx` | `010`, `011` (`sales`, `payments`, `sale_items`) | ✅ LIVE | ✅ LIVE | `p5_pos_checkout_test.sql`, `rpc_pos_checkout` | 🛡️ Đã áp dụng DB & Kiểm thử | **P5** |
| **Kho Đợt A (PO / GRN / NCC)** | `PoView.tsx`, `SuppView.tsx` | `012` - `016` (`purchase_orders`, `goods_receipt_notes`, AP) | ✅ LIVE | ✅ LIVE | `run_stage_a_verification.cjs`, `run_e2e_procurement_real_business_test.js` | 🛡️ Đã áp dụng DB & Kiểm thử | **Kho Đợt A** |
| **Kho Đợt B (Điều chuyển chi nhánh)** | `InvView.tsx` (Tab Điều chuyển) | `017` (`branch_transfers`, `branch_transfer_items`) | ✅ LIVE | ✅ LIVE | `run_stage_b_transfers_test.cjs` (PASS 100% 3 kịch bản: Nháp, Dispatched, Difference resolved) | 🛡️ Đã áp dụng DB & Kiểm thử | **Kho Đợt B** |
| **Kho Đợt C (Kiểm kê & Điều chỉnh)** | `InvView.tsx` (Tab Kiểm kê) | `018`, `019` (`stocktakes`, `stocktake_items`) | ✅ LIVE | ✅ LIVE | `run_stage_c_audits_test.cjs` (PASS 100% Snapshot, Counting, Cân bằng tồn) | 🛡️ Đã áp dụng DB & Kiểm thử | **Kho Đợt C** |
| **P6.1 Nhân sự & Chứng chỉ** | `StaffView.tsx` | `020` (`staff_profiles`, `staff_skills`) | ✅ LIVE | ✅ LIVE | `run_p6_1_staff_test.cjs` PASS | 🛡️ Đã áp dụng DB & Kiểm thử | **P6.1** |
| **P6.2 Xếp ca & Lịch tuần** | `RosterView.tsx` | `021` (`shift_rosters`, `shift_assignments`) | ✅ LIVE | ✅ LIVE | `run_p6_2_roster_test.cjs` PASS | 🛡️ Đã áp dụng DB & Kiểm thử | **P6.2** |
| **P6.3 Chấm công & Điểm danh** | `TimesView.tsx` | `022` (`timesheets`) | ✅ LIVE | ✅ LIVE | `run_p6_3_attendance_test.cjs` PASS | 🛡️ Đã áp dụng DB & Kiểm thử | **P6.3** |
| **P6.4 Hoa hồng & Bảng lương** | `CommView.tsx`, `PayrollView.tsx` | `023` (`commissions`, `payroll_records`) | ✅ LIVE | ✅ LIVE | `run_p6_4_payroll_test.cjs` (PASS 100% 6 kịch bản tính lương, phụ cấp, khóa sổ) | 🛡️ Đã áp dụng DB & Kiểm thử | **P6.4** |
| **P7.1 Doanh thu & Dòng tiền** | `ReportsView.tsx` (Tab Sales) | `024` (`rpc_report_sales_and_cashflow`) | ✅ LIVE | N/A | `run_p7_1_sales_cashflow_test.cjs` PASS | 📊 Đã kiểm thử | **P7.1** |
| **P7.2 COGS & Lợi nhuận gộp** | `ReportsView.tsx` (Tab COGS) | `025` - `027` (`product_boms`, `cogs_cost_snapshots`) | ✅ LIVE | N/A | `run_p7_2_cogs_and_profit_comprehensive_test.cjs` PASS | 📊 Đã kiểm thử | **P7.2** |
| **P7.3 Hiệu suất KTV / Tài nguyên** | `ReportsView.tsx` (Tab Staff) | `028` (`rpc_report_staff_resource_utilization`) | ✅ LIVE | N/A | `run_p7_3_staff_and_resource_utilization_test.cjs` PASS | 📊 Đã kiểm thử | **P7.3** |
| **P7.4 Cohort & RFM Khách hàng** | `ReportsView.tsx` (Tab Cohort) | `029` (`rpc_report_customer_retention_and_cohort`) | ✅ LIVE | N/A | `run_p7_4_customer_retention_test.cjs` PASS | 📊 Đã kiểm thử | **P7.4** |
| **P7.5 Xuất Excel .xlsx & PDF** | `ReportsView.tsx`, `reportExportService.ts` | Thư viện `exceljs`, `jspdf`, `jspdf-autotable` | ✅ LIVE | N/A | `run_p7_5_excel_and_pdf_export_test.cjs` PASS (File thật sinh đúng cấu trúc & định dạng) | 🚀 Đã triển khai | **P7.5** |
| **P8 Hồ sơ điều trị & Before/After** | `CustView.tsx`, `CoursesView.tsx`, `treatmentService.ts` | `030` (`treatment_plans`, `treatment_sessions`, `treatment_photos`, `treatment_consents`) | ✅ LIVE | ✅ LIVE | `run_p8_treatment_and_before_after_test.cjs` (PASS 100% 10 kịch bản: Storage signed URL, slider, audit lock) | 🛡️ Đã áp dụng DB & Kiểm thử | **P8** |
| **P9 Loyalty Engine & Thẻ VIP** | `CustView.tsx`, `loyaltyService.ts` | `031` (`loyalty_accounts`, `loyalty_transactions`, `membership_tiers`) | ✅ LIVE | ✅ LIVE | `run_p9_loyalty_and_tier_engine_test.cjs` (PASS 100% 10 kịch bản: Tích điểm, tiêu điểm, trần 50%, thăng hạng) | 🛡️ Đã áp dụng DB & Kiểm thử | **P9** |
| **P10 Mốc A CSKH Inbox** | `ChatboxView.tsx`, `chatboxService.ts` | `032` (`conversation_threads`, `chat_messages`, `channel_integrations`) | ✅ LIVE | ✅ LIVE | `run_p10_chatbox_and_cskh_test.cjs` (PASS 100% 7 kịch bản: Ghi chú nội bộ, phân công, quiet hours) | 🛡️ Đã áp dụng DB & Kiểm thử | **P10 Mốc A** |
| **P10 Mốc B Facebook Messenger** | `scripts/facebook_messenger_sync.cjs`, `ChatboxView.tsx` | `033` (`webhook_crm`, Database Trigger Bridge) | ✅ LIVE | ✅ LIVE | `run_p10_webhook_crm_bridge_test.cjs` PASS; Đấu nối Trang "Fanpage-Tuấn Phạm" (ID: 809750085555882) | 🛡️ Đã áp dụng DB & Kiểm thử | **P10 Mốc B** |
| **P10 Mốc B Telegram Bot** | `scripts/telegram_bot_sync.cjs`, `ChatboxView.tsx` | `032` (`conversation_threads`, `chat_messages`) | ✅ LIVE | ✅ LIVE | Kết nối Bot `@phuongnam_cskh_bot` nhận & gửi tin trực tiếp 2 chiều | 🛡️ Đã áp dụng DB & Kiểm thử | **P10 Mốc B** |
| **Sổ quỹ & Chi phí P&L Đầy đủ** | `ExpView.tsx`, `expenseService.ts` | `038` (`expense_vouchers`, `financial_accounts`, `cashflow_ledger`) | ✅ LIVE | ✅ LIVE | `run_p11_cashflow_and_expense_test.cjs` PASS | 🚀 Đã triển khai | **P5/P7 Bổ sung (P11)** |

---

## 2. QUY ƯỚC TRẠNG THÁI PHÂN BIỆT
- **Chưa triển khai:** Chưa có mã nguồn giao diện lẫn migration database.
- **Đã viết code:** Đã có code UI/Service nhưng chưa áp dụng database migration tương ứng lên remote Supabase.
- **Đã áp dụng database:** Database migration đã chạy trên Supabase (`lskrcerzxltlrcewigrw`), các bảng và RPC đã tồn tại.
- **Đã kiểm thử:** Có kịch bản kiểm thử (test script) tự động và đã chạy PASS với bằng chứng cụ thể trên database thực tế.
- **Đã triển khai:** Đã kiểm thử đạt, đã tích hợp trên giao diện người dùng, build thành công và đẩy lên nhánh `main`.
- **Còn chờ chính sách / tài khoản / nghiệm thu:** Đã sẵn sàng kỹ thuật nhưng phụ thuộc cấu hình bên thứ 3 (Zalo OA, phân quyền chủ dự án).
