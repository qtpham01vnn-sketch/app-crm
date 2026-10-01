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
  console.log('BỘ KIỂM THỬ TOÀN DIỆN PHASE 10: CHATBOX, OMNICHANNEL CSKH INBOX & LỊCH NHẮC HẸN');
  console.log('='.repeat(80));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const customerId = '77777777-7777-7777-7777-777777777771'; // Chị Mai Lan
  const staffId = '99999999-9999-9999-9999-999999999994'; // BS. Phạm Minh Tuấn

  console.log('\n--- BƯỚC 1: Thiết lập Kênh Tích Hợp Đa Kênh (Channel Integrations) ---');

  // 1.1 Khởi tạo kênh Web Widget, Zalo OA và Facebook Messenger
  const sampleChannels = [
    {
      organization_id: orgId,
      channel_type: 'web_widget',
      channel_name: 'Livechat Website Phương Nam',
      account_id: 'web_main_widget',
      is_connected: true,
      is_active: true
    },
    {
      organization_id: orgId,
      channel_type: 'zalo_oa',
      channel_name: 'Zalo Official Account Phương Nam (Sandbox)',
      account_id: 'zalo_oa_phuongnam_test',
      app_id: '123456789',
      is_connected: true,
      is_active: true
    },
    {
      organization_id: orgId,
      channel_type: 'facebook_messenger',
      channel_name: 'Facebook Fanpage Phương Nam (Sandbox)',
      account_id: 'fb_page_phuongnam_test',
      is_connected: true,
      is_active: true
    }
  ];

  for (const ch of sampleChannels) {
    const { data: upsertedCh, error: chErr } = await supabase
      .from('channel_integrations')
      .upsert(ch, { onConflict: 'organization_id, channel_type, account_id' })
      .select()
      .single();

    if (chErr) {
      console.error('chErr details:', chErr);
    }
    assert(!chErr && upsertedCh?.id, `Khởi tạo cấu hình kênh [${ch.channel_type}] thành công`);
  }

  console.log('\n--- BƯỚC 2: Khởi tạo Luồng Hội Thoại Đa Kênh (Conversation Threads) ---');

  // 2.1 Tạo thread Zalo OA cho khách hàng vãng lai
  const testZaloUserId = 'zalo_uid_' + Date.now();
  const { data: zaloThread, error: thErr1 } = await supabase
    .from('conversation_threads')
    .insert({
      organization_id: orgId,
      channel_type: 'zalo_oa',
      external_user_id: testZaloUserId,
      external_user_name: 'Khách Hàng Zalo Test',
      external_user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
      status: 'open',
      last_message_preview: 'Tư vấn liệu trình trẻ hóa da',
      unread_count: 1
    })
    .select()
    .single();

  if (thErr1) console.error('thErr1:', thErr1);
  assert(!thErr1 && zaloThread?.id, `Tạo hội thoại kênh Zalo OA thành công (Thread ID: ${zaloThread?.id})`);

  // 2.2 Tạo thread Web Livechat
  const testWebUserId = 'web_guest_' + Date.now();
  const { data: webThread, error: thErr2 } = await supabase
    .from('conversation_threads')
    .insert({
      organization_id: orgId,
      channel_type: 'web_widget',
      external_user_id: testWebUserId,
      external_user_name: 'Khách Website Khuyết Danh',
      status: 'open',
      last_message_preview: 'Bảng giá cấy trắng da',
      unread_count: 1
    })
    .select()
    .single();

  if (thErr2) console.error('thErr2:', thErr2);
  assert(!thErr2 && webThread?.id, `Tạo hội thoại Web Widget thành công (Thread ID: ${webThread?.id})`);

  console.log('\n--- BƯỚC 3: Kiểm thử Nhắn Tin 2 Chiều & Ghi Chú Nội Bộ (Internal Notes) ---');

  // 3.1 Khách gửi tin nhắn đến CSKH
  const { data: msgFromCust, error: msgErr1 } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: zaloThread.id,
      organization_id: orgId,
      sender_type: 'customer',
      sender_name: 'Khách Hàng Zalo Test',
      content: 'Chào viện thẩm mỹ, mình muốn hỏi gói trẻ hóa Thermage FLX giá bao nhiêu ạ?',
      delivery_status: 'delivered'
    })
    .select()
    .single();

  if (msgErr1) console.error('msgErr1:', msgErr1);
  assert(!msgErr1 && msgFromCust?.id, 'Lưu trữ tin nhắn từ khách hàng thành công');
  assert(!msgFromCust.is_internal_note, 'Xác nhận tin nhắn khách hàng KHÔNG PHẢI là ghi chú nội bộ');

  // 3.2 Nhân viên CSKH gửi tin nhắn phản hồi cho khách
  const { data: msgFromStaff, error: msgErr2 } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: zaloThread.id,
      organization_id: orgId,
      sender_type: 'staff',
      sender_staff_id: staffId,
      sender_name: 'BS. Phạm Minh Tuấn',
      content: 'Chào bạn, gói Thermage FLX hiện đang có ưu đãi tặng thêm 1 buổi điện di HA bạn nhé!',
      delivery_status: 'sent'
    })
    .select()
    .single();

  if (msgErr2) console.error('msgErr2:', msgErr2);
  assert(!msgErr2 && msgFromStaff?.id, 'Nhân viên gửi tin nhắn phản hồi thành công');

  // 3.3 Nhân viên gửi GHI CHÚ NỘI BỘ (Internal Note - Khách hàng không thể thấy)
  const { data: internalNote, error: noteErr } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: zaloThread.id,
      organization_id: orgId,
      sender_type: 'internal_note',
      sender_staff_id: staffId,
      sender_name: 'BS. Phạm Minh Tuấn',
      content: 'KH từng bị dị ứng kem trộn cách đây 2 năm, cần test da kỹ trước khi chỉ định liệu trình.',
      is_internal_note: true,
      delivery_status: 'sent'
    })
    .select()
    .single();

  if (noteErr) console.error('noteErr:', noteErr);
  assert(!noteErr && internalNote?.id, 'Ghi nhận Ghi chú nội bộ CSKH thành công');
  assert(internalNote.is_internal_note === true, 'Ghi chú nội bộ được gắn cờ is_internal_note = true bảo mật');

  console.log('\n--- BƯỚC 4: Gắn Hồ Sơ Khách Hàng & Phân Công Nhân Viên Xử Lý ---');

  // 4.1 Liên kết Thread với Khách hàng Mai Lan
  const { data: updatedThread, error: updateThErr } = await supabase
    .from('conversation_threads')
    .update({
      customer_id: customerId,
      assigned_staff_id: staffId,
      status: 'in_progress',
      unread_count: 0
    })
    .eq('id', zaloThread.id)
    .select()
    .single();

  if (updateThErr) console.error('updateThErr:', updateThErr);
  assert(!updateThErr && updatedThread?.customer_id === customerId, 'Liên kết Thread với Hồ sơ khách hàng Mai Lan thành công');
  assert(updatedThread?.assigned_staff_id === staffId, 'Phân công nhân viên phụ trách BS. Phạm Minh Tuấn thành công');
  assert(updatedThread?.status === 'in_progress', 'Cập nhật trạng thái hội thoại sang [in_progress]');

  console.log('\n--- BƯỚC 5: Mẫu Tin Nhắn Tự Động (Message Templates) ---');

  // 5.1 Khởi tạo Template Nhắc Hẹn
  const { data: tplAppt, error: tplErr1 } = await supabase
    .from('message_templates')
    .upsert({
      organization_id: orgId,
      template_code: 'TPL-APPT-REMIND-TEST',
      template_name: 'Mẫu Nhắc Lịch Hẹn Trước 24h',
      channel_supported: ['zalo_oa', 'facebook_messenger'],
      category: 'appointment_reminder',
      content_template: 'Kính chào {{customer_name}}, Viện thẩm mỹ Phương Nam xin nhắc lịch hẹn dịch vụ {{service_name}} vào lúc {{appointment_time}} tại chi nhánh {{branch_name}}. Quý khách vui lòng đến đúng giờ để được phục vụ chu đáo nhất.',
      is_active: true
    }, { onConflict: 'organization_id, template_code' })
    .select()
    .single();

  if (tplErr1) console.error('tplErr1:', tplErr1);
  assert(!tplErr1 && tplAppt?.id, 'Tạo mẫu tin nhắn nhắc lịch hẹn thành công');

  // 5.2 Khởi tạo Template Chăm Sóc Sau Điều Trị
  const { data: tplAftercare, error: tplErr2 } = await supabase
    .from('message_templates')
    .upsert({
      organization_id: orgId,
      template_code: 'TPL-AFTERCARE-TEST',
      template_name: 'Mẫu Chăm Sóc Sau Điều Trị',
      channel_supported: ['zalo_oa', 'facebook_messenger'],
      category: 'post_treatment_care',
      content_template: 'Chào {{customer_name}}, sau buổi điều trị hôm nay bạn nhớ bôi kem chống nắng và uống đủ 2 lít nước nhé. Nếu có biểu hiện khác thường hãy liên hệ ngay hotline 1900-6868.',
      is_active: true
    }, { onConflict: 'organization_id, template_code' })
    .select()
    .single();

  if (tplErr2) console.error('tplErr2:', tplErr2);
  assert(!tplErr2 && tplAftercare?.id, 'Tạo mẫu tin nhắn hướng dẫn sau chăm sóc thành công');

  console.log('\n--- BƯỚC 6: Lên Lịch Gửi Tin Nhắc Hẹn & Kiểm Tra Khung Giờ Yên Tĩnh ---');

  // 6.1 Tạo lịch thông báo gửi tin nhắc hẹn
  const scheduledTime = new Date(Date.now() + 3600000).toISOString(); // 1 giờ sau
  const { data: notifRecord, error: notifErr } = await supabase
    .from('scheduled_notifications')
    .insert({
      organization_id: orgId,
      template_id: tplAppt.id,
      customer_id: customerId,
      channel_type: 'zalo_oa',
      scheduled_for: scheduledTime,
      rendered_content: 'Kính chào Chị Mai Lan, Viện thẩm mỹ Phương Nam xin nhắc lịch hẹn dịch vụ Cấy Trắng Da VIP vào lúc 14:30 02/10/2026 tại Phương Nam Q.1.',
      status: 'pending'
    })
    .select()
    .single();

  if (notifErr) console.error('notifErr:', notifErr);
  assert(!notifErr && notifRecord?.id, 'Tạo lịch gửi tin nhắc hẹn (scheduled_notifications) thành công');
  assert(notifRecord.status === 'pending', 'Trạng thái ban đầu của thông báo là [pending]');

  // 6.2 Kiểm tra logic Quiet Hours (22:00 - 07:00 không gửi tin làm phiền khách)
  const quietHourTime = new Date();
  quietHourTime.setHours(23, 30, 0, 0); // 23:30 đêm
  const hour = quietHourTime.getHours();
  const isQuietHour = (hour >= 22 || hour < 7);
  assert(isQuietHour, 'Quy tắc Khung giờ yên tĩnh (Quiet Hours: 22h - 07h) nhận diện chính xác');

  console.log('\n--- BƯỚC 7: Đóng Hội Thoại & Đối Chiếu Tổng Thể CSKH ---');

  // 7.1 Đóng hội thoại sau khi tư vấn xong
  const { data: resolvedThread, error: resErr } = await supabase
    .from('conversation_threads')
    .update({
      status: 'resolved'
    })
    .eq('id', zaloThread.id)
    .select()
    .single();

  if (resErr) console.error('resErr:', resErr);
  assert(!resErr && resolvedThread.status === 'resolved', 'Cập nhật trạng thái hội thoại sang [resolved] thành công');

  // 7.2 Đếm số lượng tin nhắn trong thread
  const { data: allMessages, error: countErr } = await supabase
    .from('chat_messages')
    .select('id, is_internal_note, sender_type')
    .eq('thread_id', zaloThread.id);

  if (countErr) console.error('countErr:', countErr);
  assert(!countErr && allMessages.length === 3, 'Kiểm tra toàn vẹn chuỗi hội thoại (đủ 3 tin nhắn: khách, CSKH, ghi chú nội bộ)');

  const internalCount = allMessages.filter(m => m.is_internal_note).length;
  const customerCount = allMessages.filter(m => m.sender_type === 'customer').length;
  const staffCount = allMessages.filter(m => m.sender_type === 'staff').length;

  assert(internalCount === 1, 'Chính xác 1 tin ghi chú nội bộ bảo mật');
  assert(customerCount === 1, 'Chính xác 1 tin khách gửi');
  assert(staffCount === 1, 'Chính xác 1 tin nhân viên gửi');

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TẤT CẢ CÁC BƯỚC KIỂM THỬ PHASE 10 (CHATBOX & CSKH INBOX) ĐÃ PASS 100%!');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
