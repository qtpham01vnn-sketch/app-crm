-- =============================================================================
-- MIGRATION 006: AUTH SECURITY HARDENING
-- Date: 2026-09-27
-- Purpose: Fix security issues identified in auth audit
--   1. Replace claim_or_sync_staff_session() with read-only get_staff_session()
--   2. Remove unsafe auto-link trigger that overwrites auth_user_id by email
--   3. Revoke anon access to staff session RPC
--   4. Add SET search_path to all SECURITY DEFINER functions
--   5. Revoke inherited PUBLIC execute on private functions
-- =============================================================================

-- ─── 1. DROP UNSAFE TRIGGER ─────────────────────────────────────────────────
-- The old trigger auto-links any auth.users to staff_profiles by email match.
-- This allows anyone who signs up with a staff email to hijack staff identity.
DROP TRIGGER IF EXISTS on_auth_user_created_link_staff ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auth_user_linked_to_staff();

-- ─── 2. DROP OLD RPC AND REPLACE WITH READ-ONLY VERSION ──────────────────────
DROP FUNCTION IF EXISTS public.claim_or_sync_staff_session();

-- New function: get_staff_session()
-- READ-ONLY: Does NOT update auth_user_id. Only looks up existing link.
-- Requires authenticated user. Returns membership info if linked.
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

    -- Look up staff profile by auth_user_id (pre-linked by admin)
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

-- Grant ONLY to authenticated, NOT to anon
GRANT EXECUTE ON FUNCTION public.get_staff_session() TO authenticated;
-- Explicitly revoke from anon and public
REVOKE EXECUTE ON FUNCTION public.get_staff_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_session() FROM PUBLIC;

-- ─── 3. REVOKE LEFTOVER ANON GRANTS ON OLD FUNCTION ──────────────────────────
-- (safe even if function no longer exists)
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION public.claim_or_sync_staff_session() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.claim_or_sync_staff_session() FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN
    NULL; -- function already dropped, ignore
END $$;

-- ─── 4. ADD search_path TO EXISTING SECURITY DEFINER FUNCTIONS ───────────────
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

-- ─── 5. REVOKE PUBLIC EXECUTE ON RLS HELPER FUNCTIONS ────────────────────────
-- These are called by RLS policies, not by users directly.
-- They need to be executable by authenticated (via RLS), but not by anon.
REVOKE EXECUTE ON FUNCTION get_current_user_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION get_current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_org_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_current_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION has_branch_access(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION has_branch_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_branch_access(UUID) TO authenticated;

-- ─── 6. ADMIN FUNCTION TO LINK STAFF TO AUTH USER ────────────────────────────
-- Only owner_admin can call this to link a staff profile to an auth user.
-- This is the safe, managed way to link accounts (replacing auto-link).
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
    -- Only owner_admin can link staff
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

    -- Verify staff belongs to same org
    SELECT organization_id INTO v_staff_org_id
    FROM staff_profiles WHERE id = p_staff_id;

    IF v_staff_org_id IS NULL OR v_staff_org_id != v_caller_org_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nhân viên không thuộc tổ chức của bạn.');
    END IF;

    -- Check if auth_user_id is already linked to another staff
    SELECT id INTO v_existing_link
    FROM staff_profiles
    WHERE auth_user_id = p_auth_user_id AND id != p_staff_id;

    IF v_existing_link IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tài khoản auth đã liên kết với nhân viên khác.');
    END IF;

    -- Link
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
