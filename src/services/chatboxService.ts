import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { ConversationThread, ChatMessage, ChannelIntegration } from '../types';

export const chatboxService = {
  /**
   * Fetch conversation threads with filters and search
   */
  async getConversationThreads(params: {
    orgId: string;
    branchId?: string;
    status?: string;
    channelType?: string;
    assignedStaffId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ threads: ConversationThread[]; total: number }> {
    if (!isSupabaseConfigured || !supabase) {
      return { threads: [], total: 0 };
    }

    try {
      const { data, error } = await supabase.rpc('rpc_get_conversation_threads', {
        p_org_id: params.orgId,
        p_branch_id: params.branchId || null,
        p_status: params.status || null,
        p_channel_type: params.channelType || null,
        p_assigned_staff_id: params.assignedStaffId || null,
        p_search: params.search || null,
        p_page: params.page || 1,
        p_page_size: params.pageSize || 50
      });

      if (error) {
        console.error('Error fetching conversation threads:', error);
        throw error;
      }

      const res = data || {};
      const threads: ConversationThread[] = (res.threads || []).map((t: any) => ({
        id: t.id,
        orgId: params.orgId,
        branchId: t.branch_id,
        branchName: t.branch_name,
        customerId: t.customer_id,
        customerName: t.customer_name,
        customerPhone: t.customer_phone,
        channelId: t.channel_id,
        channelType: t.channel_type || 'web_widget',
        externalUserId: t.external_user_id,
        externalUserName: t.external_user_name || 'Khách vãng lai',
        externalUserAvatar: t.external_user_avatar,
        externalUserPhone: t.external_user_phone,
        assignedStaffId: t.assigned_staff_id,
        assignedStaffName: t.assigned_staff_name,
        status: t.status || 'open',
        priority: t.priority || 'normal',
        lastMessagePreview: t.last_message_preview,
        lastMessageAt: t.last_message_at,
        unreadCount: Number(t.unread_count) || 0,
        tags: t.tags || [],
        createdAt: t.created_at
      }));

      return { threads, total: Number(res.total) || 0 };
    } catch (err) {
      console.error('Lỗi khi tải danh sách hội thoại:', err);
      throw err;
    }
  },

  /**
   * Fetch chat messages in a thread (and mark as read)
   */
  async getThreadMessages(threadId: string): Promise<ChatMessage[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [];
    }

    try {
      const { data, error } = await supabase.rpc('rpc_get_thread_messages', {
        p_thread_id: threadId,
        p_limit: 100
      });

      if (error) throw error;
      const res = data || {};
      return (res.messages || []).map((m: any) => ({
        id: m.id,
        threadId: m.thread_id,
        senderType: m.sender_type,
        senderStaffId: m.sender_staff_id,
        senderName: m.sender_name || 'Hệ Thống',
        isInternalNote: Boolean(m.is_internal_note),
        messageType: m.message_type || 'text',
        content: m.content,
        attachmentUrls: m.attachment_urls || [],
        metadata: m.metadata || {},
        deliveryStatus: m.delivery_status || 'delivered',
        createdAt: m.created_at
      }));
    } catch (err) {
      console.error('Lỗi tải tin nhắn hội thoại:', err);
      throw err;
    }
  },

  /**
   * Send chat message or internal note to a thread
   */
  async sendMessage(params: {
    threadId: string;
    senderStaffId: string;
    content: string;
    isInternalNote?: boolean;
    messageType?: string;
    attachmentUrls?: string[];
    idempotencyKey?: string;
  }): Promise<{ success: boolean; messageId?: string; message?: string; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase chưa kết nối' };
    }

    const { data, error } = await supabase.rpc('rpc_send_chat_message', {
      p_thread_id: params.threadId,
      p_sender_staff_id: params.senderStaffId,
      p_content: params.content,
      p_is_internal_note: Boolean(params.isInternalNote),
      p_message_type: params.messageType || 'text',
      p_attachment_urls: params.attachmentUrls || [],
      p_idempotency_key: params.idempotencyKey || `msg-${params.threadId}-${Date.now()}`
    });

    if (error) throw error;
    return data;
  },

  /**
   * Update thread status, linked customer or assigned staff
   */
  async updateThread(params: {
    threadId: string;
    status?: string;
    customerId?: string;
    assignedStaffId?: string;
    priority?: string;
  }): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase chưa kết nối' };
    }

    const { data, error } = await supabase.rpc('rpc_update_thread_status_and_customer', {
      p_thread_id: params.threadId,
      p_status: params.status || null,
      p_customer_id: params.customerId || null,
      p_assigned_staff_id: params.assignedStaffId || null,
      p_priority: params.priority || null
    });

    if (error) throw error;
    return data;
  },

  /**
   * Fetch connected channels
   */
  async getChannelIntegrations(orgId: string): Promise<ChannelIntegration[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [
        {
          id: 'mock-web',
          orgId,
          channelType: 'web_widget',
          channelName: 'Livechat Website Phương Nam',
          isConnected: true,
          isActive: true
        },
        {
          id: 'mock-tg',
          orgId,
          channelType: 'telegram_bot',
          channelName: 'Telegram Bot CSKH (Chờ BotFather Token)',
          isConnected: false,
          isActive: false
        },
        {
          id: 'mock-fb',
          orgId,
          channelType: 'facebook_messenger',
          channelName: 'Fanpage-Tuấn Phạm (Messenger)',
          isConnected: false,
          isActive: false
        },
        {
          id: 'mock-zalo',
          orgId,
          channelType: 'zalo_oa',
          channelName: 'Zalo OA (Chưa cấu hình)',
          isConnected: false,
          isActive: false
        }
      ];
    }

    try {
      const { data, error } = await supabase
        .from('channel_integrations')
        .select('id, organization_id, branch_id, channel_type, channel_name, account_id, app_id, is_connected, is_active, token_expires_at')
        .eq('organization_id', orgId);

      if (error) throw error;
      return (data || []).map((ch: any) => ({
        id: ch.id,
        orgId: ch.organization_id,
        branchId: ch.branch_id,
        channelType: ch.channel_type,
        channelName: ch.channel_name,
        accountId: ch.account_id,
        appId: ch.app_id,
        isConnected: Boolean(ch.is_connected),
        isActive: Boolean(ch.is_active),
        tokenExpiresAt: ch.token_expires_at
      }));
    } catch (err) {
      console.error('Lỗi tải danh sách kênh kết nối:', err);
      return [];
    }
  }
};
