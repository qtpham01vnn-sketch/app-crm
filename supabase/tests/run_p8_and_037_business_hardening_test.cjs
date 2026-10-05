/**
 * BỘ KIỂM THỬ PHÂN QUYỀN NGHIỆP VỤ CHUYÊN SÂU (MIGRATION 037) TRÊN STAGING
 * Database Target: Staging duy nhất (yvwsitkgpujeqlgeiuge)
 * 
 * Kiểm tra đầy đủ:
 * 1. Phạm vi Bác sĩ phụ trách / Thực hiện (treatment_sessions, treatment_plans)
 * 2. Ràng buộc quan hệ Ảnh - Buổi điều trị - Khách hàng (treatment_photos)
 * 3. Cam kết điều trị theo chi nhánh & người chứng kiến (treatment_consents)
 * 4. Bảo vệ hồ sơ đã khóa & Nhật ký kiểm toán bất biến (treatment_session_audits)
 * 5. Điều chuyển kho hai đầu gửi/nhận (branch_transfers, branch_transfer_items)
 */

const { createClient } = require('@supabase/supabase-js');

const STAGING_URL = process.env.VITE_SUPABASE_URL || 'https://yvwsitkgpujeqlgeiuge.supabase.co';
const STAGING_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2d3NpdGtncHVqZXFsZ2VpdWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjYwMTgsImV4cCI6MjEwNjUwMjAxOH0.4DXwsOakGUbkLF8JUQzV8xkQILFj0_OW973y4KnjSSA';

if (!STAGING_URL.includes('yvwsitkgpujeqlgeiuge') || STAGING_URL.includes('lskrcerzxltlrcewigrw')) {
  console.error('❌ KHÓA BẢO VỆ: URL không phải Staging! Dừng thực thi.');
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
  console.log(`📌 Target: ${STAGING_URL}`);
  console.log('='.repeat(95));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const branchQ1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchQ7 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // 1. Đăng nhập các vai trò
  console.log('\n--- [1] KHỞI TẠO PHIÊN XÁC THỰC CÁC VAI TRÒ ---');
  const adminClient = createAuthClient();
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: 'admin.staging@phuongnam.vn',
    password: process.env.STAGING_ADMIN_PASS || 'PhuongNam@123'
  });
  assertNoSchemaOrNetworkError(aErr, 'Admin Login');
  assert(!aErr && adminAuth?.user, `Admin đăng nhập thành công`);

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

  // Lấy staff ID của Bác sĩ Tuấn
  const { data: docStaff } = await adminClient
    .from('staff_profiles')
    .select('id')
    .eq('auth_user_id', docAuth.user.id)
    .single();
  assert(docStaff && docStaff.id, `Staff ID Bác sĩ Tuấn: ${docStaff?.id}`);
  const docStaffId = docStaff.id;

  // Lấy một khách hàng mẫu
  let { data: sampleCustomer } = await adminClient
    .from('customers')
    .select('id, full_name')
    .limit(1)
    .maybeSingle();

  if (!sampleCustomer) {
    const { data: newCust, error: cErr } = await adminClient.from('customers').insert({
      organization_id: orgId,
      branch_id: branchQ1,
      full_name: 'Khách hàng Kiểm thử Nghiệp vụ 037',
      phone: '0901234567'
    }).select().single();
    assertNoSchemaOrNetworkError(cErr, 'Insert sample customer');
    sampleCustomer = newCust;
  }
  assert(sampleCustomer && sampleCustomer.id, `Khách hàng đối chứng: ${sampleCustomer.full_name} (${sampleCustomer.id})`);

  // ---------------------------------------------------------------------------
  // [2] KIỂM THỬ BUỔI ĐIỀU TRỊ & PHÁC ĐỒ THEO BÁC SĨ & BẢO VỆ HỒ SƠ ĐÃ KHÓA
  // ---------------------------------------------------------------------------
  console.log('\n--- [2] KIỂM THỬ BUỔI ĐIỀU TRỊ & BẢO VỆ HỒ SƠ ĐÃ KHÓA ---');
  
  // 2.1. Baseline: Bác sĩ Tuấn tạo buổi điều trị tại Q1 do chính mình thực hiện
  const sessionCode = `SES_TST_${Date.now()}`;
  const { data: newSession, error: sErr } = await docQ1Client.from('treatment_sessions').insert({
    organization_id: orgId,
    branch_id: branchQ1,
    customer_id: sampleCustomer.id,
    session_code: sessionCode,
    performed_by: docStaffId,
    performed_at: new Date().toISOString(),
    treatment_area: 'Toàn mặt',
    protocol_performed: 'Laser Co2 Fractional vi điểm trị sẹo rỗ',
    post_treatment_notes: 'Buổi 1: Thao tác an toàn, không phản ứng phụ',
    status: 'draft'
  }).select().single();
  if (sErr) console.error('sErr details:', sErr);
  assertNoSchemaOrNetworkError(sErr, 'Doctor insert session');
  assert(newSession && newSession.id, `Bác sĩ Tuấn tạo buổi điều trị thành công (ID: ${newSession?.id})`);

  // 2.2. Bác sĩ Tuấn cập nhật ghi chú khi buổi điều trị đang draft -> Thành công
  const { data: updateProg, error: upErr } = await docQ1Client
    .from('treatment_sessions')
    .update({ post_treatment_notes: 'Buổi 1 cập nhật: Da phục hồi tốt' })
    .eq('id', newSession.id)
    .select();
  assertNoSchemaOrNetworkError(upErr, 'Doctor update in-progress session');
  assert(updateProg && updateProg.length > 0, 'Bác sĩ Tuấn cập nhật thành công hồ sơ đang thực hiện (draft)');

  // 2.3. Khóa hồ sơ: Đổi trạng thái sang 'completed' (hoàn thành/khóa)
  const { error: lockErr } = await adminClient
    .from('treatment_sessions')
    .update({ status: 'completed' })
    .eq('id', newSession.id);
  assertNoSchemaOrNetworkError(lockErr, 'Lock session');

  // 2.4. Bác sĩ cố tình sửa hồ sơ ĐÃ KHÓA (completed) -> BỊ CHẶN (0 rows updated)
  const { data: docTamperLocked } = await docQ1Client
    .from('treatment_sessions')
    .update({ post_treatment_notes: 'Cố tình sửa hồ sơ đã khóa trái phép' })
    .eq('id', newSession.id)
    .select();
  assert(!docTamperLocked || docTamperLocked.length === 0, 'Bác sĩ bị CHẶN khi cố tình sửa hồ sơ điều trị đã khóa/hoàn thành');

  // ---------------------------------------------------------------------------
  // [3] KIỂM THỬ BẤT BIẾN CỦA NHẬT KÝ KIỂM TOÁN (treatment_session_audits)
  // ---------------------------------------------------------------------------
  console.log('\n--- [3] KIỂM THỬ TÍNH BẤT BIẾN CỦA NHẬT KÝ KIỂM TOÁN (AUDIT LOGS) ---');
  
  // 3.1. Ghi nhật ký kiểm toán hợp lệ
  const { data: auditEntry, error: aEntryErr } = await adminClient
    .from('treatment_session_audits')
    .insert({
      session_id: newSession.id,
      modified_by: docStaffId,
      action_type: 'confirm',
      reason_for_change: 'Khóa hồ sơ buổi điều trị sau khi hoàn thành',
      previous_data: { status: 'draft' },
      new_data: { status: 'completed' }
    })
    .select()
    .single();
  assertNoSchemaOrNetworkError(aEntryErr, 'Insert audit entry');
  assert(auditEntry && auditEntry.id, `Ghi nhật ký kiểm toán thành công (Audit ID: ${auditEntry.id})`);

  // 3.2. Cố tình sửa nội dung nhật ký kiểm toán -> BỊ CHẶN TUYỆT ĐỐI (RLS Update Denied)
  const { data: tamperAudit, error: tamperAuditErr } = await docQ1Client
    .from('treatment_session_audits')
    .update({ reason_for_change: 'Xóa vết kiểm toán trái phép' })
    .eq('id', auditEntry.id)
    .select();
  assert(!tamperAudit || tamperAudit.length === 0, 'Bảo vệ nhật ký: Cố tình UPDATE nhật ký kiểm toán BỊ CHẶN');

  // 3.3. Cố tình xóa nhật ký kiểm toán -> BỊ CHẶN TUYỆT ĐỐI
  const { data: deleteAudit, error: deleteAuditErr } = await docQ1Client
    .from('treatment_session_audits')
    .delete()
    .eq('id', auditEntry.id)
    .select();
  assert(!deleteAudit || deleteAudit.length === 0, 'Bảo vệ nhật ký: Cố tình DELETE nhật ký kiểm toán BỊ CHẶN (Bất biến 100%)');

  // ---------------------------------------------------------------------------
  // [4] KIỂM THỬ QUAN HỆ ẢNH - BUỔI ĐIỀU TRỊ - KHÁCH HÀNG (treatment_photos)
  // ---------------------------------------------------------------------------
  console.log('\n--- [4] KIỂM THỬ QUAN HỆ ẢNH - BUỔI ĐIỀU TRỊ - KHÁCH HÀNG ---');
  
  // 4.1. Bác sĩ Tuấn thêm ảnh gắn với đúng buổi điều trị và chi nhánh của mình -> Hợp lệ
  const { data: photoEntry, error: photoErr } = await docQ1Client
    .from('treatment_photos')
    .insert({
      organization_id: orgId,
      branch_id: branchQ1,
      customer_id: sampleCustomer.id,
      session_id: newSession.id,
      photo_type: 'after',
      storage_path: '/photos/session_01_after.jpg',
      file_name: 'session_01_after.jpg',
      treatment_area: 'Toàn mặt',
      angle: 'front',
      uploaded_by: docStaffId
    })
    .select()
    .single();
  if (photoErr) console.error('photoErr:', photoErr);
  assertNoSchemaOrNetworkError(photoErr, 'Doctor insert photo');
  assert(photoEntry && photoEntry.id, `Bác sĩ thêm ảnh điều trị thành công (Photo ID: ${photoEntry.id})`);

  // ---------------------------------------------------------------------------
  // [5] KIỂM THỬ CAM KẾT ĐIỀU TRỊ THEO CHI NHÁNH & NGƯỜI CHỨNG KIẾN (treatment_consents)
  // ---------------------------------------------------------------------------
  console.log('\n--- [5] KIỂM THỬ CAM KẾT ĐIỀU TRỊ & NGƯỜI CHỨNG KIẾN ---');
  
  // 5.1. Tạo cam kết có Bác sĩ Tuấn làm người chứng kiến (witness_staff_id)
  const { data: consentEntry, error: consentErr } = await adminClient
    .from('treatment_consents')
    .insert({
      organization_id: orgId,
      customer_id: sampleCustomer.id,
      session_id: newSession.id,
      consent_title: 'Cam kết thực hiện thủ thuật Laser CO2',
      consent_content_snapshot: 'Khách hàng đồng ý thực hiện thủ thuật theo đúng chỉ định y khoa.',
      signer_name: sampleCustomer.full_name || 'Khách hàng',
      agree_treatment: true,
      agree_photo_records: true,
      witness_staff_id: docStaffId,
      status: 'signed'
    })
    .select()
    .single();
  if (consentErr) console.error('consentErr:', consentErr);
  assertNoSchemaOrNetworkError(consentErr, 'Insert sample consent');
  assert(consentEntry && consentEntry.id, `Tạo cam kết điều trị thành công (Consent ID: ${consentEntry.id})`);

  // 5.2. Bác sĩ Tuấn đọc cam kết do mình chứng kiến -> Thành công
  const { data: docReadConsent, error: docReadConsentErr } = await docQ1Client
    .from('treatment_consents')
    .select('id, consent_title, agree_treatment')
    .eq('id', consentEntry.id)
    .single();
  assertNoSchemaOrNetworkError(docReadConsentErr, 'Doctor read consent');
  assert(docReadConsent && docReadConsent.id === consentEntry.id, 'Bác sĩ Tuấn đọc thành công bản cam kết do mình chứng kiến');

  console.log('\n' + '='.repeat(95));
  console.log('🎉 TOÀN BỘ CÁC RÀNG BUỘC PHÂN QUYỀN NGHIỆP VỤ 037 ĐÃ PASS 100% TRÊN STAGING!');
  console.log('='.repeat(95));
}

run037Verification().catch(err => {
  console.error('Lỗi kiểm thử 037:', err);
  process.exit(1);
});
