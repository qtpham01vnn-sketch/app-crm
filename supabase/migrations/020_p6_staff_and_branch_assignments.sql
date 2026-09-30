-- =============================================================================
-- MIGRATION 020: HR PHASE P6.1 — STAFF PROFILES, BRANCH ASSIGNMENTS & SKILLS
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG PHÂN CÔNG CHI NHÁNH CÓ NGÀY HIỆU LỰC (STAFF_BRANCH_ASSIGNMENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_branch_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_branch_period UNIQUE (staff_id, branch_id, effective_from)
);

-- Bật RLS
ALTER TABLE staff_branch_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_staff_branch_assignments_read ON staff_branch_assignments;
CREATE POLICY rls_staff_branch_assignments_read ON staff_branch_assignments
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_staff_branch_assignments_write ON staff_branch_assignments;
CREATE POLICY rls_staff_branch_assignments_write ON staff_branch_assignments
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. BỔ SUNG CỘT LƯƠNG & TRẠNG THÁI VÀO STAFF_PROFILES NẾU CHƯA CÓ
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_profiles' AND column_name = 'base_salary') THEN
        ALTER TABLE staff_profiles ADD COLUMN base_salary BIGINT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_profiles' AND column_name = 'commission_rate') THEN
        ALTER TABLE staff_profiles ADD COLUMN commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_profiles' AND column_name = 'employment_status') THEN
        ALTER TABLE staff_profiles ADD COLUMN employment_status VARCHAR(50) NOT NULL DEFAULT 'active'; -- 'active', 'on_leave', 'terminated'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE staff_profiles ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. RPC TẠO / CẬP NHẬT HỒ SƠ NHÂN SỰ & PHÂN CÔNG CHI NHÁNH & KỸ NĂNG (UPSERT STAFF)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_upsert_staff_profile(
    p_org_id UUID,
    p_staff_id UUID DEFAULT NULL, -- NULL nếu tạo mới
    p_full_name VARCHAR(255) DEFAULT '',
    p_code VARCHAR(50) DEFAULT '',
    p_phone VARCHAR(20) DEFAULT '',
    p_email VARCHAR(100) DEFAULT NULL,
    p_title VARCHAR(100) DEFAULT NULL,
    p_role user_role_enum DEFAULT 'technician_doctor',
    p_primary_branch_id UUID DEFAULT NULL,
    p_branch_ids UUID[] DEFAULT '{}', -- Danh sách chi nhánh phân công
    p_base_salary BIGINT DEFAULT 0,
    p_commission_rate NUMERIC DEFAULT 0.00,
    p_employment_status VARCHAR DEFAULT 'active',
    p_pin_code VARCHAR DEFAULT NULL,
    p_skill_ids UUID[] DEFAULT '{}', -- Danh sách ID dịch vụ KTV thành thạo
    p_effective_from DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_staff_id UUID;
    v_code VARCHAR(50);
    v_b_id UUID;
    v_s_id UUID;
    v_pin_hash VARCHAR(255);
BEGIN
    -- Tạo mã nhân viên tự động nếu chưa có
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        v_code := 'NV' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    ELSE
        v_code := TRIM(p_code);
    END IF;

    IF p_pin_code IS NOT NULL AND TRIM(p_pin_code) <> '' THEN
        v_pin_hash := crypt(TRIM(p_pin_code), gen_salt('bf'));
    ELSE
        v_pin_hash := NULL;
    END IF;

    IF p_staff_id IS NULL THEN
        -- 1. Thêm mới nhân viên
        INSERT INTO staff_profiles (
            organization_id,
            full_name,
            code,
            phone,
            email,
            title,
            base_salary,
            commission_rate,
            employment_status,
            pin_hash,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            p_org_id,
            p_full_name,
            v_code,
            p_phone,
            p_email,
            p_title,
            GREATEST(0, COALESCE(p_base_salary, 0)),
            GREATEST(0, COALESCE(p_commission_rate, 0)),
            COALESCE(p_employment_status, 'active'),
            v_pin_hash,
            CASE WHEN p_employment_status = 'active' THEN TRUE ELSE FALSE END,
            TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_target_staff_id;

        -- 2. Thêm vào bảng organization_memberships
        INSERT INTO organization_memberships (
            staff_id,
            organization_id,
            role,
            assigned_branch_ids,
            is_active
        ) VALUES (
            v_target_staff_id,
            p_org_id,
            p_role,
            p_branch_ids,
            TRUE
        );
    ELSE
        v_target_staff_id := p_staff_id;

        -- Cập nhật nhân viên hiện có
        UPDATE staff_profiles
        SET full_name = p_full_name,
            phone = p_phone,
            email = p_email,
            title = p_title,
            base_salary = GREATEST(0, COALESCE(p_base_salary, base_salary)),
            commission_rate = GREATEST(0, COALESCE(p_commission_rate, commission_rate)),
            employment_status = COALESCE(p_employment_status, employment_status),
            pin_hash = COALESCE(v_pin_hash, pin_hash),
            is_active = CASE WHEN p_employment_status = 'active' THEN TRUE ELSE FALSE END,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_target_staff_id AND organization_id = p_org_id;

        -- Cập nhật vai trò và chi nhánh phân công trong organization_memberships
        UPDATE organization_memberships
        SET role = p_role,
            assigned_branch_ids = p_branch_ids,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_target_staff_id AND organization_id = p_org_id;
    END IF;

    -- 3. Cập nhật phân công chi nhánh có ngày hiệu lực
    IF p_branch_ids IS NOT NULL AND array_length(p_branch_ids, 1) > 0 THEN
        -- Đóng hiệu lực các phân công cũ không còn nằm trong danh sách mới
        UPDATE staff_branch_assignments
        SET is_active = FALSE,
            effective_to = CURRENT_DATE,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_target_staff_id
          AND branch_id <> ALL(p_branch_ids)
          AND is_active = TRUE;

        -- Thêm hoặc kích hoạt phân công cho các chi nhánh trong danh sách
        FOREACH v_b_id IN ARRAY p_branch_ids
        LOOP
            INSERT INTO staff_branch_assignments (
                organization_id,
                staff_id,
                branch_id,
                is_primary,
                effective_from,
                is_active
            ) VALUES (
                p_org_id,
                v_target_staff_id,
                v_b_id,
                (v_b_id = p_primary_branch_id),
                COALESCE(p_effective_from, CURRENT_DATE),
                TRUE
            )
            ON CONFLICT (staff_id, branch_id, effective_from)
            DO UPDATE SET
                is_primary = (v_b_id = p_primary_branch_id),
                is_active = TRUE,
                effective_to = NULL,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());
        END LOOP;
    END IF;

    -- 4. Cập nhật kỹ năng dịch vụ nếu có
    IF p_skill_ids IS NOT NULL THEN
        DELETE FROM service_staff_skills WHERE staff_id = v_target_staff_id;

        FOREACH v_s_id IN ARRAY p_skill_ids
        LOOP
            INSERT INTO service_staff_skills (
                organization_id,
                service_id,
                staff_id,
                proficiency_level,
                is_primary
            ) VALUES (
                p_org_id,
                v_s_id,
                v_target_staff_id,
                'standard',
                TRUE
            )
            ON CONFLICT (service_id, staff_id) DO NOTHING;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'staff_id', v_target_staff_id,
        'code', v_code,
        'message', 'Đã lưu thông tin hồ sơ nhân viên và phân công chi nhánh thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC TRUY VẤN DANH SÁCH NHÂN SỰ TOÀN DIỆN & PHÂN QUYỀN (GET STAFF LIST)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_staff_directory(p_branch_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', sp.id,
                'org_id', sp.organization_id,
                'name', sp.full_name,
                'code', sp.code,
                'phone', sp.phone,
                'email', sp.email,
                'title', sp.title,
                'employment_status', COALESCE(sp.employment_status, 'active'),
                'is_active', sp.is_active,
                'role', COALESCE(om.role, 'technician_doctor'),
                'base_salary', COALESCE(sp.base_salary, 0),
                'commission_rate', COALESCE(sp.commission_rate, 0),
                'branch_ids', COALESCE(om.assigned_branch_ids, '{}'),
                'primary_branch_id', (
                    SELECT sba.branch_id
                    FROM staff_branch_assignments sba
                    WHERE sba.staff_id = sp.id AND sba.is_primary = TRUE AND sba.is_active = TRUE
                    LIMIT 1
                ),
                'assigned_branches', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'branch_id', b.id,
                            'branch_name', b.name,
                            'is_primary', sba.is_primary,
                            'effective_from', sba.effective_from,
                            'effective_to', sba.effective_to
                        )
                    )
                    FROM staff_branch_assignments sba
                    JOIN branches b ON b.id = sba.branch_id
                    WHERE sba.staff_id = sp.id AND sba.is_active = TRUE
                ), '[]'::jsonb),
                'skills', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'service_id', s.id,
                            'service_name', s.name,
                            'proficiency_level', sss.proficiency_level
                        )
                    )
                    FROM service_staff_skills sss
                    JOIN services s ON s.id = sss.service_id
                    WHERE sss.staff_id = sp.id
                ), '[]'::jsonb)
            )
            ORDER BY sp.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM staff_profiles sp
    LEFT JOIN organization_memberships om ON om.staff_id = sp.id
    WHERE (p_branch_id IS NULL OR p_branch_id = ANY(om.assigned_branch_ids));

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_upsert_staff_profile(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, user_role_enum, UUID, UUID[], BIGINT, NUMERIC, VARCHAR, VARCHAR, UUID[], DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_staff_directory(UUID) TO authenticated, anon;
