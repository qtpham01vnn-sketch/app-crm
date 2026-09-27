-- =============================================================================
-- MIGRATION 005: AUTH USER SYNC, AUTO-LINK STAFF PROFILES & SESSION CLAIM RPC
-- Phase: P2B — Real Auth & Membership Sync
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. Auto-confirm any pending test auth emails
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Link existing staff_profiles to auth.users by email
UPDATE public.staff_profiles sp
SET auth_user_id = au.id
FROM auth.users au
WHERE sp.email = au.email
  AND (sp.auth_user_id IS NULL OR sp.auth_user_id != au.id);

-- 3. Trigger on auth.users to auto-link staff_profiles upon sign-up or email update
CREATE OR REPLACE FUNCTION public.handle_auth_user_linked_to_staff()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.staff_profiles
    SET auth_user_id = NEW.id
    WHERE email = NEW.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_link_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_link_staff
    AFTER INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_linked_to_staff();

-- 4. Session sync RPC function: claim_or_sync_staff_session()
CREATE OR REPLACE FUNCTION public.claim_or_sync_staff_session()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_email TEXT;
    v_staff_id UUID;
    v_org_id UUID;
    v_role user_role_enum;
    v_branch_ids UUID[];
    v_staff_name TEXT;
    v_staff_code TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Chưa có phiên xác thực Supabase Auth (Anonymous)'
        );
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

    -- Link staff_profile if matching email exists
    UPDATE public.staff_profiles
    SET auth_user_id = v_user_id
    WHERE email = v_email
    RETURNING id, organization_id, full_name, code
    INTO v_staff_id, v_org_id, v_staff_name, v_staff_code;

    -- If no profile with matching email, check if one is already bound
    IF v_staff_id IS NULL THEN
        SELECT id, organization_id, full_name, code
        INTO v_staff_id, v_org_id, v_staff_name, v_staff_code
        FROM public.staff_profiles
        WHERE auth_user_id = v_user_id
        LIMIT 1;
    END IF;

    IF v_staff_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Không tìm thấy hồ sơ nhân sự liên kết với email ' || COALESCE(v_email, '')
        );
    END IF;

    -- Fetch membership role and assigned branch ids
    SELECT om.role, om.assigned_branch_ids
    INTO v_role, v_branch_ids
    FROM public.organization_memberships om
    WHERE om.staff_id = v_staff_id AND om.organization_id = v_org_id AND om.is_active = TRUE
    LIMIT 1;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_or_sync_staff_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_or_sync_staff_session() TO anon;
