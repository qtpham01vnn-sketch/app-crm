-- =============================================================================
-- MIGRATION 006: AUTH SECURITY HARDENING & POSTGREST SCHEMA CACHE REFRESH
-- Date: 2026-09-27
-- Purpose: 
--   1. One-time link existing test auth accounts to staff_profiles
--   2. Drop unsafe dynamic auto-link triggers
--   3. Replace session RPC with read-only get_staff_session()
--   4. Set search_path on all SECURITY DEFINER functions
--   5. Add RLS SELECT policies for staff_profiles & organization_memberships
--   6. Send reload schema notification to PostgREST
-- =============================================================================

-- ─── 1. LINK EXISTING SEED STAFF TO AUTH USERS (ONE-TIME) ───────────────────
-- Safely associates the 4 test accounts if they exist in auth.users
UPDATE public.staff_profiles sp
SET auth_user_id = au.id
FROM auth.users au
WHERE sp.email = au.email
  AND (sp.auth_user_id IS NULL OR sp.auth_user_id != au.id);

-- ─── 2. DROP UNSAFE TRIGGER ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created_link_staff ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auth_user_linked_to_staff();

-- ─── 3. DROP OLD RPC AND REPLACE WITH READ-ONLY VERSION ──────────────────────
DROP FUNCTION IF EXISTS public.claim_or_sync_staff_session();

CREATE OR REPLACE FUNCTION public.get_staff_session()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_staff_id UUID;
    v_org_id UUID;
    v_role user_role_enum;
    v_branch_ids UUID[];
    v_staff_name TEXT;
    v_staff_code TEXT;
    v_is_active BOOLEAN;
BEGIN
    -- Reject anonymous callers
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Phiên xác thực không hợp lệ.'
        );
    END IF;

    -- Look up staff profile by auth_user_id
    SELECT sp.id, sp.organization_id, sp.full_name, sp.code, sp.is_active
    INTO v_staff_id, v_org_id, v_staff_name, v_staff_code, v_is_active
    FROM public.staff_profiles sp
    WHERE sp.auth_user_id = v_user_id
    LIMIT 1;

    IF v_staff_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Tài khoản chưa được liên kết hồ sơ nhân sự. Vui lòng liên hệ quản trị viên.'
        );
    END IF;

    -- Check staff is still active
    IF NOT v_is_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Hồ sơ nhân sự đã bị vô hiệu hóa.'
        );
    END IF;

    -- Fetch active membership
    SELECT om.role, om.assigned_branch_ids
    INTO v_role, v_branch_ids
    FROM public.organization_memberships om
    WHERE om.staff_id = v_staff_id
      AND om.organization_id = v_org_id
      AND om.is_active = TRUE
    LIMIT 1;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Tài khoản không có membership hoạt động. Vui lòng liên hệ quản trị viên.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'auth_user_id', v_user_id,
        'staff_id', v_staff_id,
        'staff_name', v_staff_name,
        'staff_code', v_staff_code,
        'organization_id', v_org_id,
        'role', v_role,
        'assigned_branch_ids', v_branch_ids
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = public;

-- Grant ONLY to authenticated
GRANT EXECUTE ON FUNCTION public.get_staff_session() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_staff_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_session() FROM PUBLIC;

-- ─── 4. ADD search_path TO SECURITY DEFINER FUNCTIONS ─────────────────────────
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS UUID AS $$
    SELECT sp.organization_id
    FROM staff_profiles sp
    JOIN organization_memberships om ON sp.id = om.staff_id
    WHERE sp.auth_user_id = auth.uid()
      AND om.is_active = TRUE
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role_enum AS $$
    SELECT om.role
    FROM staff_profiles sp
    JOIN organization_memberships om ON sp.id = om.staff_id
    WHERE sp.auth_user_id = auth.uid()
      AND om.is_active = TRUE
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION has_branch_access(target_branch_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM staff_profiles sp
        JOIN organization_memberships om ON sp.id = om.staff_id
        WHERE sp.auth_user_id = auth.uid()
          AND om.is_active = TRUE
          AND sp.is_active = TRUE
          AND (
              om.role = 'owner_admin'
              OR target_branch_id = ANY(om.assigned_branch_ids)
          )
    );
$$ LANGUAGE SQL STABLE SECURITY DEFINER
   SET search_path = public;

-- Revoke helper functions from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION get_current_user_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION get_current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_org_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_current_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION has_branch_access(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION has_branch_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_branch_access(UUID) TO authenticated;

-- ─── 5. ADMIN-MANAGED ACCOUNT LINKING RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_link_staff_to_auth_user(
    p_staff_id UUID,
    p_auth_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_role user_role_enum;
    v_caller_org_id UUID;
    v_staff_org_id UUID;
    v_existing_link UUID;
BEGIN
    SELECT om.role, sp.organization_id
    INTO v_caller_role, v_caller_org_id
    FROM staff_profiles sp
    JOIN organization_memberships om ON sp.id = om.staff_id
    WHERE sp.auth_user_id = auth.uid()
      AND om.is_active = TRUE
      AND sp.is_active = TRUE
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role != 'owner_admin' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Chỉ Chủ doanh nghiệp mới có quyền liên kết tài khoản.');
    END IF;

    SELECT organization_id INTO v_staff_org_id
    FROM staff_profiles WHERE id = p_staff_id;

    IF v_staff_org_id IS NULL OR v_staff_org_id != v_caller_org_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nhân viên không thuộc tổ chức của bạn.');
    END IF;

    SELECT id INTO v_existing_link
    FROM staff_profiles
    WHERE auth_user_id = p_auth_user_id AND id != p_staff_id;

    IF v_existing_link IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tài khoản auth đã liên kết với nhân viên khác.');
    END IF;

    UPDATE staff_profiles
    SET auth_user_id = p_auth_user_id, updated_at = NOW()
    WHERE id = p_staff_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã liên kết thành công.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_link_staff_to_auth_user(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_link_staff_to_auth_user(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_link_staff_to_auth_user(UUID, UUID) FROM PUBLIC;

-- ─── 6. RLS POLICIES FOR STAFF & MEMBERSHIPS ─────────────────────────────────
DROP POLICY IF EXISTS staff_profiles_org_read_policy ON staff_profiles;
CREATE POLICY staff_profiles_org_read_policy ON staff_profiles
    FOR SELECT USING (organization_id = get_current_user_org_id());

DROP POLICY IF EXISTS staff_profiles_admin_write_policy ON staff_profiles;
CREATE POLICY staff_profiles_admin_write_policy ON staff_profiles
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

DROP POLICY IF EXISTS memberships_org_read_policy ON organization_memberships;
CREATE POLICY memberships_org_read_policy ON organization_memberships
    FOR SELECT USING (organization_id = get_current_user_org_id());

DROP POLICY IF EXISTS memberships_admin_write_policy ON organization_memberships;
CREATE POLICY memberships_admin_write_policy ON organization_memberships
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- ─── 7. REFRESH POSTGREST SCHEMA CACHE ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';
