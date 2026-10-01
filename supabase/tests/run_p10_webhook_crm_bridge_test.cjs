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
  console.log('BỘ KIỂM THỬ ĐẤU NỐI WEBHOOK_CRM VÀO HỘP THƯ CSKH (KHÔNG SỬA CODE WEBHOOK_CRM)');
  console.log('='.repeat(80));

  const pageId = 'page_tuan_pham_fanpage_2026';
  const senderPsid = 'fb_user_test_' + Date.now();
  const customerName = 'Chị Thu Hà (Khách Facebook Fanpage-Tuấn Phạm)';
  const customerPhone = '0988776655';
  const customerMessage = 'Chào Fanpage-Tuấn Phạm, mình muốn đặt lịch cấy trắng da vào Thứ 7 tuần này.';

  console.log('\n--- BƯỚC 1: Mô phỏng webhook_CRM tiếp nhận tin nhắn từ Facebook Fanpage-Tuấn Phạm ---');

  const { data: simRes, error: simErr } = await supabase.rpc('rpc_simulate_webhook_crm_inbound', {
    p_page_id: pageId,
    p_sender_psid: senderPsid,
    p_full_name: customerName,
    p_phone: customerPhone,
    p_text: customerMessage
  });

  if (simErr) {
    console.error('simErr:', simErr);
  }
  assert(!simErr && simRes?.success, 'webhook_CRM tiếp nhận và ghi nhận vào messenger_conversations & messenger_messages thành công');

  console.log('\n--- BƯỚC 2: Kiểm tra App CRM Hộp Thư CSKH tự động đồng bộ qua Database Trigger ---');

  // 2.1 Kiểm tra thread trong conversation_threads
  const { data: crmThread, error: threadErr } = await supabase
    .from('conversation_threads')
    .select('*')
    .eq('channel_type', 'facebook_messenger')
    .eq('external_user_id', senderPsid)
    .single();

  assert(!threadErr && crmThread?.id, 'Thread tự động sinh trong conversation_threads của App CRM');
  assert(crmThread.external_user_name === customerName, `App CRM nhận đúng tên khách: "${crmThread.external_user_name}"`);
  assert(crmThread.external_user_phone === customerPhone, `App CRM nhận đúng SĐT khách: "${crmThread.external_user_phone}"`);
  console.log(`  ✅ Thread ID trong CRM: ${crmThread.id}`);

  // 2.2 Kiểm tra tin nhắn trong chat_messages
  const { data: crmMsg, error: msgErr } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', crmThread.id)
    .single();

  assert(!msgErr && crmMsg?.id, 'Tin nhắn tự động xuất hiện trong chat_messages của Hộp thư CSKH');
  assert(crmMsg.content === customerMessage, `Nội dung tin nhắn khớp 100%: "${crmMsg.content}"`);
  assert(crmMsg.sender_type === 'customer', 'Xác nhận đúng sender_type = customer');

  console.log('\n--- BƯỚC 3: Kiểm tra hiển thị trên API Hộp Thư CSKH (rpc_get_conversation_threads) ---');

  const { data: inboxData } = await supabase.rpc('rpc_get_conversation_threads', {
    p_org_id: '11111111-1111-1111-1111-111111111111'
  });

  const matchingThread = (inboxData?.threads || []).find(t => t.id === crmThread.id);
  assert(Boolean(matchingThread), 'Hội thoại từ Facebook Fanpage-Tuấn Phạm đã hiển thị trực tiếp trong Hộp thư CSKH');
  assert(matchingThread.channel_type === 'facebook_messenger', 'Kênh hiển thị chuẩn xác: facebook_messenger');

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TẤT CẢ CÁC BƯỚC ĐẤU NỐI WEBHOOK_CRM VÀO APP CRM ĐÃ HOÀN TOÀN THÀNH CÔNG (PASS 100%)!');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
