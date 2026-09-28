-- =============================================================================
-- MIGRATION 007: E1 — DỊCH VỤ, BẢNG GIÁ THEO CHI NHÁNH, KỸ NĂNG KTV & NGUỒN LỰC
-- Reference: docs/PROMPT_BO_SUNG_CRM_7_MAN_HINH.md (Đợt E1 / Ảnh 5)
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. MỞ RỘNG BẢNG SERVICES VỚI THUỘC TÍNH CHI TIẾT
ALTER TABLE services
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS buffer_minutes_before INT NOT NULL DEFAULT 0 CHECK (buffer_minutes_before >= 0),
ADD COLUMN IF NOT EXISTS buffer_minutes_after INT NOT NULL DEFAULT 0 CHECK (buffer_minutes_after >= 0),
ADD COLUMN IF NOT EXISTS allow_online_booking BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. TABLE: RESOURCES (Danh mục Nguồn lực: Phòng, Giường, Ghế, Máy móc điều phối)
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'room', -- 'room', 'bed', 'chair', 'machine'
    capacity INT NOT NULL DEFAULT 1 CHECK (capacity >= 1),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_resource_code_per_branch UNIQUE (branch_id, code)
);

-- 3. TABLE: SERVICE_STAFF_SKILLS (Kỹ năng KTV & Bác sĩ được phép làm dịch vụ)
CREATE TABLE IF NOT EXISTS service_staff_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    proficiency_level VARCHAR(50) NOT NULL DEFAULT 'standard', -- 'standard', 'senior', 'master'
    custom_duration_minutes INT CHECK (custom_duration_minutes > 0),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_service_staff_skill UNIQUE (service_id, staff_id)
);

-- 4. TABLE: SERVICE_PRICE_VERSIONS (Bảng giá theo Chi nhánh & Khoảng thời gian hiệu lực)
CREATE TABLE IF NOT EXISTS service_price_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    price BIGINT NOT NULL CHECK (price >= 0),
    promo_price BIGINT CHECK (promo_price >= 0),
    promo_start_date DATE,
    promo_end_date DATE,
    promo_condition TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT check_promo_dates CHECK (
        (promo_price IS NULL) OR 
        (promo_start_date IS NOT NULL AND promo_end_date IS NOT NULL AND promo_end_date >= promo_start_date)
    ),
    CONSTRAINT check_effective_dates CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    )
);

-- 5. RLS POLICIES CHO CÁC BẢNG MỚI
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_staff_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_price_versions ENABLE ROW LEVEL SECURITY;

-- Resources RLS: Thành viên chỉ xem & sửa tài nguyên thuộc chi nhánh của mình
CREATE POLICY rls_resources_read ON resources
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR has_branch_access(branch_id)
        )
    );

CREATE POLICY rls_resources_admin_modify ON resources
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
        AND has_branch_access(branch_id)
    );

-- Skills RLS
CREATE POLICY rls_skills_read ON service_staff_skills
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_skills_admin_modify ON service_staff_skills
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
    );

-- Price Versions RLS
CREATE POLICY rls_prices_read ON service_price_versions
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR has_branch_access(branch_id)
        )
    );

CREATE POLICY rls_prices_admin_modify ON service_price_versions
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
        AND has_branch_access(branch_id)
    );
