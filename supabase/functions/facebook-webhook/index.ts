// =============================================================================
// SUPABASE EDGE FUNCTION: FACEBOOK MESSENGER WEBHOOK (PHASE 10 MỐC B)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FB_VERIFY_TOKEN = Deno.env.get('FB_VERIFY_TOKEN') || 'phuongnam_fb_verify_token_2026';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // 1. GET: Xác thực Webhook với Meta Developer Platform
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
      console.log('✅ Facebook Webhook xác thực thành công');
      return new Response(challenge, { status: 200 });
    } else {
      return new Response('Forbidden: Token mismatch', { status: 403 });
    }
  }

  // 2. POST: Tiếp nhận sự kiện tin nhắn từ Fanpage Messenger
  if (req.method === 'POST') {
    try {
      const body = await req.json();

      if (body.object !== 'page') {
        return new Response('Not Found', { status: 404 });
      }

      const { data: orgRecord } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .single();

      const orgId = orgRecord?.id || '11111111-1111-1111-1111-111111111111';

      for (const entry of body.entry || []) {
        const pageId = entry.id; // Page ID (Fanpage-Tuấn Phạm)

        for (const event of entry.messaging || []) {
          const senderId = event.sender?.id; // PSID (Page-Scoped User ID)
          const message = event.message;

          // Bỏ qua tin nhắn dạng echo do chính Trang gửi đi
          if (!message || message.is_echo) {
            continue;
          }

          const messageText = message.text || '[Tệp đính kèm / Sticker]';
          const mid = message.mid; // Message ID từ Meta

          // Tìm hoặc tạo thread hội thoại
          let { data: thread } = await supabase
            .from('conversation_threads')
            .select('*')
            .eq('organization_id', orgId)
            .eq('channel_type', 'facebook_messenger')
            .eq('external_user_id', senderId)
            .maybeSingle();

          if (!thread) {
            const { data: newThread, error: thErr } = await supabase
              .from('conversation_threads')
              .insert({
                organization_id: orgId,
                channel_type: 'facebook_messenger',
                external_user_id: senderId,
                external_user_name: `Khách Facebook (${senderId.slice(-4)})`,
                status: 'open',
                last_message_preview: messageText,
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
                last_message_preview: messageText,
                last_message_at: new Date().toISOString(),
                unread_count: (thread.unread_count || 0) + 1,
                status: thread.status === 'resolved' || thread.status === 'closed' ? 'open' : thread.status
              })
              .eq('id', thread.id);
          }

          // Lưu tin nhắn vào chat_messages (Idempotent theo Meta mid)
          const idempotencyKey = `fb_${mid || senderId + '_' + Date.now()}`;
          await supabase
            .from('chat_messages')
            .insert({
              thread_id: thread.id,
              organization_id: orgId,
              sender_type: 'customer',
              sender_name: thread.external_user_name,
              is_internal_note: false,
              message_type: 'text',
              content: messageText,
              idempotency_key: idempotencyKey,
              delivery_status: 'delivered'
            });
        }
      }

      return new Response(JSON.stringify({ status: 'EVENT_RECEIVED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      console.error('Lỗi xử lý Facebook Webhook:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
