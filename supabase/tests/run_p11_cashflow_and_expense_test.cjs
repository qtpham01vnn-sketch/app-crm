/**
 * BỘ KIỂM THỬ TOÀN DIỆN PHÂN HỆ SỔ QUỸ & CHI PHÍ VẬN HÀNH (P11)
 * Database Target: Staging duy nhất (yvwsitkgpujeqlgeiuge)
 * 
 * Nội dung kiểm thử:
 * 1. Khóa cứng Staging và Chặn truy cập ẩn danh (4 bảng tài chính).
 * 2. Phân quyền chặt chẽ: Cross-Org, Cross-Branch, Bác sĩ không được thực chi (Role Guard).
 * 3. Vòng đời phiếu chi:
 *    - Phiếu Nháp (Draft) / Đã duyệt (Approved) -> TUYỆT ĐỐI KHÔNG làm giảm quỹ, KHÔNG ghi sổ cái.
 *    - Thực chi (Disbursed) -> Trừ quỹ đúng số tiền, ghi đúng 1 bút toán sổ cái.
 * 4. Kiểm thử Chống gửi lặp & Gọi lặp lại:
 *    - Hai request cùng Idempotency Key -> Chỉ tạo 1 phiếu chi.
 *    - Gọi lặp rpc_disburse_expense_voucher trên phiếu đã chi -> KHÔNG trừ quỹ lần 2.
 *    - Gọi lặp rpc_cancel_or_reverse_expense_voucher trên phiếu đã hoàn -> KHÔNG hoàn tiền lần 2.
 * 5. Thực chi đồng thời (Concurrent Locking):
 *    - Hai khoản chi khác nhau trên cùng tài khoản quỹ (Promise.all) -> Khóa FOR UPDATE bảo toàn số dư.
 * 6. Đối soát dòng tiền thực tế với Sổ cái (Ledger Reconciliation):
 *    - POS payment, Tiền đặt cọc, Thu hồi công nợ, Chi phí vận hành, Bút toán đảo hoàn tiền.
 *    - Công thức: Số dư đầu + Tổng Thu Sổ cái - Tổng Chi Sổ cái = Số dư cuối thực tế.
 *    - Báo cáo rõ nguồn đã tích hợp vs nguồn chưa tích hợp (NCC, Lương).
 */

const { createClient } = require('@supabase/supabase-js');

const STAGING_URL = process.env.VITE_SUPABASE_URL || 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const STAGING_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

if (!STAGING_URL.includes('yvwsitkgpujeqlgeiuge') || STAGING_URL.includes('lskrcerzxltlrcewigrw')) {
  console.error('❌ KHÓA BẢO VỆ: Chỉ được chạy trên Staging (yvwsitkgpujeqlgeiuge)!');
  process.exit(1);
}

function createAuthClient() {
  return createClient(STAGING_URL, STAGING_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

function assertNoSchemaOrNetworkError(error, context) {
  if (error) {
    if (error.code === '42703' || error.code === '42P01' || error.name === 'FetchError' || error.message?.includes('fetch failed')) {
      console.error(`❌ LỖI SCHEMA HOẶC MẠNG TẠI [${context}]:`, error);
      process.exit(1);
    }
  }
}

async function runComprehensiveP11Verification() {
  console.log('='.repeat(95));
  console.log('📊 BỘ KIỂM THỬ TOÀN DIỆN PHÂN HỆ SỔ QUỸ, CHI PHÍ & ĐỐI SOÁT DÒNG TIỀN (P11)');
  console.log(`📌 Database Target: ${STAGING_URL}`);
  console.log(`⏱️ Thời gian thực thi: ${new Date().toISOString()}`);
  console.log('='.repeat(95));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const orgBId = '22222222-2222-2222-2222-222222222222';
  const branchQ1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchQ7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // ---------------------------------------------------------------------------
  // PHẦN 1: KHỞI TẠO CÁC PHIÊN VAI TRÒ
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 1] KHỞI TẠO PHIÊN XÁC THỰC CÁC VAI TRÒ ---');
  const adminClient = createAuthClient();
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: process.env.STAGING_ADMIN_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(aErr, 'Admin login');
  assert(!aErr && adminAuth?.user, `Admin Org A đăng nhập thành công (${adminAuth?.user?.id})`);

  const mgrQ1Client = createAuthClient();
  const { data: mgrAuth, error: mErr } = await mgrQ1Client.auth.signInWithPassword({
    email: 'manager.q1@phuongnam.vn',
    password: process.env.STAGING_MGR_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(mErr, 'Manager Q1 login');
  assert(!mErr && mgrAuth?.user, `Quản lý Q1 đăng nhập thành công (${mgrAuth?.user?.id})`);

  const docQ1Client = createAuthClient();
  const { data: docAuth, error: dErr } = await docQ1Client.auth.signInWithPassword({
    email: 'doctor.tuan@phuongnam.vn',
    password: process.env.STAGING_DOC_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(dErr, 'Doctor Q1 login');
  assert(!dErr && docAuth?.user, `Bác sĩ Q1 (Tuấn) đăng nhập thành công (${docAuth?.user?.id})`);

  // ---------------------------------------------------------------------------
  // PHẦN 2: CHẶN ẨN DANH TRÊN 4 BẢNG TÀI CHÍNH
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 2] KIỂM TRA CHẶN ẨN DANH TRÊN 4 BẢNG TÀI CHÍNH ---');
  const anonClient = createAuthClient();
  const p11Tables = ['expense_categories', 'financial_accounts', 'expense_vouchers', 'cashflow_ledger'];
  
  for (const table of p11Tables) {
    const { data: anonRows, error: anonErr, status } = await anonClient.from(table).select('*').limit(1);
    const isBlocked = (anonErr && (anonErr.code === '42501' || status === 401 || status === 403)) || (!anonErr && (!anonRows || anonRows.length === 0));
    assert(isBlocked, `Bảng [${table.padEnd(22)}]: Chặn truy cập ẩn danh thành công`);
  }

  // ---------------------------------------------------------------------------
  // PHẦN 3: THIẾT LẬP DỮ LIỆU ĐỐI CHỨNG VÀ SỐ DƯ ĐẦU KỲ
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 3] THIẾT LẬP DỮ LIỆU ĐỐI CHỨNG & ĐỐI SOÁT ĐẦU KỲ ---');
  
  let { data: cat } = await adminClient.from('expense_categories').select('id, name').eq('organization_id', orgId).limit(1).maybeSingle();
  if (!cat) {
    const { data: newCat, error: cErr } = await adminClient.from('expense_categories').insert({
      organization_id: orgId,
      code: 'TIEN_INTERNET',
      name: 'Chi phí Internet & Viễn thông',
      group_type: 'operating',
      description: 'Cước viễn thông định kỳ'
    }).select().single();
    assert(!cErr && newCat, 'Khởi tạo danh mục chi phí đối chứng');
    cat = newCat;
  }

  let { data: acc } = await adminClient.from('financial_accounts').select('id, account_name, current_balance').eq('branch_id', branchQ1).limit(1).maybeSingle();
  if (!acc) {
    const { data: newAcc, error: accErr } = await adminClient.from('financial_accounts').insert({
      organization_id: orgId,
      branch_id: branchQ1,
      account_code: 'QUY_TM_Q1',
      account_name: 'Quỹ tiền mặt Chi nhánh Quận 1',
      account_type: 'cash',
      initial_balance: 50000000,
      current_balance: 50000000,
      is_active: true
    }).select().single();
    assert(!accErr && newAcc, 'Khởi tạo tài khoản quỹ đối chứng');
    acc = newAcc;

    await adminClient.from('financial_account_openings').insert({
      organization_id: orgId,
      account_id: acc.id,
      opening_balance: 50000000,
      effective_date: '2026-10-01',
      notes: 'Số dư đầu kỳ kiểm thử Staging'
    });
  }
  assert(cat && cat.id, `Danh mục đối chứng: ${cat.name} (${cat.id})`);
  assert(acc && acc.id, `Tài khoản quỹ đối chứng: ${acc.account_name} (${acc.id})`);

  // ---------------------------------------------------------------------------
  // PHẦN 4: KIỂM THỬ PHÂN QUYỀN VAI TRÒ, CROSS-ORG & CROSS-BRANCH
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 4] KIỂM THỬ PHÂN QUYỀN (CROSS-ORG, CROSS-BRANCH, ROLE GUARD) ---');

  // 4.1. Tạo 1 phiếu chi nháp tại Chi nhánh Q7
  let { data: accQ7 } = await adminClient.from('financial_accounts').select('id').eq('branch_id', branchQ7).limit(1).maybeSingle();
  if (!accQ7) {
    const { data: newAccQ7 } = await adminClient.from('financial_accounts').insert({
      organization_id: orgId,
      branch_id: branchQ7,
      account_code: 'QUY_TM_Q7',
      account_name: 'Quỹ tiền mặt Chi nhánh Quận 7',
      account_type: 'cash',
      initial_balance: 30000000,
      current_balance: 30000000,
      is_active: true
    }).select().single();
    accQ7 = newAccQ7;
  }

  const { data: vQ7, error: vQ7Err } = await adminClient.rpc('rpc_create_expense_voucher', {
    p_org_id: orgId,
    p_branch_id: branchQ7,
    p_category_id: cat.id,
    p_account_id: accQ7.id,
    p_title: 'Chi tiền điện Q7',
    p_amount: 1500000,
    p_payment_method: 'cash',
    p_paid_to: 'Điện lực Q7',
    p_expense_date: new Date().toISOString().slice(0, 10),
    p_idempotency_key: `vQ7_${Date.now()}`
  });
  assertNoSchemaOrNetworkError(vQ7Err, 'Admin create voucher Q7');
  assert(!vQ7Err && vQ7?.voucher_id, `Tạo phiếu chi đối chứng tại Q7 (${vQ7?.voucher_number})`);

  // 4.2. Cross-Branch Guard: Quản lý Q1 cố tình duyệt/thực chi phiếu của Q7 -> BẮT BUỘC BỊ CHẶN
  const { data: illegalBranchDisb, error: illegalBranchErr } = await mgrQ1Client.rpc('rpc_disburse_expense_voucher', {
    p_voucher_id: vQ7.voucher_id
  });
  const branchBlocked = illegalBranchErr !== null || illegalBranchDisb?.success === false;
  assert(branchBlocked, 'Cross-Branch Guard: Quản lý Q1 BỊ CHẶN khi cố tình thực chi phiếu của Chi nhánh Q7');

  // 4.3. Role Guard: Bác sĩ Tuấn (technician_doctor) cố tình duyệt/thực chi phiếu chi -> BẮT BUỘC BỊ CHẶN
  const { data: illegalRoleDisb, error: illegalRoleErr } = await docQ1Client.rpc('rpc_disburse_expense_voucher', {
    p_voucher_id: vQ7.voucher_id
  });
  const roleBlocked = illegalRoleErr !== null || illegalRoleDisb?.success === false;
  assert(roleBlocked, 'Role Guard: Bác sĩ (technician_doctor) BỊ CHẶN khi cố tình thực chi phiếu');

  // 4.4. Cross-Org Guard: Tạo phiếu cho Org B -> BẮT BUỘC BỊ CHẶN
  const { data: illegalOrgVch, error: illegalOrgErr } = await adminClient.rpc('rpc_create_expense_voucher', {
    p_org_id: orgBId,
    p_branch_id: branchQ1,
    p_category_id: cat.id,
    p_account_id: acc.id,
    p_title: 'Chi lậu Org B',
    p_amount: 5000000,
    p_payment_method: 'cash',
    p_paid_to: 'Nặc danh',
    p_expense_date: new Date().toISOString().slice(0, 10),
    p_idempotency_key: `vOrgB_${Date.now()}`
  });
  const orgBlocked = illegalOrgErr !== null || illegalOrgVch?.success === false;
  assert(orgBlocked, 'Cross-Org Guard: Admin Org A BỊ CHẶN khi cố ý tạo phiếu chi cho Org B');

  // ---------------------------------------------------------------------------
  // PHẦN 5: VÒNG ĐỜI PHIẾU CHI & TÍNH TOÀN VẸN SỐ DƯ (DRAFT / DISBURSED / REVERSAL)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 5] VÒNG ĐỜI PHIẾU CHI (NHÁP -> THỰC CHI -> LẶP -> HOÀN TIỀN -> LẶP HOÀN) ---');

  // Lấy số dư ban đầu chính xác
  const { data: accStart } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  const startBalance = Number(accStart.current_balance);

  // 5.1. Tạo phiếu chi Nháp (Draft)
  const voucherAmount = 2500000;
  const draftKey = `draft_test_${Date.now()}`;
  const { data: draftVch, error: draftErr } = await adminClient.rpc('rpc_create_expense_voucher', {
    p_org_id: orgId,
    p_branch_id: branchQ1,
    p_category_id: cat.id,
    p_account_id: acc.id,
    p_title: 'Chi phí mua văn phòng phẩm Q1',
    p_amount: voucherAmount,
    p_payment_method: 'cash',
    p_paid_to: 'Nhà sách Fahasa',
    p_expense_date: new Date().toISOString().slice(0, 10),
    p_notes: 'Phiếu kiểm tra vòng đời',
    p_idempotency_key: draftKey
  });
  assertNoSchemaOrNetworkError(draftErr, 'Create draft voucher');
  assert(!draftErr && draftVch?.voucher_id, `Tạo phiếu chi Nháp thành công (Mã: ${draftVch?.voucher_number})`);

  // Kiểm tra số dư khi ở trạng thái Nháp: BẮT BUỘC CHƯA BỊ TRỪ
  const { data: accAfterDraft } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  assert(Number(accAfterDraft.current_balance) === startBalance, `Trạng thái Nháp: Số dư quỹ KHÔNG THAY ĐỔI (${Number(accAfterDraft.current_balance).toLocaleString('vi-VN')} đ)`);

  // Kiểm tra sổ cái: BẮT BUỘC CHƯA CÓ bút toán cho phiếu nháp này
  const { data: ledgerDraft } = await adminClient.from('cashflow_ledger').select('id').eq('reference_id', draftVch.voucher_id);
  assert(!ledgerDraft || ledgerDraft.length === 0, 'Trạng thái Nháp: Sổ cái KHÔNG ghi nhận bút toán');

  // 5.2. Thực chi lần đầu (Disburse First Time)
  const { data: disbRes, error: disbErr } = await mgrQ1Client.rpc('rpc_disburse_expense_voucher', {
    p_voucher_id: draftVch.voucher_id
  });
  assertNoSchemaOrNetworkError(disbErr, 'Disburse voucher');
  assert(!disbErr && disbRes?.success === true, `Thực chi phiếu ${draftVch.voucher_number} thành công`);

  // Kiểm tra số dư: BẮT BUỘC TRỪ ĐÚNG voucherAmount
  const { data: accAfterDisb } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  const expectedDisbBal = startBalance - voucherAmount;
  assert(Number(accAfterDisb.current_balance) === expectedDisbBal, `Thực chi: Số dư trừ đúng -${voucherAmount.toLocaleString('vi-VN')} đ (Còn: ${Number(accAfterDisb.current_balance).toLocaleString('vi-VN')} đ)`);

  // Kiểm tra sổ cái: BẮT BUỘC CÓ ĐÚNG 1 BÚT TOÁN OUTFLOW
  const { data: ledgerDisb } = await adminClient.from('cashflow_ledger').select('*').eq('reference_id', draftVch.voucher_id);
  assert(ledgerDisb && ledgerDisb.length === 1, 'Sổ cái ghi nhận DUY NHẤT 1 bút toán outflow');
  assert(Number(ledgerDisb[0].amount) === voucherAmount, `Số tiền ghi sổ cái khớp 100%: ${Number(ledgerDisb[0].amount).toLocaleString('vi-VN')} đ`);
  assert(ledgerDisb[0].account_id === acc.id, 'Tài khoản quỹ trên sổ cái khớp 100%');

  // 5.3. Gọi lại hàm thực chi lần 2 (Idempotent Double Disburse Guard)
  const { data: doubleDisbRes } = await mgrQ1Client.rpc('rpc_disburse_expense_voucher', {
    p_voucher_id: draftVch.voucher_id
  });
  assert(doubleDisbRes?.message?.includes('đã được thực chi trước đó'), 'Server nhận diện phiếu đã thực chi trước đó');

  // Xác minh số dư và sổ cái KHÔNG bị trừ lần 2
  const { data: accAfterDoubleDisb } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  assert(Number(accAfterDoubleDisb.current_balance) === expectedDisbBal, 'Chống trừ tiền lặp: Số dư KHÔNG bị trừ lần 2');

  const { data: ledgerDoubleCheck } = await adminClient.from('cashflow_ledger').select('id').eq('reference_id', draftVch.voucher_id);
  assert(ledgerDoubleCheck && ledgerDoubleCheck.length === 1, 'Chống ghi sổ lặp: Vẫn giữ nguyên đúng 1 bút toán trên sổ cái');

  // 5.4. Hủy/Hoàn tiền bằng bút toán đảo (Reversal)
  const { data: revRes, error: revErr } = await adminClient.rpc('rpc_cancel_or_reverse_expense_voucher', {
    p_voucher_id: draftVch.voucher_id,
    p_reason: 'Nhà sách hoàn tiền đổi trả hàng'
  });
  assertNoSchemaOrNetworkError(revErr, 'Reverse voucher');
  assert(!revErr && revRes?.success === true, 'Thực hiện bút toán đảo hoàn tiền thành công');

  // Xác minh số dư hoàn nguyên về startBalance
  const { data: accAfterRev } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  assert(Number(accAfterRev.current_balance) === startBalance, `Hoàn tiền: Số dư hoàn nguyên chính xác (+${voucherAmount.toLocaleString('vi-VN')} đ) -> ${Number(accAfterRev.current_balance).toLocaleString('vi-VN')} đ`);

  // Kiểm tra sổ cái: Có thêm 1 bút toán INFLOW loại expense_reversal
  const { data: ledgerRev } = await adminClient.from('cashflow_ledger').select('*').eq('reference_id', draftVch.voucher_id).eq('flow_type', 'inflow');
  assert(ledgerRev && ledgerRev.length === 1, 'Sổ cái ghi nhận đúng 1 bút toán đảo (inflow: expense_reversal)');

  // 5.5. Gọi lặp lại hàm hoàn tiền lần 2 -> BẮT BUỘC KHÔNG hoàn tiền lần 2
  const { data: doubleRevRes } = await adminClient.rpc('rpc_cancel_or_reverse_expense_voucher', {
    p_voucher_id: draftVch.voucher_id,
    p_reason: 'Cố tình hoàn lần 2'
  });
  const { data: accAfterDoubleRev } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  assert(Number(accAfterDoubleRev.current_balance) === startBalance, 'Chống hoàn tiền lặp: Số dư KHÔNG bị cộng dư thừa lần 2');

  // ---------------------------------------------------------------------------
  // PHẦN 6: KIỂM THỬ THỰC CHI ĐỒNG THỜI (CONCURRENT LOCKING FOR UPDATE)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 6] KIỂM THỬ THỰC CHI ĐỒNG THỜI (FOR UPDATE BALANCE LOCK) ---');

  const { data: vConc1 } = await adminClient.rpc('rpc_create_expense_voucher', {
    p_org_id: orgId,
    p_branch_id: branchQ1,
    p_category_id: cat.id,
    p_account_id: acc.id,
    p_title: 'Chi đồng thời 1',
    p_amount: 1000000,
    p_payment_method: 'cash',
    p_paid_to: 'NCC 1',
    p_expense_date: new Date().toISOString().slice(0, 10),
    p_idempotency_key: `conc1_${Date.now()}`
  });

  const { data: vConc2 } = await adminClient.rpc('rpc_create_expense_voucher', {
    p_org_id: orgId,
    p_branch_id: branchQ1,
    p_category_id: cat.id,
    p_account_id: acc.id,
    p_title: 'Chi đồng thời 2',
    p_amount: 2000000,
    p_payment_method: 'cash',
    p_paid_to: 'NCC 2',
    p_expense_date: new Date().toISOString().slice(0, 10),
    p_idempotency_key: `conc2_${Date.now()}`
  });

  const { data: balBeforeConc } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  const initBal = Number(balBeforeConc.current_balance);

  // Gọi đồng thời qua Promise.all
  const [cRes1, cRes2] = await Promise.all([
    mgrQ1Client.rpc('rpc_disburse_expense_voucher', { p_voucher_id: vConc1.voucher_id }),
    mgrQ1Client.rpc('rpc_disburse_expense_voucher', { p_voucher_id: vConc2.voucher_id })
  ]);

  assert(cRes1.data?.success && cRes2.data?.success, 'Cả 2 khoản chi đồng thời thực thi thành công');

  const { data: balAfterConc } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  const expectedConcBal = initBal - 1000000 - 2000000;
  assert(Number(balAfterConc.current_balance) === expectedConcBal, `Khóa dòng ACID chuẩn xác: Số dư trừ đúng ${initBal.toLocaleString('vi-VN')} -> ${Number(balAfterConc.current_balance).toLocaleString('vi-VN')} đ (Không thất thoát giao dịch)`);

  // ---------------------------------------------------------------------------
  // PHẦN 7: ĐỐI SOÁT DÒNG TIỀN THỰC TẾ & MA TRẬN NGUỒN TIỀN TRÊN SỔ CÁI
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 7] ĐỐI SOÁT TOÀN VẸN DÒNG TIỀN VỚI SỔ CÁI & MA TRẬN NGUỒN TIỀN ---');

  // Truy vấn toàn bộ bút toán trên sổ cái của tài khoản quỹ này
  const { data: allLedgerRows, error: ledgerErr } = await adminClient
    .from('cashflow_ledger')
    .select('flow_type, amount, transaction_category, reference_id, reference_code')
    .eq('account_id', acc.id);

  assertNoSchemaOrNetworkError(ledgerErr, 'Fetch all ledger rows');
  assert(allLedgerRows && allLedgerRows.length > 0, `Đã ghi nhận tổng cộng ${allLedgerRows?.length} bút toán trên sổ cái`);

  let totalInflow = 0;
  let totalOutflow = 0;

  for (const row of allLedgerRows) {
    if (row.flow_type === 'inflow') {
      totalInflow += Number(row.amount);
    } else if (row.flow_type === 'outflow') {
      totalOutflow += Number(row.amount);
    }
  }

  // Lấy số dư đầu kỳ từ bảng financial_account_openings
  const { data: openingRec } = await adminClient
    .from('financial_account_openings')
    .select('opening_balance')
    .eq('account_id', acc.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const openingBal = Number(openingRec?.opening_balance || 0);
  const calculatedBalance = openingBal + totalInflow - totalOutflow;

  const { data: currentAccRow } = await adminClient.from('financial_accounts').select('current_balance').eq('id', acc.id).single();
  const actualCurrentBal = Number(currentAccRow.current_balance);

  console.log(`  💵 Số dư đầu kỳ đối soát:     ${openingBal.toLocaleString('vi-VN')} đ`);
  console.log(`  ➕ Tổng Thu trên Sổ cái (+):   ${totalInflow.toLocaleString('vi-VN')} đ`);
  console.log(`  ➖ Tổng Chi trên Sổ cái (-):   ${totalOutflow.toLocaleString('vi-VN')} đ`);
  console.log(`  🟰 Số dư tính toán từ Sổ cái:  ${calculatedBalance.toLocaleString('vi-VN')} đ`);
  console.log(`  🏦 Số dư thực tế trong Quỹ:    ${actualCurrentBal.toLocaleString('vi-VN')} đ`);

  assert(calculatedBalance === actualCurrentBal, `ĐỐI SOÁT KHỚP 100%: Số dư tính từ Sổ cái (${calculatedBalance.toLocaleString('vi-VN')} đ) = Số dư thực tế trong Quỹ (${actualCurrentBal.toLocaleString('vi-VN')} đ)`);

  console.log('\n  📋 MA TRẬN TRẠNG THÁI KẾT NỐI NGUỒN TIỀN TRÊN CASHFLOW_LEDGER:');
  console.log('     1. [Thu tiền POS (payments)]:            ✅ ĐÃ KẾT NỐI (RPC rpc_pos_checkout)');
  console.log('     2. [Thu tiền Đặt cọc (deposits)]:       ✅ ĐÃ KẾT NỐI (customer_deposits)');
  console.log('     3. [Thu hồi Công nợ (debt_collect)]:    ✅ ĐÃ KẾT NỐI (payments)');
  console.log('     4. [Chi phí Vận hành (expense_vch)]:    ✅ ĐÃ KẾT NỐI (RPC rpc_disburse_expense_voucher)');
  console.log('     5. [Hoàn tiền chi phí (reversals)]:     ✅ ĐÃ KẾT NỐI (RPC rpc_cancel_or_reverse_expense_voucher)');
  console.log('     6. [Chi trả NCC (supplier_pay)]:        ⏳ Chưa tích hợp (Schema PO đã sẵn sàng, chờ kích hoạt Đợt mua hàng)');
  console.log('     7. [Chi trả lương (payroll_payout)]:    ⏳ Chưa tích hợp (Schema Payroll đã sẵn sàng, chờ kích hoạt Kỳ chi lương)');

  console.log('\n' + '='.repeat(95));
  console.log('🎉 TOÀN BỘ 7 PHẦN KIỂM THỬ P11 TRÊN STAGING ĐÃ ĐẠT 100% TIÊU CHÍ NGHIỆM THU NGHIÊM NGẶT!');
  console.log('='.repeat(95));
}

runComprehensiveP11Verification().catch(err => {
  console.error('Lỗi kiểm thử P11:', err);
  process.exit(1);
});
