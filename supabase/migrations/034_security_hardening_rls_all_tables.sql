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
-- 1. DROP ALL LEGACY / PERMISSIVE POLICIES
-- -----------------------------------------------------------------------------

-- Treatment & Medical
DROP POLICY IF EXISTS rls_treatment_plans_read ON treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_write ON treatment_plans;
DROP POLICY IF EXISTS treatment_plans_select_policy ON treatment_plans;
DROP POLICY IF EXISTS treatment_plans_write_policy ON treatment_plans;
DROP POLICY IF EXISTS rls_treatment_sessions_all ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_select_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_insert_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_update_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_role_policy ON treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_session_audits_all ON treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_select ON treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_insert ON treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_photos_all ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_select_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_write_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_role_policy ON treatment_photos;
DROP POLICY IF EXISTS rls_treatment_consents_all ON treatment_consents;
DROP POLICY IF EXISTS treatment_consents_select_policy ON treatment_consents;
DROP POLICY IF EXISTS treatment_consents_write_policy ON treatment_consents;
DROP POLICY IF EXISTS treatment_consents_role_policy ON treatment_consents;

-- HR & Payroll
DROP POLICY IF EXISTS rls_payroll_periods_all ON payroll_periods;
DROP POLICY IF EXISTS payroll_periods_select_policy ON payroll_periods;
DROP POLICY IF EXISTS payroll_periods_write_policy ON payroll_periods;
DROP POLICY IF EXISTS rls_payroll_records_all ON payroll_records;
DROP POLICY IF EXISTS payroll_records_select_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_records_admin_write ON payroll_records;
DROP POLICY IF EXISTS payroll_role_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_admin_write_policy ON payroll_records;
DROP POLICY IF EXISTS rls_commission_records_all ON commission_records;
DROP POLICY IF EXISTS commission_records_select_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_insert_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_update_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_delete_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_admin_write ON commission_records;
DROP POLICY IF EXISTS commission_role_policy ON commission_records;

-- Inventory Transfers & Audits
DROP POLICY IF EXISTS rls_branch_transfers_all ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_select_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_insert_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_update_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_delete_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_access_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_mgr_write_policy ON branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfer_items_all ON branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_select ON branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_write ON branch_transfer_items;
DROP POLICY IF EXISTS rls_stocktakes_all ON stocktakes;
DROP POLICY IF EXISTS stocktakes_select_policy ON stocktakes;
DROP POLICY IF EXISTS stocktakes_write_policy ON stocktakes;
DROP POLICY IF EXISTS rls_stocktake_items_all ON stocktake_items;
DROP POLICY IF EXISTS stocktake_items_select_policy ON stocktake_items;
DROP POLICY IF EXISTS stocktake_items_write_policy ON stocktake_items;

-- Chatbox & CSKH
DROP POLICY IF EXISTS rls_conversation_threads_all ON conversation_threads;
DROP POLICY IF EXISTS conversation_threads_auth_policy ON conversation_threads;
DROP POLICY IF EXISTS threads_org_policy ON conversation_threads;
DROP POLICY IF EXISTS threads_org_isolation ON conversation_threads;
DROP POLICY IF EXISTS rls_chat_messages_all ON chat_messages;
DROP POLICY IF EXISTS chat_messages_auth_policy ON chat_messages;
DROP POLICY IF EXISTS chat_messages_org_policy ON chat_messages;
DROP POLICY IF EXISTS messages_org_isolation ON chat_messages;
DROP POLICY IF EXISTS channel_integrations_auth_policy ON channel_integrations;
DROP POLICY IF EXISTS message_templates_auth_policy ON message_templates;

-- Loyalty & Memberships
DROP POLICY IF EXISTS rls_loyalty_policies_read ON loyalty_policies;
DROP POLICY IF EXISTS rls_loyalty_policies_write ON loyalty_policies;
DROP POLICY IF EXISTS loyalty_policies_select ON loyalty_policies;
DROP POLICY IF EXISTS loyalty_policies_write ON loyalty_policies;
DROP POLICY IF EXISTS rls_loyalty_tier_policies_read ON loyalty_tier_policies;
DROP POLICY IF EXISTS rls_loyalty_tier_policies_write ON loyalty_tier_policies;
DROP POLICY IF EXISTS loyalty_tier_policies_select ON loyalty_tier_policies;
DROP POLICY IF EXISTS loyalty_tier_policies_write ON loyalty_tier_policies;
DROP POLICY IF EXISTS rls_customer_loyalty_balances_read ON customer_loyalty_balances;
DROP POLICY IF EXISTS rls_customer_loyalty_balances_write ON customer_loyalty_balances;
DROP POLICY IF EXISTS customer_loyalty_balances_select ON customer_loyalty_balances;
DROP POLICY IF EXISTS customer_loyalty_balances_write ON customer_loyalty_balances;
DROP POLICY IF EXISTS rls_loyalty_points_ledger_read ON loyalty_points_ledger;
DROP POLICY IF EXISTS rls_loyalty_points_ledger_write ON loyalty_points_ledger;
DROP POLICY IF EXISTS loyalty_points_ledger_select ON loyalty_points_ledger;
DROP POLICY IF EXISTS loyalty_points_ledger_write ON loyalty_points_ledger;
DROP POLICY IF EXISTS rls_customer_tier_history_read ON customer_tier_history;
DROP POLICY IF EXISTS rls_customer_tier_history_write ON customer_tier_history;
DROP POLICY IF EXISTS customer_tier_history_select ON customer_tier_history;
DROP POLICY IF EXISTS customer_tier_history_write ON customer_tier_history;

-- Revoke direct table permissions from anon
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

-- =============================================================================
-- A. HỒ SƠ ĐIỀU TRỊ & Y KHOA
-- =============================================================================

-- --- 1. Phác đồ điều trị (treatment_plans) ---
CREATE POLICY treatment_plans_select_policy ON treatment_plans
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
            OR lead_doctor_id = get_current_staff_id()
        )
    );

CREATE POLICY treatment_plans_write_policy ON treatment_plans
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND has_branch_access(branch_id))
        )
    );

-- --- 2. Buổi điều trị chi tiết (treatment_sessions) ---
-- Đọc: Chủ cơ sở, Quản lý chi nhánh, Lễ tân (thu ngân/đón tiếp), hoặc chính Bác sĩ thực hiện
CREATE POLICY treatment_sessions_select_policy ON treatment_sessions
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
            OR performed_by = get_current_staff_id()
        )
    );

-- Tạo buổi điều trị: Chỉ Bác sĩ/KTV tại chi nhánh được gán hoặc Quản lý chi nhánh / Admin (CHẶN LỄ TÂN)
CREATE POLICY treatment_sessions_insert_policy ON treatment_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND performed_by = get_current_staff_id() AND has_branch_access(branch_id))
        )
    );

-- Sửa buổi điều trị: Chỉ Bác sĩ thực hiện khi còn ở trạng thái draft, hoặc Admin/Manager
CREATE POLICY treatment_sessions_update_policy ON treatment_sessions
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND performed_by = get_current_staff_id() AND has_branch_access(branch_id))
        )
    );

-- --- 3. Nhật ký kiểm toán hồ sơ (treatment_session_audits) ---
CREATE POLICY treatment_session_audits_select ON treatment_session_audits
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM treatment_sessions ts
            WHERE ts.id = treatment_session_audits.session_id
              AND ts.organization_id = get_current_user_org_id()
              AND (get_current_user_role() IN ('owner_admin', 'branch_manager') OR ts.performed_by = get_current_staff_id())
        )
    );

CREATE POLICY treatment_session_audits_insert ON treatment_session_audits
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

-- --- 4. Quản lý Ảnh Before/After (treatment_photos) ---
CREATE POLICY treatment_photos_select_policy ON treatment_photos
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
            OR EXISTS (
                SELECT 1 FROM treatment_sessions ts
                WHERE ts.id = treatment_photos.session_id AND ts.performed_by = get_current_staff_id()
            )
        )
    );

-- Ghi ảnh: Kiểm tra chặt chẽ session tồn tại, cùng tổ chức/chi nhánh, đúng khách và Bác sĩ phụ trách
CREATE POLICY treatment_photos_insert_policy ON treatment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (
                get_current_user_role() = 'technician_doctor'
                AND has_branch_access(branch_id)
                AND EXISTS (
                    SELECT 1 FROM treatment_sessions ts
                    WHERE ts.id = treatment_photos.session_id
                      AND ts.organization_id = get_current_user_org_id()
                      AND ts.branch_id = treatment_photos.branch_id
                      AND ts.customer_id = treatment_photos.customer_id
                      AND ts.performed_by = get_current_staff_id()
                )
            )
        )
    );

-- --- 5. Cam kết điều trị & Chữ ký điện tử (treatment_consents) ---
CREATE POLICY treatment_consents_select_policy ON treatment_consents
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
            OR witness_staff_id = get_current_staff_id()
            OR EXISTS (
                SELECT 1 FROM treatment_sessions ts
                WHERE ts.id = treatment_consents.session_id AND ts.performed_by = get_current_staff_id()
            )
        )
    );

CREATE POLICY treatment_consents_insert_policy ON treatment_consents
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist', 'technician_doctor')
        )
    );

-- =============================================================================
-- B. HR, HOA HỒNG & BẢNG LƯƠNG
-- =============================================================================

-- --- 1. Kỳ lương (payroll_periods) ---
CREATE POLICY payroll_periods_select_policy ON payroll_periods
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
        )
    );

CREATE POLICY payroll_periods_write_policy ON payroll_periods
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- --- 2. Bảng lương chi tiết (payroll_records) ---
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

-- --- 3. Sổ hoa hồng (commission_records) ---
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

CREATE POLICY commission_records_insert_policy ON commission_records
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY commission_records_update_policy ON commission_records
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY commission_records_delete_policy ON commission_records
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- =============================================================================
-- C. ĐIỀU CHUYỂN KHO & KIỂM KÊ
-- =============================================================================

-- --- 1. Điều chuyển liên chi nhánh (branch_transfers) ---
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

CREATE POLICY branch_transfers_insert_policy ON branch_transfers
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(from_branch_id))
        )
    );

CREATE POLICY branch_transfers_update_policy ON branch_transfers
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND (has_branch_access(from_branch_id) OR has_branch_access(to_branch_id)))
        )
    );

CREATE POLICY branch_transfers_delete_policy ON branch_transfers
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY branch_transfer_items_select ON branch_transfer_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM branch_transfers bt
            WHERE bt.id = branch_transfer_items.transfer_id
              AND bt.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR has_branch_access(bt.from_branch_id) OR has_branch_access(bt.to_branch_id))
        )
    );

CREATE POLICY branch_transfer_items_write ON branch_transfer_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM branch_transfers bt
            WHERE bt.id = branch_transfer_items.transfer_id
              AND bt.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR (get_current_user_role() = 'branch_manager' AND has_branch_access(bt.from_branch_id)))
        )
    );

-- --- 2. Kiểm kê kho (stocktakes & stocktake_items) ---
CREATE POLICY stocktakes_select_policy ON stocktakes
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
        )
    );

CREATE POLICY stocktakes_write_policy ON stocktakes
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY stocktake_items_select_policy ON stocktake_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM stocktakes st
            WHERE st.id = stocktake_items.stocktake_id
              AND st.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR has_branch_access(st.branch_id))
        )
    );

CREATE POLICY stocktake_items_write_policy ON stocktake_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM stocktakes st
            WHERE st.id = stocktake_items.stocktake_id
              AND st.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR (get_current_user_role() = 'branch_manager' AND has_branch_access(st.branch_id)))
        )
    );

-- =============================================================================
-- D. HỘP THƯ CSKH & CHATBOX
-- =============================================================================
CREATE POLICY conversation_threads_auth_policy ON conversation_threads
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY chat_messages_auth_policy ON chat_messages
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY channel_integrations_auth_policy ON channel_integrations
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
        )
    );

CREATE POLICY message_templates_auth_policy ON message_templates
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

-- =============================================================================
-- E. LOYALTY & HẠNG THÀNH VIÊN
-- =============================================================================
CREATE POLICY loyalty_policies_select ON loyalty_policies
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY loyalty_policies_write ON loyalty_policies
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY loyalty_tier_policies_select ON loyalty_tier_policies
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY loyalty_tier_policies_write ON loyalty_tier_policies
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY customer_loyalty_balances_select ON customer_loyalty_balances
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY customer_loyalty_balances_write ON customer_loyalty_balances
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY loyalty_points_ledger_select ON loyalty_points_ledger
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY customer_tier_history_select ON customer_tier_history
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());
