-- =============================================================================
-- MIGRATION 033: PHASE 10 MỐC B — BIDIRECTIONAL BRIDGE VỚI WEBHOOK_CRM
-- Target: PostgreSQL / Supabase
-- Bảo toàn 100% mã nguồn dự án webhook_CRM (Không can thiệp hay sửa file)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TRIGGER SYNC: TỪ MESSENGER_CONVERSATIONS SANG CONVERSATION_THREADS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_messenger_conv_to_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_thread_id UUID;
    v_name VARCHAR(255);
BEGIN
    v_name := COALESCE(NEW.full_name, 'Khách Facebook Fanpage-Tuấn Phạm');

    -- Tìm thread hiện có theo external_user_id (sender_psid)
    SELECT id INTO v_thread_id
    FROM conversation_threads
    WHERE organization_id = v_org_id
      AND channel_type = 'facebook_messenger'
      AND external_user_id = NEW.sender_psid;

    IF v_thread_id IS NULL THEN
        INSERT INTO conversation_threads (
            organization_id,
            channel_type,
            external_user_id,
            external_user_name,
            external_user_phone,
            status,
            priority,
            last_message_at,
            unread_count,
            created_at,
            updated_at
        ) VALUES (
            v_org_id,
            'facebook_messenger',
            NEW.sender_psid,
            v_name,
            NEW.phone,
            'open',
            'normal',
            COALESCE(NEW.last_message_at, NOW()),
            1,
            COALESCE(NEW.created_at, NOW()),
            COALESCE(NEW.updated_at, NOW())
        );
    ELSE
        UPDATE conversation_threads SET
            external_user_name = COALESCE(NEW.full_name, external_user_name),
            external_user_phone = COALESCE(NEW.phone, external_user_phone),
            last_message_at = COALESCE(NEW.last_message_at, NOW()),
            updated_at = NOW()
        WHERE id = v_thread_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_messenger_conv ON messenger_conversations;
CREATE TRIGGER trg_sync_messenger_conv
    AFTER INSERT OR UPDATE ON messenger_conversations
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_messenger_conv_to_thread();

-- -----------------------------------------------------------------------------
-- 2. TRIGGER SYNC: TỪ MESSENGER_MESSAGES SANG CHAT_MESSAGES (HỘP THƯ CRM)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_messenger_msg_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_thread_id UUID;
    v_conv RECORD;
    v_sender_type VARCHAR(50);
    v_sender_name VARCHAR(255);
    v_preview TEXT;
BEGIN
    -- Lấy thông tin conversation tương ứng
    SELECT * INTO v_conv FROM messenger_conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Tìm thread tương ứng trong CRM
    SELECT id INTO v_thread_id
    FROM conversation_threads
    WHERE organization_id = v_org_id
      AND channel_type = 'facebook_messenger'
      AND external_user_id = v_conv.sender_psid;

    IF v_thread_id IS NULL THEN
        -- Tự động tạo thread nếu chưa có
        INSERT INTO conversation_threads (
            organization_id,
            channel_type,
            external_user_id,
            external_user_name,
            status,
            last_message_preview,
            last_message_at,
            unread_count
        ) VALUES (
            v_org_id,
            'facebook_messenger',
            v_conv.sender_psid,
            COALESCE(v_conv.full_name, 'Khách Facebook'),
            'open',
            SUBSTRING(NEW.text FROM 1 FOR 100),
            COALESCE(NEW.created_at, NOW()),
            1
        ) RETURNING id INTO v_thread_id;
    END IF;

    -- Xác định vai trò người gửi
    IF NEW.direction = 'inbound' THEN
        v_sender_type := 'customer';
        v_sender_name := COALESCE(v_conv.full_name, 'Khách Facebook');
    ELSE
        v_sender_type := 'staff';
        v_sender_name := 'Tư Vấn Viên';
    END IF;

    v_preview := SUBSTRING(TRIM(NEW.text) FROM 1 FOR 100);

    -- Chống lưu trùng tin nhắn theo event_id
    IF NEW.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM chat_messages WHERE idempotency_key = NEW.event_id) THEN
        RETURN NEW;
    END IF;

    -- Thêm vào chat_messages
    INSERT INTO chat_messages (
        thread_id,
        organization_id,
        sender_type,
        sender_name,
        is_internal_note,
        message_type,
        content,
        idempotency_key,
        delivery_status,
        created_at
    ) VALUES (
        v_thread_id,
        v_org_id,
        v_sender_type,
        v_sender_name,
        FALSE,
        'text',
        NEW.text,
        NEW.event_id,
        'delivered',
        COALESCE(NEW.created_at, NOW())
    );

    -- Cập nhật last_message trên thread
    UPDATE conversation_threads SET
        last_message_preview = v_preview,
        last_message_at = COALESCE(NEW.created_at, NOW()),
        unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
        updated_at = NOW()
    WHERE id = v_thread_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_messenger_msg ON messenger_messages;
CREATE TRIGGER trg_sync_messenger_msg
    AFTER INSERT ON messenger_messages
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_messenger_msg_to_chat();
