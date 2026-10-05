-- =============================================================================
-- MIGRATION 036: MINIMAL ANONYMOUS BLOCK HOTFIX (LIVE VERIFIED)
-- Căn cứ: Kết quả trích xuất Catalog thực tế trên Live (Project: lskrcerzxltlrcewigrw)
-- Mục tiêu:
-- 1. Thu hồi toàn bộ quyền từ `anon` & `public` trên 12 bảng nhạy cảm.
-- 2. Xóa chính xác 19 Policies lỏng lẻo (`USING (true) TO anon, authenticated`) đang tồn tại trên Live.
-- 3. Tạo chính sách tối giản bảo toàn quyền nhân viên (`authenticated` theo `organization_id`), chặn 100% ẩn danh.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- BƯỚC 1: THU HỒI QUYỀN TRUY CẬP TỪ ANON & PUBLIC
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

-- -----------------------------------------------------------------------------
-- BƯỚC 2: CẤP QUYỀN CHO AUTHENTICATED VÀ SERVICE_ROLE
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_shifts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_photos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_consents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_session_audits TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_transfers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_transfer_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_notes TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- BƯỚC 3: XÓA CHÍNH XÁC 19 POLICIES LỎNG LẺO ĐANG TỒN TẠI TRÊN LIVE
-- -----------------------------------------------------------------------------
-- 1. payroll_records
DROP POLICY IF EXISTS rls_payroll_records_all ON public.payroll_records;

-- 2. commission_records
DROP POLICY IF EXISTS rls_commission_records_all ON public.commission_records;

-- 3. roster_shifts
DROP POLICY IF EXISTS rls_roster_shifts_all ON public.roster_shifts;

-- 4. treatment_sessions
DROP POLICY IF EXISTS rls_treatment_sessions_read ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_write ON public.treatment_sessions;

-- 5. treatment_photos
DROP POLICY IF EXISTS rls_treatment_photos_read ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_write ON public.treatment_photos;

-- 6. treatment_consents
DROP POLICY IF EXISTS rls_treatment_consents_read ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_write ON public.treatment_consents;

-- 7. treatment_plans
DROP POLICY IF EXISTS rls_treatment_plans_read ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_write ON public.treatment_plans;

-- 8. treatment_session_audits
DROP POLICY IF EXISTS rls_treatment_session_audits_read ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_write ON public.treatment_session_audits;

-- 9. branch_transfers
DROP POLICY IF EXISTS rls_branch_transfers_read ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_write ON public.branch_transfers;

-- 10. branch_transfer_items
DROP POLICY IF EXISTS rls_branch_transfer_items_read ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_write ON public.branch_transfer_items;

-- 11. purchase_orders
DROP POLICY IF EXISTS rls_po_read ON public.purchase_orders;
DROP POLICY IF EXISTS rls_po_write ON public.purchase_orders;

-- 12. goods_receipt_notes
DROP POLICY IF EXISTS rls_grn_read ON public.goods_receipt_notes;
DROP POLICY IF EXISTS rls_grn_write ON public.goods_receipt_notes;

-- -----------------------------------------------------------------------------
-- BƯỚC 4: THIẾT LẬP CHÍNH SÁCH BẢO TỒN NHÂN VIÊN (CHỈ DÀNH CHO AUTHENTICATED)
-- -----------------------------------------------------------------------------
-- 1. payroll_records
CREATE POLICY rls_payroll_records_auth_read ON public.payroll_records
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_payroll_records_auth_write ON public.payroll_records
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 2. commission_records
CREATE POLICY rls_commission_records_auth_read ON public.commission_records
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_commission_records_auth_write ON public.commission_records
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 3. roster_shifts
CREATE POLICY rls_roster_shifts_auth_read ON public.roster_shifts
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_roster_shifts_auth_write ON public.roster_shifts
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 4. treatment_sessions
CREATE POLICY rls_treatment_sessions_auth_read ON public.treatment_sessions
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_treatment_sessions_auth_write ON public.treatment_sessions
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 5. treatment_photos
CREATE POLICY rls_treatment_photos_auth_read ON public.treatment_photos
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_treatment_photos_auth_write ON public.treatment_photos
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 6. treatment_consents
CREATE POLICY rls_treatment_consents_auth_read ON public.treatment_consents
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_treatment_consents_auth_write ON public.treatment_consents
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 7. treatment_plans
CREATE POLICY rls_treatment_plans_auth_read ON public.treatment_plans
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_treatment_plans_auth_write ON public.treatment_plans
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 8. treatment_session_audits
CREATE POLICY rls_treatment_session_audits_auth_read ON public.treatment_session_audits
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_treatment_session_audits_auth_write ON public.treatment_session_audits
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 9. branch_transfers
CREATE POLICY rls_branch_transfers_auth_read ON public.branch_transfers
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_branch_transfers_auth_write ON public.branch_transfers
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 10. branch_transfer_items
CREATE POLICY rls_branch_transfer_items_auth_read ON public.branch_transfer_items
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_branch_transfer_items_auth_write ON public.branch_transfer_items
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 11. purchase_orders
CREATE POLICY rls_purchase_orders_auth_read ON public.purchase_orders
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_purchase_orders_auth_write ON public.purchase_orders
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- 12. goods_receipt_notes
CREATE POLICY rls_goods_receipt_notes_auth_read ON public.goods_receipt_notes
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_goods_receipt_notes_auth_write ON public.goods_receipt_notes
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

COMMIT;
