const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8607322875:AAF5dFuq_p7JXlNIOrbOdav9YP9EnzWw_iw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const orgId = '11111111-1111-1111-1111-111111111111';

let lastUpdateId = 0;

console.log('='.repeat(75));
console.log('🤖 TELEGRAM BOT CSKH SYNC SERVICE ĐANG CHẠY TRỰC TIẾP');
console.log(`📌 Bot: @phuongnam_cskh_bot (Phương Nam CSKH)`);
console.log('='.repeat(75));

async function fetchTelegramUpdates() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return;
    }

    for (const update of data.result) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);

      const message = update.message;
      if (!message || !message.text) continue;

      const chatId = String(message.chat.id);
      const text = String(message.text).trim();
      const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || 'Khách Telegram';
      const messageId = String(message.message_id);

      console.log(`\n📩 Nhận tin nhắn mới từ Telegram [${senderName} - Chat ID: ${chatId}]: "${text}"`);

      // 1. Tìm hoặc tạo thread hội thoại
      let { data: thread } = await supabase
        .from('conversation_threads')
        .select('*')
        .eq('organization_id', orgId)
        .eq('channel_type', 'telegram_bot')
        .eq('external_user_id', chatId)
        .maybeSingle();

      if (!thread) {
        const { data: newThread, error: thErr } = await supabase
          .from('conversation_threads')
          .insert({
            organization_id: orgId,
            channel_type: 'telegram_bot',
            external_user_id: chatId,
            external_user_name: senderName,
            status: 'open',
            last_message_preview: text,
            last_message_at: new Date().toISOString(),
            unread_count: 1
          })
          .select()
          .single();

        if (thErr) {
          console.error('Lỗi tạo thread:', thErr);
          continue;
        }
        thread = newThread;
        console.log(`  ✅ Đã tạo hội thoại mới trong CRM (ID: ${thread.id})`);
      } else {
        await supabase
          .from('conversation_threads')
          .update({
            last_message_preview: text,
            last_message_at: new Date().toISOString(),
            unread_count: (thread.unread_count || 0) + 1,
            status: thread.status === 'resolved' || thread.status === 'closed' ? 'open' : thread.status
          })
          .eq('id', thread.id);
      }

      // 2. Lưu tin nhắn vào chat_messages
      const idempotencyKey = `tg_${chatId}_${messageId}`;
      const { error: msgErr } = await supabase
        .from('chat_messages')
        .insert({
          thread_id: thread.id,
          organization_id: orgId,
          sender_type: 'customer',
          sender_name: senderName,
          is_internal_note: false,
          message_type: 'text',
          content: text,
          idempotency_key: idempotencyKey,
          delivery_status: 'delivered'
        });

      if (!msgErr) {
        console.log(`  💾 Đã lưu tin nhắn vào Hộp thư CSKH thành công.`);
      }

      // 3. Phản hồi tự động chào mừng nếu là lệnh /start
      if (text === '/start') {
        const welcomeMsg = `Kính chào ${senderName}! Viện Thẩm Mỹ Phương Nam xin hân hạnh phục vụ. Quý khách vui lòng gửi câu hỏi hoặc dịch vụ cần tư vấn để chuyên viên CSKH hỗ trợ chu đáo nhất ạ.`;
        await sendTelegramMessage(chatId, welcomeMsg);
      }
    }
  } catch (err) {
    console.error('Lỗi sync Telegram:', err.message);
  }
}

async function sendTelegramMessage(chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`  📤 Đã gửi phản hồi thành công đến Telegram user ${chatId}`);
    }
  } catch (err) {
    console.error('Lỗi gửi tin nhắn Telegram:', err.message);
  }
}

// Chạy vòng lặp polling mỗi 2 giây
async function loop() {
  await fetchTelegramUpdates();
  setTimeout(loop, 2000);
}

loop();
