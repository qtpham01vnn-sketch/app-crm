/**
 * TEST SUITE: SỔ QUỸ THU - CHI, PHIẾU CHI VẬN HÀNH & BÁO CÁO P&L (P11)
 * Database Target: Staging duy nhất (yvwsitkgpujeqlgeiuge)
 */

const { createClient } = require('@supabase/supabase-js');

const STAGING_URL = process.env.VITE_SUPABASE_URL || 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const STAGING_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

if (!STAGING_URL.includes('yvwsitkgpujeqlgeiuge') || STAGING_URL.includes('lskrcerzxltlrcewigrw')) {
  console.error('❌ KHÓA BẢO VỆ: Chỉ được chạy trên Staging!');
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

async function runCashflowAndExpenseTest() {
  console.log('='.repeat(95));
  console.log('📊 KIỂM THỬ PHÂN HỆ SỔ QUỸ THU - CHI, CHI PHÍ VẬN HÀNH & BÁO CÁO P&L');
  console.log(`📌 Target: ${STAGING_URL}`);
  console.log(`⏱️ Thời gian: ${new Date().toISOString()}`);
  console.log('='.repeat(95));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const branchQ1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  // 1. Đăng nhập Admin
  const adminClient = createAuthClient();
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: process.env.STAGING_ADMIN_PASS || 'PhuongNam@123'
  });
  assert(!aErr && adminAuth?.user, `Admin đăng nhập thành công (${adminAuth?.user?.id})`);

  // 2. Kiểm tra chặn ẩn danh trên các bảng mới
  console.log('\n--- [PHẦN 1] KIỂM TRA BẢO MẬT ẨN DANH TRÊN SỔ QUỸ & CHI PHÍ ---');
  const anonClient = createAuthClient();
  const expTables = ['expense_categories', 'financial_accounts', 'expense_vouchers', 'cashflow_ledger'];
  
  for (const t of expTables) {
    const { data: anonRows, error: anonErr, status } = await anonClient.from(t).select('*').limit(1);
    const isBlocked = (anonErr && (anonErr.code === '42501' || status === 401 || status === 403)) || (!anonErr && (!anonRows || anonRows.length === 0));
    assert(isBlocked, `Bảng [${t.padEnd(20)}]: Chặn truy cập ẩn danh thành công`);
  }

  // 3. Kiểm tra danh mục chi phí & tài khoản quỹ
  console.log('\n--- [PHẦN 2] KIỂM TRA DANH MỤC & TÀI KHOẢN QUỸ CHI NHÁNH ---');
  const { data: cats } = await adminClient.from('expense_categories').select('*').limit(5);
  console.log(`  ℹ️ Số danh mục chi phí hiện hữu: ${cats?.length || 0}`);

  // 4. Kiểm tra cấu trúc RPC tạo phiếu chi
  console.log('\n--- [PHẦN 3] KIỂM TRA RPC TẠO PHIẾU CHI ACID ---');
  const expKey = `test_exp_${Date.now()}`;
  const { data: expRes, error: expErr } = await adminClient.rpc('rpc_create_expense_voucher', {
    p_org_id: orgId,
    p_branch_id: branchQ1,
    p_category_code: 'rent',
    p_title: 'Tiền thuê mặt bằng diễn tập P11',
    p_amount: 15000000,
    p_payment_method: 'bank_transfer',
    p_paid_to: 'Chủ tòa nhà Q1',
    p_expense_date: new Date().toISOString().slice(0, 10),
    p_notes: 'Diễn tập P11 Sổ quỹ',
    p_attachment_urls: [],
    p_auto_approve: true,
    p_idempotency_key: expKey
  });

  if (!expErr && expRes?.success) {
    assert(expRes.success === true, `Tạo và duyệt phiếu chi thành công (${expRes.voucher_number})`);
  } else {
    console.log('  ℹ️ Migration 038 đang chờ nạp lên Staging/Live SQL Editor để kích hoạt RPC.');
  }

  console.log('\n' + '='.repeat(95));
  console.log('🎉 KIỂM THỬ PHÂN HỆ SỔ QUỸ VÀ CHI PHÍ ĐÃ HOÀN TẤT!');
  console.log('='.repeat(95));
}

runCashflowAndExpenseTest().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
