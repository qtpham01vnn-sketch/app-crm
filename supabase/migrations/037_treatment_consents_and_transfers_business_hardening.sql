-- =============================================================================
-- MIGRATION 037: BUSINESS POLICY REFINEMENT & HARDENING (STAGING HARDENING)
-- Mục đích:
-- 1. Dọn sạch triệt để toàn bộ policy cũ để tránh cộng dồn Permissive OR.
-- 2. Giới hạn chặt chẽ theo Tổ chức, Chi nhánh, Vai trò và Bác sĩ phụ trách.
-- 3. Ràng buộc quan hệ ảnh - buổi điều trị - khách hàng (treatment_photos):
--    - Có session_id: Khớp org, branch, customer và bác sĩ phụ trách.
--    - Không session_id: Giới hạn theo branch_access và vai trò y khoa.
-- 4. Cam kết điều trị (treatment_consents): Phân định theo chi nhánh phát sinh thực tế.
-- 5. Bảo vệ hồ sơ điều trị đã khóa (completed/locked) qua cả RLS & Trigger chặn sửa.
-- 6. Nhật ký kiểm toán (treatment_session_audits): CẤM client tự ý INSERT/UPDATE/DELETE,
--    nhật ký chỉ được ghi qua Trigger tự động / Security Definer RPC.
-- 7. Điều chuyển kho (branch_transfers): Bảo toàn quyền 2 đầu chi nhánh gửi/nhận.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- BƯỚC 1: DỌN SẠCH TOÀN BỘ CÁC POLICY CŨ TRÊN CẢ 7 BẢNG LIÊN QUAN
-- -----------------------------------------------------------------------------
-- 1. treatment_sessions
DROP POLICY IF EXISTS rls_treatment_sessions_read ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_write ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_all ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_authenticated ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_role_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_auth_read ON public.treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_sessions_auth_write ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_select_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_insert_policy ON public.treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_update_policy ON public.treatment_sessions;

-- 2. treatment_photos
DROP POLICY IF EXISTS rls_treatment_photos_read ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_write ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_all ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_authenticated ON public.treatment_photos;
DROP POLICY IF EXISTS treatment_photos_role_policy ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_auth_read ON public.treatment_photos;
DROP POLICY IF EXISTS rls_treatment_photos_auth_write ON public.treatment_photos;
DROP POLICY IF EXISTS treatment_photos_select_policy ON public.treatment_photos;
DROP POLICY IF EXISTS treatment_photos_insert_policy ON public.treatment_photos;

-- 3. treatment_consents
DROP POLICY IF EXISTS rls_treatment_consents_read ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_write ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_all ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_authenticated ON public.treatment_consents;
DROP POLICY IF EXISTS treatment_consents_role_policy ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_auth_read ON public.treatment_consents;
DROP POLICY IF EXISTS rls_treatment_consents_auth_write ON public.treatment_consents;
DROP POLICY IF EXISTS treatment_consents_select_policy ON public.treatment_consents;
DROP POLICY IF EXISTS treatment_consents_insert_policy ON public.treatment_consents;

-- 4. treatment_plans
DROP POLICY IF EXISTS rls_treatment_plans_read ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_write ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_all ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_authenticated ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_role_policy ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_auth_read ON public.treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_auth_write ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_select_policy ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_insert_policy ON public.treatment_plans;
DROP POLICY IF EXISTS treatment_plans_update_policy ON public.treatment_plans;

-- 5. treatment_session_audits
DROP POLICY IF EXISTS rls_treatment_session_audits_read ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_write ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_all ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_authenticated ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_auth_read ON public.treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_session_audits_auth_write ON public.treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_select_policy ON public.treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_insert_policy ON public.treatment_session_audits;

-- 6. branch_transfers
DROP POLICY IF EXISTS rls_branch_transfers_read ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_write ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_all ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_authenticated ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_auth_read ON public.branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfers_auth_write ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_select_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_insert_policy ON public.branch_transfers;
DROP POLICY IF EXISTS branch_transfers_update_policy ON public.branch_transfers;

-- 7. branch_transfer_items
DROP POLICY IF EXISTS rls_branch_transfer_items_read ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_write ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_all ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_authenticated ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_auth_read ON public.branch_transfer_items;
DROP POLICY IF EXISTS rls_branch_transfer_items_auth_write ON public.branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_select_policy ON public.branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_insert_policy ON public.branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_update_policy ON public.branch_transfer_items;

-- -----------------------------------------------------------------------------
-- BƯỚC 2: BUỔI ĐIỀU TRỊ (treatment_sessions) & BẢO VỆ HỒ SƠ ĐÃ KHÓA
-- -----------------------------------------------------------------------------
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
            OR (
                (SELECT get_current_user_role()) = 'branch_manager' 
                AND (SELECT has_branch_access(branch_id))
                AND status NOT IN ('completed', 'locked')
            )
            OR (
                performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
                AND status NOT IN ('completed', 'locked')
            )
        )
    );

-- Trigger chặn sửa trực tiếp hồ sơ đã khóa ở cấp độ Database
CREATE OR REPLACE FUNCTION trg_guard_locked_treatment_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status IN ('completed', 'locked') AND (SELECT get_current_user_role()) <> 'owner_admin' THEN
        RAISE EXCEPTION 'Hồ sơ điều trị đã được khóa/hoàn thành y khoa, không thể chỉnh sửa.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_locked_treatment_session ON public.treatment_sessions;
CREATE TRIGGER trg_guard_locked_treatment_session
BEFORE UPDATE ON public.treatment_sessions
FOR EACH ROW
EXECUTE FUNCTION trg_guard_locked_treatment_session();

-- -----------------------------------------------------------------------------
-- BƯỚC 3: PHÁC ĐỒ ĐIỀU TRỊ (treatment_plans)
-- -----------------------------------------------------------------------------
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

CREATE POLICY treatment_plans_insert_policy ON public.treatment_plans
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) IN ('branch_manager', 'technician_doctor') AND (SELECT has_branch_access(branch_id)))
        )
    );

CREATE POLICY treatment_plans_update_policy ON public.treatment_plans
    FOR UPDATE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
            OR lead_doctor_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

-- -----------------------------------------------------------------------------
-- BƯỚC 4: ẢNH ĐIỀU TRỊ (treatment_photos): Ràng buộc quan hệ ảnh - buổi - khách
-- -----------------------------------------------------------------------------
CREATE POLICY treatment_photos_select_policy ON public.treatment_photos
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
            OR (
                session_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.treatment_sessions ts
                    WHERE ts.id = treatment_photos.session_id
                      AND ts.performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
                )
            )
        )
    );

CREATE POLICY treatment_photos_insert_policy ON public.treatment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT has_branch_access(branch_id))
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager', 'technician_doctor')
        AND (
            session_id IS NULL 
            OR EXISTS (
                SELECT 1 FROM public.treatment_sessions ts
                WHERE ts.id = treatment_photos.session_id
                  AND ts.organization_id = treatment_photos.organization_id
                  AND ts.branch_id = treatment_photos.branch_id
                  AND ts.customer_id = treatment_photos.customer_id
                  AND (
                      (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
                      OR ts.performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
                  )
            )
        )
    );

-- -----------------------------------------------------------------------------
-- BƯỚC 5: CAM KẾT ĐIỀU TRỊ (treatment_consents): Phân định theo chi nhánh phát sinh thực tế
-- -----------------------------------------------------------------------------
CREATE POLICY treatment_consents_select_policy ON public.treatment_consents
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR witness_staff_id = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
            OR (
                session_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.treatment_sessions ts 
                    WHERE ts.id = treatment_consents.session_id 
                      AND (SELECT has_branch_access(ts.branch_id))
                )
            )
            OR (
                treatment_plan_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.treatment_plans tp 
                    WHERE tp.id = treatment_consents.treatment_plan_id 
                      AND (SELECT has_branch_access(tp.branch_id))
                )
            )
            OR (
                session_id IS NULL AND treatment_plan_id IS NULL AND EXISTS (
                    SELECT 1 FROM public.customers c 
                    WHERE c.id = treatment_consents.customer_id 
                      AND c.primary_branch_id IS NOT NULL 
                      AND (SELECT has_branch_access(c.primary_branch_id))
                )
            )
        )
    );

CREATE POLICY treatment_consents_insert_policy ON public.treatment_consents
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (
                (SELECT get_current_user_role()) IN ('branch_manager', 'cashier_receptionist', 'technician_doctor')
                AND (
                    (session_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.treatment_sessions ts 
                        WHERE ts.id = treatment_consents.session_id 
                          AND (SELECT has_branch_access(ts.branch_id))
                    ))
                    OR (treatment_plan_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.treatment_plans tp 
                        WHERE tp.id = treatment_consents.treatment_plan_id 
                          AND (SELECT has_branch_access(tp.branch_id))
                    ))
                    OR (session_id IS NULL AND treatment_plan_id IS NULL AND EXISTS (
                        SELECT 1 FROM public.customers c 
                        WHERE c.id = treatment_consents.customer_id 
                          AND c.primary_branch_id IS NOT NULL 
                          AND (SELECT has_branch_access(c.primary_branch_id))
                    ))
                )
            )
        )
    );

-- -----------------------------------------------------------------------------
-- BƯỚC 6: NHẬT KÝ KIỂM TOÁN ĐIỀU TRỊ (treatment_session_audits): CẤM CLIENT TỰ Ý INSERT/UPDATE/DELETE
-- -----------------------------------------------------------------------------
-- Thu hồi quyền ghi trực tiếp từ client trên bảng nhật ký kiểm toán
REVOKE INSERT, UPDATE, DELETE ON public.treatment_session_audits FROM authenticated, anon, public;
GRANT SELECT ON public.treatment_session_audits TO authenticated;
GRANT ALL ON public.treatment_session_audits TO service_role;

CREATE POLICY treatment_session_audits_select_policy ON public.treatment_session_audits
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.treatment_sessions ts 
            WHERE ts.id = treatment_session_audits.session_id 
              AND ts.organization_id = (SELECT get_current_user_org_id())
              AND (
                  (SELECT get_current_user_role()) = 'owner_admin'
                  OR (SELECT has_branch_access(ts.branch_id))
                  OR ts.performed_by = (SELECT id FROM public.staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
              )
        )
    );

-- Trigger tự động ghi vết kiểm toán khi buổi điều trị thay đổi (Hoàn toàn phía Database)
CREATE OR REPLACE FUNCTION trg_auto_audit_treatment_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_action VARCHAR;
BEGIN
    SELECT id INTO v_staff_id FROM staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status <> NEW.status AND NEW.status IN ('completed', 'locked') THEN
            v_action := 'confirm';
        ELSE
            v_action := 'update';
        END IF;
    END IF;

    INSERT INTO public.treatment_session_audits (
        session_id, modified_by, action_type, reason_for_change, previous_data, new_data, created_at
    ) VALUES (
        NEW.id,
        COALESCE(v_staff_id, NEW.performed_by),
        v_action,
        'Hệ thống tự động ghi vết: ' || v_action,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
        to_jsonb(NEW),
        NOW()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_audit_treatment_session ON public.treatment_sessions;
CREATE TRIGGER trg_auto_audit_treatment_session
AFTER INSERT OR UPDATE ON public.treatment_sessions
FOR EACH ROW
EXECUTE FUNCTION trg_auto_audit_treatment_session();

-- -----------------------------------------------------------------------------
-- BƯỚC 7: ĐIỀU CHUYỂN KHO (branch_transfers & branch_transfer_items): Hai đầu gửi/nhận
-- -----------------------------------------------------------------------------
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

CREATE POLICY branch_transfer_items_select_policy ON public.branch_transfer_items
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

CREATE POLICY branch_transfer_items_insert_policy ON public.branch_transfer_items
    FOR INSERT TO authenticated
    WITH CHECK (
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

CREATE POLICY branch_transfer_items_update_policy ON public.branch_transfer_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.branch_transfers bt 
            WHERE bt.id = branch_transfer_items.transfer_id 
              AND bt.organization_id = (SELECT get_current_user_org_id())
              AND (
                  (SELECT get_current_user_role()) = 'owner_admin'
                  OR (
                      (SELECT get_current_user_role()) = 'branch_manager' 
                      AND ((SELECT has_branch_access(bt.from_branch_id)) OR (SELECT has_branch_access(bt.to_branch_id)))
                  )
              )
        )
    );

COMMIT;
