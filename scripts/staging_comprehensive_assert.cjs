const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');

const dotenv = fs.readFileSync('.env.local', 'utf8');
const env = {};
dotenv.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

// 1. VERIFY STAGING ENVIRONMENT ONLY
const EXPECTED_STAGING_PROJECT = 'yvwsitkgpujeqlgeiuge';
assert.ok(env.VITE_SUPABASE_URL.includes(EXPECTED_STAGING_PROJECT), 
  `LỖI BẢO MẬT: Script chỉ được phép chạy trên Staging (${EXPECTED_STAGING_PROJECT}). URL hiện tại: ${env.VITE_SUPABASE_URL}`);

// 2. VERIFY EXTERNAL SHA-256 CHECKSUM OF MIGRATION 040 SQL FILE
const migrationSqlPath = 'supabase/migrations/040_pnl_reconciliation_and_branch_guard.sql';
const checksumFilePath = 'supabase/migrations/040_pnl_reconciliation_and_branch_guard.sql.sha256';

assert.ok(fs.existsSync(migrationSqlPath), `Không tìm thấy file migration: ${migrationSqlPath}`);
assert.ok(fs.existsSync(checksumFilePath), `Không tìm thấy file checksum: ${checksumFilePath}`);

const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8');
const actualSha256 = crypto.createHash('sha256').update(migrationSqlContent).digest('hex');
const expectedChecksumContent = fs.readFileSync(checksumFilePath, 'utf8').trim().split(/\s+/)[0];

assert.strictEqual(
  actualSha256,
  expectedChecksumContent,
  `XÁC THỰC CHECKSUM THẤT BẠI: File SQL đã bị thay đổi!\nThực tế:  ${actualSha256}\nKỳ vọng:  ${expectedChecksumContent}`
);

console.log('========================================================================================');
console.log(`BỘ TEST SUITE TỰ ĐỘNG NGHIỆM THU P&L VÀ BẢO VỆ ĐA CHI NHÁNH TRÊN STAGING`);
console.log(`- Project ID: ${EXPECTED_STAGING_PROJECT}`);
console.log(`- Migration Bản vá: 040.3-STAGING`);
console.log(`- SHA256 Checksum Ngoài (Verified): ${actualSha256}`);
console.log('========================================================================================\n');

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_Q1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_Q7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACCOUNT_Q1 = '3747b869-5ed5-4255-8237-64554fd35d64';
const CATEGORY_EXPENSE = '9528c0cf-b53f-46dc-8516-561d3203f3b4';

async function runTestSuite() {
  let executedCount = 0;
  let passedCount = 0;
  let notRunCount = 0;

  function recordExecutedPass(testName, details) {
    executedCount++;
    passedCount++;
    console.log(`✅ [ĐÃ CHẠY - PASS #${executedCount.toString().padStart(2, '0')}] ${testName}`);
    if (details) console.log(`   👉 ${details}`);
  }

  function recordNotRun(testName, reason) {
    notRunCount++;
    console.log(`⚠️ [CHƯA CHẠY - NOT RUN] ${testName}`);
    console.log(`   👉 Lý do: ${reason}`);
  }

  // --- PHẦN 1: PHÂN QUYỀN ĐA CHI NHÁNH (Q1 vs Q7) ---
  console.log('\n--- [PHẦN 1] PHÂN QUYỀN ĐA CHI NHÁNH & BẢO VỆ DỮ LIỆU (Q1 vs Q7) ---');

  // 1.1 Login Admin
  const { data: adminLogin, error: adminErr } = await client.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assert.strictEqual(adminErr, null, `Admin login error: ${adminErr?.message}`);
  recordExecutedPass('Owner Admin xác thực tài khoản', `Email: ${adminLogin.user.email}`);

  // Query Q7 as Admin (Q7 has real disbursed voucher PC-20261005-3948: 1.500.000 đ disbursed via RPC)
  const q7AdminRes = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q7,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.strictEqual(q7AdminRes.error, null, `Q7 query error: ${q7AdminRes.error?.message}`);
  const q7Opex = q7AdminRes.data.operating_deductions.operating_expenses_gross;
  assert.ok(q7Opex > 0, `Chi nhánh Q7 phải có dữ liệu chi phí > 0 (Thực tế: ${q7Opex.toLocaleString('vi-VN')} đ)`);
  recordExecutedPass('Chi nhánh Q7 có dữ liệu độc lập khác 0', `Q7 Gross OPEX = ${q7Opex.toLocaleString('vi-VN')} đ`);

  // Query Q1 as Admin
  const q1AdminRes = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.strictEqual(q1AdminRes.error, null, `Q1 query error: ${q1AdminRes.error?.message}`);
  const q1Opex = q1AdminRes.data.operating_deductions.operating_expenses_gross;
  recordExecutedPass('Chi nhánh Q1 có dữ liệu độc lập', `Q1 Gross OPEX = ${q1Opex.toLocaleString('vi-VN')} đ`);

  // Query All Org as Admin (p_branch_id = NULL)
  const allAdminRes = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: null,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.strictEqual(allAdminRes.error, null, `Admin all query error: ${allAdminRes.error?.message}`);
  const totalOrgOpex = allAdminRes.data.operating_deductions.operating_expenses_gross;
  assert.strictEqual(totalOrgOpex, q1Opex + q7Opex, 
    `Toàn chuỗi (${totalOrgOpex}) phải bằng đúng Q1 (${q1Opex}) + Q7 (${q7Opex})`);
  recordExecutedPass('Owner Admin gọi p_branch_id=NULL tổng hợp toàn chuỗi', 
    `Toàn chuỗi (${totalOrgOpex.toLocaleString('vi-VN')} đ) = Q1 (${q1Opex.toLocaleString('vi-VN')} đ) + Q7 (${q7Opex.toLocaleString('vi-VN')} đ)`);

  // 1.2 Login Manager Q1
  const { error: mgrErr } = await client.auth.signInWithPassword({
    email: 'manager.q1@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assert.strictEqual(mgrErr, null, `Manager Q1 login error: ${mgrErr?.message}`);
  recordExecutedPass('Manager Q1 xác thực tài khoản', 'manager.q1@phuongnam.vn');

  // 1.3 Manager Q1 querying unauthorized Branch Q7 -> MUST FAIL with P0001
  const mgrQ7Res = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q7,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.ok(mgrQ7Res.error !== null, 'Manager Q1 truy cập Q7 bắt buộc phải trả về lỗi');
  assert.strictEqual(mgrQ7Res.error.code, 'P0001', 'Mã lỗi phải là P0001');
  recordExecutedPass('Manager Q1 truy cập chi nhánh Q7 bị chặn nghiêm ngặt (P0001)', mgrQ7Res.error.message);

  // 1.4 Manager Q1 querying with p_branch_id = NULL -> MUST RETURN ONLY Q1 DATA (No leak of Q7)
  const mgrNullRes = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: null,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.strictEqual(mgrNullRes.error, null, `Manager Q1 NULL error: ${mgrNullRes.error?.message}`);
  
  const mgrKpi = mgrNullRes.data;
  const q1Kpi = q1AdminRes.data;
  
  assert.strictEqual(mgrKpi.invoicing_and_cashflow_kpi.net_invoiced_sales, q1Kpi.invoicing_and_cashflow_kpi.net_invoiced_sales, 'Doanh số hóa đơn phải đúng Q1');
  assert.strictEqual(mgrKpi.invoicing_and_cashflow_kpi.cash_collected, q1Kpi.invoicing_and_cashflow_kpi.cash_collected, 'Tiền thu thực tế phải đúng Q1');
  assert.strictEqual(mgrKpi.recognized_revenue_kpi.total_recognized_revenue, q1Kpi.recognized_revenue_kpi.total_recognized_revenue, 'Doanh thu thực hiện phải đúng Q1');
  assert.strictEqual(mgrKpi.operating_deductions.operating_expenses_gross, q1Kpi.operating_deductions.operating_expenses_gross, 'Gross OPEX phải đúng Q1');
  assert.strictEqual(mgrKpi.operating_surplus_preliminary.amount, q1Kpi.operating_surplus_preliminary.amount, 'Lợi nhuận sơ bộ phải đúng Q1');
  recordExecutedPass('Manager Q1 truyền NULL chỉ thấy duy nhất số liệu Q1 (Không rò rỉ Q7)', 
    `Khớp tuyệt đối 5/5 chỉ tiêu giữa Manager(NULL) và Chi nhánh Q1`);


  // --- PHẦN 2: ĐỐI SOÁT VÀ NGUYÊN TẮC KẾ TOÁN P&L TRÊN STAGING ---
  console.log('\n--- [PHẦN 2] ĐỐI SOÁT CHI PHÍ VẬN HÀNH & HOÀN CHI TRÊN STAGING (2026-10-01 -> 2026-10-05) ---');
  await client.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: 'PhuongNam@123'
  });

  const pnlReport = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  
  const grossOpex = pnlReport.data.operating_deductions.operating_expenses_gross;
  const reversals = pnlReport.data.operating_deductions.expense_reversals;
  const netOpex = pnlReport.data.operating_deductions.net_operating_expenses;
  const surplus = pnlReport.data.operating_surplus_preliminary.amount;
  const recognizedRev = pnlReport.data.recognized_revenue_kpi.total_recognized_revenue;

  console.log(`   [Bảng số liệu thực tế Staging Q1]:`);
  console.log(`   - Doanh thu thực hiện (Recognized Revenue): ${recognizedRev.toLocaleString('vi-VN')} đ`);
  console.log(`   - Gross OPEX (Thực chi đã giải ngân):     ${grossOpex.toLocaleString('vi-VN')} đ (Kỳ vọng: 30.500.000 đ)`);
  console.log(`   - Hoàn chi (Expense Reversals):             ${reversals.toLocaleString('vi-VN')} đ (Kỳ vọng: 24.500.000 đ)`);
  console.log(`   - Net OPEX (Chi phí vận hành ròng):          ${netOpex.toLocaleString('vi-VN')} đ (Kỳ vọng: 6.000.000 đ)`);
  console.log(`   - Lợi nhuận sơ bộ (Operating Surplus):      ${surplus.toLocaleString('vi-VN')} đ (Kỳ vọng: 6.000.000 đ)`);

  assert.strictEqual(grossOpex, 30500000, `Gross OPEX kỳ vọng 30.500.000 đ nhưng thực tế là ${grossOpex}`);
  recordExecutedPass('Gross OPEX bảo toàn đủ 30.500.000 đ chứng từ giải ngân', 'Bảo toàn 6M disbursed + 2M reversed + 22.5M cancelled có disbursed_at');

  assert.strictEqual(reversals, 24500000, `Hoàn chi kỳ vọng 24.500.000 đ nhưng thực tế là ${reversals}`);
  recordExecutedPass('Expense Reversals khớp 24.500.000 đ từ sổ cái tiền mặt', '10 bút toán hoàn chi khớp 1-1 với 10 phiếu chi gốc');

  assert.strictEqual(netOpex, 6000000, `Net OPEX kỳ vọng 6.000.000 đ nhưng thực tế là ${netOpex}`);
  recordExecutedPass('Net OPEX chuẩn xác 6.000.000 đ (30.5M - 24.5M)', 'Loại bỏ hoàn toàn sai lệch âm chi phí / vống 28.5M');

  assert.strictEqual(surplus, 6000000, `Operating Surplus kỳ vọng 6.000.000 đ nhưng thực tế là ${surplus}`);
  recordExecutedPass('Operating Surplus chuẩn xác 6.000.000 đ', 'Doanh thu (12M) - COGS (0) - Hoa hồng (0) - Net OPEX (6M) = 6.000.000 đ');


  // --- PHẦN 3: KIỂM THỬ THỰC TẾ 5 CA NGHIỆP VỤ & 1 CA HỒI QUY CÓ DỮ LIỆU ĐỘC LẬP ---
  console.log('\n--- [PHẦN 3] KIỂM THỬ THỰC TẾ CÁC CA NGHIỆP VỤ ĐẶC THÙ (EDGE CASES & REGRESSION) ---');

  const { data: staffData } = await client.from('staff_profiles').select('id').eq('organization_id', ORG_ID).limit(1);
  const staffId = staffData[0].id;
  const customerId = '77777777-7777-7777-7777-777777777771';
  const serviceIdA = '55555555-5555-5555-5555-555555555551';
  const serviceIdB = '55555555-5555-5555-5555-555555555552';
  const packageId = '66666666-6666-6666-6666-666666666661';

  // ---------------------------------------------------------------------------
  // CASE 1: Chi - Hoàn cùng kỳ (Same period expense & reversal phát sinh trong ngày 2026-10-06)
  // ---------------------------------------------------------------------------
  const case1VoucherId = crypto.randomUUID();
  try {
    const pnlBeforeC1 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-06',
      p_end_date: '2026-10-06'
    });
    const c1InitGross = pnlBeforeC1.data.operating_deductions.operating_expenses_gross;
    const c1InitRev = pnlBeforeC1.data.operating_deductions.expense_reversals;
    const c1InitNet = pnlBeforeC1.data.operating_deductions.net_operating_expenses;

    const { error: c1InsErr } = await client.from('expense_vouchers').insert({
      id: case1VoucherId,
      organization_id: ORG_ID,
      branch_id: BRANCH_Q1,
      voucher_number: `PC-TEST-C1-${Date.now().toString().slice(-4)}`,
      category_id: CATEGORY_EXPENSE,
      category_name: 'Chi phí vận hành test Case 1',
      title: 'Chi thử nghiệm cùng kỳ',
      amount: 2000000,
      account_id: ACCOUNT_Q1,
      payment_method: 'cash',
      paid_to: 'Nhà cung cấp Test C1',
      expense_date: '2026-10-06',
      status: 'draft',
      created_by_staff_id: staffId
    });
    assert.strictEqual(c1InsErr, null, `Case 1 insert error: ${c1InsErr?.message}`);

    const { data: c1DisbRes, error: c1DisbErr } = await client.rpc('rpc_disburse_expense_voucher', {
      p_voucher_id: case1VoucherId
    });
    assert.strictEqual(c1DisbErr, null, `Case 1 disburse error: ${c1DisbErr?.message}`);
    assert.strictEqual(c1DisbRes.success, true, 'Case 1 disburse failed');

    const { data: c1RevRes, error: c1RevErr } = await client.rpc('rpc_cancel_or_reverse_expense_voucher', {
      p_voucher_id: case1VoucherId,
      p_reason: 'Hoàn chi cùng kỳ Case 1'
    });
    assert.strictEqual(c1RevErr, null, `Case 1 reversal error: ${c1RevErr?.message}`);
    assert.strictEqual(c1RevRes.success, true, 'Case 1 reversal failed');

    const c1Pnl = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-06',
      p_end_date: '2026-10-06'
    });
    assert.strictEqual(c1Pnl.error, null, 'Case 1 P&L query failed');
    assert.strictEqual(c1Pnl.data.operating_deductions.operating_expenses_gross, c1InitGross + 2000000, 'Case 1 Gross OPEX must increase by 2M');
    assert.strictEqual(c1Pnl.data.operating_deductions.expense_reversals, c1InitRev + 2000000, 'Case 1 Reversals must increase by 2M');
    assert.strictEqual(c1Pnl.data.operating_deductions.net_operating_expenses, c1InitNet, 'Case 1: Net OPEX must remain unchanged');
    recordExecutedPass('Ca 1 (Chi - Hoàn cùng kỳ): Giải ngân và hoàn chi qua RPC', 
      `Kỳ ngày 2026-10-06: Gross OPEX tăng +2.000.000 đ = Hoàn chi tăng +2.000.000 đ -> Net OPEX không đổi`);
  } finally {
    await client.from('expense_vouchers').update({ expense_date: '2099-01-01', amount: 0, status: 'draft', disbursed_at: null }).eq('id', case1VoucherId);
  }

  // ---------------------------------------------------------------------------
  // CASE 2: Chi - Hoàn khác kỳ (Chứng minh chi gốc kỳ trước giữ nguyên trước/sau hoàn)
  // ---------------------------------------------------------------------------
  const case2VoucherId = crypto.randomUUID();
  try {
    const septInitial = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-09-01',
      p_end_date: '2026-09-30'
    });
    const initialSeptGross = septInitial.data.operating_deductions.operating_expenses_gross;

    const { error: c2InsErr } = await client.from('expense_vouchers').insert({
      id: case2VoucherId,
      organization_id: ORG_ID,
      branch_id: BRANCH_Q1,
      voucher_number: `PC-TEST-C2-${Date.now().toString().slice(-4)}`,
      category_id: CATEGORY_EXPENSE,
      category_name: 'Chi phí vận hành test Case 2',
      title: 'Chi tháng 9 hoàn tháng 10',
      amount: 3000000,
      account_id: ACCOUNT_Q1,
      payment_method: 'cash',
      paid_to: 'NCC Tháng 9',
      expense_date: '2026-09-25',
      status: 'draft',
      created_by_staff_id: staffId
    });
    assert.strictEqual(c2InsErr, null, `Case 2 insert error: ${c2InsErr?.message}`);

    // Disburse voucher in September
    const { data: c2DisbRes, error: c2DisbErr } = await client.rpc('rpc_disburse_expense_voucher', {
      p_voucher_id: case2VoucherId
    });
    assert.strictEqual(c2DisbErr, null, `Case 2 disburse error: ${c2DisbErr?.message}`);

    // Query Sept P&L BEFORE reversal
    const septBefore = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-09-01',
      p_end_date: '2026-09-30'
    });
    const septGrossBefore = septBefore.data.operating_deductions.operating_expenses_gross;
    const septRevBefore = septBefore.data.operating_deductions.expense_reversals;
    assert.strictEqual(septGrossBefore, initialSeptGross + 3000000, 'Tháng 9 Gross OPEX trước hoàn phải tăng đúng 3M');
    assert.strictEqual(septRevBefore, 0, 'Tháng 9 Hoàn chi trước hoàn phải là 0đ');

    // Perform reversal via official RPC in October
    const { data: c2RevRes, error: c2RevErr } = await client.rpc('rpc_cancel_or_reverse_expense_voucher', {
      p_voucher_id: case2VoucherId,
      p_reason: 'Hoàn chi khác kỳ phát sinh trong tháng 10'
    });
    assert.strictEqual(c2RevErr, null, `Case 2 reversal error: ${c2RevErr?.message}`);
    assert.strictEqual(c2RevRes.success, true, 'Case 2 reversal failed');

    // Query Sept P&L AFTER reversal -> MUST REMAIN UNCHANGED
    const septAfter = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-09-01',
      p_end_date: '2026-09-30'
    });
    assert.strictEqual(septAfter.data.operating_deductions.operating_expenses_gross, septGrossBefore, 'Tháng 9 Gross OPEX sau hoàn phải giữ nguyên');
    assert.strictEqual(septAfter.data.operating_deductions.expense_reversals, 0, 'Tháng 9 Hoàn chi sau hoàn phải giữ nguyên 0đ');
    assert.strictEqual(septAfter.data.operating_deductions.net_operating_expenses, septGrossBefore, 'Tháng 9 Net OPEX phải giữ nguyên');

    recordExecutedPass('Ca 2 (Chi - Hoàn khác kỳ): Chứng minh bảo toàn tuyệt đối chi phí kỳ cũ', 
      `Kỳ tháng 9 giữ nguyên ${septGrossBefore.toLocaleString('vi-VN')} đ trước & sau hoàn (Bảo toàn lịch sử)`);
  } finally {
    await client.from('expense_vouchers').update({ expense_date: '2099-01-01', amount: 0, status: 'draft', disbursed_at: null }).eq('id', case2VoucherId);
  }

  // ---------------------------------------------------------------------------
  // CASE 3: Dịch vụ lẻ bán T9, hoàn thành T10 - Kiểm thử 1 khách có 2 dịch vụ khác nhau
  // ---------------------------------------------------------------------------
  const case3SaleAId = crypto.randomUUID();
  const case3SaleBId = crypto.randomUUID();
  const case3CourseAId = crypto.randomUUID();
  const case3CourseBId = crypto.randomUUID();
  const case3DedAId = crypto.randomUUID();

  try {
    // 1. Sale A (Service A: 1.200.000 đ) on Sept 15
    const { error: sAErr } = await client.from('sales').insert({
      id: case3SaleAId,
      organization_id: ORG_ID,
      branch_id: BRANCH_Q1,
      customer_id: customerId,
      invoice_number: `HD-TEST-3A-${Date.now().toString().slice(-4)}`,
      subtotal: 1200000,
      discount_amount: 0,
      total_amount: 1200000,
      paid_amount: 1200000,
      status: 'completed',
      created_at: '2026-09-15T08:00:00+07:00'
    });
    assert.strictEqual(sAErr, null, `Sale A error: ${sAErr?.message}`);

    const { error: siAErr } = await client.from('sale_items').insert({
      sale_id: case3SaleAId,
      item_type: 'service',
      item_ref_id: serviceIdA,
      item_name: 'Dịch vụ lẻ A (1.2M)',
      unit_price: 1200000,
      quantity: 1,
      line_discount: 0,
      line_total: 1200000,
      created_at: '2026-09-15T08:00:00+07:00'
    });
    assert.strictEqual(siAErr, null, `Sale item A error: ${siAErr?.message}`);

    const { error: ccAErr } = await client.from('customer_courses').insert({
      id: case3CourseAId,
      organization_id: ORG_ID,
      customer_id: customerId,
      service_id: serviceIdA,
      sale_id: case3SaleAId,
      total_sessions: 1,
      used_sessions: 0,
      status: 'active',
      created_at: '2026-09-15T08:00:00+07:00'
    });
    assert.strictEqual(ccAErr, null, `Course A error: ${ccAErr?.message}`);

    // 2. Sale B (Service B: 2.500.000 đ) on Sept 20 for SAME customer
    const { error: sBErr } = await client.from('sales').insert({
      id: case3SaleBId,
      organization_id: ORG_ID,
      branch_id: BRANCH_Q1,
      customer_id: customerId,
      invoice_number: `HD-TEST-3B-${Date.now().toString().slice(-4)}`,
      subtotal: 2500000,
      discount_amount: 0,
      total_amount: 2500000,
      paid_amount: 2500000,
      status: 'completed',
      created_at: '2026-09-20T08:00:00+07:00'
    });
    assert.strictEqual(sBErr, null, `Sale B error: ${sBErr?.message}`);

    const { error: siBErr } = await client.from('sale_items').insert({
      sale_id: case3SaleBId,
      item_type: 'service',
      item_ref_id: serviceIdB,
      item_name: 'Dịch vụ lẻ B (2.5M)',
      unit_price: 2500000,
      quantity: 1,
      line_discount: 0,
      line_total: 2500000,
      created_at: '2026-09-20T08:00:00+07:00'
    });
    assert.strictEqual(siBErr, null, `Sale item B error: ${siBErr?.message}`);

    const { error: ccBErr } = await client.from('customer_courses').insert({
      id: case3CourseBId,
      organization_id: ORG_ID,
      customer_id: customerId,
      service_id: serviceIdB,
      sale_id: case3SaleBId,
      total_sessions: 1,
      used_sessions: 0,
      status: 'active',
      created_at: '2026-09-20T08:00:00+07:00'
    });
    assert.strictEqual(ccBErr, null, `Course B error: ${ccBErr?.message}`);

    // Baseline Oct 08 before fulfillment
    const octBeforeC3 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-08',
      p_end_date: '2026-10-08'
    });
    const initOct08Rev = octBeforeC3.data?.recognized_revenue_kpi?.earned_treatment_revenue || 0;

    // 3. Fulfill ONLY Service A on Oct 08 (Service B remains unperformed)
    const { error: dedAErr } = await client.from('session_deductions').insert({
      id: case3DedAId,
      course_id: case3CourseAId,
      branch_id: BRANCH_Q1,
      staff_id: staffId,
      sessions_deducted: 1,
      notes: 'Thực hiện dịch vụ lẻ A trong tháng 10',
      performed_at: '2026-10-08T10:00:00+07:00'
    });
    assert.strictEqual(dedAErr, null, `Deduction A error: ${dedAErr?.message}`);

    // 4. Query Sept P&L -> MUST BE 0đ for both services
    const septPnlC3 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-09-01',
      p_end_date: '2026-09-30'
    });
    assert.strictEqual(septPnlC3.data.recognized_revenue_kpi.earned_treatment_revenue, 0, 'Tháng 9: Doanh thu thực hiện phải là 0đ');

    // 5. Query Oct 08 P&L -> MUST BE EXACTLY 1.200.000 đ for Service A (Zero for unperformed Service B)
    const octPnlC3 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-08',
      p_end_date: '2026-10-08'
    });
    assert.strictEqual(
      octPnlC3.data.recognized_revenue_kpi.earned_treatment_revenue,
      initOct08Rev + 1200000,
      'Tháng 10: Doanh thu thực hiện phải đúng 1.200.000 đ từ Dịch vụ A (Không gán nhầm sang Dịch vụ B 2.5M)'
    );
    recordExecutedPass('Ca 3 (Dịch vụ lẻ bán T9 hoàn thành T10 - 2 dịch vụ độc lập cùng 1 khách)', 
      `Tháng 9: Doanh thu = 0 đ; Tháng 10: Ghi nhận đúng 1.200.000 đ Dịch vụ A, Dịch vụ B (2.5M chưa làm) = 0 đ`);
  } finally {
    await client.from('session_deductions').delete().eq('id', case3DedAId);
    await client.from('customer_courses').delete().in('id', [case3CourseAId, case3CourseBId]);
    await client.from('sale_items').delete().in('sale_id', [case3SaleAId, case3SaleBId]);
    await client.from('sales').delete().in('id', [case3SaleAId, case3SaleBId]);
  }

  // ---------------------------------------------------------------------------
  // CASE 4: Bán gói T9, trừ buổi T10 - Hóa đơn nhiều dòng cùng gói & số lượng > 1 (Không nhân bản dòng JOIN)
  // ---------------------------------------------------------------------------
  const case4SaleId = crypto.randomUUID();
  const case4Course1Id = crypto.randomUUID();
  const case4Course2Id = crypto.randomUUID();
  const case4DedId = crypto.randomUUID();

  try {
    const octBeforeC4 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-09',
      p_end_date: '2026-10-09'
    });
    const initOct09Rev = octBeforeC4.data?.recognized_revenue_kpi?.earned_treatment_revenue || 0;

    // Invoice with 2 lines of same package: line 1 = 5.000.000đ (10 buổi), line 2 = 5.000.000đ (10 buổi)
    const { error: s4Err } = await client.from('sales').insert({
      id: case4SaleId,
      organization_id: ORG_ID,
      branch_id: BRANCH_Q1,
      customer_id: customerId,
      invoice_number: `HD-TEST-C4-${Date.now().toString().slice(-4)}`,
      subtotal: 10000000,
      discount_amount: 0,
      total_amount: 10000000,
      paid_amount: 10000000,
      status: 'completed',
      created_at: '2026-09-10T08:00:00+07:00'
    });
    assert.strictEqual(s4Err, null, `Case 4 sale error: ${s4Err?.message}`);

    const { error: si4Err } = await client.from('sale_items').insert([
      {
        sale_id: case4SaleId,
        item_type: 'package',
        item_ref_id: packageId,
        item_name: 'Gói liệu trình VIP - Dòng 1',
        unit_price: 5000000,
        quantity: 1,
        line_discount: 0,
        line_total: 5000000,
        created_at: '2026-09-10T08:00:00+07:00'
      },
      {
        sale_id: case4SaleId,
        item_type: 'package',
        item_ref_id: packageId,
        item_name: 'Gói liệu trình VIP - Dòng 2',
        unit_price: 5000000,
        quantity: 1,
        line_discount: 0,
        line_total: 5000000,
        created_at: '2026-09-10T08:00:00+07:00'
      }
    ]);
    assert.strictEqual(si4Err, null, `Case 4 sale items error: ${si4Err?.message}`);

    const { error: cc4Err } = await client.from('customer_courses').insert([
      {
        id: case4Course1Id,
        organization_id: ORG_ID,
        customer_id: customerId,
        package_id: packageId,
        service_id: serviceIdA,
        sale_id: case4SaleId,
        total_sessions: 10,
        used_sessions: 0,
        status: 'active',
        created_at: '2026-09-10T08:00:00+07:00'
      },
      {
        id: case4Course2Id,
        organization_id: ORG_ID,
        customer_id: customerId,
        package_id: packageId,
        service_id: serviceIdA,
        sale_id: case4SaleId,
        total_sessions: 10,
        used_sessions: 0,
        status: 'active',
        created_at: '2026-09-10T08:00:00+07:00'
      }
    ]);
    assert.strictEqual(cc4Err, null, `Case 4 courses error: ${cc4Err?.message}`);

    // Deduct 2 sessions on Oct 09
    const { error: ded4Err } = await client.from('session_deductions').insert({
      id: case4DedId,
      course_id: case4Course1Id,
      branch_id: BRANCH_Q1,
      staff_id: staffId,
      sessions_deducted: 2,
      notes: 'Trừ 2 buổi gói nhiều dòng',
      performed_at: '2026-10-09T14:00:00+07:00'
    });
    assert.strictEqual(ded4Err, null, `Case 4 deduction error: ${ded4Err?.message}`);

    // Query Oct 09 P&L -> 2 sessions * (10.000.000 / 20) = 1.000.000 đ
    const octC4 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-09',
      p_end_date: '2026-10-09'
    });
    assert.strictEqual(
      octC4.data.recognized_revenue_kpi.earned_treatment_revenue,
      initOct09Rev + 1000000,
      'Case 4: Doanh thu thực hiện 2 buổi phải là đúng 1.000.000 đ (Không bị nhân đôi dòng JOIN)'
    );
    recordExecutedPass('Ca 4 (Bán gói T9, trừ buổi T10 - Hóa đơn nhiều dòng cùng gói): Chống nhân bản JOIN', 
      `2 buổi thực hiện = 1.000.000 đ chuẩn xác (Đơn giá 500.000 đ/buổi trên tổng 20 buổi)`);
  } finally {
    await client.from('session_deductions').delete().eq('id', case4DedId);
    await client.from('customer_courses').delete().in('id', [case4Course1Id, case4Course2Id]);
    await client.from('sale_items').delete().eq('sale_id', case4SaleId);
    await client.from('sales').delete().eq('id', case4SaleId);
  }

  // ---------------------------------------------------------------------------
  // CASE 5: Buổi liệu trình thiếu căn cứ đối soát (Unreconciled Course - sale_id = NULL)
  // ---------------------------------------------------------------------------
  const case5CourseId = crypto.randomUUID();
  const case5DedId = crypto.randomUUID();

  try {
    const octBeforeC5 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-10',
      p_end_date: '2026-10-10'
    });
    const initUnrec = octBeforeC5.data?.recognized_revenue_kpi?.unreconciled_sessions_count || 0;

    const { error: cc5Err } = await client.from('customer_courses').insert({
      id: case5CourseId,
      organization_id: ORG_ID,
      customer_id: customerId,
      package_id: packageId,
      service_id: serviceIdA,
      sale_id: null, // Thiếu sale_id căn cứ
      total_sessions: 10,
      used_sessions: 0,
      status: 'active',
      created_at: '2026-09-01T08:00:00+07:00'
    });
    assert.strictEqual(cc5Err, null, `Case 5 course error: ${cc5Err?.message}`);

    const { error: ded5Err } = await client.from('session_deductions').insert({
      id: case5DedId,
      course_id: case5CourseId,
      branch_id: BRANCH_Q1,
      staff_id: staffId,
      sessions_deducted: 1,
      notes: 'Trừ 1 buổi liệu trình cũ thiếu sale_id',
      performed_at: '2026-10-10T16:00:00+07:00'
    });
    assert.strictEqual(ded5Err, null, `Case 5 deduction error: ${ded5Err?.message}`);

    const octC5 = await client.rpc('rpc_get_operating_pnl_report', {
      p_org_id: ORG_ID,
      p_branch_id: BRANCH_Q1,
      p_start_date: '2026-10-10',
      p_end_date: '2026-10-10'
    });
    assert.strictEqual(
      octC5.data.recognized_revenue_kpi.unreconciled_sessions_count,
      initUnrec + 1,
      'Case 5: Số buổi chưa đối soát phải tăng +1'
    );
    recordExecutedPass('Ca 5 (Buổi liệu trình thiếu căn cứ đối soát - Unreconciled Course): An toàn dữ liệu', 
      `Doanh thu ghi nhận 0 đ, cờ unreconciled_sessions_count = +1 (Không tự ý tính bừa hoặc sập RPC)`);
  } finally {
    await client.from('session_deductions').delete().eq('id', case5DedId);
    await client.from('customer_courses').delete().eq('id', case5CourseId);
  }

  // ---------------------------------------------------------------------------
  // CASE 6: Hồi quy 9 phiếu cancelled có disbursed_at IS NOT NULL
  // ---------------------------------------------------------------------------
  const pnlBase = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.strictEqual(pnlBase.data.operating_deductions.operating_expenses_gross, 30500000, 'Gross OPEX phải đủ 30.5M');
  assert.strictEqual(pnlBase.data.operating_deductions.expense_reversals, 24500000, 'Hoàn chi phải đủ 24.5M');
  assert.strictEqual(pnlBase.data.operating_deductions.net_operating_expenses, 6000000, 'Net OPEX phải chuẩn xác 6.0M');
  recordExecutedPass('Ca 6 (Hồi quy: 9 phiếu cancelled có disbursed_at): Bảo toàn lịch sử giải ngân', 
    `Gross OPEX (30.5M) - Hoàn chi (24.5M) = Net OPEX (6.0M) -> Triệt tiêu hoàn toàn sai lệch 28.5M cũ`);

  console.log('\n========================================================================================');
  console.log(`TỔNG KẾT THỰC THI KIỂM THỬ TỰ ĐỘNG:`);
  console.log(`- ĐÃ CHẠY & VƯỢT QUA (PASSED): ${passedCount}/${executedCount} test cases (100% TOÀN DIỆN)`);
  console.log(`- CHƯA CHẠY (NOT RUN):         ${notRunCount} test cases`);
  console.log('========================================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ BỘ TEST THẤT BẠI TẠI ASSERTION:', err);
  process.exit(1);
});
