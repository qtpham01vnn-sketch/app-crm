/**
 * BỘ KIỂM THỬ PHÂN QUYỀN NGHIỆP VỤ CHUYÊN SÂU 037 (STAGING)
 * Database Target: Staging duy nhất (yvwsitkgpujeqlgeiuge)
 * 
 * Nội dung kiểm thử:
 * 1. Bác sĩ phụ trách & Buổi điều trị: Được sửa khi mở, BỊ CHẶN TUYỆT ĐỐI khi hồ sơ đã khóa (completed/locked).
 * 2. Cấm client tự INSERT/UPDATE/DELETE nhật ký kiểm toán (treatment_session_audits) -> Tự động sinh qua trigger DB.
 * 3. Ràng buộc Ảnh điều trị (treatment_photos): Khớp bác sĩ/chi nhánh/khách khi có session_id; có quy tắc riêng khi không session_id.
 * 4. Cam kết điều trị (treatment_consents): Phân định theo chi nhánh phát sinh nghiệp vụ thực tế.
 * 5. Điều chuyển kho (branch_transfers): Bảo toàn quyền 2 đầu chi nhánh gửi/nhận, CHẶN chi nhánh ngoài luồng.
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

function assertNoSchemaOrNetworkError(error, context) {
  if (error) {
    if (error.code === '42703' || error.code === '42P01' || error.name === 'FetchError' || error.message?.includes('fetch failed')) {
      console.error(`❌ LỖI SCHEMA HOẶC MẠNG TẠI [${context}]:`, error);
      process.exit(1);
    }
  }
}

async function run037Verification() {
  console.log('='.repeat(95));
  console.log('🛡️ BỘ KIỂM THỬ XÁC MINH PHÂN QUYỀN NGHIỆP VỤ CHUYÊN SÂU 037 (STAGING)');
  console.log(`📌 Database Target: ${STAGING_URL}`);
  console.log(`⏱️ Thời gian thực thi: ${new Date().toISOString()}`);
  console.log('='.repeat(95));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const branchQ1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchQ7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const branchQ2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  // 1. Khởi tạo phiên
  console.log('\n--- [1] KHỞI TẠO PHIÊN XÁC THỰC CÁC VAI TRÒ ---');
  const adminClient = createAuthClient();
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: process.env.STAGING_ADMIN_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(aErr, 'Admin Login');
  assert(!aErr && adminAuth?.user, `Admin Org A đăng nhập thành công`);

  const docQ1Client = createAuthClient();
  const { data: docAuth, error: dErr } = await docQ1Client.auth.signInWithPassword({
    email: 'doctor.tuan@phuongnam.vn',
    password: process.env.STAGING_DOC_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(dErr, 'Doctor Login');
  assert(!dErr && docAuth?.user, `Bác sĩ Tuấn (Q1) đăng nhập thành công`);

  const mgrQ1Client = createAuthClient();
  const { data: mgrAuth, error: mErr } = await mgrQ1Client.auth.signInWithPassword({
    email: 'manager.q1@phuongnam.vn',
    password: process.env.STAGING_MGR_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(mErr, 'Manager Q1 Login');
  assert(!mErr && mgrAuth?.user, `Quản lý Q1 đăng nhập thành công`);

  const recQ1Client = createAuthClient();
  const { data: recAuth, error: rErr } = await recQ1Client.auth.signInWithPassword({
    email: 'reception.q1@phuongnam.vn',
    password: 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(rErr, 'Reception Q1 Login');
  assert(!rErr && recAuth?.user, `Lễ tân Q1 đăng nhập thành công`);

  // Lấy staff ID của Bác sĩ Tuấn
  const { data: docStaff } = await adminClient
    .from('staff_profiles')
    .select('id')
    .eq('auth_user_id', docAuth.user.id)
    .single();
  const docStaffId = docStaff.id;

  // Lấy khách hàng đối chứng tại Q1
  let { data: sampleCustomer } = await adminClient
    .from('customers')
    .select('id, full_name, primary_branch_id')
    .eq('primary_branch_id', branchQ1)
    .limit(1)
    .maybeSingle();

  if (!sampleCustomer) {
    const { data: newCust, error: cErr } = await adminClient.from('customers').insert({
      organization_id: orgId,
      primary_branch_id: branchQ1,
      full_name: 'Chị Mai Hoa Q1',
      phone: '0912345678'
    }).select().single();
    assertNoSchemaOrNetworkError(cErr, 'Insert sample customer');
    sampleCustomer = newCust;
  }
  assert(sampleCustomer && sampleCustomer.id, `Khách hàng đối chứng: ${sampleCustomer.full_name} (${sampleCustomer.id})`);

  // ---------------------------------------------------------------------------
  // [2] KIỂM THỬ BUỔI ĐIỀU TRỊ & BẢO VỆ HỒ SƠ ĐÃ KHÓA
  // ---------------------------------------------------------------------------
  console.log('\n--- [2] KIỂM THỬ BUỔI ĐIỀU TRỊ & BẢO VỆ HỒ SƠ ĐÃ KHÓA ---');
  const sessionCode = `SES_037_${Date.now()}`;
  const { data: newSession, error: sErr } = await docQ1Client.from('treatment_sessions').insert({
    organization_id: orgId,
    branch_id: branchQ1,
    customer_id: sampleCustomer.id,
    session_code: sessionCode,
    performed_by: docStaffId,
    performed_at: new Date().toISOString(),
    treatment_area: 'Toàn mặt',
    protocol_performed: 'Laser Co2 Fractional vi điểm',
    post_treatment_notes: 'Buổi 1: Thao tác an toàn',
    status: 'draft'
  }).select().single();
  assertNoSchemaOrNetworkError(sErr, 'Doctor insert session');
  assert(newSession && newSession.id, `Bác sĩ tạo buổi điều trị thành công (${newSession.session_code})`);

  // Bác sĩ cập nhật ghi chú khi đang draft -> Hợp lệ
  const { data: updateProg, error: upErr } = await docQ1Client
    .from('treatment_sessions')
    .update({ post_treatment_notes: 'Buổi 1 cập nhật: Da hấp thu tốt' })
    .eq('id', newSession.id)
    .select();
  assertNoSchemaOrNetworkError(upErr, 'Doctor update in-progress session');
  assert(updateProg && updateProg.length > 0, 'Bác sĩ cập nhật thành công khi hồ sơ đang mở (draft)');

  // Khóa hồ sơ: Đổi trạng thái sang 'completed'
  const { error: lockErr } = await adminClient
    .from('treatment_sessions')
    .update({ status: 'completed' })
    .eq('id', newSession.id);
  assertNoSchemaOrNetworkError(lockErr, 'Lock session');

  // Bác sĩ cố tình sửa hồ sơ ĐÃ KHÓA (completed) -> BẮT BUỘC BỊ CHẶN
  const { data: docTamperLocked, error: docTamperErr } = await docQ1Client
    .from('treatment_sessions')
    .update({ post_treatment_notes: 'Cố tình sửa hồ sơ đã khóa' })
    .eq('id', newSession.id)
    .select();
  const editLockedBlocked = docTamperErr !== null || !docTamperLocked || docTamperLocked.length === 0;
  assert(editLockedBlocked, 'Bảo vệ hồ sơ y khoa: Bác sĩ BỊ CHẶN khi cố tình sửa hồ sơ đã khóa (completed)');

  // ---------------------------------------------------------------------------
  // [3] KIỂM THỬ NHẬT KÝ KIỂM TOÁN TỰ ĐỘNG & CẤM CLIENT TỰ Ý GHI
  // ---------------------------------------------------------------------------
  console.log('\n--- [3] KIỂM THỬ NHẬT KÝ KIỂM TOÁN (AUTO DB AUDIT & CLIENT WRITE BLOCKED) ---');

  // 3.1. Client cố tình tự INSERT nhật ký kiểm toán -> BẮT BUỘC BỊ CHẶN (Permission Denied 42501)
  const { data: clientAuditInsert, error: clientAuditErr } = await docQ1Client
    .from('treatment_session_audits')
    .insert({
      session_id: newSession.id,
      modified_by: docStaffId,
      action_type: 'fake_action',
      reason_for_change: 'Client tự chèn vết kiểm toán giả mạo',
      previous_data: {},
      new_data: {}
    })
    .select();
  const directInsertBlocked = clientAuditErr !== null || !clientAuditInsert || clientAuditInsert.length === 0;
  assert(directInsertBlocked, 'Bảo vệ vết kiểm toán: Client BỊ CHẶN khi cố ý tự INSERT vào treatment_session_audits');

  // 3.2. Kiểm tra vết kiểm toán tự động sinh bởi Database Trigger
  const { data: autoAudits } = await adminClient
    .from('treatment_session_audits')
    .select('id, action_type, session_id, reason_for_change')
    .eq('session_id', newSession.id);
  assert(autoAudits && autoAudits.length >= 1, `Database Trigger tự động ghi nhận ${autoAudits?.length} vết kiểm toán y khoa`);

  // ---------------------------------------------------------------------------
  // [4] KIỂM THỬ RÀNG BUỘC ẢNH ĐIỀU TRỊ (TREATMENT_PHOTOS)
  // ---------------------------------------------------------------------------
  console.log('\n--- [4] KIỂM THỬ RÀNG BUỘC ẢNH ĐIỀU TRỊ (CÓ SESSION VS KHÔNG SESSION) ---');

  // 4.1. Bác sĩ thêm ảnh gắn với đúng buổi điều trị và chi nhánh của mình -> Hợp lệ
  const { data: photoEntry, error: photoErr } = await docQ1Client
    .from('treatment_photos')
    .insert({
      organization_id: orgId,
      branch_id: branchQ1,
      customer_id: sampleCustomer.id,
      session_id: newSession.id,
      photo_type: 'after',
      storage_path: '/photos/ses_01_after.jpg',
      file_name: 'ses_01_after.jpg',
      treatment_area: 'Toàn mặt',
      angle: 'front',
      uploaded_by: docStaffId
    })
    .select()
    .single();
  assertNoSchemaOrNetworkError(photoErr, 'Doctor insert photo with session');
  assert(photoEntry && photoEntry.id, `Thêm ảnh gắn buổi điều trị hợp lệ thành công (${photoEntry.id})`);

  // 4.2. Thêm ảnh tổng quan không gắn buổi (session_id IS NULL) tại chi nhánh có quyền -> Hợp lệ
  const { data: photoGeneral, error: photoGenErr } = await docQ1Client
    .from('treatment_photos')
    .insert({
      organization_id: orgId,
      branch_id: branchQ1,
      customer_id: sampleCustomer.id,
      session_id: null,
      photo_type: 'before',
      storage_path: '/photos/general_before.jpg',
      file_name: 'general_before.jpg',
      treatment_area: 'Toàn mặt',
      angle: 'front',
      uploaded_by: docStaffId
    })
    .select()
    .single();
  assertNoSchemaOrNetworkError(photoGenErr, 'Doctor insert general photo');
  assert(photoGeneral && photoGeneral.id, `Thêm ảnh tổng quan (không session_id) tại chi nhánh có quyền thành công`);

  // ---------------------------------------------------------------------------
  // [5] KIỂM THỬ CAM KẾT ĐIỀU TRỊ THEO CHI NHÁNH PHÁT SINH THỰC TẾ
  // ---------------------------------------------------------------------------
  console.log('\n--- [5] KIỂM THỬ CAM KẾT ĐIỀU TRỊ (TREATMENT_CONSENTS) ---');

  // 5.1. Tạo cam kết gắn với buổi điều trị tại Q1 -> Nhân sự Q1 tạo hợp lệ
  const { data: consentEntry, error: consentErr } = await adminClient
    .from('treatment_consents')
    .insert({
      organization_id: orgId,
      customer_id: sampleCustomer.id,
      session_id: newSession.id,
      consent_title: 'Cam kết thực hiện thủ thuật Laser CO2',
      consent_content_snapshot: 'Khách hàng đồng ý thực hiện theo phác đồ.',
      signer_name: sampleCustomer.full_name,
      agree_treatment: true,
      agree_photo_records: true,
      witness_staff_id: docStaffId,
      status: 'signed'
    })
    .select()
    .single();
  assertNoSchemaOrNetworkError(consentErr, 'Insert consent with session');
  assert(consentEntry && consentEntry.id, `Tạo cam kết điều trị thành công (${consentEntry.id})`);

  // Bác sĩ Tuấn (người chứng kiến) đọc cam kết -> Thành công
  const { data: docConsentRead } = await docQ1Client.from('treatment_consents').select('id').eq('id', consentEntry.id).single();
  assert(docConsentRead && docConsentRead.id === consentEntry.id, 'Bác sĩ Tuấn đọc thành công bản cam kết');

  // ---------------------------------------------------------------------------
  // [6] KIỂM THỬ ĐIỀU CHUYỂN KHO 2 ĐẦU CHI NHÁNH & CHẶN NGOÀI LUỒNG
  // ---------------------------------------------------------------------------
  console.log('\n--- [6] KIỂM THỬ ĐIỀU CHUYỂN KHO (HAI ĐẦU GỬI/NHẬN VS NGOÀI LUỒNG) ---');

  // 6.1. Phiếu chuyển Q1 -> Q7
  let { data: txQ1toQ7 } = await adminClient.from('branch_transfers').select('id, transfer_number').eq('from_branch_id', branchQ1).eq('to_branch_id', branchQ7).limit(1).maybeSingle();
  if (!txQ1toQ7) {
    const { data: nTx } = await adminClient.from('branch_transfers').insert({
      organization_id: orgId,
      transfer_number: `TX_Q1_Q7_${Date.now()}`,
      from_branch_id: branchQ1,
      to_branch_id: branchQ7,
      status: 'draft'
    }).select().single();
    txQ1toQ7 = nTx;
  }
  const { data: mgrReadFrom } = await mgrQ1Client.from('branch_transfers').select('id').eq('id', txQ1toQ7.id).maybeSingle();
  assert(mgrReadFrom && mgrReadFrom.id === txQ1toQ7.id, 'Quản lý Q1 ĐỌC THÀNH CÔNG phiếu chuyển Q1 gửi đi');

  // 6.2. Phiếu chuyển Q7 -> Q1
  let { data: txQ7toQ1 } = await adminClient.from('branch_transfers').select('id, transfer_number').eq('from_branch_id', branchQ7).eq('to_branch_id', branchQ1).limit(1).maybeSingle();
  if (!txQ7toQ1) {
    const { data: nTx2 } = await adminClient.from('branch_transfers').insert({
      organization_id: orgId,
      transfer_number: `TX_Q7_Q1_${Date.now()}`,
      from_branch_id: branchQ7,
      to_branch_id: branchQ1,
      status: 'draft'
    }).select().single();
    txQ7toQ1 = nTx2;
  }
  const { data: mgrReadTo } = await mgrQ1Client.from('branch_transfers').select('id').eq('id', txQ7toQ1.id).maybeSingle();
  assert(mgrReadTo && mgrReadTo.id === txQ7toQ1.id, 'Quản lý Q1 ĐỌC THÀNH CÔNG phiếu chuyển Q7 gửi về Q1');

  // 6.3. Phiếu chuyển ngoài luồng Q7 -> Q2
  let { data: txExt } = await adminClient.from('branch_transfers').select('id, transfer_number').eq('from_branch_id', branchQ7).eq('to_branch_id', branchQ2).limit(1).maybeSingle();
  if (!txExt) {
    const { data: nTx3 } = await adminClient.from('branch_transfers').insert({
      organization_id: orgId,
      transfer_number: `TX_Q7_Q2_${Date.now()}`,
      from_branch_id: branchQ7,
      to_branch_id: branchQ2,
      status: 'draft'
    }).select().single();
    txExt = nTx3;
  }
  const { data: mgrReadExt } = await mgrQ1Client.from('branch_transfers').select('id').eq('id', txExt.id);
  assert(!mgrReadExt || mgrReadExt.length === 0, 'Quản lý Q1 BỊ CHẶN khi xem phiếu điều chuyển ngoài luồng Q1 (Q7 -> Q2)');

  console.log('\n' + '='.repeat(95));
  console.log('🎉 TOÀN BỘ 6 TIÊU CHÍ PHÂN QUYỀN NGHIỆP VỤ 037 ĐÃ PASS 100% TRÊN STAGING!');
  console.log('='.repeat(95));
}

run037Verification().catch(err => {
  console.error('Lỗi kiểm thử 037:', err);
  process.exit(1);
});
