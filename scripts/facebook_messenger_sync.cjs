const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || 'EAAprnJJ6ZCckBSptRpHzg149sMUnJZAW390nPuyrZAcwrujL7KQwbMzl8qxxtbCht28bvIR3MVwUbonl0Js2RylxqFcZBll4Ngg5hZANUIgdZBZCIBOf3JFgWTXvHqM0jf3Ii9BzeRosxHepcja5ITQNjqWI7Tq3DAKo46hTTJGjifrFOnQQ8GGqaAd2VBWs7ji9hRQHWYt4gZDZD';
const FB_PAGE_ID = process.env.FB_PAGE_ID || '809750085555882';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const orgId = '11111111-1111-1111-1111-111111111111';

const processedMessageIds = new Set();
let isPolling = false;

console.log('='.repeat(75));
console.log('📘 FACEBOOK MESSENGER FANPAGE SYNC SERVICE ĐANG CHẠY TRỰC TIẾP');
console.log(`📌 Fanpage: Fanpage-Tuấn Phạm (ID: ${FB_PAGE_ID})`);
console.log('='.repeat(75));

// Tải trước danh sách các message id đã có trong DB để tránh trùng lặp
async function preloadExistingMessageIds() {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('idempotency_key')
      .not('idempotency_key', 'is', null)
      .limit(1000);

    if (data) {
      data.forEach((row) => {
        if (row.idempotency_key) {
          processedMessageIds.add(row.idempotency_key.replace(/^fb_/, ''));
        }
      });
      console.log(`  ℹ️ Đã nạp ${processedMessageIds.size} tin nhắn lịch sử vào bộ nhớ đệm`);
    }
  } catch (err) {
    console.error('Lỗi nạp cache tin nhắn:', err.message);
  }
}

// Quét tin nhắn mới từ Facebook Messenger Graph API
async function fetchFacebookUpdates() {
  if (isPolling) return;
  isPolling = true;
  try {
    const url = `https://graph.facebook.com/v23.0/me/conversations?fields=id,updated_time,participants,messages{id,message,from,created_time}&access_token=${FB_PAGE_ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      isPolling = false;
      return;
    }

    for (const conv of data.data) {
      const messages = (conv.messages?.data || []).slice().reverse(); // Duyệt theo thứ tự thời gian cũ -> mới
      for (const msg of messages) {
        const msgId = msg.id;
        if (processedMessageIds.has(msgId)) continue;
        processedMessageIds.add(msgId);

        const fromId = msg.from?.id;
        const fromName = msg.from?.name || 'Khách Facebook';
        const text = msg.message;

        // Bỏ qua tin nhắn trống
        if (!text) continue;

        // Xác định chiều tin nhắn: Nếu người gửi là chính Page thì là staff/outbound, ngược lại là customer/inbound
        const isFromPage = String(fromId) === String(FB_PAGE_ID);

        // Lấy PSID của khách hàng trong hội thoại
        const customerParticipant = (conv.participants?.data || []).find(p => String(p.id) !== String(FB_PAGE_ID));
        const senderPsid = isFromPage ? (customerParticipant?.id || fromId) : fromId;
        const customerName = isFromPage ? (customerParticipant?.name || 'Khách Facebook') : fromName;

        // 1. Tìm hoặc tạo thread hội thoại trong conversation_threads
        let { data: thread } = await supabase
          .from('conversation_threads')
          .select('*')
          .eq('organization_id', orgId)
          .eq('channel_type', 'facebook_messenger')
          .eq('external_user_id', senderPsid)
          .maybeSingle();

        if (!thread) {
          const { data: newThread, error: thErr } = await supabase
            .from('conversation_threads')
            .insert({
              organization_id: orgId,
              channel_type: 'facebook_messenger',
              external_user_id: senderPsid,
              external_user_name: customerName,
              status: 'open',
              last_message_preview: text,
              last_message_at: new Date(msg.created_time).toISOString(),
              unread_count: isFromPage ? 0 : 1
            })
            .select()
            .single();

          if (thErr) {
            console.error('Lỗi tạo thread FB:', thErr);
            continue;
          }
          thread = newThread;
          console.log(`  ✅ Đã tạo hội thoại mới từ Fanpage trong CRM (Khách: ${customerName} - PSID: ${senderPsid})`);
        } else {
          await supabase
            .from('conversation_threads')
            .update({
              last_message_preview: text,
              last_message_at: new Date(msg.created_time).toISOString(),
              unread_count: isFromPage ? thread.unread_count : (thread.unread_count || 0) + 1,
              status: thread.status === 'resolved' || thread.status === 'closed' ? 'open' : thread.status
            })
            .eq('id', thread.id);
        }

        // 2. Lưu tin nhắn vào chat_messages
        const idempotencyKey = `fb_${msgId}`;
        const { error: msgErr } = await supabase
          .from('chat_messages')
          .insert({
            thread_id: thread.id,
            organization_id: orgId,
            sender_type: isFromPage ? 'staff' : 'customer',
            sender_name: fromName,
            is_internal_note: false,
            message_type: 'text',
            content: text,
            idempotency_key: idempotencyKey,
            delivery_status: 'delivered',
            created_at: new Date(msg.created_time).toISOString()
          });

        if (!msgErr) {
          console.log(`  📥 [FB Sync Mới] ${isFromPage ? 'Page' : customerName}: "${text}"`);
        }
      }
    }
  } catch (err) {
    console.error('Lỗi fetch Facebook Messenger:', err.message);
  } finally {
    isPolling = false;
  }
}

// Khởi chạy
async function start() {
  await preloadExistingMessageIds();
  await fetchFacebookUpdates();

  setInterval(async () => {
    await fetchFacebookUpdates();
  }, 6000); // Quét nhẹ nhàng mỗi 6 giây
}

start();
