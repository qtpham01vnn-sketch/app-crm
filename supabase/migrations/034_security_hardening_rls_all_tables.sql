-- =============================================================================
-- MIGRATION 034: ROLE-BASED & BRANCH-ISOLATED RLS SECURITY HARDENING
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 0. HELPER FUNCTION: Get current authenticated staff profile ID
CREATE OR REPLACE FUNCTION get_current_staff_id()
RETURNS UUID AS $$
    SELECT sp.id
    FROM staff_profiles sp
    WHERE sp.auth_user_id = auth.uid()
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 1. ENABLE RLS ON ALL REMAINING EXTENSION TABLES
ALTER TABLE IF EXISTS conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS channel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_crm ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shift_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stocktake_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_tier_history ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. FINE-GRAINED ROLE & BRANCH RLS POLICIES
-- -----------------------------------------------------------------------------

-- --- A. HR & PAYROLL (Cách ly lương và hoa hồng theo vai trò cá nhân) ---
DROP POLICY IF EXISTS payroll_role_policy ON payroll_records;
CREATE POLICY payroll_role_policy ON payroll_records
    FOR SELECT
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager')
            OR staff_id = get_current_staff_id()
        )
    );

DROP POLICY IF EXISTS payroll_admin_write_policy ON payroll_records;
CREATE POLICY payroll_admin_write_policy ON payroll_records
    FOR ALL
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

DROP POLICY IF EXISTS commission_role_policy ON commission_records;
CREATE POLICY commission_role_policy ON commission_records
    FOR SELECT
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager')
            OR staff_id = get_current_staff_id()
        )
    );

-- --- B. HỒ SƠ ĐIỀU TRỊ & Y KHOA (Chỉ bác sĩ phụ trách, quản lý hoặc admin) ---
DROP POLICY IF EXISTS treatment_sessions_role_policy ON treatment_sessions;
CREATE POLICY treatment_sessions_role_policy ON treatment_sessions
    FOR ALL
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
            OR practitioner_id = get_current_staff_id()
        )
    );

DROP POLICY IF EXISTS treatment_photos_role_policy ON treatment_photos;
CREATE POLICY treatment_photos_role_policy ON treatment_photos
    FOR ALL
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
            OR practitioner_id = get_current_staff_id()
        )
    );

DROP POLICY IF EXISTS treatment_consents_role_policy ON treatment_consents;
CREATE POLICY treatment_consents_role_policy ON treatment_consents
    FOR ALL
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
            OR EXISTS (SELECT 1 FROM treatment_sessions ts WHERE ts.id = treatment_consents.session_id AND ts.practitioner_id = get_current_staff_id())
        )
    );

-- --- C. KHO LIÊN CHI NHÁNH & KIỂM KÊ (Cách ly theo quyền chi nhánh) ---
DROP POLICY IF EXISTS branch_transfers_access_policy ON branch_transfers;
CREATE POLICY branch_transfers_access_policy ON branch_transfers
    FOR SELECT
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            has_branch_access(from_branch_id)
            OR has_branch_access(to_branch_id)
        )
    );

DROP POLICY IF EXISTS branch_transfers_mgr_write_policy ON branch_transfers;
CREATE POLICY branch_transfers_mgr_write_policy ON branch_transfers
    FOR ALL
    TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() IN ('owner_admin', 'branch_manager')
    );

-- --- D. CHATBOX & CSKH (Cách ly tổ chức) ---
DROP POLICY IF EXISTS threads_org_policy ON conversation_threads;
CREATE POLICY threads_org_policy ON conversation_threads
    FOR ALL
    TO authenticated
    USING (organization_id = get_current_user_org_id());

DROP POLICY IF EXISTS chat_messages_org_policy ON chat_messages;
CREATE POLICY chat_messages_org_policy ON chat_messages
    FOR ALL
    TO authenticated
    USING (organization_id = get_current_user_org_id());

-- -----------------------------------------------------------------------------
-- 3. SERVER-SIDE FEATURE GUARDS CHO CHÍNH SÁCH CHƯA DUYỆT (CHỐNG TỰ ĐỘNG HÓA)
-- -----------------------------------------------------------------------------
ALTER TABLE loyalty_policies ADD COLUMN IF NOT EXISTS is_approved_by_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- Cập nhật RPC Loyalty để kiểm tra cờ phê duyệt server-side
CREATE OR REPLACE FUNCTION rpc_earn_loyalty_points(
    p_customer_id UUID,
    p_sale_id UUID,
    p_spend_amount BIGINT,
    p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer RECORD;
    v_policy RECORD;
    v_points BIGINT;
    v_account RECORD;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Khách hàng không tồn tại.');
    END IF;

    -- Kiểm tra cờ chính sách đã được phê duyệt hay chưa
    SELECT * INTO v_policy FROM loyalty_policies WHERE organization_id = v_customer.organization_id;
    IF NOT FOUND OR v_policy.is_approved_by_owner = FALSE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'is_policy_blocked', TRUE,
            'message', 'Chính sách Loyalty chưa được phê duyệt bởi Chủ dự án. Giao dịch không tự động tích điểm.'
        );
    END IF;

    -- Kiểm tra idempotency
    IF EXISTS (SELECT 1 FROM loyalty_transactions WHERE idempotency_key = p_idempotency_key) THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Giao dịch tích điểm đã được xử lý trước đó (Idempotent).');
    END IF;

    v_points := FLOOR(p_spend_amount * (v_policy.earn_rate_pct / 100.0) / v_policy.point_to_vnd_rate);

    -- Tích điểm
    INSERT INTO loyalty_transactions (
        organization_id, customer_id, sale_id, transaction_type, points, balance_after, idempotency_key, note
    ) VALUES (
        v_customer.organization_id, p_customer_id, p_sale_id, 'earn', v_points, v_points, p_idempotency_key, 'Tích điểm từ hóa đơn'
    );

    RETURN jsonb_build_object('success', TRUE, 'points_earned', v_points, 'message', 'Đã tích điểm thành công.');
END;
$$;
