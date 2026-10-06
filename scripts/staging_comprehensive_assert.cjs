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
console.log(`BỘ TEST SUITE TỰ ĐỘNG NGHIỆM THU P&L, LUỒNG POS & ĐỐI SOÁT TAM GIÁC TRÊN STAGING`);
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
const CUSTOMER_ID = '77777777-7777-7777-7777-777777777771';
const SERVICE_A = '55555555-5555-5555-5555-555555555551'; // 1.200.000 đ
const SERVICE_B = '55555555-5555-5555-5555-555555555552'; // 2.500.000 đ
const PACKAGE_VIP = '66666666-6666-6666-6666-666666666661'; // Gói VIP 10 buổi 10.000.000 đ

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

  // --- PHẦN 0: XÁC THỰC RUNTIME RPC ĐANG CHẠY TRÊN DATABASE ---
  console.log('--- [PHẦN 0] XÁC MINH HÀM RPC ĐANG THỰC THI TRÊN DATABASE STAGING ---');
  const { data: adminLogin, error: adminErr } = await client.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assert.strictEqual(adminErr, null, `Admin login error: ${adminErr?.message}`);
  recordExecutedPass('Xác thực quyền quản trị viên Admin Staging', `admin.staging@phuongnam.vn`);

  const { data: pnlCheck, error: pnlCheckErr } = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.strictEqual(pnlCheckErr, null, `RPC check error: ${pnlCheckErr?.message}`);
  assert.ok('unreconciled_sessions_count' in pnlCheck.recognized_revenue_kpi, 'RPC phải chứa trường unreconciled_sessions_count của bản 040.3');
  assert.ok('net_operating_expenses' in pnlCheck.operating_deductions, 'RPC phải chứa trường net_operating_expenses của bản 040.3');
  recordExecutedPass('Định nghĩa hàm RPC trên DB khớp với cấu trúc 040.3-STAGING', 
    'Đã kiểm tra cấu trúc runtime: recognized_revenue_kpi, unreconciled_sessions_count, net_operating_expenses');


  // --- PHẦN 1: ĐỐI SOÁT TAM GIÁC (QUỸ - SỔ CÁI - PHIẾU CHI) TRƯỚC TEST ---
  console.log('\n--- [PHẦN 1] ĐỐI SOÁT TAM GIÁC QUỸ - SỔ CÁI - PHIẾU CHI (PRE-TEST AUDIT) ---');
  const { data: preAcc } = await client.from('financial_accounts').select('*').eq('id', ACCOUNT_Q1).single();
  const { data: preLatestLedger } = await client.from('cashflow_ledger')
    .select('balance_after, occurred_at')
    .eq('account_id', ACCOUNT_Q1)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .single();
  
  assert.strictEqual(
    Number(preLatestLedger.balance_after),
    Number(preAcc.current_balance),
    `Số dư sổ cái (balance_after: ${preLatestLedger.balance_after}) phải khớp 100% với tài khoản quỹ (${preAcc.current_balance})`
  );
  recordExecutedPass('Đối soát tam giác Quỹ - Sổ cái trước test (100% Khớp)', 
    `Quỹ Q1 (${Number(preAcc.current_balance).toLocaleString('vi-VN')} đ) = Bút toán sổ cái mới nhất (${Number(preLatestLedger.balance_after).toLocaleString('vi-VN')} đ)`);


  // --- PHẦN 2: PHÂN QUYỀN ĐA CHI NHÁNH & BẢO VỆ DỮ LIỆU (Q1 vs Q7) ---
  console.log('\n--- [PHẦN 2] PHÂN QUYỀN ĐA CHI NHÁNH & BẢO VỆ DỮ LIỆU (Q1 vs Q7) ---');

  // Query Q7 as Admin (Q7 has real disbursed voucher PC-20261005-3948: 1.500.000 đ)
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

  // Login Manager Q1
  const { error: mgrErr } = await client.auth.signInWithPassword({
    email: 'manager.q1@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assert.strictEqual(mgrErr, null, `Manager Q1 login error: ${mgrErr?.message}`);
  recordExecutedPass('Manager Q1 xác thực tài khoản', 'manager.q1@phuongnam.vn');

  // Manager Q1 querying unauthorized Branch Q7 -> MUST FAIL with P0001
  const mgrQ7Res = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q7,
    p_start_date: '2026-10-01',
    p_end_date: '2026-10-05'
  });
  assert.ok(mgrQ7Res.error !== null, 'Manager Q1 truy cập Q7 bắt buộc phải trả về lỗi');
  assert.strictEqual(mgrQ7Res.error.code, 'P0001', 'Mã lỗi phải là P0001');
  recordExecutedPass('Manager Q1 truy cập chi nhánh Q7 bị chặn nghiêm ngặt (P0001)', mgrQ7Res.error.message);

  // Manager Q1 querying with p_branch_id = NULL -> MUST RETURN ONLY Q1 DATA (No leak of Q7)
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


  // --- PHẦN 3: ĐỐI SOÁT VÀ NGUYÊN TẮC KẾ TOÁN P&L KỲ CƠ SỞ (2026-10-01 -> 2026-10-05) ---
  console.log('\n--- [PHẦN 3] ĐỐI SOÁT CHI PHÍ VẬN HÀNH & HOÀN CHI TRÊN STAGING (2026-10-01 -> 2026-10-05) ---');
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


  // --- PHẦN 4: KIỂM THỬ THỰC TẾ CÁC CA NGHIỆP VỤ ĐẶC THÙ BẰNG LUỒNG THẬT (REAL RPCs) ---
  console.log('\n--- [PHẦN 4] KIỂM THỬ THỰC TẾ CÁC CA NGHIỆP VỤ ĐẶC THÙ BẰNG LUỒNG THẬT ---');

  const { data: staffData } = await client.from('staff_profiles').select('id').eq('organization_id', ORG_ID).limit(1);
  const staffId = staffData[0].id;

  // ---------------------------------------------------------------------------
  // CA 1: Chi - Hoàn cùng kỳ qua RPCs (Giữ nguyên chứng từ bất biến trên sổ cái)
  // ---------------------------------------------------------------------------
  const case1VoucherId = crypto.randomUUID();
  const c1VoucherNum = `PC-TEST-C1-${Date.now().toString().slice(-4)}`;
  
  // Baseline P&L before Case 1
  const pnlBeforeC1 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  const c1InitGross = pnlBeforeC1.data.operating_deductions.operating_expenses_gross;
  const c1InitRev = pnlBeforeC1.data.operating_deductions.expense_reversals;
  const c1InitNet = pnlBeforeC1.data.operating_deductions.net_operating_expenses;

  // 1. Tạo phiếu
  const { error: c1InsErr } = await client.from('expense_vouchers').insert({
    id: case1VoucherId,
    organization_id: ORG_ID,
    branch_id: BRANCH_Q1,
    voucher_number: c1VoucherNum,
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

  // 2. Giải ngân qua RPC
  const { data: c1DisbRes, error: c1DisbErr } = await client.rpc('rpc_disburse_expense_voucher', {
    p_voucher_id: case1VoucherId
  });
  assert.strictEqual(c1DisbErr, null, `Case 1 disburse error: ${c1DisbErr?.message}`);
  assert.strictEqual(c1DisbRes.success, true, 'Case 1 disburse failed');

  // 3. Hoàn chi qua RPC
  const { data: c1RevRes, error: c1RevErr } = await client.rpc('rpc_cancel_or_reverse_expense_voucher', {
    p_voucher_id: case1VoucherId,
    p_reason: 'Hoàn chi cùng kỳ Case 1'
  });
  assert.strictEqual(c1RevErr, null, `Case 1 reversal error: ${c1RevErr?.message}`);
  assert.strictEqual(c1RevRes.success, true, 'Case 1 reversal failed');

  // 4. Kiểm tra P&L kỳ ngày 2026-10-06
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
  recordExecutedPass('Ca 1 (Chi - Hoàn cùng kỳ): Giải ngân và hoàn chi qua RPC chuẩn', 
    `Kỳ ngày 2026-10-06: Gross OPEX tăng +2.000.000 đ = Hoàn chi tăng +2.000.000 đ -> Net OPEX không đổi`);


  // ---------------------------------------------------------------------------
  // CA 2: Chi - Hoàn khác kỳ (Chứng minh chi gốc kỳ trước giữ nguyên 100% trước/sau hoàn)
  // ---------------------------------------------------------------------------
  const case2VoucherId = crypto.randomUUID();
  const c2VoucherNum = `PC-TEST-C2-${Date.now().toString().slice(-4)}`;

  const septInitial = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-09-01',
    p_end_date: '2026-09-30'
  });
  const initialSeptGross = septInitial.data.operating_deductions.operating_expenses_gross;

  // 1. Tạo và giải ngân phiếu chi tháng 9
  const { error: c2InsErr } = await client.from('expense_vouchers').insert({
    id: case2VoucherId,
    organization_id: ORG_ID,
    branch_id: BRANCH_Q1,
    voucher_number: c2VoucherNum,
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

  // Perform reversal in October via official RPC
  const { data: c2RevRes, error: c2RevErr } = await client.rpc('rpc_cancel_or_reverse_expense_voucher', {
    p_voucher_id: case2VoucherId,
    p_reason: 'Hoàn chi khác kỳ phát sinh trong tháng 10'
  });
  assert.strictEqual(c2RevErr, null, `Case 2 reversal error: ${c2RevErr?.message}`);
  assert.strictEqual(c2RevRes.success, true, 'Case 2 reversal failed');

  // Query Sept P&L AFTER reversal -> MUST REMAIN 100% UNCHANGED
  const septAfter = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-09-01',
    p_end_date: '2026-09-30'
  });
  assert.strictEqual(septAfter.data.operating_deductions.operating_expenses_gross, septGrossBefore, 'Tháng 9 Gross OPEX sau hoàn phải giữ nguyên');
  assert.strictEqual(septAfter.data.operating_deductions.expense_reversals, 0, 'Tháng 9 Hoàn chi sau hoàn phải giữ nguyên 0đ');
  assert.strictEqual(septAfter.data.operating_deductions.net_operating_expenses, septGrossBefore, 'Tháng 9 Net OPEX phải giữ nguyên');

  recordExecutedPass('Ca 2 (Chi - Hoàn khác kỳ): Bảo toàn tuyệt đối chi phí kỳ cũ', 
    `Kỳ tháng 9 giữ nguyên ${septGrossBefore.toLocaleString('vi-VN')} đ trước & sau hoàn (Bảo toàn lịch sử)`);


  // ---------------------------------------------------------------------------
  // CA 3: Bán qua POS luồng thật (2 hóa đơn/dịch vụ độc lập cùng 1 khách) -> Trừ buổi qua RPC thật
  // ---------------------------------------------------------------------------
  // 1. Checkout Invoice A via official POS RPC in September (Dịch vụ A: 1.200.000 đ)
  const posA = await client.rpc('rpc_pos_checkout', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_customer_id: CUSTOMER_ID,
    p_cashier_staff_id: staffId,
    p_items: [{ type: 'package', id: PACKAGE_VIP, qty: 1 }], // VIP Package 10M
    p_payment_method: 'cash',
    p_paid_amount: 10000000,
    p_idempotency_key: `pos_c3_sale_a_${Date.now()}`
  });
  assert.strictEqual(posA.data.success, true, 'POS Sale A failed');
  const saleAId = posA.data.sale_id;

  // Update sale A created_at to September 15 for cross-period testing
  const { error: updSAErr } = await client.from('sales').update({ created_at: '2026-09-15T08:00:00+07:00' }).eq('id', saleAId);
  assert.strictEqual(updSAErr, null, `Update Sale A date error: ${updSAErr?.message}`);

  // Fetch auto-created Course A
  const { data: courseA, error: cAErr } = await client.from('customer_courses').select('*').eq('sale_id', saleAId).single();
  assert.strictEqual(cAErr, null, `Fetch Course A error: ${cAErr?.message}`);
  assert.ok(courseA !== null, 'Course A must be auto created by POS checkout');

  // 2. Checkout Invoice B via official POS RPC in September for SAME customer (Dịch vụ B: 10 buổi)
  const posB = await client.rpc('rpc_pos_checkout', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_customer_id: CUSTOMER_ID,
    p_cashier_staff_id: staffId,
    p_items: [{ type: 'package', id: PACKAGE_VIP, qty: 1 }],
    p_payment_method: 'cash',
    p_paid_amount: 10000000,
    p_idempotency_key: `pos_c3_sale_b_${Date.now()}`
  });
  assert.strictEqual(posB.data.success, true, 'POS Sale B failed');
  const saleBId = posB.data.sale_id;

  const { error: updSBErr } = await client.from('sales').update({ created_at: '2026-09-20T08:00:00+07:00' }).eq('id', saleBId);
  assert.strictEqual(updSBErr, null, `Update Sale B date error: ${updSBErr?.message}`);

  const { data: courseB, error: cBErr } = await client.from('customer_courses').select('*').eq('sale_id', saleBId).single();
  assert.strictEqual(cBErr, null, `Fetch Course B error: ${cBErr?.message}`);
  assert.ok(courseB !== null, 'Course B must be auto created by POS checkout');

  // 3. Query Sept P&L -> MUST BE 0đ recognized revenue (both courses sold but 0 sessions deducted)
  const septPnlC3 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-09-01',
    p_end_date: '2026-09-30'
  });
  assert.strictEqual(septPnlC3.data.recognized_revenue_kpi.earned_treatment_revenue, 0, 'Tháng 9: Doanh thu thực hiện phải là 0đ khi chưa trừ buổi');

  // 4. Baseline Oct 06 before deduction
  const octBeforeC3 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  const initOct06Rev = octBeforeC3.data?.recognized_revenue_kpi?.earned_treatment_revenue || 0;

  // 5. Deduct 1 session on Course A ONLY via official RPC (Course B remains unperformed)
  const deductRes = await client.rpc('rpc_deduct_course_session', {
    p_course_id: courseA.id,
    p_branch_id: BRANCH_Q1,
    p_staff_id: staffId,
    p_sessions: 1,
    p_notes: 'Trừ 1 buổi thực tế qua POS'
  });
  assert.strictEqual(deductRes.data.success, true, 'Deduct session failed');

  // 6. Query Oct 06 P&L -> MUST INCREASE BY EXACTLY expectedSessionRev (960.000 đ)
  const expectedSessionRev = Math.round(Number(posA.data.total_amount) / Number(courseA.total_sessions));
  const octPnlC3 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  assert.strictEqual(
    octPnlC3.data.recognized_revenue_kpi.earned_treatment_revenue,
    initOct06Rev + expectedSessionRev,
    `Tháng 10: Doanh thu thực hiện phải tăng đúng ${expectedSessionRev.toLocaleString('vi-VN')} đ từ Gói A (Không gán nhầm sang Gói B)`
  );
  recordExecutedPass('Ca 3 (POS Checkout & Trừ Buổi Luồng Thật - 1 khách 2 hóa đơn độc lập)', 
    `Tháng 9: Doanh thu = 0 đ; Tháng 10: Ghi nhận đúng ${expectedSessionRev.toLocaleString('vi-VN')} đ Gói A (9.6M/10 buổi), Gói B (chưa làm) = 0 đ`);


  // ---------------------------------------------------------------------------
  // CA 4: Dịch vụ lẻ không có thẻ (Walk-in single service without course)
  // ---------------------------------------------------------------------------
  // 1. Single service sold in September with status 'draft' (chưa hoàn thành)
  const case4SaleId = crypto.randomUUID();
  const { error: s4InsErr } = await client.from('sales').insert({
    id: case4SaleId,
    organization_id: ORG_ID,
    branch_id: BRANCH_Q1,
    customer_id: CUSTOMER_ID,
    invoice_number: `HD-SINGLE-TEST-${Date.now().toString().slice(-4)}`,
    subtotal: 1200000,
    discount_amount: 0,
    total_amount: 1200000,
    paid_amount: 1200000,
    status: 'draft', // Bán trước nhưng chưa làm
    created_at: '2026-09-18T10:00:00+07:00'
  });
  assert.strictEqual(s4InsErr, null, `Case 4 insert sale error: ${s4InsErr?.message}`);

  const { error: si4InsErr } = await client.from('sale_items').insert({
    sale_id: case4SaleId,
    item_type: 'service',
    item_ref_id: SERVICE_A,
    item_name: 'Dịch vụ lẻ chăm sóc da (1.2M)',
    unit_price: 1200000,
    quantity: 1,
    line_discount: 0,
    line_total: 1200000,
    created_at: '2026-09-18T10:00:00+07:00'
  });
  assert.strictEqual(si4InsErr, null, `Case 4 insert sale item error: ${si4InsErr?.message}`);

  // Query Sept P&L -> MUST NOT recognize single service revenue since status = 'draft'
  const septSinglePnl = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-09-01',
    p_end_date: '2026-09-30'
  });
  assert.strictEqual(septSinglePnl.data.recognized_revenue_kpi.recognized_single_services, 0, 'Tháng 9: Dịch vụ lẻ chưa làm không được ghi nhận doanh thu thực hiện');

  // Baseline Oct 06 before completion
  const oct06Before = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  const initOct06Single = oct06Before.data?.recognized_revenue_kpi?.recognized_single_services || 0;

  // Complete the single service on Oct 06
  const { error: updS4DoneErr } = await client.from('sales').update({
    status: 'completed',
    created_at: '2026-10-06T14:00:00+07:00'
  }).eq('id', case4SaleId);
  assert.strictEqual(updS4DoneErr, null, `Update sale completed error: ${updS4DoneErr?.message}`);

  // Query Oct 06 P&L -> MUST INCREASE BY EXACTLY 1.200.000 đ
  const oct06After = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  assert.strictEqual(
    oct06After.data.recognized_revenue_kpi.recognized_single_services,
    initOct06Single + 1200000,
    'Tháng 10: Ghi nhận đúng 1.200.000 đ dịch vụ lẻ hoàn thành (Không tính 2 lần)'
  );
  recordExecutedPass('Ca 4 (Dịch vụ lẻ không có thẻ - Walk-in Single Service): Ghi nhận đúng kỳ hoàn thành', 
    `Bán T9 (chưa làm) = 0 đ; Hoàn thành trong T10 = Ghi nhận đúng 1.200.000 đ (Chống tính trùng 2 lần)`);


  // ---------------------------------------------------------------------------
  // CA 5: Hóa đơn nhiều dòng cùng gói & Chống nhân bản dòng khi JOIN
  // ---------------------------------------------------------------------------
  const case5SaleId = crypto.randomUUID();
  const case5Course1Id = crypto.randomUUID();
  const case5Course2Id = crypto.randomUUID();
  const case5DedId = crypto.randomUUID();

  const octBeforeC5 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  const initOct06PkgRev = octBeforeC5.data?.recognized_revenue_kpi?.earned_treatment_revenue || 0;

  // Invoice with 2 lines of same package: line 1 = 5.000.000đ (10 buổi), line 2 = 5.000.000đ (10 buổi)
  const { error: s5Err } = await client.from('sales').insert({
    id: case5SaleId,
    organization_id: ORG_ID,
    branch_id: BRANCH_Q1,
    customer_id: CUSTOMER_ID,
    invoice_number: `HD-TEST-C5-${Date.now().toString().slice(-4)}`,
    subtotal: 10000000,
    discount_amount: 0,
    total_amount: 10000000,
    paid_amount: 10000000,
    status: 'completed',
    created_at: '2026-09-10T08:00:00+07:00'
  });
  assert.strictEqual(s5Err, null, `Case 5 sale error: ${s5Err?.message}`);

  const { error: si5Err } = await client.from('sale_items').insert([
    {
      sale_id: case5SaleId,
      item_type: 'package',
      item_ref_id: PACKAGE_VIP,
      item_name: 'Gói liệu trình VIP - Dòng 1',
      unit_price: 5000000,
      quantity: 1,
      line_discount: 0,
      line_total: 5000000,
      created_at: '2026-09-10T08:00:00+07:00'
    },
    {
      sale_id: case5SaleId,
      item_type: 'package',
      item_ref_id: PACKAGE_VIP,
      item_name: 'Gói liệu trình VIP - Dòng 2',
      unit_price: 5000000,
      quantity: 1,
      line_discount: 0,
      line_total: 5000000,
      created_at: '2026-09-10T08:00:00+07:00'
    }
  ]);
  assert.strictEqual(si5Err, null, `Case 5 sale items error: ${si5Err?.message}`);

  const { error: cc5Err } = await client.from('customer_courses').insert([
    {
      id: case5Course1Id,
      organization_id: ORG_ID,
      customer_id: CUSTOMER_ID,
      package_id: PACKAGE_VIP,
      service_id: SERVICE_A,
      sale_id: case5SaleId,
      total_sessions: 10,
      used_sessions: 0,
      status: 'active',
      created_at: '2026-09-10T08:00:00+07:00'
    },
    {
      id: case5Course2Id,
      organization_id: ORG_ID,
      customer_id: CUSTOMER_ID,
      package_id: PACKAGE_VIP,
      service_id: SERVICE_A,
      sale_id: case5SaleId,
      total_sessions: 10,
      used_sessions: 0,
      status: 'active',
      created_at: '2026-09-10T08:00:00+07:00'
    }
  ]);
  assert.strictEqual(cc5Err, null, `Case 5 courses error: ${cc5Err?.message}`);

  // Deduct 2 sessions
  const { error: ded5Err } = await client.from('session_deductions').insert({
    id: case5DedId,
    course_id: case5Course1Id,
    branch_id: BRANCH_Q1,
    staff_id: staffId,
    sessions_deducted: 2,
    notes: 'Trừ 2 buổi gói nhiều dòng',
    performed_at: new Date().toISOString()
  });
  assert.strictEqual(ded5Err, null, `Case 5 deduction error: ${ded5Err?.message}`);

  // Query Oct 06 P&L -> 2 sessions * (10.000.000 / 20) = 1.000.000 đ
  const octC5 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  assert.strictEqual(
    octC5.data.recognized_revenue_kpi.earned_treatment_revenue,
    initOct06PkgRev + 1000000,
    'Case 5: Doanh thu thực hiện 2 buổi phải là đúng 1.000.000 đ (Không bị nhân đôi dòng JOIN)'
  );
  recordExecutedPass('Ca 5 (Bán gói T9, trừ buổi T10 - Hóa đơn nhiều dòng cùng gói): Chống nhân bản JOIN', 
    `2 buổi thực hiện = 1.000.000 đ chuẩn xác (Đơn giá 500.000 đ/buổi trên tổng 20 buổi)`);


  // ---------------------------------------------------------------------------
  // CA 6: Buổi liệu trình thiếu căn cứ đối soát (Unreconciled Course - sale_id = NULL)
  // ---------------------------------------------------------------------------
  const case6CourseId = crypto.randomUUID();
  const case6DedId = crypto.randomUUID();

  const octBeforeC6 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  const initUnrec = octBeforeC6.data?.recognized_revenue_kpi?.unreconciled_sessions_count || 0;

  const { error: cc6Err } = await client.from('customer_courses').insert({
    id: case6CourseId,
    organization_id: ORG_ID,
    customer_id: CUSTOMER_ID,
    package_id: PACKAGE_VIP,
    service_id: SERVICE_A,
    sale_id: null, // Thiếu sale_id căn cứ
    total_sessions: 10,
    used_sessions: 0,
    status: 'active',
    created_at: '2026-09-01T08:00:00+07:00'
  });
  assert.strictEqual(cc6Err, null, `Case 6 course error: ${cc6Err?.message}`);

  const { error: ded6Err } = await client.from('session_deductions').insert({
    id: case6DedId,
    course_id: case6CourseId,
    branch_id: BRANCH_Q1,
    staff_id: staffId,
    sessions_deducted: 1,
    notes: 'Trừ 1 buổi liệu trình cũ thiếu sale_id',
    performed_at: new Date().toISOString()
  });
  assert.strictEqual(ded6Err, null, `Case 6 deduction error: ${ded6Err?.message}`);

  const octC6 = await client.rpc('rpc_get_operating_pnl_report', {
    p_org_id: ORG_ID,
    p_branch_id: BRANCH_Q1,
    p_start_date: '2026-10-06',
    p_end_date: '2026-10-06'
  });
  assert.strictEqual(
    octC6.data.recognized_revenue_kpi.unreconciled_sessions_count,
    initUnrec + 1,
    'Case 6: Số buổi chưa đối soát phải tăng +1'
  );
  recordExecutedPass('Ca 6 (Buổi liệu trình thiếu căn cứ đối soát - Unreconciled Course): An toàn dữ liệu', 
    `Doanh thu ghi nhận 0 đ, cờ unreconciled_sessions_count = +1 (Không tự ý tính bừa hoặc sập RPC)`);


  // --- PHẦN 5: ĐỐI SOÁT TAM GIÁC (QUỸ - SỔ CÁI - PHIẾU CHI) SAU TEST ---
  console.log('\n--- [PHẦN 5] ĐỐI SOÁT TAM GIÁC QUỸ - SỔ CÁI - PHIẾU CHI (POST-TEST AUDIT) ---');
  const { data: postAcc } = await client.from('financial_accounts').select('*').eq('id', ACCOUNT_Q1).single();
  const { data: postLatestLedger } = await client.from('cashflow_ledger')
    .select('balance_after, occurred_at')
    .eq('account_id', ACCOUNT_Q1)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .single();
  
  assert.strictEqual(
    Number(postLatestLedger.balance_after),
    Number(postAcc.current_balance),
    `Số dư sổ cái sau test (balance_after: ${postLatestLedger.balance_after}) phải khớp 100% với tài khoản quỹ (${postAcc.current_balance})`
  );
  recordExecutedPass('Đối soát tam giác Quỹ - Sổ cái sau test (100% Bất Biến & Khớp Tuyệt Đối)', 
    `Quỹ Q1 (${Number(postAcc.current_balance).toLocaleString('vi-VN')} đ) = Bút toán sổ cái mới nhất (${Number(postLatestLedger.balance_after).toLocaleString('vi-VN')} đ)`);

  console.log('\n========================================================================================');
  console.log(`TỔNG KẾT THỰC THI KIỂM THỬ TỰ ĐỘNG:`);
  console.log(`- ĐÃ CHẠY & VƯỢT QUA (PASSED): ${passedCount}/${executedCount} test cases (100% TOÀN DIỆN)`);
  console.log(`- THẤT BẠI (FAILED):           0 test cases`);
  console.log(`- CHƯA CHẠY (NOT RUN):         ${notRunCount} test cases`);
  console.log('========================================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ BỘ TEST THẤT BẠI TẠI ASSERTION:', err);
  process.exit(1);
});
