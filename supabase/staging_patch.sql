-- PATCH CHO STAGING: BỔ SUNG UNIQUE CONSTRAINT TRÊN BẢNG MESSENGER_CONVERSATIONS
ALTER TABLE messenger_conversations DROP CONSTRAINT IF EXISTS uq_messenger_page_psid;
ALTER TABLE messenger_conversations ADD CONSTRAINT uq_messenger_page_psid UNIQUE (page_id, sender_psid);

ALTER TABLE messenger_messages ADD COLUMN IF NOT EXISTS event_id VARCHAR(255);
ALTER TABLE messenger_messages ADD COLUMN IF NOT EXISTS direction VARCHAR(50) DEFAULT 'inbound';
ALTER TABLE messenger_messages ADD COLUMN IF NOT EXISTS sender_psid VARCHAR(100);
ALTER TABLE messenger_messages ADD COLUMN IF NOT EXISTS text TEXT;
