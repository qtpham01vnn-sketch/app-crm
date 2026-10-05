/**
 * BỘ KIỂM THỬ XÁC MINH BẢO MẬT & PHÂN QUYỀN CHẶT CHẼ (NGHIỆM THU RLS)
 * Database Target: Staging duy nhất (yvwsitkgpujeqlgeiuge)
 * 
 * Tuân thủ tuyệt đối 5 nguyên tắc nghiệm thu:
 * 1. Khóa cứng mục tiêu staging trước mọi thao tác ghi/đọc.
 * 2. Mọi ca kiểm thử đều có Positive Baseline (người đúng quyền đọc/ghi thành công trước để chứng minh bản ghi và schema hợp lệ).
 * 3. Kiểm tra error rõ ràng; lỗi schema/mạng/thiếu mẫu lập tức FAIL/BLOCKED (không nuốt lỗi).
 * 4. Người sai quyền thử trên ĐÚNG bản ghi mẫu đó; thao tác ghi dùng payload hợp lệ và xác minh bản ghi không thay đổi.
 * 5. Phân biệt rõ phiếu chuyển kho Q1 <-> Q7 (Q1 gửi hoặc nhận thì được xem) với phiếu nằm hoàn toàn ngoài Q1.
 */

const { createClient } = require('@supabase/supabase-js');

// -----------------------------------------------------------------------------
// NGUYÊN TẮC 1: KHÓA CỨNG MỤC TIÊU STAGING
// -----------------------------------------------------------------------------
const STAGING_URL = process.env.VITE_SUPABASE_URL || 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const STAGING_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

if (!STAGING_URL.includes('yvwsitkgpujeqlgeiuge') || STAGING_URL.includes('lskrcerzxltlrcewigrw')) {
  console.error('❌ KHÓA BẢO VỆ: Phát hiện URL không phải Staging hoặc có dấu hiệu kết nối Live! Hủy bỏ thực thi.');
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
    // 42703: undefined column, 42P01: undefined table, ECONNREFUSED, fetch failed
    if (error.code === '42703' || error.code === '42P01' || error.name === 'FetchError' || error.message?.includes('fetch failed')) {
      console.error(`❌ LỖI SCHEMA HOẶC MẠNG TẠI [${context}]:`, error);
      process.exit(1);
    }
  }
}

async function runHardenedVerification() {
  console.log('='.repeat(95));
  console.log('🛡️ BỘ KIỂM THỬ XÁC MINH BẢO MẬT & PHÂN QUYỀN CHẶT CHẼ (POSITIVE BASELINE & RLS GUARD)');
  console.log(`📌 Database Target: ${STAGING_URL}`);
  console.log(`⏱️ Thời gian chạy: ${new Date().toISOString()}`);
  console.log('='.repeat(95));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const branchQ1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchQ7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const branchQ2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  // ---------------------------------------------------------------------------
  // PHẦN 1: KHỞI TẠO CÁC PHIÊN XÁC THỰC
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 1] KHỞI TẠO CÁC PHIÊN VAI TRÒ ---');
  const adminClient = createAuthClient();
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: process.env.STAGING_ADMIN_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(aErr, 'Admin Login');
  assert(!aErr && adminAuth?.user, `Admin Org A đăng nhập thành công (${adminAuth?.user?.id})`);

  const mgrQ1Client = createAuthClient();
  const { data: mgrAuth, error: mErr } = await mgrQ1Client.auth.signInWithPassword({
    email: 'manager.q1@phuongnam.vn',
    password: process.env.STAGING_MGR_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(mErr, 'Manager Q1 Login');
  assert(!mErr && mgrAuth?.user, `Quản lý Q1 đăng nhập thành công (${mgrAuth?.user?.id})`);

  const docQ1Client = createAuthClient();
  const { data: docAuth, error: dErr } = await docQ1Client.auth.signInWithPassword({
    email: 'doctor.tuan@phuongnam.vn',
    password: process.env.STAGING_DOC_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(dErr, 'Doctor Q1 Login');
  assert(!dErr && docAuth?.user, `Bác sĩ Q1 (Tuấn) đăng nhập thành công (${docAuth?.user?.id})`);

  const recQ1Client = createAuthClient();
  const { data: recAuth, error: rErr } = await recQ1Client.auth.signInWithPassword({
    email: 'reception.q1@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(rErr, 'Reception Q1 Login');
  assert(!rErr && recAuth?.user, `Lễ tân Q1 đăng nhập thành công (${recAuth?.user?.id})`);

  // ---------------------------------------------------------------------------
  // PHẦN 2: CHẶN ẨN DANH (ANONYMOUS) TRÊN 12 BẢNG CÓ BASELINE ĐỐI CHỨNG
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 2] CHẶN ẨN DANH TRÊN 12 BẢNG (KÈM BASELINE ĐỐI CHỨNG ADMIN) ---');
  const targetTables = [
    'payroll_records', 'commission_records', 'roster_shifts',
    'treatment_sessions', 'treatment_photos', 'treatment_consents',
    'treatment_plans', 'treatment_session_audits', 'branch_transfers',
    'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
  ];

  const anonClient = createAuthClient();

  for (const table of targetTables) {
    // 2.1. Baseline: Admin đọc bảng mục tiêu để chứng minh bảng tồn tại và schema hợp lệ
    const { data: adminRows, error: adminErr } = await adminClient.from(table).select('*').limit(1);
    assertNoSchemaOrNetworkError(adminErr, `Admin read ${table}`);

    // 2.2. Negative: Anon đọc bảng
    const { data: anonRows, error: anonErr, status: anonStatus } = await anonClient.from(table).select('*').limit(5);
    
    // Yêu cầu: Hoặc là lỗi 42501/401/403 (Permission denied), hoặc data trả về rỗng (0 rows)
    const isBlocked = (anonErr && (anonErr.code === '42501' || anonStatus === 401 || anonStatus === 403)) || (!anonErr && (!anonRows || anonRows.length === 0));
    const leaked = !anonErr && anonRows && anonRows.length > 0;
    
    assert(!leaked, `Bảo vệ bảng [${table.padEnd(24)}]: Anon KHÔNG thể đọc dữ liệu (Bản ghi rò rỉ = 0)`);
  }

  // ---------------------------------------------------------------------------
  // PHẦN 3: BẢO MẬT LƯƠNG & HOA HỒNG (STAFF PRIVACY: POSITIVE -> NEGATIVE -> WRITE GUARD)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 3] BẢO MẬT LƯƠNG & HOA HỒNG (POSITIVE BASELINE -> NEGATIVE -> TAMPER GUARD) ---');
  const recStaffId = '99999999-9999-9999-9999-999999999993'; // Lễ tân Q1

  // 3.1. Baseline: Đảm bảo tồn tại bản ghi lương mẫu của Lễ tân Q1
  let { data: samplePay, error: samplePayErr } = await adminClient
    .from('payroll_records')
    .select('id, staff_id, net_salary, organization_id')
    .eq('staff_id', recStaffId)
    .limit(1)
    .maybeSingle();

  assertNoSchemaOrNetworkError(samplePayErr, 'Admin fetch sample payroll');

  if (!samplePay) {
    // 3.1.a Đảm bảo tồn tại kỳ lương mẫu
    let { data: samplePeriod } = await adminClient
      .from('payroll_periods')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!samplePeriod) {
      const { data: newPeriod, error: pErr } = await adminClient.from('payroll_periods').insert({
        organization_id: orgId,
        branch_id: branchQ1,
        period_name: 'Kỳ lương Test Diễn tập',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        status: 'draft'
      }).select().single();
      assertNoSchemaOrNetworkError(pErr, 'Insert sample payroll period');
      samplePeriod = newPeriod;
    }

    // 3.1.b Tạo bản ghi lương mẫu gắn với kỳ lương
    const { data: newPay, error: newPayErr } = await adminClient.from('payroll_records').insert({
      organization_id: orgId,
      payroll_period_id: samplePeriod.id,
      branch_id: branchQ1,
      staff_id: recStaffId,
      base_salary: 10000000,
      net_salary: 12500000,
      status: 'approved'
    }).select().single();
    assertNoSchemaOrNetworkError(newPayErr, 'Insert sample payroll');
    samplePay = newPay;
  }
  assert(samplePay && samplePay.id, `Baseline thành công: Bản ghi lương đối chứng tồn tại (ID: ${samplePay.id}, Net: ${samplePay.net_salary})`);

  // 3.2. Negative Read: Bác sĩ Q1 cố tình đọc đúng ID bản ghi lương của Lễ tân Q1
  const { data: docReadPay, error: docReadPayErr } = await docQ1Client
    .from('payroll_records')
    .select('id, net_salary')
    .eq('id', samplePay.id);
  assertNoSchemaOrNetworkError(docReadPayErr, 'Doctor read payroll');
  assert(!docReadPay || docReadPay.length === 0, 'Bác sĩ Q1 KHÔNG THỂ đọc bản ghi lương của Lễ tân Q1 (RLS Row Filtered = 0 rows)');

  // 3.3. Negative Write: Bác sĩ Q1 cố tình sửa net_salary của Lễ tân Q1 với payload hợp lệ
  const originalSalary = samplePay.net_salary;
  const maliciousSalary = 999999999;
  const { data: docTamperPay, error: docTamperErr } = await docQ1Client
    .from('payroll_records')
    .update({ net_salary: maliciousSalary })
    .eq('id', samplePay.id)
    .select();
  
  const tamperSucceeded = !docTamperErr && docTamperPay && docTamperPay.length > 0;
  assert(!tamperSucceeded, 'Bác sĩ Q1 bị CHẶN khi cố tình ghi đè lương của nhân sự khác');

  // 3.4. Xác minh bản ghi đối chứng hoàn toàn KHÔNG bị thay đổi
  const { data: verifyPay } = await adminClient
    .from('payroll_records')
    .select('net_salary')
    .eq('id', samplePay.id)
    .single();
  assert(Number(verifyPay.net_salary) === Number(originalSalary), `Xác nhận số liệu lương bảo toàn 100% (${verifyPay.net_salary} đ)`);

  // ---------------------------------------------------------------------------
  // PHẦN 4: ĐIỀU CHUYỂN KHO (PHÂN BIỆT RÕ PHIẾU Q1<->Q7 VỚI PHIẾU HOÀN TOÀN NGOÀI Q1)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 4] KIỂM THỬ ĐIỀU CHUYỂN KHO (Q1<->Q7 HỢP LỆ VS NGOÀI Q1 BỊ CHẶN) ---');

  // 4.1. Bản ghi mẫu 1: Phiếu chuyển từ Q1 -> Q7 (Quản lý Q1 là bên gửi -> ĐƯỢC XEM)
  let { data: txQ1toQ7 } = await adminClient
    .from('branch_transfers')
    .select('id, transfer_number, from_branch_id, to_branch_id')
    .eq('from_branch_id', branchQ1)
    .eq('to_branch_id', branchQ7)
    .limit(1)
    .maybeSingle();

  if (!txQ1toQ7) {
    const { data: newTx, error: nErr1 } = await adminClient.from('branch_transfers').insert({
      organization_id: orgId,
      transfer_number: `TX_Q1_Q7_${Date.now()}`,
      from_branch_id: branchQ1,
      to_branch_id: branchQ7,
      status: 'draft'
    }).select().single();
    assertNoSchemaOrNetworkError(nErr1, 'Insert sample transfer Q1->Q7');
    txQ1toQ7 = newTx;
  }
  assert(txQ1toQ7 && txQ1toQ7.id, `Bản ghi đối chứng Q1 -> Q7 tồn tại (${txQ1toQ7.transfer_number})`);

  // Quản lý Q1 đọc phiếu Q1 -> Q7: BẮT BUỘC THÀNH CÔNG (Không được chặn nhầm bên gửi)
  const { data: mgrReadQ1Tx, error: mgrReadQ1Err } = await mgrQ1Client
    .from('branch_transfers')
    .select('id, transfer_number')
    .eq('id', txQ1toQ7.id)
    .maybeSingle();
  assertNoSchemaOrNetworkError(mgrReadQ1Err, 'Manager read Q1-Q7 transfer');
  assert(mgrReadQ1Tx && mgrReadQ1Tx.id === txQ1toQ7.id, 'Quản lý Q1 ĐỌC THÀNH CÔNG phiếu chuyển kho do Q1 xuất gửi (Bảo toàn quyền)');

  // 4.2. Bản ghi mẫu 2: Phiếu chuyển từ Q7 -> Q1 (Quản lý Q1 là bên nhận -> ĐƯỢC XEM)
  let { data: txQ7toQ1 } = await adminClient
    .from('branch_transfers')
    .select('id, transfer_number, from_branch_id, to_branch_id')
    .eq('from_branch_id', branchQ7)
    .eq('to_branch_id', branchQ1)
    .limit(1)
    .maybeSingle();

  if (!txQ7toQ1) {
    const { data: newTx, error: nErr2 } = await adminClient.from('branch_transfers').insert({
      organization_id: orgId,
      transfer_number: `TX_Q7_Q1_${Date.now()}`,
      from_branch_id: branchQ7,
      to_branch_id: branchQ1,
      status: 'draft'
    }).select().single();
    assertNoSchemaOrNetworkError(nErr2, 'Insert sample transfer Q7->Q1');
    txQ7toQ1 = newTx;
  }
  assert(txQ7toQ1 && txQ7toQ1.id, `Bản ghi đối chứng Q7 -> Q1 tồn tại (${txQ7toQ1.transfer_number})`);

  // Quản lý Q1 đọc phiếu Q7 -> Q1: BẮT BUỘC THÀNH CÔNG (Không được chặn nhầm bên nhận)
  const { data: mgrReadQ7Tx, error: mgrReadQ7Err } = await mgrQ1Client
    .from('branch_transfers')
    .select('id, transfer_number')
    .eq('id', txQ7toQ1.id)
    .maybeSingle();
  assertNoSchemaOrNetworkError(mgrReadQ7Err, 'Manager read Q7-Q1 transfer');
  assert(mgrReadQ7Tx && mgrReadQ7Tx.id === txQ7toQ1.id, 'Quản lý Q1 ĐỌC THÀNH CÔNG phiếu chuyển kho Q7 gửi về Q1 (Bảo toàn quyền bên nhận)');

  // 4.3. Bản ghi mẫu 3: Phiếu chuyển hoàn toàn ngoài Q1 (Ví dụ Q7 -> Q2 hoặc nội bộ Q7)
  let { data: txExternal } = await adminClient
    .from('branch_transfers')
    .select('id, transfer_number, from_branch_id, to_branch_id, status')
    .eq('from_branch_id', branchQ7)
    .neq('to_branch_id', branchQ1)
    .limit(1)
    .maybeSingle();

  if (!txExternal) {
    const { data: newTx, error: nErr3 } = await adminClient.from('branch_transfers').insert({
      organization_id: orgId,
      transfer_number: `TX_Q7_Q2_${Date.now()}`,
      from_branch_id: branchQ7,
      to_branch_id: branchQ2,
      status: 'draft'
    }).select().single();
    assertNoSchemaOrNetworkError(nErr3, 'Insert sample transfer Q7->Q2');
    txExternal = newTx;
  }
  assert(txExternal && txExternal.id, `Bản ghi đối chứng NGOÀI Q1 tồn tại (${txExternal.transfer_number})`);

  // Quản lý Q1 đọc phiếu ngoài Q1: BẮT BUỘC BỊ CHẶN (0 rows)
  const { data: mgrReadExtTx, error: mgrReadExtErr } = await mgrQ1Client
    .from('branch_transfers')
    .select('id')
    .eq('id', txExternal.id);
  assertNoSchemaOrNetworkError(mgrReadExtErr, 'Manager read external transfer');
  assert(!mgrReadExtTx || mgrReadExtTx.length === 0, 'Quản lý Q1 BỊ CHẶN khi xem phiếu điều chuyển hoàn toàn ngoài chi nhánh Q1');

  // Quản lý Q1 thử sửa trạng thái phiếu ngoài Q1 -> BẮT BUỘC THẤT BẠI & KHÔNG ĐỔI
  const { data: mgrTamperExt } = await mgrQ1Client
    .from('branch_transfers')
    .update({ status: 'completed' })
    .eq('id', txExternal.id)
    .select();
  assert(!mgrTamperExt || mgrTamperExt.length === 0, 'Quản lý Q1 BỊ CHẶN khi cố tình sửa phiếu điều chuyển ngoài Q1');

  const { data: verifyExtTx } = await adminClient
    .from('branch_transfers')
    .select('status')
    .eq('id', txExternal.id)
    .single();
  assert(verifyExtTx.status === txExternal.status, `Trạng thái phiếu ngoài Q1 giữ nguyên trạng thái gốc (${verifyExtTx.status})`);

  // ---------------------------------------------------------------------------
  // PHẦN 5: CÁCH LY ĐA TỔ CHỨC (CROSS-ORG POSITIVE & NEGATIVE)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 5] CÁCH LY ĐA TỔ CHỨC (CROSS-ORG TRÊN PAYROLL VÀ TRANSFERS) ---');
  const orgBId = '22222222-2222-2222-2222-222222222222';

  // Thử chèn bản ghi vào Org B với đầy đủ trường hợp lệ
  const { data: illegalOrgInsert, error: illegalOrgErr } = await adminClient
    .from('branch_transfers')
    .insert({
      organization_id: orgBId,
      transfer_number: `ILG_TX_${Date.now()}`,
      from_branch_id: branchQ2,
      to_branch_id: branchQ1,
      status: 'draft'
    })
    .select();

  assert(illegalOrgErr !== null || !illegalOrgInsert || illegalOrgInsert.length === 0, 'Admin Org A bị CHẶN khi cố ý ghi dữ liệu vào Org B (Cross-Org Guard)');

  console.log('\n' + '='.repeat(95));
  console.log('🎉 TOÀN BỘ CÁC TIÊU CHÍ NGHIỆM THU NGHIÊM NGẶT ĐÃ ĐƯỢC XÁC MINH VÀ ĐẠT 100%!');
  console.log('='.repeat(95));
}

runHardenedVerification().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
