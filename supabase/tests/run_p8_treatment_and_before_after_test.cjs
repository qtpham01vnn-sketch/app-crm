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
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name').limit(1);
  if (orgErr || !orgs || orgs.length === 0) {
    console.error('Không tìm thấy organization trong DB:', orgErr);
    return;
  }
  const orgId = orgs[0].id;
  console.log(`  🏢 Organization: ${orgs[0].name} (${orgId})`);

  const { data: branches } = await supabase.from('branches').select('id, name, org_id').limit(1);
  const branchId = branches && branches.length > 0 ? branches[0].id : null;
  const testOrgId = branches && branches.length > 0 && branches[0].org_id ? branches[0].org_id : orgId;
  console.log(`  🏬 Branch: ${branches?.[0]?.name || 'N/A'} (${branchId})`);

  let { data: customers } = await supabase.from('customers').select('id, full_name, phone').limit(1);
  let customerId = customers && customers.length > 0 ? customers[0].id : null;

  if (!customerId) {
    console.log('  ⚠️ Chưa có customer trong DB, tiến hành tạo customer mẫu cho test...');
    const { data: newCust, error: custErr } = await supabase.from('customers').insert({
      org_id: testOrgId,
      branch_id: branchId,
      full_name: 'Nguyễn Thị Minh Hạnh',
      phone: '0908123456',
      email: 'minhhanh.test@phuongnam.vn',
      vip_tier: 'gold',
      gender: 'female',
      notes: 'Khách hàng thử nghiệm P8 Hồ sơ điều trị'
    }).select().single();

    if (custErr) {
      console.error('Không thể tạo test customer:', custErr);
      return;
    }
    customerId = newCust.id;
    customers = [newCust];
  }
  console.log(`  👤 Customer: ${customers?.[0]?.full_name || 'N/A'} (${customerId})`);

  // Step 2: Test Treatment Plan creation / lookup
  console.log('\n--- BƯỚC 2: Kiểm tra / Tạo Phác Đồ Điều Trị (Treatment Plan) ---');
  let planId = null;
  const { data: existingPlans } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('org_id', orgId)
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
        org_id: orgId,
        branch_id: branchId,
        customer_id: customerId,
        plan_code: planCode,
        title: 'Phác đồ điều trị Nám & Trẻ hóa Meso P8',
        diagnosis: 'Tăng sắc tố biểu bì sau viêm, da mất ẩm độ 2',
        treatment_goal: 'Mờ thâm nám 70%, cải thiện độ đàn hồi sau 5 buổi',
        total_sessions: 5,
        completed_sessions: 0,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (pErr) {
      console.warn('  ⚠️ Note: Có thể chưa áp dụng migration 030 trên remote DB:', pErr.message);
      console.log('  👉 Vui lòng dán file `030_p8_treatment_records_and_before_after.sql` vào Supabase SQL Editor.');
      return;
    }
    planId = newPlan.id;
    console.log(`  ✅ Đã tạo phác đồ mới: [${planCode}] id=${planId}`);
  }
  assert(planId !== null, 'Phác đồ điều trị hợp lệ');

  // Step 3: Test rpc_create_treatment_session
  console.log('\n--- BƯỚC 3: Test rpc_create_treatment_session (Tạo buổi điều trị Nháp) ---');
  const sessionCode = `SES-P8-${Date.now().toString().slice(-4)}`;
  const { data: createRes, error: createErr } = await supabase.rpc('rpc_create_treatment_session', {
    p_org_id: orgId,
    p_branch_id: branchId,
    p_customer_id: customerId,
    p_plan_id: planId,
    p_session_number: 1,
    p_session_code: sessionCode,
    p_practitioner_id: null,
    p_practitioner_name: 'Bác Sĩ Nguyễn Văn A',
    p_performed_at: new Date().toISOString(),
    p_symptoms_before: 'Vùng gò má xuất hiện đốm nâu sẫm, da khô ráp rát nhẹ.',
    p_treatment_details: 'Làm sạch sâu $\\rightarrow$ Ủ tê 20p $\\rightarrow$ Tiêm vi điểm Meso HA + Tranexamic 2ml $\\rightarrow$ Đắp mặt nạ phục hồi B5.',
    p_reactions_after: 'Hồng ban nhẹ đồng đều vùng má, không sưng nề bất thường.',
    p_vital_signs: { bp: '120/80', pulse: '78', skin_temp: '36.5' },
    p_supplies_used: [
      { item_name: 'Serum Meso HA+', quantity: 1, unit: 'lọ' },
      { item_name: 'Kim tiêm 34G nano', quantity: 2, unit: 'cái' }
    ],
    p_homecare_instructions: 'Tránh nước 6 tiếng đầu. Thoa kem phục hồi B5 ngày 2 lần. Bôi kem chống nắng SPF50+ trước khi ra ngoài 20p.',
    p_status: 'draft',
    p_created_by: null
  });

  assert(!createErr, `Gọi rpc_create_treatment_session thành công: ${createErr?.message || ''}`);
  assert(createRes && createRes.success === true, `Buổi điều trị tạo thành công: ID=${createRes?.session_id}`);
  const testSessionId = createRes.session_id;

  // Step 4: Test rpc_update_treatment_session (Khi còn là Draft -> sửa không bắt buộc lý do)
  console.log('\n--- BƯỚC 4: Test cập nhật buổi điều trị ở trạng thái Nháp (Draft) ---');
  const { data: draftUpdateRes, error: draftUpdateErr } = await supabase.rpc('rpc_update_treatment_session', {
    p_session_id: testSessionId,
    p_practitioner_id: null,
    p_practitioner_name: 'Bác Sĩ Nguyễn Văn A - Chuyên Khoa Da Liễu',
    p_performed_at: new Date().toISOString(),
    p_symptoms_before: 'Vùng má nám đinh + tàn nhang rải rác.',
    p_treatment_details: 'Tiêm Meso Tranexamic Acid 2.5ml + Điện di tinh chất Vitamin C.',
    p_reactions_after: 'Hơi đỏ nhẹ vùng tiêm, dịu sau 15 phút đắp nạ lạnh.',
    p_vital_signs: { bp: '118/78', pulse: '75' },
    p_supplies_used: [{ item_name: 'Meso TA 2.5ml', quantity: 1, unit: 'ống' }],
    p_homecare_instructions: 'Rửa mặt bằng nước muối sinh lý 24h đầu.',
    p_reason_for_change: null,
    p_updated_by: null
  });
  assert(!draftUpdateErr && draftUpdateRes.success, 'Cập nhật thành công hồ sơ Draft không cần reason');

  // Step 5: Test rpc_confirm_treatment_session (Khóa hồ sơ)
  console.log('\n--- BƯỚC 5: Test rpc_confirm_treatment_session (Khóa và xác nhận hồ sơ y khoa) ---');
  const { data: confirmRes, error: confirmErr } = await supabase.rpc('rpc_confirm_treatment_session', {
    p_session_id: testSessionId,
    p_confirmed_by: null
  });
  assert(!confirmErr && confirmRes.success, 'Khóa và xác nhận hồ sơ điều trị thành công');

  // Step 6: Test Audit Trail - Sửa hồ sơ đã khóa KHÔNG CÓ lý do -> Phải BỊ TỪ CHỐI
  console.log('\n--- BƯỚC 6: Test Audit Trail - Cố ý sửa hồ sơ ĐÃ KHÓA không kèm lý do (Phải Chặn) ---');
  const { data: badUpdateRes, error: badUpdateErr } = await supabase.rpc('rpc_update_treatment_session', {
    p_session_id: testSessionId,
    p_practitioner_id: null,
    p_practitioner_name: 'Bác Sĩ Cố Tình Sửa',
    p_performed_at: new Date().toISOString(),
    p_symptoms_before: 'Đã thay đổi trái phép',
    p_treatment_details: 'Đã thay đổi trái phép',
    p_reactions_after: 'Đã thay đổi',
    p_vital_signs: {},
    p_supplies_used: [],
    p_homecare_instructions: 'Đã thay đổi',
    p_reason_for_change: null, // Thiếu lý do
    p_updated_by: null
  });
  assert(badUpdateErr !== null || (badUpdateRes && !badUpdateRes.success), 'Hệ thống đã chặn đúng khi sửa hồ sơ khóa mà không có lý do');
  console.log(`  🛡️ Chặn thành công: ${badUpdateErr?.message || 'Bị từ chối'}`);

  // Step 7: Test Audit Trail - Sửa hồ sơ đã khóa CÓ lý do hợp lệ (> 5 ký tự) -> Thành công & Lưu snapshot
  console.log('\n--- BƯỚC 7: Test Audit Trail - Sửa hồ sơ ĐÃ KHÓA có lý do hợp lệ (Lưu vết Audit) ---');
  const validReason = 'Bổ sung liều lượng thuốc bôi thoa theo kết luận tái khám sau 24h';
  const { data: goodUpdateRes, error: goodUpdateErr } = await supabase.rpc('rpc_update_treatment_session', {
    p_session_id: testSessionId,
    p_practitioner_id: null,
    p_practitioner_name: 'Bác Sĩ Nguyễn Văn A - Chuyên Khoa Da Liễu',
    p_performed_at: new Date().toISOString(),
    p_symptoms_before: 'Vùng má nám đinh + tàn nhang rải rác. Da thích ứng tốt.',
    p_treatment_details: 'Tiêm Meso Tranexamic Acid 2.5ml + Điện di tinh chất Vitamin C (Chuẩn y khoa).',
    p_reactions_after: 'Hết đỏ sau 30 phút. Bệnh nhân cảm thấy dễ chịu.',
    p_vital_signs: { bp: '118/78', pulse: '75' },
    p_supplies_used: [{ item_name: 'Meso TA 2.5ml', quantity: 1, unit: 'ống' }],
    p_homecare_instructions: 'Rửa mặt bằng nước muối sinh lý 24h đầu. Sử dụng serum B5 phục hồi buổi tối.',
    p_reason_for_change: validReason,
    p_updated_by: null
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
      org_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      session_id: testSessionId,
      photo_type: 'before',
      treatment_area: 'face',
      angle: 'front',
      storage_path: `org_${orgId}/cust_${customerId}/ses_${testSessionId}/before_front.jpg`,
      file_name: 'before_front.jpg',
      file_size: 1542000,
      mime_type: 'image/jpeg',
      watermark_applied: false,
      captured_at: new Date().toISOString(),
      notes: 'Ảnh chụp trước khi can thiệp laser/tiêm',
      is_consent_marketing: false // Riêng tư, KHÔNG cho phép marketing
    })
    .select()
    .single();
  assert(!photoBeforeErr && photoBefore?.id, 'Lưu metadata ảnh Before (is_consent_marketing=false) thành công');

  const { data: photoAfter, error: photoAfterErr } = await supabase
    .from('treatment_photos')
    .insert({
      org_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      session_id: testSessionId,
      photo_type: 'after',
      treatment_area: 'face',
      angle: 'front',
      storage_path: `org_${orgId}/cust_${customerId}/ses_${testSessionId}/after_front.jpg`,
      file_name: 'after_front.jpg',
      file_size: 1621000,
      mime_type: 'image/jpeg',
      watermark_applied: false,
      captured_at: new Date().toISOString(),
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
      org_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      session_id: testSessionId,
      consent_type: 'treatment_procedure',
      consent_title: 'Phiếu Đồng Thuận & Cam Kết Thực Hiện Thủ Thuật Thẩm Mỹ Da Liễu',
      consent_text: 'Tôi đã được bác sĩ tư vấn rõ ràng về phác đồ, các phản ứng thông thường sau điều trị và cam kết tuân thủ hướng dẫn chăm sóc tại nhà.',
      signer_name: customers[0].full_name,
      signature_svg: sampleSignatureData,
      signed_at: new Date().toISOString(),
      ip_address: '127.0.0.1',
      is_consent_marketing: false
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
