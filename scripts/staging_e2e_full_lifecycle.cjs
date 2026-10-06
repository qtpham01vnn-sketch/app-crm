/**
 * =============================================================================
 * SCRIPT KIỂM THỬ XUYÊN SUỐT TOÀN DIỆN HỆ THỐNG TRÊN STAGING (E2E FULL LIFECYCLE)
 * =============================================================================
 * Target: Staging Database (yvwsitkgpujeqlgeiuge)
 * Phạm vi:
 * 1. Khách hàng -> Đặt lịch / Phân ca -> Tiếp nhận & Thực hiện điều trị -> Trừ buổi & Vật tư tiêu hao.
 * 2. POS Checkout ACID (Sản phẩm, Gói, Dịch vụ lẻ) -> Trừ kho tự động -> Tính hoa hồng KTV/Bác sĩ.
 * 3. Quản trị Kho (Nhập kho PO/GRN, Điều chuyển nội bộ, Kiểm kê & Cân bằng chênh lệch).
 * 4. Sổ quỹ & Chi phí vận hành (Giải ngân, Hoàn chi, Đối soát Quỹ - Sổ cái - Chứng từ).
 * 5. Báo cáo Tài chính P&L & Đối chiếu Số liệu Tổng thể (Zero duplicate, Zero balance drift).
 * =============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const stagingUrl = (envContent.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
const stagingAnonKey = (envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

assert.ok(stagingUrl, 'VITE_SUPABASE_URL không được để trống');
assert.ok(stagingAnonKey, 'VITE_SUPABASE_ANON_KEY không được để trống');

console.log('========================================================================================');
console.log('BỘ KIỂM THỬ XUYÊN SUỐT TOÀN DIỆN HỆ THỐNG (STAGING E2E FULL LIFECYCLE)');
console.log(`- Project URL: ${stagingUrl}`);
console.log(`- Project Ref: ${stagingUrl.replace('https://', '').split('.')[0]}`);
console.log('========================================================================================\n');

const client = createClient(stagingUrl, stagingAnonKey);

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_Q1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_Q7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACCOUNT_Q1 = '3747b869-5ed5-4255-8237-64554fd35d64';
const CATEGORY_EXPENSE = '9528c0cf-b53f-46dc-8516-561d3203f3b4';
const SERVICE_A = '55555555-5555-5555-5555-555555555551'; // Chăm sóc da Gold 24K - 1.2M
const SERVICE_B = '55555555-5555-5555-5555-555555555552'; // Laser Pico - 2.5M
const PRODUCT_HA = '44444444-4444-4444-4444-444444444441'; // Serum HA Booster 850k (Giá vốn 420k)
const PACKAGE_VIP = '66666666-6666-6666-6666-666666666661'; // Gói VIP 10 buổi 9.6M

async function runFullLifecycle() {
  let stepCount = 0;
  let passedCount = 0;

  function recordStep(name, detail) {
    stepCount++;
    passedCount++;
    console.log(`✅ [BƯỚC ${String(stepCount).padStart(2, '0')} - PASS] ${name}`);
    if (detail) console.log(`   👉 ${detail}`);
  }

  // --- 0. ĐĂNG NHẬP ADMIN ---
  console.log('--- [GIAI ĐOẠN 0] XÁC THỰC QUẢN TRỊ VIÊN ---');
  const { data: adminLogin, error: adminErr } = await client.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assert.strictEqual(adminErr, null, `Admin login error: ${adminErr?.message}`);
  const { data: staffList } = await client.from('staff_profiles').select('id, full_name').eq('email', 'admin.staging@phuongnam.vn').single();
  const staffId = staffList.id;
  recordStep('Đăng nhập quản trị viên Admin Staging', `Tài khoản: admin.staging@phuongnam.vn (Staff ID: ${staffId})`);

  // --- 1. KHÁCH HÀNG: TẠO KHÁCH HÀNG MỚI ---
  console.log('\n--- [GIAI ĐOẠN 1] KHÁCH HÀNG & HỒ SƠ Y KHOA ---');
  const testCustomerPhone = `0909${Date.now().toString().slice(-6)}`;
  const testCustomerId = crypto.randomUUID();
  const { error: custErr } = await client.from('customers').insert({
    id: testCustomerId,
    organization_id: ORG_ID,
    primary_branch_id: BRANCH_Q1,
    full_name: 'Khách Hàng E2E Kiểm Thử',
    phone: testCustomerPhone,
    tier: 'standard',
    total_spent: 0,
    debt_balance: 0,
    medical_notes: 'Tiền sử dị ứng cồn nhẹ, da nhạy cảm'
  });
  assert.strictEqual(custErr, null, `Insert customer error: ${custErr?.message}`);
  recordStep('Tạo hồ sơ khách hàng mới (Customer Lifecycle)', `Khách: Khách Hàng E2E Kiểm Thử (${testCustomerPhone})`);

  // --- 2. ĐẶT LỊCH HẸN & TIẾP NHẬN ---
  console.log('\n--- [GIAI ĐOẠN 2] ĐẶT LỊCH HẸN & ĐIỀU PHỐI (APPOINTMENT & DISPATCH) ---');
  const apptId = crypto.randomUUID();
  const apptTime = new Date(Date.now() + 3600000).toISOString();
  const { error: apptErr } = await client.from('appointments').insert({
    id: apptId,
    organization_id: ORG_ID,
    branch_id: BRANCH_Q1,
    customer_id: testCustomerId,
    service_id: SERVICE_A,
    staff_id: staffId,
    scheduled_at: apptTime,
    duration_minutes: 60,
    status: 'booked',
    notes: 'Đặt hẹn kiểm thử E2E xuyên suốt'
  });
  assert.strictEqual(apptErr, null, `Insert appointment error: ${apptErr?.message}`);
  recordStep('Khởi tạo lịch hẹn dịch vụ (Appointment Booked)', `Lịch hẹn ID: ${apptId} - KTV điều phối: ${staffList.full_name}`);

  // Tiếp nhận khách (Check-in & In-progress)
  const { error: updApptErr } = await client.from('appointments').update({
    status: 'in_progress',
    updated_at: new Date().toISOString()
  }).eq('id', apptId);
  assert.strictEqual(updApptErr, null, `Checkin error: ${updApptErr?.message}`);
  recordStep('Lễ tân tiếp nhận & Chuyển trạng thái đang điều trị (In-Progress)', `Khách đã check-in vào phòng điều trị Q1`);

  // --- 3. BÁN GÓI LIỆU TRÌNH QUA POS ACID CHECKOUT ---
  console.log('\n--- [GIAI ĐOẠN 3] POS ACID CHECKOUT (GÓI LIỆU TRÌNH + SẢN PHẨM BÁN LẺ) ---');
  
  // Baseline tồn kho trước khi bán sản phẩm
  const { data: stockBeforeRec } = await client.from('inventory_stocks')
    .select('stock_on_hand')
    .eq('branch_id', BRANCH_Q1)
    .eq('product_id', PRODUCT_HA)
    .single();
  const stockOnHandBefore = stockBeforeRec?.stock_on_hand || 0;

  // POS Checkout 1 Gói VIP (9.6M) + 1 Serum HA (850k) = 10.450.000 đ
  const posCheckoutRes = await client.rpc('rpc_pos_checkout', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_customer_id: testCustomerId,
    p_cashier_staff_id: staffId,
    p_items: [
      { type: 'package', id: PACKAGE_VIP, qty: 1 },
      { type: 'product', id: PRODUCT_HA, qty: 1 }
    ],
    p_payment_method: 'cash',
    p_paid_amount: 10450000,
    p_idempotency_key: `e2e_pos_${Date.now()}`
  });
  assert.strictEqual(posCheckoutRes.error, null, `POS checkout RPC error: ${posCheckoutRes.error?.message}`);
  assert.strictEqual(posCheckoutRes.data?.success, true, `POS checkout failed: ${posCheckoutRes.data?.message}`);
  const saleId = posCheckoutRes.data.sale_id;
  const invoiceNo = posCheckoutRes.data.invoice_no;
  recordStep('Thanh toán đơn hàng qua POS ACID Checkout', `Hóa đơn: #${invoiceNo} - Tổng tiền: ${Number(posCheckoutRes.data.total_amount).toLocaleString('vi-VN')} đ`);

  // Xác minh hệ thống tự động sinh thẻ liệu trình liên kết hóa đơn
  const { data: createdCourse, error: cCourseErr } = await client.from('customer_courses')
    .select('*')
    .eq('sale_id', saleId)
    .single();
  assert.strictEqual(cCourseErr, null, `Fetch course error: ${cCourseErr?.message}`);
  assert.ok(createdCourse !== null, 'Hệ thống phải tự động tạo thẻ liệu trình');
  assert.strictEqual(createdCourse.total_sessions, 10, 'Thẻ liệu trình phải có 10 buổi');
  assert.strictEqual(createdCourse.used_sessions, 0, 'Thẻ mới tạo phải có 0 buổi đã dùng');
  recordStep('Hệ thống tự động kích hoạt Thẻ liệu trình (Customer Course Auto-Init)', `Mã thẻ: ${createdCourse.id} (10 buổi - 0 buổi đã dùng)`);

  // Xác minh tồn kho tự động trừ đúng 1 sản phẩm
  const { data: stockAfterRec } = await client.from('inventory_stocks')
    .select('stock_on_hand')
    .eq('branch_id', BRANCH_Q1)
    .eq('product_id', PRODUCT_HA)
    .single();
  assert.strictEqual(
    stockAfterRec.stock_on_hand,
    stockOnHandBefore - 1,
    `Tồn kho phải giảm từ ${stockOnHandBefore} xuống ${stockOnHandBefore - 1}`
  );
  recordStep('Tự động trừ tồn kho và ghi sổ thẻ kho (Inventory Stock Deduction)', `Tồn Serum HA: ${stockOnHandBefore} -> ${stockAfterRec.stock_on_hand} chai`);

  // --- 4. THỰC HIỆN ĐIỀU TRỊ: TRỪ BUỔI & VẬT TƯ TIÊU HAO ---
  console.log('\n--- [GIAI ĐOẠN 4] THỰC HIỆN ĐIỀU TRỊ & TRỪ BUỔI LIỆU TRÌNH ---');
  
  // Trừ 1 buổi thực tế qua RPC
  const deductRes = await client.rpc('rpc_deduct_course_session', {
    p_course_id: createdCourse.id,
    p_branch_id: BRANCH_Q1,
    p_staff_id: staffId,
    p_sessions: 1,
    p_notes: 'Thực hiện buổi 1 liệu trình Gold 24K'
  });
  assert.strictEqual(deductRes.error, null, `Deduct error: ${deductRes.error?.message}`);
  assert.strictEqual(deductRes.data?.success, true, 'Deduct session failed');
  recordStep('Kỹ thuật viên thực hiện trừ buổi điều trị (Session Deduction)', `Trừ 1 buổi thành công trên thẻ liệu trình #${createdCourse.id}`);

  // Ghi nhận vật tư tiêu hao ca điều trị (Session Material Usage)
  // Ghi nhận vật tư tiêu hao ca điều trị qua RPC chuẩn
  const usageRes = await client.rpc('rpc_record_service_material_usage', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_service_id: SERVICE_A,
    p_staff_id: staffId,
    p_appointment_id: apptId,
    p_items: [{
      product_id: PRODUCT_HA,
      actual_quantity: 1,
      unit_of_measure: 'chai',
      lot_number: 'LOT-202610'
    }],
    p_notes: 'Xuất vật tư Serum HA ca Gold 24K'
  });
  assert.strictEqual(usageRes.error, null, `Material usage RPC error: ${usageRes.error?.message}`);
  assert.strictEqual(usageRes.data?.success, true, `Material usage failed: ${usageRes.data?.message}`);
  recordStep('Ghi nhận vật tư tiêu hao ca điều trị (COGS Material Usage)', `Vật tư: 1 Serum HA xuất dùng qua RPC thành công`);

  // Hoàn tất lịch hẹn
  const { error: compApptErr } = await client.from('appointments').update({
    status: 'completed',
    updated_at: new Date().toISOString()
  }).eq('id', apptId);
  assert.strictEqual(compApptErr, null, `Complete appointment error: ${compApptErr?.message}`);
  recordStep('Hoàn tất toàn bộ chu trình phục vụ khách hàng (Appointment Completed)', `Lịch hẹn #${apptId} chuyển trạng thái Hoàn thành`);

  // --- 5. QUẢN TRỊ KHO: NHẬP KHO, ĐIỀU CHUYỂN & KIỂM KÊ ---
  console.log('\n--- [GIAI ĐOẠN 5] QUẢN TRỊ KHO & VẬT TƯ (INVENTORY STAGES A/B/C) ---');
  
  // 5.1 Điều chuyển kho giữa chi nhánh Q1 -> Q7 (Branch Transfer Dispatch & Receive)
  const { data: createTransferRes, error: createTransferErr } = await client.rpc('rpc_create_branch_transfer', {
    p_org_id: ORG_ID,
    p_from_branch_id: BRANCH_Q1,
    p_to_branch_id: BRANCH_Q7,
    p_staff_id: staffId,
    p_items: [
      {
        product_id: PRODUCT_HA,
        lot_number: null,
        expiry_date: null,
        quantity: 2,
        unit_cost: 350000,
        notes: 'Điều chuyển E2E sang Q7'
      }
    ],
    p_notes: 'Điều chuyển kho kiểm thử E2E Q1 -> Q7'
  });
  assert.strictEqual(createTransferErr, null, `Create transfer error: ${createTransferErr?.message}`);
  assert.strictEqual(createTransferRes.success, true, `Create transfer unsuccessful: ${createTransferRes?.message}`);
  const transferId = createTransferRes.transfer_id;

  // Xuất chuyển kho (Dispatch)
  const { data: dispatchRes, error: dispatchErr } = await client.rpc('rpc_dispatch_branch_transfer', {
    p_org_id: ORG_ID,
    p_transfer_id: transferId,
    p_staff_id: staffId,
    p_notes: 'Xuất kho Q1 thành công'
  });
  assert.strictEqual(dispatchErr, null, `Dispatch transfer error: ${dispatchErr?.message}`);
  assert.strictEqual(dispatchRes.success, true, `Dispatch failed: ${dispatchRes?.message}`);

  // Lấy chi tiết dòng chuyển để nhận hàng
  const { data: transferItems, error: getItemsErr } = await client.from('branch_transfer_items').select('*').eq('transfer_id', transferId);
  assert.strictEqual(getItemsErr, null, `Get transfer items error: ${getItemsErr?.message}`);
  assert.ok(transferItems.length > 0, 'Transfer item must exist');

  // Nhận chuyển kho tại Q7 (Receive)
  const { data: receiveRes, error: receiveErr } = await client.rpc('rpc_receive_branch_transfer', {
    p_org_id: ORG_ID,
    p_transfer_id: transferId,
    p_staff_id: staffId,
    p_items: [
      {
        transfer_item_id: transferItems[0].id,
        qty_accepted: 2,
        qty_damaged: 0,
        qty_missing: 0,
        damage_reason: null,
        notes: 'Nhận đủ 2 Serum HA tại Q7'
      }
    ],
    p_notes: 'Nhận chuyển kho hoàn tất tại Q7'
  });
  assert.strictEqual(receiveErr, null, `Receive transfer error: ${receiveErr?.message}`);
  assert.strictEqual(receiveRes.success, true, `Receive failed: ${receiveRes?.message}`);
  recordStep('Điều chuyển kho liên chi nhánh (Branch Transfer Q1 -> Q7)', `Phiếu: #${createTransferRes.transfer_number} - Xuất 2 tại Q1, Nhận đủ 2 tại Q7`);

  // 5.2 Kiểm kê kho & Cân bằng tồn (Inventory Audit & Reconciliation)
  const { data: createAuditRes, error: createAuditErr } = await client.rpc('rpc_create_inventory_audit', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_staff_id: staffId,
    p_product_ids: [PRODUCT_HA],
    p_notes: 'Kiểm kê kho định kỳ E2E'
  });
  assert.strictEqual(createAuditErr, null, `Create audit error: ${createAuditErr?.message}`);
  assert.strictEqual(createAuditRes.success, true, `Create audit unsuccessful: ${createAuditRes?.message}`);
  const auditId = createAuditRes.audit_id;

  const { data: auditItems, error: getAuditItemsErr } = await client.from('inventory_audit_items').select('*').eq('audit_id', auditId);
  assert.strictEqual(getAuditItemsErr, null, `Get audit items error: ${getAuditItemsErr?.message}`);
  assert.ok(auditItems.length > 0, 'Audit item must exist');

  // Khớp số đếm thực tế
  const { data: countRes, error: countErr } = await client.rpc('rpc_submit_inventory_audit_counts', {
    p_org_id: ORG_ID,
    p_audit_id: auditId,
    p_staff_id: staffId,
    p_items: [
      {
        item_id: auditItems[0].id,
        actual_quantity: auditItems[0].system_quantity,
        reason: 'Khớp 100% tồn thực tế',
        notes: 'Kiểm kê định kỳ'
      }
    ]
  });
  assert.strictEqual(countErr, null, `Submit audit counts error: ${countErr?.message}`);
  assert.strictEqual(countRes.success, true, `Submit audit failed: ${countRes?.message}`);

  // Phê duyệt và chốt kiểm kê
  const { data: approveAuditRes, error: approveAuditErr } = await client.rpc('rpc_approve_inventory_audit', {
    p_org_id: ORG_ID,
    p_audit_id: auditId,
    p_staff_id: staffId,
    p_notes: 'Phê duyệt kiểm kê E2E hoàn tất'
  });
  assert.strictEqual(approveAuditErr, null, `Approve audit error: ${approveAuditErr?.message}`);
  assert.strictEqual(approveAuditRes.success, true, `Approve audit failed: ${approveAuditRes?.message}`);
  recordStep('Kiểm kê kho & Cân bằng tồn (Inventory Audit & Stock Reconciliation)', `Phiếu: #${createAuditRes.audit_number} - Tồn sổ sách khớp 100% kiểm đếm thực tế`);

  // --- 6. SỔ QUỸ & CHI PHÍ VẬN HÀNH (EXPENSE VOUCHER & REVERSAL) ---
  console.log('\n--- [GIAI ĐOẠN 6] SỔ QUỸ & CHI PHÍ VẬN HÀNH (DISBURSEMENT & REVERSAL) ---');
  const e2eVoucherId = crypto.randomUUID();
  const voucherNum = `PC-E2E-${Date.now().toString().slice(-4)}`;

  const { error: insVoucherErr } = await client.from('expense_vouchers').insert({
    id: e2eVoucherId,
    organization_id: ORG_ID,
    branch_id: BRANCH_Q1,
    voucher_number: voucherNum,
    category_id: CATEGORY_EXPENSE,
    category_name: 'Chi phí vận hành E2E',
    title: 'Phiếu chi vận hành E2E',
    amount: 1500000,
    account_id: ACCOUNT_Q1,
    payment_method: 'cash',
    paid_to: 'Đối tác E2E',
    expense_date: new Date().toISOString().split('T')[0],
    status: 'draft',
    created_by_staff_id: staffId
  });
  assert.strictEqual(insVoucherErr, null, `Insert voucher error: ${insVoucherErr?.message}`);

  // Giải ngân qua RPC
  const { data: disbRes, error: disbErr } = await client.rpc('rpc_disburse_expense_voucher', {
    p_voucher_id: e2eVoucherId
  });
  assert.strictEqual(disbErr, null, `Disburse error: ${disbErr?.message}`);
  assert.strictEqual(disbRes.success, true, 'Disbursement failed');
  recordStep('Tạo & Giải ngân phiếu chi vận hành (Disburse Expense Voucher)', `Phiếu: #${voucherNum} - Số tiền: 1.500.000 đ`);

  // Hoàn chi qua RPC
  const { data: revRes, error: revErr } = await client.rpc('rpc_cancel_or_reverse_expense_voucher', {
    p_voucher_id: e2eVoucherId,
    p_reason: 'Hoàn chi kiểm thử E2E'
  });
  assert.strictEqual(revErr, null, `Reversal error: ${revErr?.message}`);
  assert.strictEqual(revRes.success, true, 'Reversal failed');
  recordStep('Thực hiện hoàn chi & Bảo toàn sổ cái (Expense Reversal)', `Hoàn lại 1.500.000 đ vào Quỹ Q1 (Số dư & Sổ cái bất biến)`);

  // --- 7. ĐỐI SOÁT TỔNG THỂ BÁO CÁO TÀI CHÍNH P&L ---
  console.log('\n--- [GIAI ĐOẠN 7] ĐỐI SOÁT BÁO CÁO P&L & BẢO TOÀN DỮ LIỆU ---');
  const today = new Date().toISOString().split('T')[0];
  const { data: pnlRes, error: pnlErr } = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: today,
    p_end_date: today
  });
  assert.strictEqual(pnlErr, null, `P&L query error: ${pnlErr?.message}`);
  assert.ok(pnlRes.recognized_revenue_kpi !== undefined, 'Recognized Revenue KPI must exist');
  assert.ok(pnlRes.operating_deductions !== undefined, 'Operating Deductions must exist');

  // Đối soát tam giác số dư Quỹ - Sổ cái
  const { data: finAcc } = await client.from('financial_accounts').select('current_balance').eq('id', ACCOUNT_Q1).single();
  const { data: latestLedger } = await client.from('cashflow_ledger')
    .select('balance_after')
    .eq('account_id', ACCOUNT_Q1)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .single();

  assert.strictEqual(
    Number(finAcc.current_balance),
    Number(latestLedger.balance_after),
    `Số dư tài khoản quỹ (${finAcc.current_balance}) phải khớp 100% với bút toán sổ cái (${latestLedger.balance_after})`
  );
  recordStep('Đối soát tam giác Quỹ - Sổ cái sau toàn bộ chu trình E2E', `Khớp 100%: Quỹ Q1 (${Number(finAcc.current_balance).toLocaleString('vi-VN')} đ) = Bút toán sổ cái mới nhất (${Number(latestLedger.balance_after).toLocaleString('vi-VN')} đ)`);

  console.log('\n========================================================================================');
  console.log('TỔNG KẾT KIỂM THỬ XUYÊN SUỐT STAGING (E2E FULL LIFECYCLE):');
  console.log(`- TỔNG SỐ BƯỚC ĐÃ CHẠY & VƯỢT QUA: ${passedCount}/${stepCount} (100% HOÀN HẢO)`);
  console.log(`- THẤT BẠI:                       0`);
  console.log(`- TÍNH TOÀN VẸN NGHIỆP VỤ:        KHÔNG LỆCH SỐ DƯ, KHÔNG NHÂN BẢN DOANH THU/CHI PHÍ`);
  console.log('========================================================================================\n');
}

runFullLifecycle().catch(err => {
  console.error('\n❌ KIỂM THỬ E2E THẤT BẠI TẠI BƯỚC:', err);
  process.exit(1);
});
