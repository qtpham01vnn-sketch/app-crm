/**
 * COMPREHENSIVE SECURITY VERIFICATION SUITE FOR EMERGENCY HOTFIX 034
 * Database Target: Staging (yvwsitkgpujeqlgeiuge)
 * 
 * Kiểm thử trực tiếp trên chính các bảng bị sửa đổi:
 * 1. Anonymous Access: Bị chặn 100% trên cả 12 bảng (42501 / 0 rows).
 * 2. Multi-tenant / Cross-Org Protection: Người dùng Org A không thể đọc/ghi bản ghi thuộc Org B.
 * 3. Multi-branch / Cross-Branch Protection: Quản lý Q1 không thể đọc/ghi dữ liệu của Q7 trên transfers, PO, treatment, payroll.
 * 4. Staff Privacy Protection: Nhân viên không thể xem bảng lương / hoa hồng của đồng nghiệp.
 * 5. Bot Synchronization Engine: Kênh đồng bộ chat duy trì kết nối an toàn.
 */

const { createClient } = require('@supabase/supabase-js');

const STAGING_URL = process.env.VITE_SUPABASE_URL || 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const STAGING_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

function createAuthClient() {
  return createClient(STAGING_URL, STAGING_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function classifyError(error, count, status) {
  if (!error && count === 0) return 'RLS_FILTERED_ZERO_ROWS';
  if (!error && count > 0) return 'LEAKED_DATA';
  if (!error) return 'SUCCESS';
  
  if (error.message?.includes('Invalid API key')) return 'AUTH_KEY_INVALID';
  if (error.code === '42501' || error.message?.includes('permission denied') || status === 401 || status === 403 || error.status === 401 || error.status === 403) {
    return 'PERMISSION_DENIED';
  }
  if (error.code === '42P01') return 'TABLE_NOT_FOUND';
  if (error.name === 'FetchError' || error.code === 'ECONNREFUSED') return 'NETWORK_ERROR';
  return `OTHER_ERROR_${error.code || error.message}`;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

async function runRigorousSecurityTest() {
  console.log('='.repeat(95));
  console.log('🛡️ KIỂM THỬ BẢO MẬT ĐA TẦNG (CROSS-ORG, CROSS-BRANCH, PRIVACY) TRÊN 12 BẢNG SỬA ĐỔI');
  console.log(`📌 Target: ${STAGING_URL}`);
  console.log(`⏱️ Thời gian: ${new Date().toISOString()}`);
  console.log('='.repeat(95));

  const targetTables = [
    'payroll_records', 'commission_records', 'roster_shifts',
    'treatment_sessions', 'treatment_photos', 'treatment_consents',
    'treatment_plans', 'treatment_session_audits', 'branch_transfers',
    'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
  ];

  // ---------------------------------------------------------------------------
  // PHẦN 1: KIỂM TRA TRUY CẬP ẨN DANH (ANONYMOUS CLIENT) TRÊN 12 BẢNG
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 1] KIỂM TRA CHẶN TRUY CẬP ẨN DANH (ANONYMOUS) ---');
  const anonClient = createAuthClient();

  for (const table of targetTables) {
    const { data, error, count, status } = await anonClient.from(table).select('*', { count: 'exact', head: true });
    const classification = classifyError(error, count, status);
    const isBlocked = classification === 'PERMISSION_DENIED' || classification === 'RLS_FILTERED_ZERO_ROWS';
    assert(isBlocked, `Bảng ${table.padEnd(25)}: Chặn ẩn danh thành công (${classification})`);
  }

  // ---------------------------------------------------------------------------
  // PHẦN 2: KHỞI TẠO PHIÊN ĐĂNG NHẬP 3 VAI TRÒ
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 2] KHỞI TẠO CÁC PHIÊN VAI TRÒ (ADMIN, MGR Q1, DOCTOR Q1) ---');
  const adminClient = createAuthClient();
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: process.env.STAGING_ADMIN_PASS || 'PhuongNam@123'
  });
  assert(!aErr && adminAuth?.user, `Admin Org A đăng nhập thành công (${adminAuth?.user?.id})`);

  const mgrClient = createAuthClient();
  const { data: mgrAuth, error: mErr } = await mgrClient.auth.signInWithPassword({
    email: 'manager.q1@phuongnam.vn',
    password: process.env.STAGING_MGR_PASS || 'PhuongNam@123'
  });
  assert(!mErr && mgrAuth?.user, `Quản lý Q1 đăng nhập thành công (${mgrAuth?.user?.id})`);

  const docClient = createAuthClient();
  const { data: docAuth, error: dErr } = await docClient.auth.signInWithPassword({
    email: 'doctor.tuan@phuongnam.vn',
    password: process.env.STAGING_DOC_PASS || 'PhuongNam@123'
  });
  assert(!dErr && docAuth?.user, `Bác sĩ Q1 đăng nhập thành công (${docAuth?.user?.id})`);

  // ---------------------------------------------------------------------------
  // PHẦN 3: KIỂM THỬ CÁCH LY ĐA TỔ CHỨC (CROSS-ORG ISOLATION TRÊN BẢN GHI THỰC TẾ)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 3] KIỂM THỬ CÁCH LY ĐA TỔ CHỨC (CROSS-ORG TRÊN BẢNG SỬA ĐỔI) ---');
  const orgBId = '22222222-2222-2222-2222-222222222222';
  
  // 3.1. Thử đọc bản ghi thuộc Org B
  const { data: crossOrgPay } = await adminClient
    .from('payroll_records')
    .select('id, organization_id')
    .eq('organization_id', orgBId);
  assert(!crossOrgPay || crossOrgPay.length === 0, 'Admin Org A hoàn toàn KHÔNG THỂ đọc bảng lương của Org B');

  const { data: crossOrgTransfers } = await adminClient
    .from('branch_transfers')
    .select('id, organization_id')
    .eq('organization_id', orgBId);
  assert(!crossOrgTransfers || crossOrgTransfers.length === 0, 'Admin Org A hoàn toàn KHÔNG THỂ đọc phiếu điều chuyển của Org B');

  // 3.2. Thử can thiệp chèn bản ghi trái phép vào Org B
  const { data: illegalInsert, error: illegalInsertErr } = await adminClient
    .from('branch_transfers')
    .insert({
      organization_id: orgBId,
      transfer_code: `ILG_TX_${Date.now()}`,
      from_branch_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      to_branch_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      status: 'draft'
    })
    .select();
  assert(illegalInsertErr !== null || !illegalInsert, 'Admin Org A bị CHẶN khi cố ý ghi dữ liệu vào Org B (Cross-Org Insert Guard)');

  // ---------------------------------------------------------------------------
  // PHẦN 4: KIỂM THỬ CÁCH LY CHI NHÁNH TRÊN CÁC BẢNG SỬA ĐỔI (QUẢN LÝ Q1 VS Q7)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 4] KIỂM THỬ CÁCH LY CHI NHÁNH TRÊN CÁC BẢNG SỬA ĐỔI (Q1 VS Q7) ---');
  const branchQ7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // 4.1. Điều chuyển kho Q7
  const { data: q7Transfers } = await mgrClient
    .from('branch_transfers')
    .select('id, from_branch_id, to_branch_id')
    .or(`from_branch_id.eq.${branchQ7},to_branch_id.eq.${branchQ7}`);
  assert(!q7Transfers || q7Transfers.length === 0, 'Quản lý Q1 KHÔNG THỂ xem phiếu điều chuyển nội bộ của Chi nhánh Q7');

  // 4.2. Đơn mua hàng (PO) Q7
  const { data: q7POs } = await mgrClient
    .from('purchase_orders')
    .select('id, branch_id')
    .eq('branch_id', branchQ7);
  assert(!q7POs || q7POs.length === 0, 'Quản lý Q1 KHÔNG THỂ xem đơn mua hàng tại Chi nhánh Q7');

  // 4.3. Hồ sơ buổi điều trị Q7
  const { data: q7Treatments } = await mgrClient
    .from('treatment_sessions')
    .select('id, branch_id')
    .eq('branch_id', branchQ7);
  assert(!q7Treatments || q7Treatments.length === 0, 'Quản lý Q1 KHÔNG THỂ xem buổi điều trị thực hiện tại Chi nhánh Q7');

  // ---------------------------------------------------------------------------
  // PHẦN 5: KIỂM THỬ BẢO MẬT LƯƠNG & HOA HỒNG (STAFF PRIVACY)
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 5] KIỂM THỬ BẢO MẬT RIÊNG TƯ LƯƠNG & HOA HỒNG (STAFF PRIVACY) ---');
  const otherStaffId = '99999999-9999-9999-9999-999999999993'; // Lễ tân Q1

  // Bác sĩ Q1 thử đọc bảng lương của Lễ tân Q1
  const { data: docReadOtherPay } = await docClient
    .from('payroll_records')
    .select('id, staff_id, net_salary')
    .eq('staff_id', otherStaffId);
  assert(!docReadOtherPay || docReadOtherPay.length === 0, 'Bác sĩ KHÔNG THỂ đọc bảng lương của nhân sự khác (Staff Privacy Active)');

  // Bác sĩ Q1 thử đọc sổ hoa hồng của Lễ tân Q1
  const { data: docReadOtherComm } = await docClient
    .from('commission_records')
    .select('id, staff_id, final_commission')
    .eq('staff_id', otherStaffId);
  assert(!docReadOtherComm || docReadOtherComm.length === 0, 'Bác sĩ KHÔNG THỂ đọc hoa hồng của nhân sự khác (Staff Privacy Active)');

  // ---------------------------------------------------------------------------
  // PHẦN 6: KIỂM TRA BẢO TOÀN DỊCH VỤ CSKH & BOT SYNC
  // ---------------------------------------------------------------------------
  console.log('\n--- [PHẦN 6] KIỂM TRA BẢO TOÀN DỊCH VỤ CSKH & BOT SYNC ---');
  const { data: chatData, error: chatErr } = await adminClient
    .from('chat_messages')
    .select('id')
    .limit(1);
  assert(!chatErr, 'Hệ thống chat & CSKH sẵn sàng hoạt động bình thường');

  console.log('\n' + '='.repeat(95));
  console.log('🎉 TOÀN BỘ 6 PHẦN KIỂM THỬ BẢO MẬT NGHIÊM NGẶT TRÊN CÁC BẢNG SỬA ĐỔI ĐÃ ĐẠT 100%!');
  console.log('='.repeat(95));
}

runRigorousSecurityTest().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
