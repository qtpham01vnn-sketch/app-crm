// =============================================================================
// SUPABASE EDGE FUNCTION: TELEGRAM BOT WEBHOOK (PHASE 10 MỐC B)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  // 1. Chỉ chấp nhận phương thức POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Xác thực Secret Token từ Header (nếu được thiết lập)
  const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
  if (TELEGRAM_WEBHOOK_SECRET && incomingSecret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Secret Token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const update = await req.json();

    // 3. Chống xử lý trùng lặp theo update_id
    if (!update || !update.update_id) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const message = update.message;
    if (!message || !message.text) {
      // Bỏ qua tin không có văn bản hoặc sự kiện cập nhật khác
      return new Response(JSON.stringify({ ok: true, message: 'Non-text update ignored' }), { status: 200 });
    }

    const chatId = String(message.chat.id);
    const text = String(message.text).trim();
    const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || 'Khách Telegram';
    const messageId = String(message.message_id);

    // 4. Lấy organization_id mặc định của thẩm mỹ viện
    const { data: orgRecord } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    const orgId = orgRecord?.id || '11111111-1111-1111-1111-111111111111';

    // 5. Tìm hoặc tạo conversation_thread cho khách Telegram
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

      if (thErr) throw thErr;
      thread = newThread;
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

    // 6. Lưu tin nhắn vào chat_messages (Idempotent theo chat_id + message_id)
    const idempotencyKey = `tg_${chatId}_${messageId}`;
    await supabase
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
      })
      .select();

    return new Response(JSON.stringify({ ok: true, thread_id: thread.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Lỗi xử lý Telegram Webhook:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
