-- =============================================================================
-- MIGRATION 037: BUSINESS POLICY REFINEMENT & HARDENING (TÁCH RIÊNG)
-- Mục đích:
-- 1. Kiểm tra người phụ trách buổi điều trị & phác đồ (performed_by, lead_doctor_id).
-- 2. Ràng buộc quan hệ ảnh - buổi - khách trong treatment_photos.
-- 3. Phân định phạm vi chi nhánh của cam kết điều trị (treatment_consents).
-- 4. Đảm bảo quyền hai đầu chi nhánh gửi và chi nhánh nhận cho branch_transfers.
-- =============================================================================

BEGIN;

-- 1. BUỔI ĐIỀU TRỊ (treatment_sessions): Bác sĩ thực hiện, Quản lý chi nhánh, Admin
DROP POLICY IF EXISTS treatment_sessions_select_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_insert_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_update_policy ON public.treatment_sessions;

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
            OR (performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
        )
    );

-- 2. ẢNH TRƯỚC/SAU (treatment_photos): Ràng buộc quan hệ ảnh - buổi - khách
DROP POLICY IF EXISTS treatment_photos_select_policy ON public.treatment_photos;
DROP POLICY IF EXISTS treatment_photos_insert_policy ON public.treatment_photos;

CREATE POLICY treatment_photos_select_policy ON public.treatment_photos
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
            OR EXISTS (
                SELECT 1 FROM public.treatment_sessions ts
                WHERE ts.id = treatment_photos.session_id
                  AND ts.performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
            )
        )
    );

CREATE POLICY treatment_photos_insert_policy ON public.treatment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) IN ('branch_manager', 'technician_doctor') AND (SELECT has_branch_access(branch_id)))
        )
    );

-- 3. CAM KẾT ĐIỀU TRỊ (treatment_consents): Phân định theo phạm vi chi nhánh & người chứng kiến
DROP POLICY IF EXISTS treatment_consents_select_policy ON public.treatment_consents;
DROP POLICY IF EXISTS treatment_consents_insert_policy ON public.treatment_consents;

CREATE POLICY treatment_consents_select_policy ON public.treatment_consents
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (
                -- Kiểm tra theo chi nhánh của khách hàng hoặc chi nhánh cam kết
                (SELECT get_current_user_role()) IN ('branch_manager', 'cashier_receptionist', 'technician_doctor')
                AND (
                    (branch_id IS NOT NULL AND (SELECT has_branch_access(branch_id)))
                    OR (branch_id IS NULL)
                )
            )
            OR witness_staff_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

CREATE POLICY treatment_consents_insert_policy ON public.treatment_consents
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) IN ('branch_manager', 'cashier_receptionist', 'technician_doctor') AND (branch_id IS NULL OR (SELECT has_branch_access(branch_id))))
        )
    );

-- 4. ĐIỀU CHUYỂN KHO ĐA CHI NHÁNH (branch_transfers & branch_transfer_items): Quản lý chi nhánh gửi HOẶC nhận
DROP POLICY IF EXISTS branch_transfers_select_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_insert_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_update_policy ON public.branch_transfers;

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
            OR (
                (SELECT get_current_user_role()) = 'branch_manager' 
                AND ((SELECT has_branch_access(from_branch_id)) OR (SELECT has_branch_access(to_branch_id)))
            )
        )
    );

COMMIT;
