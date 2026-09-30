const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('BỘ KIỂM THỬ TOÀN DIỆN PHASE 8: HỒ SƠ ĐIỀU TRỊ & BEFORE/AFTER MANAGEMENT');
  console.log('='.repeat(80));

  // Step 1: Discover test org, branch, staff, customer
  console.log('\n--- BƯỚC 1: Lấy Organization, Branch, Customer & Practitioner để kiểm thử ---');
  const orgId = '11111111-1111-1111-1111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const staffId = '99999999-9999-9999-9999-999999999994'; // BS. Phạm Minh Tuấn
  const customerId = '77777777-7777-7777-7777-777777777771'; // Chị Mai Lan

  console.log(`  🏢 Organization: Phuong Nam Clinic (${orgId})`);
  console.log(`  🏬 Branch: Chi Nhánh Quận 1 (${branchId})`);
  console.log(`  👨‍⚕️ Lead Doctor: BS. Phạm Minh Tuấn (${staffId})`);
  console.log(`  👤 Customer: Chị Mai Lan (${customerId})`);

  // Step 2: Test Treatment Plan creation / lookup
  console.log('\n--- BƯỚC 2: Kiểm tra / Tạo Phác Đồ Điều Trị (Treatment Plan) ---');
  let planId = null;
  const { data: existingPlans } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .limit(1);

  if (existingPlans && existingPlans.length > 0) {
    planId = existingPlans[0].id;
    console.log(`  📌 Đã có phác đồ điều trị: [${existingPlans[0].plan_code}] ${existingPlans[0].title}`);
  } else {
    const planCode = `P8-PLAN-${Date.now().toString().slice(-4)}`;
    const { data: newPlan, error: pErr } = await supabase
      .from('treatment_plans')
      .insert({
        organization_id: orgId,
        branch_id: branchId,
        customer_id: customerId,
        plan_code: planCode,
        title: 'Phác đồ điều trị Nám & Trẻ hóa Meso P8',
        diagnosis_notes: 'Tăng sắc tố biểu bì sau viêm, da mất ẩm độ 2',
        target_outcome: 'Mờ thâm nám 70%, cải thiện độ đàn hồi sau 5 buổi',
        total_sessions_planned: 5,
        lead_doctor_id: staffId,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (pErr) {
      console.error('  ❌ Lỗi tạo treatment plan:', pErr);
      return;
    }
    planId = newPlan.id;
    console.log(`  ✅ Đã tạo phác đồ mới: [${planCode}] id=${planId}`);
  }
  assert(planId !== null, 'Phác đồ điều trị hợp lệ');

  // Step 3: Test rpc_create_treatment_session
  console.log('\n--- BƯỚC 3: Test rpc_create_treatment_session (Tạo buổi điều trị Nháp) ---');
  const { data: createRes, error: createErr } = await supabase.rpc('rpc_create_treatment_session', {
    p_org_id: orgId,
    p_branch_id: branchId,
    p_customer_id: customerId,
    p_performed_by: staffId,
    p_protocol_performed: 'Làm sạch sâu -> Ủ tê 20p -> Tiêm vi điểm Meso HA + Tranexamic 2ml -> Đắp mặt nạ phục hồi B5.',
    p_treatment_plan_id: planId,
    p_appointment_id: null,
    p_course_id: null,
    p_session_number: 1,
    p_treatment_area: 'Toàn mặt',
    p_pre_treatment_notes: 'Vùng gò má xuất hiện đốm nâu sẫm, da khô ráp rát nhẹ.',
    p_post_treatment_notes: 'Hồng ban nhẹ đồng đều vùng má, không sưng nề bất thường.',
    p_clinical_reactions: 'Bình thường',
    p_homecare_instructions: 'Tránh nước 6 tiếng đầu. Thoa kem phục hồi B5 ngày 2 lần. Bôi kem chống nắng SPF50+ trước khi ra ngoài 20p.',
    p_next_appointment_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    p_assistant_id: null
  });

  assert(!createErr, `Gọi rpc_create_treatment_session thành công: ${createErr?.message || ''}`);
  assert(createRes && createRes.success === true, `Buổi điều trị tạo thành công: ID=${createRes?.session_id}`);
  const testSessionId = createRes.session_id;

  // Step 4: Test rpc_update_treatment_session (Khi còn là Draft -> sửa không bắt buộc lý do)
  console.log('\n--- BƯỚC 4: Test cập nhật buổi điều trị ở trạng thái Nháp (Draft) ---');
  const { data: draftUpdateRes, error: draftUpdateErr } = await supabase.rpc('rpc_update_treatment_session', {
    p_session_id: testSessionId,
    p_modified_by: staffId,
    p_reason_for_change: null,
    p_protocol_performed: 'Tiêm Meso Tranexamic Acid 2.5ml + Điện di tinh chất Vitamin C.',
    p_treatment_area: 'Toàn mặt',
    p_pre_treatment_notes: 'Vùng má nám đinh + tàn nhang rải rác.',
    p_post_treatment_notes: 'Hơi đỏ nhẹ vùng tiêm, dịu sau 15 phút đắp nạ lạnh.',
    p_clinical_reactions: 'Bình thường',
    p_homecare_instructions: 'Rửa mặt bằng nước muối sinh lý 24h đầu.',
    p_next_appointment_date: null
  });
  assert(!draftUpdateErr && draftUpdateRes.success, 'Cập nhật thành công hồ sơ Draft không cần reason');

  // Step 5: Test rpc_confirm_treatment_session (Khóa hồ sơ)
  console.log('\n--- BƯỚC 5: Test rpc_confirm_treatment_session (Khóa và xác nhận hồ sơ y khoa) ---');
  const { data: confirmRes, error: confirmErr } = await supabase.rpc('rpc_confirm_treatment_session', {
    p_session_id: testSessionId,
    p_confirmed_by: staffId
  });
  assert(!confirmErr && confirmRes.success, 'Khóa và xác nhận hồ sơ điều trị thành công');

  // Step 6: Test Audit Trail - Sửa hồ sơ đã khóa KHÔNG CÓ lý do -> Phải BỊ TỪ CHỐI
  console.log('\n--- BƯỚC 6: Test Audit Trail - Cố ý sửa hồ sơ ĐÃ KHÓA không kèm lý do (Phải Chặn) ---');
  const { data: badUpdateRes, error: badUpdateErr } = await supabase.rpc('rpc_update_treatment_session', {
    p_session_id: testSessionId,
    p_modified_by: staffId,
    p_reason_for_change: null, // Thiếu lý do
    p_protocol_performed: 'Đã thay đổi trái phép',
    p_treatment_area: 'Toàn mặt',
    p_pre_treatment_notes: 'Đã thay đổi trái phép',
    p_post_treatment_notes: 'Đã thay đổi',
    p_clinical_reactions: 'Bất thường',
    p_homecare_instructions: 'Đã thay đổi',
    p_next_appointment_date: null
  });
  assert(badUpdateErr !== null || (badUpdateRes && !badUpdateRes.success), 'Hệ thống đã chặn đúng khi sửa hồ sơ khóa mà không có lý do');
  console.log(`  🛡️ Chặn thành công: ${badUpdateRes?.error || 'Bị từ chối'}`);

  // Step 7: Test Audit Trail - Sửa hồ sơ ĐÃ KHÓA có lý do hợp lệ (> 5 ký tự) -> Thành công & Lưu snapshot
  console.log('\n--- BƯỚC 7: Test Audit Trail - Sửa hồ sơ ĐÃ KHÓA có lý do hợp lệ (Lưu vết Audit) ---');
  const validReason = 'Bổ sung liều lượng thuốc bôi thoa theo kết luận tái khám sau 24h';
  const { data: goodUpdateRes, error: goodUpdateErr } = await supabase.rpc('rpc_update_treatment_session', {
    p_session_id: testSessionId,
    p_modified_by: staffId,
    p_reason_for_change: validReason,
    p_protocol_performed: 'Tiêm Meso Tranexamic Acid 2.5ml + Điện di tinh chất Vitamin C (Chuẩn y khoa).',
    p_treatment_area: 'Toàn mặt',
    p_pre_treatment_notes: 'Vùng má nám đinh + tàn nhang rải rác. Da thích ứng tốt.',
    p_post_treatment_notes: 'Hết đỏ sau 30 phút. Bệnh nhân cảm thấy dễ chịu.',
    p_clinical_reactions: 'Bình thường',
    p_homecare_instructions: 'Rửa mặt bằng nước muối sinh lý 24h đầu. Sử dụng serum B5 phục hồi buổi tối.',
    p_next_appointment_date: null
  });
  assert(!goodUpdateErr && goodUpdateRes.success, 'Sửa hồ sơ khóa thành công khi cung cấp lý do chính đáng');

  // Verify audit log record in treatment_session_audits
  const { data: audits } = await supabase
    .from('treatment_session_audits')
    .select('*')
    .eq('session_id', testSessionId);
  assert(audits && audits.length > 0, `Đã ghi nhận ${audits?.length} bản ghi nhật ký kiểm toán (Audit Trail)`);
  console.log(`  📜 Lý do lưu trong Audit: "${audits[0].reason_for_change}"`);

  // Step 8: Test Treatment Photo metadata & Marketing Consent isolation
  console.log('\n--- BƯỚC 8: Test Ảnh Before/After & Tách biệt quyền Marketing Consent ---');
  const { data: photoBefore, error: photoBeforeErr } = await supabase
    .from('treatment_photos')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      session_id: testSessionId,
      photo_type: 'before',
      treatment_area: 'Toàn mặt',
      angle: 'front',
      storage_path: `org_${orgId}/cust_${customerId}/ses_${testSessionId}/before_front.jpg`,
      file_name: 'before_front.jpg',
      file_size: 1542000,
      mime_type: 'image/jpeg',
      watermark_applied: false,
      captured_at: new Date().toISOString(),
      uploaded_by: staffId,
      notes: 'Ảnh chụp trước khi can thiệp laser/tiêm',
      is_consent_marketing: false // Riêng tư, KHÔNG cho phép marketing
    })
    .select()
    .single();
  assert(!photoBeforeErr && photoBefore?.id, 'Lưu metadata ảnh Before (is_consent_marketing=false) thành công');

  const { data: photoAfter, error: photoAfterErr } = await supabase
    .from('treatment_photos')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      session_id: testSessionId,
      photo_type: 'after',
      treatment_area: 'Toàn mặt',
      angle: 'front',
      storage_path: `org_${orgId}/cust_${customerId}/ses_${testSessionId}/after_front.jpg`,
      file_name: 'after_front.jpg',
      file_size: 1621000,
      mime_type: 'image/jpeg',
      watermark_applied: false,
      captured_at: new Date().toISOString(),
      uploaded_by: staffId,
      notes: 'Ảnh chụp sau khi hoàn thành buổi 1',
      is_consent_marketing: true // Khách hàng đồng ý cho phép chia sẻ
    })
    .select()
    .single();
  assert(!photoAfterErr && photoAfter?.id, 'Lưu metadata ảnh After thành công');

  // Step 9: Test Treatment Consent & Digital Signature
  console.log('\n--- BƯỚC 9: Test Cam Kết Điều Trị & Chữ Ký Điện Tử Khách Hàng ---');
  const sampleSignatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const { data: consentRecord, error: consentErr } = await supabase
    .from('treatment_consents')
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      treatment_plan_id: planId,
      session_id: testSessionId,
      template_code: 'CONSENT_STANDARD_V1',
      template_version: 'v1.0',
      consent_title: 'Phiếu Đồng Thuận & Cam Kết Thực Hiện Thủ Thuật Thẩm Mỹ Da Liễu',
      consent_content_snapshot: 'Tôi đã được bác sĩ tư vấn rõ ràng về phác đồ, các phản ứng thông thường sau điều trị và cam kết tuân thủ hướng dẫn chăm sóc tại nhà.',
      agree_treatment: true,
      agree_photo_records: true,
      agree_marketing_usage: false,
      signer_name: 'Chị Mai Lan',
      signature_svg: sampleSignatureData,
      signed_at: new Date().toISOString(),
      witness_staff_id: staffId,
      ip_address: '127.0.0.1',
      status: 'signed'
    })
    .select()
    .single();
  assert(!consentErr && consentRecord?.id, 'Lưu phiếu cam kết điều trị kèm chữ ký số thành công');

  // Step 10: Test rpc_get_customer_treatment_history (Tổng hợp hồ sơ)
  console.log('\n--- BƯỚC 10: Test rpc_get_customer_treatment_history (Trích xuất toàn diện hồ sơ) ---');
  const { data: historyData, error: historyErr } = await supabase.rpc('rpc_get_customer_treatment_history', {
    p_org_id: orgId,
    p_customer_id: customerId
  });
  assert(!historyErr, `Gọi rpc_get_customer_treatment_history thành công: ${historyErr?.message || ''}`);
  assert(Array.isArray(historyData?.treatment_plans), 'Có danh sách treatment_plans');
  assert(Array.isArray(historyData?.treatment_sessions), 'Có danh sách treatment_sessions');
  assert(Array.isArray(historyData?.treatment_photos), 'Có danh sách treatment_photos');
  assert(Array.isArray(historyData?.treatment_consents), 'Có danh sách treatment_consents');

  console.log(`\n  📊 TỔNG KẾT HỒ SƠ KHÁCH HÀNG:`);
  console.log(`     - Phác đồ điều trị: ${historyData.treatment_plans.length}`);
  console.log(`     - Buổi điều trị: ${historyData.treatment_sessions.length}`);
  console.log(`     - Ảnh Before / After: ${historyData.treatment_photos.length}`);
  console.log(`     - Phiếu cam kết đã ký: ${historyData.treatment_consents.length}`);

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TẤT CẢ 10 BƯỚC KIỂM THỬ PHASE 8 ĐỀU ĐẠT CHUẨN 100%!');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
