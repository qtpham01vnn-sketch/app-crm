-- =============================================================================
-- MIGRATION 034: COMPREHENSIVE ROLE-BASED & BRANCH-ISOLATED RLS SECURITY HARDENING
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_staff_id()
RETURNS UUID AS $$
    SELECT sp.id
    FROM staff_profiles sp
    WHERE sp.auth_user_id = auth.uid()
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1. DROP ALL PERMISSIVE / LEGACY POLICIES (AUTHENTICATED & ANON)
-- -----------------------------------------------------------------------------

-- Treatment & Medical
DROP POLICY IF EXISTS rls_treatment_plans_read ON treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_write ON treatment_plans;
DROP POLICY IF EXISTS rls_treatment_sessions_all ON treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_session_audits_all ON treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_photos_all ON treatment_photos;
DROP POLICY IF EXISTS rls_treatment_consents_all ON treatment_consents;
DROP POLICY IF EXISTS treatment_sessions_role_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_photos_role_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_consents_role_policy ON treatment_consents;

-- HR & Payroll
DROP POLICY IF EXISTS rls_payroll_records_all ON payroll_records;
DROP POLICY IF EXISTS rls_payroll_periods_all ON payroll_periods;
DROP POLICY IF EXISTS rls_commission_records_all ON commission_records;
DROP POLICY IF EXISTS payroll_role_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_admin_write_policy ON payroll_records;
DROP POLICY IF EXISTS commission_role_policy ON commission_records;

-- Inventory Transfers & Audits
DROP POLICY IF EXISTS rls_branch_transfers_all ON branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfer_items_all ON branch_transfer_items;
DROP POLICY IF EXISTS rls_stocktakes_all ON stocktakes;
DROP POLICY IF EXISTS rls_stocktake_items_all ON stocktake_items;
DROP POLICY IF EXISTS branch_transfers_access_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_mgr_write_policy ON branch_transfers;

-- Chatbox & CSKH
DROP POLICY IF EXISTS threads_org_policy ON conversation_threads;
DROP POLICY IF EXISTS chat_messages_org_policy ON chat_messages;
DROP POLICY IF EXISTS rls_conversation_threads_all ON conversation_threads;
DROP POLICY IF EXISTS rls_chat_messages_all ON chat_messages;

-- Loyalty & Memberships
DROP POLICY IF EXISTS rls_loyalty_policies_read ON loyalty_policies;
DROP POLICY IF EXISTS rls_loyalty_policies_write ON loyalty_policies;
DROP POLICY IF EXISTS rls_loyalty_tier_policies_read ON loyalty_tier_policies;
DROP POLICY IF EXISTS rls_loyalty_tier_policies_write ON loyalty_tier_policies;
DROP POLICY IF EXISTS rls_customer_loyalty_balances_read ON customer_loyalty_balances;
DROP POLICY IF EXISTS rls_customer_loyalty_balances_write ON customer_loyalty_balances;
DROP POLICY IF EXISTS rls_loyalty_points_ledger_read ON loyalty_points_ledger;
DROP POLICY IF EXISTS rls_loyalty_points_ledger_write ON loyalty_points_ledger;
DROP POLICY IF EXISTS rls_customer_tier_history_read ON customer_tier_history;
DROP POLICY IF EXISTS rls_customer_tier_history_write ON customer_tier_history;

-- Revoke public / anon direct table grants
REVOKE ALL ON treatment_plans, treatment_sessions, treatment_session_audits, treatment_photos, treatment_consents FROM anon;
REVOKE ALL ON payroll_periods, payroll_records, commission_records FROM anon;
REVOKE ALL ON branch_transfers, branch_transfer_items, stocktakes, stocktake_items FROM anon;
REVOKE ALL ON loyalty_policies, loyalty_tier_policies, customer_loyalty_balances, loyalty_points_ledger, customer_tier_history FROM anon;
REVOKE ALL ON conversation_threads, chat_messages, channel_integrations, message_templates FROM anon;

-- -----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_session_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_consents ENABLE ROW LEVEL SECURITY;

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE loyalty_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tier_history ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. FINE-GRAINED ROLE & BRANCH RLS POLICIES (AUTHENTICATED ONLY)
-- -----------------------------------------------------------------------------

-- --- A. HỒ SƠ ĐIỀU TRỊ & Y KHOA ---
-- Đọc: Chủ cơ sở, Quản lý chi nhánh, Lễ tân (để đón tiếp), hoặc chính Bác sĩ/KTV thực hiện
CREATE POLICY treatment_sessions_select_policy ON treatment_sessions
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() IN ('branch_manager', 'cashier_receptionist') AND has_branch_access(branch_id))
            OR performed_by = get_current_staff_id()
        )
    );

-- Ghi/Sửa: Chỉ Chủ cơ sở, Quản lý chi nhánh phụ trách, hoặc chính Bác sĩ/KTV thực hiện (KHÔNG CHO LỄ TÂN)
CREATE POLICY treatment_sessions_insert_policy ON treatment_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND performed_by = get_current_staff_id())
        )
    );

CREATE POLICY treatment_sessions_update_policy ON treatment_sessions
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND performed_by = get_current_staff_id())
        )
    );

-- Ảnh Before/After: Lễ tân chỉ ĐỌC, Bác sĩ/Quản lý được GHI
CREATE POLICY treatment_photos_select_policy ON treatment_photos
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() IN ('branch_manager', 'cashier_receptionist') AND has_branch_access(branch_id))
            OR EXISTS (SELECT 1 FROM treatment_sessions ts WHERE ts.id = treatment_photos.session_id AND ts.performed_by = get_current_staff_id())
        )
    );

CREATE POLICY treatment_photos_write_policy ON treatment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR get_current_user_role() = 'technician_doctor'
        )
    );

-- --- B. LƯƠNG & HOA HỒNG (CÁCH LY THEO VAI TRÒ & CHI NHÁNH) ---
CREATE POLICY payroll_records_select_policy ON payroll_records
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR staff_id = get_current_staff_id()
        )
    );

CREATE POLICY payroll_records_admin_write ON payroll_records
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY commission_records_select_policy ON commission_records
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR staff_id = get_current_staff_id()
        )
    );

CREATE POLICY commission_records_admin_write ON commission_records
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() IN ('owner_admin', 'branch_manager')
    );

-- --- C. ĐIỀU CHUYỂN KHO (GIỚI HẠN THEO CHI NHÁNH XUẤT/NHẬN) ---
CREATE POLICY branch_transfers_select_policy ON branch_transfers
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(from_branch_id)
            OR has_branch_access(to_branch_id)
        )
    );

CREATE POLICY branch_transfers_write_policy ON branch_transfers
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(from_branch_id))
        )
    );

-- --- D. HỘP THƯ CSKH & CHATBOX ---
CREATE POLICY conversation_threads_auth_policy ON conversation_threads
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY chat_messages_auth_policy ON chat_messages
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

-- -----------------------------------------------------------------------------
-- 4. SERVER-SIDE GUARDS CHO CHÍNH SÁCH LOYALTY & BẢO TOÀN NGHIỆP VỤ GỐC
-- -----------------------------------------------------------------------------
ALTER TABLE loyalty_policies ADD COLUMN IF NOT EXISTS is_approved_by_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- Hàm tích điểm: Giữ nguyên 100% logic gốc (chống lặp, multiplier, balance_after), bổ sung kiểm tra cờ và đối soát sale server-side
CREATE OR REPLACE FUNCTION rpc_earn_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_sale_id UUID,
    p_eligible_amount BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_tier RECORD;
    v_balance RECORD;
    v_sale RECORD;
    v_actual_spend BIGINT := p_eligible_amount;
    v_multiplier NUMERIC(3, 2) := 1.00;
    v_base_points INT := 0;
    v_final_points INT := 0;
    v_new_balance INT := 0;
    v_new_total_earned INT := 0;
    v_new_qualifying_spend BIGINT := 0;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Kiểm tra idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Giao dịch tích điểm đã được xử lý trước đó (Idempotent).');
        END IF;
    END IF;

    -- 2. Kiểm tra cờ chính sách đã được phê duyệt và kích hoạt bởi Chủ cơ sở
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND OR v_policy.is_approved_by_owner = FALSE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'is_policy_blocked', TRUE,
            'error', 'Chính sách tích điểm Loyalty chưa được Chủ cơ sở phê duyệt kích hoạt. Giao dịch không tự động tích điểm.'
        );
    END IF;

    -- 3. Đối soát giá trị chi tiêu hợp lệ từ bảng sales phía Server (Không tin p_eligible_amount client gửi)
    IF p_sale_id IS NOT NULL THEN
        SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND organization_id = p_org_id;
        IF FOUND THEN
            IF v_sale.status != 'completed' THEN
                RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn chưa hoàn tất, không đủ điều kiện tích điểm.');
            END IF;
            -- Lấy số tiền thực thu làm căn cứ tích điểm
            v_actual_spend := LEAST(p_eligible_amount, v_sale.paid_amount);
        END IF;
    END IF;

    IF v_actual_spend <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Giá trị chi tiêu hợp lệ phải lớn hơn 0.');
    END IF;

    -- 4. Khóa dòng số dư khách hàng (FOR UPDATE)
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    -- 5. Tính toán hệ số nhân theo Hạng
    SELECT * INTO v_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;
    IF FOUND THEN
        v_multiplier := COALESCE(v_tier.points_multiplier, 1.00);
    END IF;

    -- 6. Quy đổi điểm theo chính sách và làm tròn
    v_base_points := FLOOR(v_actual_spend::NUMERIC / v_policy.earn_spend_ratio);
    v_final_points := FLOOR(v_base_points * v_multiplier);

    IF v_final_points <= 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'points_earned', 0, 'message', 'Chưa đủ ngưỡng tích điểm tối thiểu.');
    END IF;

    v_new_balance := v_balance.available_points + v_final_points;
    v_new_total_earned := v_balance.total_earned_points + v_final_points;
    v_new_qualifying_spend := v_balance.tier_qualifying_spend + v_actual_spend;
    v_expires_at := TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_policy.points_expiry_days || ' days')::INTERVAL;

    -- 7. Ghi sổ cái điểm (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, expires_at, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'earn', v_final_points,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tích điểm từ hóa đơn mua hàng', v_policy.policy_version,
        p_staff_id, v_expires_at, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 8. Cập nhật số dư tổng hợp
    UPDATE customer_loyalty_balances
    SET available_points = v_new_balance,
        total_earned_points = v_new_total_earned,
        tier_qualifying_spend = v_new_qualifying_spend,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_earned', v_final_points,
        'new_balance', v_new_balance,
        'multiplier_applied', v_multiplier,
        'message', 'Đã tích ' || v_final_points || ' điểm thành công.'
    );
END;
$$;
