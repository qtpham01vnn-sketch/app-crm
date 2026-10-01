-- =============================================================================
-- MIGRATION 032: PHASE 10 — OMNICHANNEL CHATBOX & CSKH INBOX ENGINE (MỐC A, B, C)
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG KẾT NỐI KÊNH HỘI THOẠI (CHANNEL_INTEGRATIONS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    channel_type VARCHAR(50) NOT NULL, -- 'zalo_oa', 'facebook_messenger', 'web_widget', 'hotline_note'
    channel_name VARCHAR(255) NOT NULL,
    account_id VARCHAR(100), -- OA ID / Page ID
    app_id VARCHAR(100),
    secret_key_enc TEXT, -- Lưu an toàn phía server
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMPTZ,
    webhook_verify_token VARCHAR(255),
    is_connected BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_channel_org_account UNIQUE (organization_id, channel_type, account_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_org ON channel_integrations(organization_id, channel_type);

-- -----------------------------------------------------------------------------
-- 2. BẢNG LUỒNG HỘI THOẠI (CONVERSATION_THREADS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES channel_integrations(id) ON DELETE SET NULL,
    channel_type VARCHAR(50) NOT NULL DEFAULT 'web_widget',
    external_user_id VARCHAR(100) NOT NULL, -- Zalo User ID (ZUID) / FB PSID / Web Client ID
    external_user_name VARCHAR(255) NOT NULL DEFAULT 'Khách vãng lai',
    external_user_avatar TEXT,
    external_user_phone VARCHAR(50),
    assigned_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
    priority VARCHAR(50) NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    last_message_preview TEXT,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    unread_count INT NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_thread_external_user UNIQUE (organization_id, channel_type, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_org_status ON conversation_threads(organization_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_customer ON conversation_threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_threads_assigned_staff ON conversation_threads(assigned_staff_id);

-- -----------------------------------------------------------------------------
-- 3. BẢNG TIN NHẮN & GHI CHÚ NỘI BỘ (CHAT_MESSAGES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- 'customer', 'staff', 'system', 'internal_note'
    sender_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    sender_name VARCHAR(255) NOT NULL,
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE, -- Ghi chú nội bộ vàng (chỉ NV thấy)
    message_type VARCHAR(50) NOT NULL DEFAULT 'text', -- 'text', 'image', 'attachment', 'appointment_card'
    content TEXT NOT NULL,
    attachment_urls TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    idempotency_key VARCHAR(255) UNIQUE,
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'delivered', -- 'pending', 'sent', 'delivered', 'read', 'failed'
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 4. BẢNG MẪU TIN NHẮN CSKH / NHẮC LỊCH (MESSAGE_TEMPLATES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_code VARCHAR(100) NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'appointment_reminder', 'post_treatment_care', 'birthday_greeting', 'loyalty_tier_up'
    channel_supported TEXT[] NOT NULL DEFAULT '{"zalo_oa", "facebook_messenger"}',
    content_template TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- Danh sách biến: customer_name, branch_name, appointment_time, doctor_name
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Mặc định TẮT
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_msg_template_code UNIQUE (organization_id, template_code)
);

-- -----------------------------------------------------------------------------
-- 5. BẢNG LỊCH GỬI THÔNG BÁO TỰ ĐỘNG (SCHEDULED_NOTIFICATIONS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    treatment_session_id UUID REFERENCES treatment_sessions(id) ON DELETE SET NULL,
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    channel_type VARCHAR(50) NOT NULL DEFAULT 'zalo_oa',
    scheduled_for TIMESTAMPTZ NOT NULL,
    rendered_content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'cancelled', 'failed'
    sent_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status ON scheduled_notifications(status, scheduled_for ASC);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_appt ON scheduled_notifications(appointment_id);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE channel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_channel_integrations_read ON channel_integrations;
CREATE POLICY rls_channel_integrations_read ON channel_integrations FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_channel_integrations_write ON channel_integrations;
CREATE POLICY rls_channel_integrations_write ON channel_integrations FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_conversation_threads_read ON conversation_threads;
CREATE POLICY rls_conversation_threads_read ON conversation_threads FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_conversation_threads_write ON conversation_threads;
CREATE POLICY rls_conversation_threads_write ON conversation_threads FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_chat_messages_read ON chat_messages;
CREATE POLICY rls_chat_messages_read ON chat_messages FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_chat_messages_write ON chat_messages;
CREATE POLICY rls_chat_messages_write ON chat_messages FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_message_templates_read ON message_templates;
CREATE POLICY rls_message_templates_read ON message_templates FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_message_templates_write ON message_templates;
CREATE POLICY rls_message_templates_write ON message_templates FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_scheduled_notifications_read ON scheduled_notifications;
CREATE POLICY rls_scheduled_notifications_read ON scheduled_notifications FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_scheduled_notifications_write ON scheduled_notifications;
CREATE POLICY rls_scheduled_notifications_write ON scheduled_notifications FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

GRANT ALL ON channel_integrations TO anon, authenticated, service_role;
GRANT ALL ON conversation_threads TO anon, authenticated, service_role;
GRANT ALL ON chat_messages TO anon, authenticated, service_role;
GRANT ALL ON message_templates TO anon, authenticated, service_role;
GRANT ALL ON scheduled_notifications TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. RPC FUNCTIONS FOR SECURE CHATBOX & CSKH
-- -----------------------------------------------------------------------------

-- RPC 1: Lấy danh sách hội thoại Inbox kèm lọc và phân trang
CREATE OR REPLACE FUNCTION rpc_get_conversation_threads(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL, -- NULL = all, 'open', 'in_progress', 'resolved', 'closed'
    p_channel_type VARCHAR DEFAULT NULL,
    p_assigned_staff_id UUID DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(100, GREATEST(1, COALESCE(p_page_size, 50)));
    v_threads JSONB;
    v_total INT := 0;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM conversation_threads t
    WHERE t.organization_id = p_org_id
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
      AND (p_status IS NULL OR p_status = 'all' OR t.status = p_status)
      AND (p_channel_type IS NULL OR p_channel_type = 'all' OR t.channel_type = p_channel_type)
      AND (p_assigned_staff_id IS NULL OR t.assigned_staff_id = p_assigned_staff_id)
      AND (p_search IS NULL OR p_search = '' OR (
          t.external_user_name ILIKE '%' || p_search || '%' OR
          t.external_user_phone ILIKE '%' || p_search || '%' OR
          t.last_message_preview ILIKE '%' || p_search || '%'
      ));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'channel_type', t.channel_type,
        'customer_id', t.customer_id,
        'customer_name', c.full_name,
        'customer_phone', c.phone,
        'external_user_id', t.external_user_id,
        'external_user_name', t.external_user_name,
        'external_user_avatar', t.external_user_avatar,
        'external_user_phone', t.external_user_phone,
        'assigned_staff_id', t.assigned_staff_id,
        'assigned_staff_name', sp.full_name,
        'branch_name', b.name,
        'status', t.status,
        'priority', t.priority,
        'last_message_preview', t.last_message_preview,
        'last_message_at', t.last_message_at,
        'unread_count', t.unread_count,
        'tags', t.tags,
        'created_at', t.created_at
    ) ORDER BY t.last_message_at DESC), '[]'::JSONB)
    INTO v_threads
    FROM (
        SELECT t.*
        FROM conversation_threads t
        WHERE t.organization_id = p_org_id
          AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
          AND (p_status IS NULL OR p_status = 'all' OR t.status = p_status)
          AND (p_channel_type IS NULL OR p_channel_type = 'all' OR t.channel_type = p_channel_type)
          AND (p_assigned_staff_id IS NULL OR t.assigned_staff_id = p_assigned_staff_id)
          AND (p_search IS NULL OR p_search = '' OR (
              t.external_user_name ILIKE '%' || p_search || '%' OR
              t.external_user_phone ILIKE '%' || p_search || '%' OR
              t.last_message_preview ILIKE '%' || p_search || '%'
          ))
        ORDER BY t.last_message_at DESC
        OFFSET v_offset LIMIT v_limit
    ) t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN staff_profiles sp ON sp.id = t.assigned_staff_id
    LEFT JOIN branches b ON b.id = t.branch_id;

    RETURN jsonb_build_object(
        'threads', v_threads,
        'total', v_total,
        'page', p_page,
        'page_size', v_limit
    );
END;
$$;

-- RPC 2: Lấy chi tiết tin nhắn trong một hội thoại
CREATE OR REPLACE FUNCTION rpc_get_thread_messages(
    p_thread_id UUID,
    p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_messages JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'thread_id', m.thread_id,
        'sender_type', m.sender_type,
        'sender_staff_id', m.sender_staff_id,
        'sender_name', m.sender_name,
        'is_internal_note', m.is_internal_note,
        'message_type', m.message_type,
        'content', m.content,
        'attachment_urls', m.attachment_urls,
        'metadata', m.metadata,
        'delivery_status', m.delivery_status,
        'created_at', m.created_at
    ) ORDER BY m.created_at ASC), '[]'::JSONB)
    INTO v_messages
    FROM (
        SELECT *
        FROM chat_messages
        WHERE thread_id = p_thread_id
        ORDER BY created_at DESC
        LIMIT p_limit
    ) m;

    -- Đánh dấu đã đọc
    UPDATE conversation_threads SET
        unread_count = 0,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_thread_id;

    RETURN jsonb_build_object(
        'thread_id', p_thread_id,
        'messages', v_messages
    );
END;
$$;

-- RPC 3: Gửi tin nhắn / Ghi chú nội bộ
CREATE OR REPLACE FUNCTION rpc_send_chat_message(
    p_thread_id UUID,
    p_sender_staff_id UUID,
    p_content TEXT,
    p_is_internal_note BOOLEAN DEFAULT FALSE,
    p_message_type VARCHAR DEFAULT 'text',
    p_attachment_urls TEXT[] DEFAULT '{}',
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_thread RECORD;
    v_staff RECORD;
    v_msg_id UUID;
    v_preview TEXT;
    v_status VARCHAR(50);
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM chat_messages WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Tin nhắn đã được gửi trước đó (Idempotent).');
        END IF;
    END IF;

    SELECT * INTO v_thread FROM conversation_threads WHERE id = p_thread_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Không tìm thấy hội thoại.');
    END IF;

    SELECT * INTO v_staff FROM staff_profiles WHERE id = p_sender_staff_id;

    v_preview := SUBSTRING(TRIM(p_content) FROM 1 FOR 100);
    IF p_is_internal_note THEN
        v_preview := '[Ghi chú nội bộ] ' || v_preview;
    END IF;

    INSERT INTO chat_messages (
        thread_id, organization_id, sender_type, sender_staff_id,
        sender_name, is_internal_note, message_type, content,
        attachment_urls, idempotency_key, delivery_status, created_at
    ) VALUES (
        p_thread_id, v_thread.organization_id,
        CASE WHEN p_is_internal_note THEN 'internal_note' ELSE 'staff' END,
        p_sender_staff_id, COALESCE(v_staff.full_name, 'Tư Vấn Viên'),
        p_is_internal_note, p_message_type, p_content,
        p_attachment_urls, p_idempotency_key, 'delivered', TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    ) RETURNING id INTO v_msg_id;

    -- Cập nhật thread last_message
    UPDATE conversation_threads SET
        last_message_preview = v_preview,
        last_message_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_thread_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message_id', v_msg_id,
        'message', 'Đã lưu tin nhắn thành công.'
    );
END;
$$;

-- RPC 4: Gắn khách hàng & Chuyển trạng thái hội thoại
CREATE OR REPLACE FUNCTION rpc_update_thread_status_and_customer(
    p_thread_id UUID,
    p_status VARCHAR DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_assigned_staff_id UUID DEFAULT NULL,
    p_priority VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE conversation_threads SET
        status = COALESCE(p_status, status),
        customer_id = COALESCE(p_customer_id, customer_id),
        assigned_staff_id = COALESCE(p_assigned_staff_id, assigned_staff_id),
        priority = COALESCE(p_priority, priority),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_thread_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'thread_id', p_thread_id,
        'message', 'Cập nhật trạng thái hội thoại thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_conversation_threads TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_get_thread_messages TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_send_chat_message TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_update_thread_status_and_customer TO anon, authenticated, service_role;
