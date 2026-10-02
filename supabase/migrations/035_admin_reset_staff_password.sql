-- ==============================================================================
-- MIGRATION 035: RPC ADMIN RESET STAFF PASSWORD
-- Cho phép Chủ hệ thống (owner_admin) cấp / đổi mật khẩu trực tiếp cho nhân viên
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_reset_staff_password(
    p_staff_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_role user_role_enum;
    v_caller_org_id UUID;
    v_target_org_id UUID;
    v_target_email TEXT;
    v_target_auth_uid UUID;
    v_target_name TEXT;
    v_hashed_pw TEXT;
BEGIN
    -- 1. Kiểm tra xác thực người gọi
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'Chưa đăng nhập hoặc phiên xác thực đã hết hạn.';
    END IF;

    -- 2. Kiểm tra quyền của người gọi (Chỉ owner_admin được phép đổi mật khẩu)
    SELECT sp.organization_id, om.role
    INTO v_caller_org_id, v_caller_role
    FROM public.staff_profiles sp
    JOIN public.organization_memberships om ON sp.id = om.staff_id
    WHERE sp.auth_user_id = v_caller_uid
      AND sp.is_active = TRUE
      AND om.is_active = TRUE
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role <> 'owner_admin' THEN
        RAISE EXCEPTION 'Chỉ Chủ hệ thống (Admin) mới có quyền cấp / đổi mật khẩu cho nhân viên.';
    END IF;

    -- 3. Kiểm tra độ dài mật khẩu mới
    IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
        RAISE EXCEPTION 'Mật khẩu mới phải có ít nhất 6 ký tự.';
    END IF;

    -- 4. Lấy thông tin nhân viên mục tiêu
    SELECT sp.organization_id, sp.auth_user_id, sp.email, sp.full_name
    INTO v_target_org_id, v_target_auth_uid, v_target_email, v_target_name
    FROM public.staff_profiles sp
    WHERE sp.id = p_staff_id;

    IF v_target_org_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy hồ sơ nhân sự mục tiêu.';
    END IF;

    -- Đảm bảo cùng tổ chức
    IF v_target_org_id <> v_caller_org_id THEN
        RAISE EXCEPTION 'Không thể đổi mật khẩu cho nhân sự thuộc tổ chức khác.';
    END IF;

    IF v_target_email IS NULL OR trim(v_target_email) = '' THEN
        RAISE EXCEPTION 'Hồ sơ nhân viên chưa có email để đăng nhập.';
    END IF;

    -- 5. Mã hóa mật khẩu mới bằng bcrypt
    v_hashed_pw := extensions.crypt(trim(p_new_password), extensions.gen_salt('bf'));

    -- 6. Nếu target đã có auth_user_id trong auth.users -> Cập nhật mật khẩu
    IF v_target_auth_uid IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_auth_uid) THEN
        UPDATE auth.users
        SET 
            encrypted_password = v_hashed_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW(),
            raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{provider}', '"email"'),
            raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{email_verified}', 'true')
        WHERE id = v_target_auth_uid;

        -- Đảm bảo auth.identities tồn tại
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_target_auth_uid, v_target_auth_uid,
            jsonb_build_object('sub', v_target_auth_uid::text, 'email', v_target_email),
            'email', v_target_auth_uid::text, NOW(), NOW(), NOW()
        )
        ON CONFLICT (provider, provider_id) DO UPDATE
        SET identity_data = jsonb_build_object('sub', v_target_auth_uid::text, 'email', v_target_email),
            updated_at = NOW();

    ELSE
        -- 7. Nếu chưa có auth.users hoặc auth_user_id chưa liên kết -> Tạo user mới trong auth.users
        IF v_target_auth_uid IS NULL THEN
            v_target_auth_uid := gen_random_uuid();
            UPDATE public.staff_profiles SET auth_user_id = v_target_auth_uid WHERE id = p_staff_id;
        END IF;

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_target_auth_uid, 'authenticated', 'authenticated',
            v_target_email, v_hashed_pw, NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', v_target_name),
            NOW(), NOW(), '', '', '', ''
        )
        ON CONFLICT (id) DO UPDATE
        SET encrypted_password = v_hashed_pw,
            email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
            updated_at = NOW();

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_target_auth_uid, v_target_auth_uid,
            jsonb_build_object('sub', v_target_auth_uid::text, 'email', v_target_email),
            'email', v_target_auth_uid::text, NOW(), NOW(), NOW()
        )
        ON CONFLICT (provider, provider_id) DO UPDATE
        SET identity_data = jsonb_build_object('sub', v_target_auth_uid::text, 'email', v_target_email),
            updated_at = NOW();
    END IF;

    -- 8. Ghi Audit Log bất biến
    INSERT INTO public.audit_events (
        organization_id, actor_staff_id, actor_role, event_action, entity_table, entity_id, after_state
    ) VALUES (
        v_caller_org_id,
        (SELECT id FROM public.staff_profiles WHERE auth_user_id = v_caller_uid LIMIT 1),
        v_caller_role::text,
        'auth.reset_password',
        'staff_profiles',
        p_staff_id,
        jsonb_build_object('email', v_target_email, 'reset_by', v_caller_uid, 'timestamp', NOW())
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Đã cấp lại mật khẩu thành công cho nhân viên %s (%s).', v_target_name, v_target_email),
        'staff_id', p_staff_id,
        'email', v_target_email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_reset_staff_password(UUID, TEXT) TO authenticated;
