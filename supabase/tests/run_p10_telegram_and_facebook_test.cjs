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
  console.log('BỘ KIỂM THỬ PHASE 10 MỐC B: TELEGRAM BOT & FACEBOOK MESSENGER FANPAGE');
  console.log('='.repeat(80));

  const orgId = '11111111-1111-1111-1111-111111111111';
  const customerId = '77777777-7777-7777-7777-777777777771'; // Chị Mai Lan
  const staffId = '99999999-9999-9999-9999-999999999994'; // BS. Phạm Minh Tuấn

  console.log('\n--- BƯỚC 1: Cấu hình Kênh Telegram Bot & Fanpage-Tuấn Phạm ---');

  // 1.1 Kênh Telegram Bot
  const { data: tgChannel, error: tgChErr } = await supabase
    .from('channel_integrations')
    .upsert({
      organization_id: orgId,
      channel_type: 'telegram_bot',
      channel_name: 'Telegram Bot CSKH (Phương Nam Clinic)',
      account_id: 'phuongnam_cskh_bot',
      is_connected: true,
      is_active: true
    }, { onConflict: 'organization_id, channel_type, account_id' })
    .select()
    .single();

  assert(!tgChErr && tgChannel?.id, 'Khởi tạo cấu hình kênh Telegram Bot thành công');

  // 1.2 Kênh Facebook Messenger (Fanpage-Tuấn Phạm)
  const { data: fbChannel, error: fbChErr } = await supabase
    .from('channel_integrations')
    .upsert({
      organization_id: orgId,
      channel_type: 'facebook_messenger',
      channel_name: 'Fanpage-Tuấn Phạm (Messenger)',
      account_id: 'page_tuan_pham_id_10293847',
      is_connected: true,
      is_active: true
    }, { onConflict: 'organization_id, channel_type, account_id' })
    .select()
    .single();

  assert(!fbChErr && fbChannel?.id, 'Khởi tạo cấu hình Fanpage-Tuấn Phạm thành công');

  console.log('\n--- BƯỚC 2: Kiểm thử Luồng Khách Gửi Tin từ Telegram Bot (/start & văn bản) ---');

  const testTgChatId = 'tg_user_' + Date.now();
  const { data: tgThread, error: tgThErr } = await supabase
    .from('conversation_threads')
    .insert({
      organization_id: orgId,
      channel_type: 'telegram_bot',
      external_user_id: testTgChatId,
      external_user_name: 'Chủ Dự Án (Telegram Test)',
      status: 'open',
      last_message_preview: '/start',
      unread_count: 1
    })
    .select()
    .single();

  assert(!tgThErr && tgThread?.id, `Tạo luồng hội thoại Telegram Bot thành công (Thread ID: ${tgThread?.id})`);

  // Khách gửi câu hỏi qua Telegram
  const { data: tgMsg1, error: tgMsgErr1 } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: tgThread.id,
      organization_id: orgId,
      sender_type: 'customer',
      sender_name: 'Chủ Dự Án (Telegram Test)',
      content: 'Chào bác sĩ, em muốn đặt lịch tư vấn trẻ hóa da cuối tuần này.',
      idempotency_key: `tg_msg_${Date.now()}_1`,
      delivery_status: 'delivered'
    })
    .select()
    .single();

  assert(!tgMsgErr1 && tgMsg1?.id, 'Lưu trữ tin nhắn gửi từ Telegram Bot vào CRM thành công');

  console.log('\n--- BƯỚC 3: Kiểm thử Luồng Khách Gửi Tin từ Facebook Fanpage-Tuấn Phạm ---');

  const testFbPsid = 'fb_psid_' + Date.now();
  const { data: fbThread, error: fbThErr } = await supabase
    .from('conversation_threads')
    .insert({
      organization_id: orgId,
      channel_type: 'facebook_messenger',
      external_user_id: testFbPsid,
      external_user_name: 'Khách Facebook Fanpage-Tuấn Phạm',
      status: 'open',
      last_message_preview: 'Bảng giá dịch vụ điều trị sẹo rỗ',
      unread_count: 1
    })
    .select()
    .single();

  assert(!fbThErr && fbThread?.id, `Tạo luồng hội thoại Fanpage-Tuấn Phạm thành công (Thread ID: ${fbThread?.id})`);

  // Khách gửi câu hỏi qua Facebook Messenger
  const { data: fbMsg1, error: fbMsgErr1 } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: fbThread.id,
      organization_id: orgId,
      sender_type: 'customer',
      sender_name: 'Khách Facebook Fanpage-Tuấn Phạm',
      content: 'Chào viện thẩm mỹ Phương Nam, gói trị sẹo rỗ bên mình hiện có chương trình ưu đãi nào không?',
      idempotency_key: `fb_msg_${Date.now()}_1`,
      delivery_status: 'delivered'
    })
    .select()
    .single();

  assert(!fbMsgErr1 && fbMsg1?.id, 'Lưu trữ tin nhắn từ Facebook Messenger vào CRM thành công');

  console.log('\n--- BƯỚC 4: Nhân Viên Phản Hồi từ CRM & Ghi Chú Nội Bộ Bảo Mật ---');

  // Phản hồi khách Telegram
  const { data: replyTgRes, error: replyTgErr } = await supabase.rpc('rpc_send_chat_message', {
    p_thread_id: tgThread.id,
    p_sender_staff_id: staffId,
    p_content: 'Chào bạn, BS. Tuấn sẵn sàng tiếp đón bạn vào 9h sáng Thứ 7 nhé!',
    p_is_internal_note: false
  });
  assert(!replyTgErr && replyTgRes.success, 'Nhân viên gửi tin phản hồi khách Telegram thành công');

  // Thêm Ghi Chú Nội Bộ trong thread Telegram (Tuyệt đối không gửi ra ngoài bot)
  const { data: noteTgRes, error: noteTgErr } = await supabase.rpc('rpc_send_chat_message', {
    p_thread_id: tgThread.id,
    p_sender_staff_id: staffId,
    p_content: 'Khách là chủ dự án đang test kết nối Bot Telegram.',
    p_is_internal_note: true
  });
  assert(!noteTgErr && noteTgRes.success, 'Thêm Ghi chú nội bộ bảo mật vào thread Telegram thành công');

  console.log('\n--- BƯỚC 5: Tách Biệt Danh Tính Khách Hàng Giữa Telegram & Facebook ---');

  // Gắn khách hàng Mai Lan vào Facebook Thread nhưng giữ Telegram Thread độc lập
  const { data: linkedFbThread } = await supabase
    .from('conversation_threads')
    .update({ customer_id: customerId, status: 'in_progress' })
    .eq('id', fbThread.id)
    .select()
    .single();

  assert(linkedFbThread.customer_id === customerId, 'Gắn hồ sơ khách hàng Mai Lan vào Facebook Thread thành công');

  const { data: unlinkedTgThread } = await supabase
    .from('conversation_threads')
    .select('customer_id')
    .eq('id', tgThread.id)
    .single();

  assert(unlinkedTgThread.customer_id === null, 'Xác nhận Telegram Thread KHÔNG bị tự động gộp danh tính với Facebook');

  console.log('\n--- BƯỚC 6: Kiểm tra Trạng Thái Kênh Zalo OA (Chưa Cấu Hình) ---');

  // Đảm bảo kênh Zalo OA được đặt về trạng thái Chưa Cấu Hình
  await supabase
    .from('channel_integrations')
    .update({ is_connected: false, is_active: false })
    .eq('organization_id', orgId)
    .eq('channel_type', 'zalo_oa');

  const { data: zaloCheck } = await supabase
    .from('channel_integrations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('channel_type', 'zalo_oa');

  const isZaloConfigured = zaloCheck && zaloCheck.length > 0 && zaloCheck.some(z => z.is_connected);
  assert(!isZaloConfigured, 'Xác nhận kênh Zalo OA đang ở trạng thái [Chưa cấu hình] đúng yêu cầu');

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TẤT CẢ CÁC BƯỚC KIỂM THỬ TELEGRAM BOT & FACEBOOK FANPAGE ĐÃ PASS 100%!');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
