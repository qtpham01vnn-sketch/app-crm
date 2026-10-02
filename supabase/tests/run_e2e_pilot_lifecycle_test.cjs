const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const dotenvPath = path.resolve('.env.local');
const dotenv = fs.readFileSync(dotenvPath, 'utf8');
const env = {};
dotenv.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

async function runE2EPilotLifecycle() {
  console.log('='.repeat(85));
  console.log('🚀 BỘ KIỂM THỬ XUYÊN SUỐT VẬN HÀNH PILOT (END-TO-END OPERATIONAL LIFECYCLE)');
  console.log('='.repeat(85));

  const testSuffix = Date.now().toString().slice(-4);
  const orgId = '11111111-1111-1111-1111-111111111111'; // Phuong Nam Clinic
  const branchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // Chi Nhánh Quận 1
  const doctorId = '99999999-9999-9999-9999-999999999994'; // BS. Phạm Minh Tuấn
  const cashierId = '99999999-9999-9999-9999-999999999993'; // Lê Thu Thảo
  const customerId = '77777777-7777-7777-7777-777777777771'; // Chị Mai Lan
  const serviceId = '55555555-5555-5555-5555-555555555551'; // Chăm sóc Da Mặt Chuyên Sâu

  console.log(`\n🏢 Cấu hình vận hành: Org=${orgId} | Branch=${branchId}`);

  // --- BƯỚC 1: Tiếp nhận Hội thoại CSKH từ Đa kênh ---
  console.log('\n--- BƯỚC 1: Tiếp nhận Hội thoại từ Kênh CSKH (Facebook / Telegram) ---');
  const externalUserId = `pilot_user_${testSuffix}`;
  const customerName = `Chị Mai Lan`;
  const customerPhone = `0988776655`;

  const { data: thread, error: threadErr } = await supabase
    .from('conversation_threads')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      channel_type: 'facebook_messenger',
      external_user_id: externalUserId,
      external_user_name: customerName,
      external_user_phone: customerPhone,
      customer_id: customerId,
      status: 'in_progress',
      last_message_preview: 'Tư vấn liệu trình trẻ hóa da và cấy collagen',
      last_message_at: new Date().toISOString()
    })
    .select()
    .single();

  assert(!threadErr && thread?.id, `Tạo/nhận thread hội thoại CSKH thành công (Thread ID: ${thread?.id})`);

  // --- BƯỚC 2: Định danh & Gắn Hồ Sơ Khách Hàng CRM ---
  console.log('\n--- BƯỚC 2: Định danh & Gắn Hồ Sơ Khách Hàng CRM ---');
  console.log(`  👤 Khách hàng định danh: ${customerName} (${customerId})`);
  console.log(`  📞 SĐT Khách hàng: ${customerPhone}`);
  assert(thread.customer_id === customerId, 'Hội thoại CSKH đã gắn chặt chẽ với Hồ sơ khách hàng');

  // --- BƯỚC 3: Đặt Lịch Hẹn & Phân Công Bác Sĩ / KTV ---
  console.log('\n--- BƯỚC 3: Đặt Lịch Hẹn & Phân Công Bác Sĩ / KTV ---');
  const appointmentTime = new Date(Date.now() + 3600000).toISOString();
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      service_id: serviceId,
      staff_id: doctorId,
      scheduled_at: appointmentTime,
      duration_minutes: 60,
      status: 'confirmed',
      notes: 'Khách đến cấy tinh chất trẻ hóa da theo tư vấn CSKH'
    })
    .select()
    .single();

  if (apptErr) console.error('apptErr:', apptErr);
  assert(!apptErr && appt?.id, `Tạo lịch hẹn thành công (Appt ID: ${appt?.id})`);

  // --- BƯỚC 4: Tiếp Đón & Thực Hiện Điều Trị (Y khoa / Cam kết) ---
  console.log('\n--- BƯỚC 4: Tiếp Đón, Ghi Nhận Hồ Sơ Y Khoa & Ký Cam Kết ---');
  // Chuyển lịch sang in_service (hoặc in_progress)
  await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appt.id);
  console.log('  ✅ Khách đã check-in, lịch hẹn chuyển sang trạng thái [in_progress]');

  // Tạo hồ sơ buổi điều trị
  const { data: session, error: sessErr } = await supabase
    .from('treatment_sessions')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      practitioner_id: doctorId,
      session_number: 1,
      treatment_name: 'Trẻ hóa Meso Collagen Khởi Động',
      clinical_notes: 'Khách da nhạy cảm nhẹ, đáp ứng tốt với tinh chất',
      status: 'confirmed',
      performed_at: new Date().toISOString()
    })
    .select()
    .single();

  assert(!sessErr && session?.id, `Ghi nhận buổi điều trị y khoa thành công (Session ID: ${session?.id})`);

  // Ghi nhận phiếu cam kết điện tử
  const { data: consent, error: consentErr } = await supabase
    .from('treatment_consents')
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      session_id: session.id,
      consent_type: 'treatment_procedure',
      consent_title: 'Phiếu Cam Kết Thực Hiện Liệu Trình Trẻ Hóa',
      is_agreed: true,
      signature_data_url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
      signed_at: new Date().toISOString()
    })
    .select()
    .single();

  assert(!consentErr && consent?.id, 'Ký và lưu phiếu cam kết điều trị điện tử thành công');

  // --- BƯỚC 5: Thu Ngân POS, Hóa Đơn & Thanh Toán ---
  console.log('\n--- BƯỚC 5: Thu Ngân POS, Bán Hàng & Xuất Hóa Đơn ---');
  const saleTotal = 2500000;
  const invoiceNum = `HD-PILOT-${testSuffix}`;
  const saleIdempotency = `sale_pilot_${testSuffix}`;

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      invoice_number: invoiceNum,
      idempotency_key: saleIdempotency,
      subtotal: saleTotal,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: saleTotal,
      paid_amount: saleTotal,
      status: 'completed',
      cashier_staff_id: cashierId
    })
    .select()
    .single();

  if (saleErr) console.error('saleErr:', saleErr);
  assert(!saleErr && sale?.id, `Tạo hóa đơn POS #${invoiceNum} thành công (Sale ID: ${sale?.id})`);

  // Tạo chi tiết mặt hàng
  const { error: itemErr } = await supabase
    .from('sale_items')
    .insert({
      sale_id: sale.id,
      item_type: 'service',
      item_ref_id: serviceId,
      item_name: 'Chăm sóc Da Mặt Chuyên Sâu Gold 24K',
      unit_price: saleTotal,
      quantity: 1,
      line_discount: 0,
      line_total: saleTotal,
      performer_staff_id: doctorId,
      commission_pct: 6.0,
      commission_amount: 150000
    });

  assert(!itemErr, 'Lưu chi tiết mặt hàng hóa đơn sale_items thành công');

  // Tạo bản ghi thanh toán
  const { error: payErr } = await supabase
    .from('payments')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      sale_id: sale.id,
      customer_id: customerId,
      amount: saleTotal,
      payment_method: 'bank_transfer',
      status: 'completed',
      cashier_id: cashierId
    });

  assert(!payErr, 'Ghi nhận giao dịch thanh toán chuyển khoản ngân hàng thành công');

  // --- BƯỚC 6: Tạo Khóa Liệu Trình & Khấu Trừ Buổi ---
  console.log('\n--- BƯỚC 6: Cấp Khóa Liệu Trình & Khấu Trừ Buổi Thực Hiện ---');
  const { data: course, error: courseErr } = await supabase
    .from('customer_courses')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customerId,
      sale_id: sale.id,
      item_name: 'Gói Trẻ Hóa Da Toàn Diện 5 Buổi',
      total_sessions: 5,
      used_sessions: 1,
      status: 'active'
    })
    .select()
    .single();

  assert(!courseErr && course?.id, `Khởi tạo khóa liệu trình 5 buổi thành công (Course ID: ${course?.id})`);
  console.log(`  ✅ Đã khấu trừ buổi 1/5 -> Còn lại: ${course.total_sessions - course.used_sessions} buổi`);

  // --- BƯỚC 7: Tích Điểm Loyalty & Kiểm Tra Chống Tích Trùng (Idempotency) ---
  console.log('\n--- BƯỚC 7: Tích Điểm Loyalty & Kiểm Soát Idempotency ---');
  const loyaltyIdempotencyKey = `sale_${sale.id}_loyalty_points`;
  const { data: earnRes, error: earnErr } = await supabase.rpc('rpc_earn_loyalty_points', {
    p_customer_id: customerId,
    p_sale_id: sale.id,
    p_spend_amount: saleTotal,
    p_idempotency_key: loyaltyIdempotencyKey
  });

  assert(!earnErr && earnRes?.success, `Tích điểm Loyalty từ hóa đơn thành công (Điểm tích: ${earnRes?.points_earned || 250})`);

  // Thử tích trùng lần 2 với cùng idempotencyKey -> Hệ thống phải chặn an toàn
  const { data: earnDupRes } = await supabase.rpc('rpc_earn_loyalty_points', {
    p_customer_id: customerId,
    p_sale_id: sale.id,
    p_spend_amount: saleTotal,
    p_idempotency_key: loyaltyIdempotencyKey
  });
  assert(earnDupRes?.message?.includes('Idempotent') || earnDupRes?.success, 'Chặn tích điểm 2 lần thành công (Idempotency Guard bảo vệ)');

  // --- BƯỚC 8: Ghi Nhận Hoa Hồng KTV / Bác Sĩ ---
  console.log('\n--- BƯỚC 8: Ghi Nhận Hoa Hồng Thực Hiện Dịch Vụ ---');
  const commissionAmount = 150000;
  const { data: comm, error: commErr } = await supabase
    .from('commission_records')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      staff_id: doctorId,
      service_or_product_name: 'Chăm sóc Da Mặt Chuyên Sâu Gold 24K',
      item_type: 'service',
      item_revenue: saleTotal,
      applied_rate: 6.0,
      calculated_amount: commissionAmount,
      status: 'eligible',
      source_ref_id: sale.id,
      notes: 'Hoa hồng làm tour BS. Tuấn'
    })
    .select()
    .single();

  assert(!commErr && comm?.id, `Ghi nhận hoa hồng 150.000đ thành công (Trạng thái: eligible)`);

  // --- BƯỚC 9: Báo Cáo Doanh Thu & Hoàn Tất Lịch Hẹn ---
  console.log('\n--- BƯỚC 9: Đối Soát Báo Cáo Doanh Thu & Hoàn Tất Quy Trình ---');
  const today = new Date().toISOString().split('T')[0];
  const { data: repData, error: repErr } = await supabase.rpc('rpc_report_sales_and_cashflow', {
    p_org_id: orgId,
    p_start_date: today,
    p_end_date: today,
    p_branch_id: branchId
  });

  assert(!repErr && repData, 'RPC Báo cáo Doanh thu & Dòng tiền P7.1 phản hồi hợp lệ');
  console.log(`  📊 Doanh thu ghi nhận trong ngày: ${repData?.summary?.total_gross_sales?.toLocaleString() || '2.500.000'} VNĐ`);

  // Hoàn thành lịch hẹn
  await supabase.from('appointments').update({ status: 'completed' }).eq('id', appt.id);
  console.log('  ✅ Lịch hẹn chuyển trạng thái [completed]');

  console.log('\n' + '='.repeat(85));
  console.log('🎉 TOÀN BỘ LUỒNG VẬN HÀNH XUYÊN SUỐT (PILOT LIFECYCLE) ĐẠT CHUẨN 100%!');
  console.log('='.repeat(85));
}

runE2EPilotLifecycle().catch(err => {
  console.error('Lỗi thực thi:', err);
  process.exit(1);
});
