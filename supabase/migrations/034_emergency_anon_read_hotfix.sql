-- =============================================================================
-- MIGRATION 034: EMERGENCY ANONYMOUS READ & ROLE/BRANCH ISOLATION HOTFIX
-- Target: PostgreSQL / Supabase Live & Staging
-- Mục đích:
-- 1. Chặn 100% truy cập ẩn danh (anon & public) trên đúng 12 bảng nhạy cảm.
-- 2. Thiết lập chặt chẽ cách ly đa tổ chức (Cross-Org) và phân quyền chi nhánh
--    (Cross-Branch) theo đúng vai trò nghiệp vụ (RBAC).
-- 3. KHÔNG sử dụng USING (TRUE) trên bất kỳ bảng nhạy cảm nào.
-- 4. BẢO TOÀN NGUYÊN VẸN chat_messages, conversation_threads, channel_integrations
--    để đảm bảo luồng đồng bộ tin nhắn Facebook Messenger & Telegram hoạt động bình thường.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- BƯỚC 0: KIỂM TRA ĐIỀU KIỆN TIÊN QUYẾT (PRE-FLIGHT CHECK ĐỦ 12 BẢNG)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing_tables TEXT[];
BEGIN
    SELECT ARRAY_AGG(t)
    INTO v_missing_tables
    FROM (
        SELECT unnest(ARRAY[
            'payroll_records', 'commission_records', 'roster_shifts',
            'treatment_sessions', 'treatment_photos', 'treatment_consents',
            'treatment_plans', 'treatment_session_audits', 'branch_transfers',
            'branch_transfer_items', 'purchase_orders', 'goods_receipt_notes'
        ]) AS t
    ) req
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = req.t
    );

    IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Pre-flight check failed: Thiếu bảng mục tiêu %', v_missing_tables;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- BƯỚC 1: THU HỒI QUYỀN TỪ ANON & PUBLIC TRÊN ĐÚNG 12 BẢNG
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.payroll_records FROM anon, public;
REVOKE ALL ON public.commission_records FROM anon, public;
REVOKE ALL ON public.roster_shifts FROM anon, public;
REVOKE ALL ON public.treatment_sessions FROM anon, public;
REVOKE ALL ON public.treatment_photos FROM anon, public;
REVOKE ALL ON public.treatment_consents FROM anon, public;
REVOKE ALL ON public.treatment_plans FROM anon, public;
REVOKE ALL ON public.treatment_session_audits FROM anon, public;
REVOKE ALL ON public.branch_transfers FROM anon, public;
REVOKE ALL ON public.branch_transfer_items FROM anon, public;
REVOKE ALL ON public.purchase_orders FROM anon, public;
REVOKE ALL ON public.goods_receipt_notes FROM anon, public;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_shifts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_photos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_consents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated, service_role;
GRANT SELECT, INSERT ON public.treatment_session_audits TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_transfers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_transfer_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_notes TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- BƯỚC 2: BẢO ĐẢM ENABLE ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_session_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_notes ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- BƯỚC 3: XÓA CÁC POLICY CŨ / LỎNG LẺO TRÊN 12 BẢNG
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_payroll_records_all ON public.payroll_records;
DROP POLICY IF EXISTS rls_payroll_records_anon_block ON public.payroll_records;
DROP POLICY IF EXISTS rls_payroll_records_authenticated ON public.payroll_records;
DROP POLICY IF EXISTS payroll_records_select_policy ON public.payroll_records;
DROP POLICY IF EXISTS payroll_records_admin_write ON public.payroll_records;

DROP POLICY IF EXISTS rls_commission_records_all ON public.commission_records;
DROP POLICY IF EXISTS rls_commission_records_authenticated ON public.commission_records;
DROP POLICY IF EXISTS commission_records_select_policy ON public.commission_records;
DROP POLICY IF EXISTS commission_records_insert_policy ON public.commission_records;
DROP POLICY IF EXISTS commission_records_update_policy ON public.commission_records;
DROP POLICY IF EXISTS commission_records_delete_policy ON public.commission_records;

DROP POLICY IF EXISTS rls_roster_shifts_read ON public.roster_shifts;
DROP POLICY IF EXISTS rls_roster_shifts_admin_modify ON public.roster_shifts;

DROP POLICY IF EXISTS rls_treatment_sessions_read ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_write ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_authenticated ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_select_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_insert_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_update_policy ON public.treatment_sessions;

DROP POLICY IF EXISTS rls_treatment_photos_read ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_write ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_authenticated ON public.treatment_photos;
DROP POLICY IF EXISTS treatment_photos_select_policy ON public.treatment_photos;
DROP POLICY IF EXISTS treatment_photos_insert_policy ON public.treatment_photos;

DROP POLICY IF EXISTS rls_treatment_consents_read ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_write ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_authenticated ON public.treatment_consents;
DROP POLICY IF EXISTS treatment_consents_select_policy ON public.treatment_consents;
DROP POLICY IF EXISTS treatment_consents_insert_policy ON public.treatment_consents;

DROP POLICY IF EXISTS rls_treatment_plans_read ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_write ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_authenticated ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_select_policy ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_write_policy ON public.treatment_plans;

DROP POLICY IF EXISTS rls_treatment_session_audits_read ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_write ON public.treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_insert ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_authenticated ON public.treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_select ON public.treatment_session_audits;

DROP POLICY IF EXISTS rls_branch_transfers_read ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_write ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_authenticated ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_select_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_insert_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_update_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_delete_policy ON public.branch_transfers;

DROP POLICY IF EXISTS rls_branch_transfer_items_read ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_write ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_authenticated ON public.branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_select ON public.branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_write ON public.branch_transfer_items;

DROP POLICY IF EXISTS rls_po_read ON public.purchase_orders;
DROP POLICY IF EXISTS rls_po_write ON public.purchase_orders;
DROP POLICY IF EXISTS rls_purchase_orders_authenticated ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_select_policy ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_write_policy ON public.purchase_orders;

DROP POLICY IF EXISTS rls_grn_read ON public.goods_receipt_notes;
DROP POLICY IF EXISTS rls_grn_write ON public.goods_receipt_notes;
DROP POLICY IF EXISTS rls_goods_receipt_notes_authenticated ON public.goods_receipt_notes;
DROP POLICY IF EXISTS goods_receipt_notes_select_policy ON public.goods_receipt_notes;
DROP POLICY IF EXISTS goods_receipt_notes_write_policy ON public.goods_receipt_notes;

-- -----------------------------------------------------------------------------
-- BƯỚC 4: THIẾT LẬP CHÍNH SÁCH BẢO VỆ PHÂN QUYỀN CHUẨN (RBAC & CHI NHÁNH)
-- -----------------------------------------------------------------------------

-- 4.1. Lương nhân viên (payroll_records): Admin, Manager (chi nhánh), Nhân viên (chỉ bản thân)
CREATE POLICY payroll_records_select_policy ON public.payroll_records
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR staff_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

CREATE POLICY payroll_records_admin_write ON public.payroll_records
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) = 'owner_admin'
    );

-- 4.2. Hoa hồng (commission_records): Admin, Manager (chi nhánh), Nhân viên (chỉ bản thân)
CREATE POLICY commission_records_select_policy ON public.commission_records
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR staff_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

CREATE POLICY commission_records_insert_policy ON public.commission_records
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
        )
    );

CREATE POLICY commission_records_update_policy ON public.commission_records
    FOR UPDATE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
        )
    );

CREATE POLICY commission_records_delete_policy ON public.commission_records
    FOR DELETE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) = 'owner_admin'
    );

-- 4.3. Phân ca trực (roster_shifts): Đọc trong cùng tổ chức, Ghi bởi Admin / Manager chi nhánh
CREATE POLICY rls_roster_shifts_read ON public.roster_shifts
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_roster_shifts_admin_modify ON public.roster_shifts
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
        )
    );

-- 4.4. Phác đồ điều trị (treatment_plans): Admin, Manager (chi nhánh), Bác sĩ phụ trách
CREATE POLICY treatment_plans_select_policy ON public.treatment_plans
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
            OR lead_doctor_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

CREATE POLICY treatment_plans_write_policy ON public.treatment_plans
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR ((SELECT get_current_user_role()) = 'technician_doctor' AND (SELECT has_branch_access(branch_id)))
        )
    );

-- 4.5. Buổi điều trị (treatment_sessions): Admin, Nhân sự cùng chi nhánh, Bác sĩ thực hiện
CREATE POLICY treatment_sessions_select_policy ON public.treatment_sessions
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
            OR performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

CREATE POLICY treatment_sessions_insert_policy ON public.treatment_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR ((SELECT get_current_user_role()) = 'technician_doctor' AND (SELECT has_branch_access(branch_id)))
        )
    );

CREATE POLICY treatment_sessions_update_policy ON public.treatment_sessions
    FOR UPDATE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR ((SELECT get_current_user_role()) = 'technician_doctor' AND (SELECT has_branch_access(branch_id)))
        )
    );

-- 4.6. Ảnh Before/After (treatment_photos): Admin, Chi nhánh, Bác sĩ phụ trách
CREATE POLICY treatment_photos_select_policy ON public.treatment_photos
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
        )
    );

CREATE POLICY treatment_photos_insert_policy ON public.treatment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR ((SELECT get_current_user_role()) = 'technician_doctor' AND (SELECT has_branch_access(branch_id)))
        )
    );

-- 4.7. Cam kết điều trị (treatment_consents): Cùng tổ chức
CREATE POLICY treatment_consents_select_policy ON public.treatment_consents
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager', 'cashier_receptionist', 'technician_doctor')
            OR witness_staff_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

CREATE POLICY treatment_consents_insert_policy ON public.treatment_consents
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager', 'cashier_receptionist', 'technician_doctor')
    );

-- 4.8. Nhật ký hồ sơ (treatment_session_audits): Chỉ xem khi có quyền trên session liên quan
CREATE POLICY treatment_session_audits_select ON public.treatment_session_audits
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.treatment_sessions ts
            WHERE ts.id = treatment_session_audits.session_id
              AND ts.organization_id = (SELECT get_current_user_org_id())
              AND (
                  (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
                  OR ts.performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
              )
        )
    );

-- 4.9. Điều chuyển kho (branch_transfers): Admin hoặc Manager của chi nhánh gửi/nhận
CREATE POLICY branch_transfers_select_policy ON public.branch_transfers
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(from_branch_id))
            OR (SELECT has_branch_access(to_branch_id))
        )
    );

CREATE POLICY branch_transfers_insert_policy ON public.branch_transfers
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(from_branch_id)))
        )
    );

CREATE POLICY branch_transfers_update_policy ON public.branch_transfers
    FOR UPDATE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND ((SELECT has_branch_access(from_branch_id)) OR (SELECT has_branch_access(to_branch_id))))
        )
    );

CREATE POLICY branch_transfers_delete_policy ON public.branch_transfers
    FOR DELETE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) = 'owner_admin'
    );

-- 4.10. Dòng hàng điều chuyển (branch_transfer_items): Kế thừa từ branch_transfers
CREATE POLICY branch_transfer_items_select ON public.branch_transfer_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.branch_transfers bt
            WHERE bt.id = branch_transfer_items.transfer_id
              AND bt.organization_id = (SELECT get_current_user_org_id())
              AND (
                  (SELECT get_current_user_role()) = 'owner_admin'
                  OR (SELECT has_branch_access(bt.from_branch_id))
                  OR (SELECT has_branch_access(bt.to_branch_id))
              )
        )
    );

CREATE POLICY branch_transfer_items_write ON public.branch_transfer_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.branch_transfers bt
            WHERE bt.id = branch_transfer_items.transfer_id
              AND bt.organization_id = (SELECT get_current_user_org_id())
              AND (
                  (SELECT get_current_user_role()) = 'owner_admin'
                  OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(bt.from_branch_id)))
              )
        )
    );

-- 4.11. Đơn đặt hàng NCC (purchase_orders): Admin, Chi nhánh phụ trách
CREATE POLICY purchase_orders_select_policy ON public.purchase_orders
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
        )
    );

CREATE POLICY purchase_orders_write_policy ON public.purchase_orders
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
        )
    );

-- 4.12. Phiếu nhập kho (goods_receipt_notes): Admin, Chi nhánh phụ trách
CREATE POLICY goods_receipt_notes_select_policy ON public.goods_receipt_notes
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
        )
    );

CREATE POLICY goods_receipt_notes_write_policy ON public.goods_receipt_notes
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
        )
    );

COMMIT;
