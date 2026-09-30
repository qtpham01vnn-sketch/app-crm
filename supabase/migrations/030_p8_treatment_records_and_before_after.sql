-- =============================================================================
-- MIGRATION 030: PHASE 8 — HỒ SƠ ĐIỀU TRỊ, DIỄN TIẾN & QUẢN LÝ ẢNH BEFORE / AFTER
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG PHÁC ĐỒ / KẾ HOẠCH ĐIỀU TRỊ TỔNG THỂ (TREATMENT_PLANS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    plan_code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    diagnosis_notes TEXT,
    target_outcome TEXT,
    total_sessions_planned INT NOT NULL DEFAULT 1,
    lead_doctor_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'draft', 'active', 'completed', 'paused', 'cancelled'
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_end_date DATE,
    course_id UUID REFERENCES customer_courses(id) ON DELETE SET NULL,
    created_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_plan_code_org UNIQUE (organization_id, plan_code)
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_customer ON treatment_plans(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_org_branch ON treatment_plans(organization_id, branch_id);

-- -----------------------------------------------------------------------------
-- 2. BẢNG BUỔI ĐIỀU TRỊ CHI TIẾT (TREATMENT_SESSIONS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    treatment_plan_id UUID REFERENCES treatment_plans(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    course_id UUID REFERENCES customer_courses(id) ON DELETE SET NULL,
    session_code VARCHAR(50) NOT NULL,
    session_number INT NOT NULL DEFAULT 1,
    performed_by UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    assistant_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    treatment_area VARCHAR(100) NOT NULL DEFAULT 'Toàn mặt',
    pre_treatment_notes TEXT,
    protocol_performed TEXT NOT NULL,
    post_treatment_notes TEXT,
    clinical_reactions VARCHAR(100) DEFAULT 'Bình thường',
    homecare_instructions TEXT,
    next_appointment_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'confirmed'
    confirmed_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_session_code_org UNIQUE (organization_id, session_code)
);

CREATE INDEX IF NOT EXISTS idx_treatment_sessions_customer ON treatment_sessions(customer_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_plan ON treatment_sessions(treatment_plan_id, session_number);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_staff ON treatment_sessions(performed_by, performed_at);

-- -----------------------------------------------------------------------------
-- 3. BẢNG NHẬT KÝ KIỂM TOÁN LỊCH SỬ SỬA ĐỔI HỒ SƠ (TREATMENT_SESSION_AUDITS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_session_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES treatment_sessions(id) ON DELETE CASCADE,
    modified_by UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    action_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'confirm', 'add_note'
    reason_for_change TEXT NOT NULL,
    previous_data JSONB NOT NULL,
    new_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_treatment_session_audits ON treatment_session_audits(session_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. BẢNG QUẢN LÝ HÌNH ẢNH BEFORE / AFTER & DIỄN TIẾN (TREATMENT_PHOTOS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    session_id UUID REFERENCES treatment_sessions(id) ON DELETE SET NULL,
    photo_type VARCHAR(50) NOT NULL, -- 'before', 'after', 'follow_up', 'progress'
    treatment_area VARCHAR(100) NOT NULL DEFAULT 'Toàn mặt',
    angle VARCHAR(50) NOT NULL DEFAULT 'front', -- 'front', 'left_45', 'right_45', 'left_90', 'right_90', 'close_up'
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    watermark_applied BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    uploaded_by UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    notes TEXT,
    is_consent_marketing BOOLEAN NOT NULL DEFAULT FALSE, -- Tách riêng: Không mặc định đồng ý quảng cáo
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_treatment_photos_customer ON treatment_photos(customer_id, photo_type, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_photos_session ON treatment_photos(session_id);

-- -----------------------------------------------------------------------------
-- 5. BẢNG CAM KẾT ĐIỀU TRỊ & CHỮ KÝ ĐIỆN TỬ (TREATMENT_CONSENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    treatment_plan_id UUID REFERENCES treatment_plans(id) ON DELETE SET NULL,
    session_id UUID REFERENCES treatment_sessions(id) ON DELETE SET NULL,
    template_code VARCHAR(100) NOT NULL DEFAULT 'CONSENT_STANDARD_V1',
    template_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    consent_title VARCHAR(255) NOT NULL,
    consent_content_snapshot TEXT NOT NULL,
    agree_treatment BOOLEAN NOT NULL DEFAULT TRUE,
    agree_photo_records BOOLEAN NOT NULL DEFAULT TRUE,
    agree_marketing_usage BOOLEAN NOT NULL DEFAULT FALSE, -- Tách bạch riêng
    signature_svg TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    witness_staff_id UUID REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    signer_name VARCHAR(255) NOT NULL,
    signer_phone VARCHAR(50),
    ip_address VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'signed', -- 'draft', 'signed', 'revoked'
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_treatment_consents_customer ON treatment_consents(customer_id, signed_at DESC);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_session_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_treatment_plans_read ON treatment_plans;
CREATE POLICY rls_treatment_plans_read ON treatment_plans
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_treatment_plans_write ON treatment_plans;
CREATE POLICY rls_treatment_plans_write ON treatment_plans
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_treatment_sessions_read ON treatment_sessions;
CREATE POLICY rls_treatment_sessions_read ON treatment_sessions
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_treatment_sessions_write ON treatment_sessions;
CREATE POLICY rls_treatment_sessions_write ON treatment_sessions
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_treatment_session_audits_read ON treatment_session_audits;
CREATE POLICY rls_treatment_session_audits_read ON treatment_session_audits
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_treatment_session_audits_write ON treatment_session_audits;
CREATE POLICY rls_treatment_session_audits_write ON treatment_session_audits
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_treatment_photos_read ON treatment_photos;
CREATE POLICY rls_treatment_photos_read ON treatment_photos
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_treatment_photos_write ON treatment_photos;
CREATE POLICY rls_treatment_photos_write ON treatment_photos
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_treatment_consents_read ON treatment_consents;
CREATE POLICY rls_treatment_consents_read ON treatment_consents
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_treatment_consents_write ON treatment_consents;
CREATE POLICY rls_treatment_consents_write ON treatment_consents
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- Cấp quyền bảng cho roles
GRANT ALL ON treatment_plans TO anon, authenticated, service_role;
GRANT ALL ON treatment_sessions TO anon, authenticated, service_role;
GRANT ALL ON treatment_session_audits TO anon, authenticated, service_role;
GRANT ALL ON treatment_photos TO anon, authenticated, service_role;
GRANT ALL ON treatment_consents TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. STORAGE BUCKET INITIALIZATION & SECURITY POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'treatment-photos',
    'treatment-photos',
    false, -- Private bucket: chỉ truy cập qua signed URL
    10485760, -- 10MB per image
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760;

-- -----------------------------------------------------------------------------
-- 8. RPC FUNCTIONS FOR SECURE TREATMENT MANAGEMENT
-- -----------------------------------------------------------------------------

-- RPC 1: Tạo buổi điều trị mới
CREATE OR REPLACE FUNCTION rpc_create_treatment_session(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_performed_by UUID,
    p_protocol_performed TEXT,
    p_treatment_plan_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_session_number INT DEFAULT 1,
    p_treatment_area VARCHAR DEFAULT 'Toàn mặt',
    p_pre_treatment_notes TEXT DEFAULT NULL,
    p_post_treatment_notes TEXT DEFAULT NULL,
    p_clinical_reactions VARCHAR DEFAULT 'Bình thường',
    p_homecare_instructions TEXT DEFAULT NULL,
    p_next_appointment_date DATE DEFAULT NULL,
    p_assistant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code VARCHAR(50);
    v_session_id UUID;
    v_session_record RECORD;
BEGIN
    -- Tạo mã buổi điều trị duy nhất
    v_code := 'BUOI-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO treatment_sessions (
        organization_id, branch_id, customer_id, treatment_plan_id,
        appointment_id, course_id, session_code, session_number,
        performed_by, assistant_id, performed_at, treatment_area,
        pre_treatment_notes, protocol_performed, post_treatment_notes,
        clinical_reactions, homecare_instructions, next_appointment_date, status
    ) VALUES (
        p_org_id, p_branch_id, p_customer_id, p_treatment_plan_id,
        p_appointment_id, p_course_id, v_code, p_session_number,
        p_performed_by, p_assistant_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW()), p_treatment_area,
        p_pre_treatment_notes, p_protocol_performed, p_post_treatment_notes,
        p_clinical_reactions, p_homecare_instructions, p_next_appointment_date, 'draft'
    )
    RETURNING * INTO v_session_record;

    v_session_id := v_session_record.id;

    -- Ghi log khởi tạo
    INSERT INTO treatment_session_audits (
        session_id, modified_by, action_type, reason_for_change,
        previous_data, new_data, created_at
    ) VALUES (
        v_session_id, p_performed_by, 'create', 'Khởi tạo buổi điều trị mới',
        '{}'::JSONB, to_jsonb(v_session_record), TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'session_id', v_session_id,
        'session_code', v_code,
        'message', 'Đã khởi tạo hồ sơ buổi điều trị thành công.'
    );
END;
$$;

-- RPC 2: Cập nhật buổi điều trị (bắt buộc lý do sửa)
CREATE OR REPLACE FUNCTION rpc_update_treatment_session(
    p_session_id UUID,
    p_modified_by UUID,
    p_reason_for_change TEXT,
    p_protocol_performed TEXT,
    p_treatment_area VARCHAR DEFAULT 'Toàn mặt',
    p_pre_treatment_notes TEXT DEFAULT NULL,
    p_post_treatment_notes TEXT DEFAULT NULL,
    p_clinical_reactions VARCHAR DEFAULT 'Bình thường',
    p_homecare_instructions TEXT DEFAULT NULL,
    p_next_appointment_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_record RECORD;
    v_new_record RECORD;
BEGIN
    SELECT * INTO v_old_record FROM treatment_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Không tìm thấy hồ sơ buổi điều trị.');
    END IF;

    IF v_old_record.status = 'confirmed' THEN
        -- Đã khóa hồ sơ, bắt buộc có lý do sửa đổi chi tiết
        IF p_reason_for_change IS NULL OR LENGTH(TRIM(p_reason_for_change)) < 5 THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Hồ sơ đã xác nhận. Bắt buộc nhập lý do điều chỉnh tối thiểu 5 ký tự.');
        END IF;
    END IF;

    UPDATE treatment_sessions SET
        protocol_performed = p_protocol_performed,
        treatment_area = p_treatment_area,
        pre_treatment_notes = p_pre_treatment_notes,
        post_treatment_notes = p_post_treatment_notes,
        clinical_reactions = p_clinical_reactions,
        homecare_instructions = p_homecare_instructions,
        next_appointment_date = p_next_appointment_date,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_session_id
    RETURNING * INTO v_new_record;

    -- Ghi log lịch sử kiểm toán
    INSERT INTO treatment_session_audits (
        session_id, modified_by, action_type, reason_for_change,
        previous_data, new_data, created_at
    ) VALUES (
        p_session_id, p_modified_by, 'update', COALESCE(p_reason_for_change, 'Cập nhật diễn tiến điều trị'),
        to_jsonb(v_old_record), to_jsonb(v_new_record), TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'session_id', p_session_id,
        'message', 'Đã cập nhật hồ sơ điều trị và bảo toàn lịch sử kiểm toán.'
    );
END;
$$;

-- RPC 3: Xác nhận khóa hồ sơ buổi điều trị
CREATE OR REPLACE FUNCTION rpc_confirm_treatment_session(
    p_session_id UUID,
    p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_record RECORD;
    v_new_record RECORD;
BEGIN
    SELECT * INTO v_old_record FROM treatment_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Không tìm thấy hồ sơ buổi điều trị.');
    END IF;

    UPDATE treatment_sessions SET
        status = 'confirmed',
        confirmed_by = p_confirmed_by,
        confirmed_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_session_id
    RETURNING * INTO v_new_record;

    -- Ghi log xác nhận
    INSERT INTO treatment_session_audits (
        session_id, modified_by, action_type, reason_for_change,
        previous_data, new_data, created_at
    ) VALUES (
        p_session_id, p_confirmed_by, 'confirm', 'Xác nhận và khóa hồ sơ buổi điều trị',
        to_jsonb(v_old_record), to_jsonb(v_new_record), TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'session_id', p_session_id,
        'message', 'Đã xác nhận và khóa hồ sơ điều trị thành công.'
    );
END;
$$;

-- RPC 4: Lấy toàn bộ lịch sử hồ sơ điều trị của khách hàng
CREATE OR REPLACE FUNCTION rpc_get_customer_treatment_history(
    p_org_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plans JSONB;
    v_sessions JSONB;
    v_photos JSONB;
    v_consents JSONB;
BEGIN
    -- 1. Kế hoạch điều trị
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'plan_code', p.plan_code,
        'title', p.title,
        'diagnosis_notes', p.diagnosis_notes,
        'target_outcome', p.target_outcome,
        'total_sessions_planned', p.total_sessions_planned,
        'status', p.status,
        'start_date', p.start_date,
        'expected_end_date', p.expected_end_date,
        'lead_doctor_name', sp.full_name,
        'branch_name', b.name,
        'created_at', p.created_at
    ) ORDER BY p.created_at DESC), '[]'::JSONB)
    INTO v_plans
    FROM treatment_plans p
    LEFT JOIN staff_profiles sp ON sp.id = p.lead_doctor_id
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE p.organization_id = p_org_id AND p.customer_id = p_customer_id;

    -- 2. Buổi điều trị
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'session_code', s.session_code,
        'session_number', s.session_number,
        'treatment_plan_id', s.treatment_plan_id,
        'treatment_area', s.treatment_area,
        'performed_at', s.performed_at,
        'performed_by_name', sp.full_name,
        'performed_by_id', s.performed_by,
        'assistant_name', sa.full_name,
        'branch_name', b.name,
        'pre_treatment_notes', s.pre_treatment_notes,
        'protocol_performed', s.protocol_performed,
        'post_treatment_notes', s.post_treatment_notes,
        'clinical_reactions', s.clinical_reactions,
        'homecare_instructions', s.homecare_instructions,
        'next_appointment_date', s.next_appointment_date,
        'status', s.status,
        'confirmed_at', s.confirmed_at,
        'confirmed_by_name', sc.full_name
    ) ORDER BY s.performed_at DESC), '[]'::JSONB)
    INTO v_sessions
    FROM treatment_sessions s
    LEFT JOIN staff_profiles sp ON sp.id = s.performed_by
    LEFT JOIN staff_profiles sa ON sa.id = s.assistant_id
    LEFT JOIN staff_profiles sc ON sc.id = s.confirmed_by
    LEFT JOIN branches b ON b.id = s.branch_id
    WHERE s.organization_id = p_org_id AND s.customer_id = p_customer_id;

    -- 3. Hình ảnh Before / After
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'session_id', ph.session_id,
        'photo_type', ph.photo_type,
        'treatment_area', ph.treatment_area,
        'angle', ph.angle,
        'storage_path', ph.storage_path,
        'thumbnail_path', ph.thumbnail_path,
        'file_name', ph.file_name,
        'file_size', ph.file_size,
        'captured_at', ph.captured_at,
        'notes', ph.notes,
        'is_consent_marketing', ph.is_consent_marketing,
        'uploaded_by_name', sp.full_name
    ) ORDER BY ph.captured_at DESC), '[]'::JSONB)
    INTO v_photos
    FROM treatment_photos ph
    LEFT JOIN staff_profiles sp ON sp.id = ph.uploaded_by
    WHERE ph.organization_id = p_org_id AND ph.customer_id = p_customer_id AND ph.is_archived = FALSE;

    -- 4. Cam kết & Chữ ký
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'template_code', c.template_code,
        'template_version', c.template_version,
        'consent_title', c.consent_title,
        'agree_treatment', c.agree_treatment,
        'agree_photo_records', c.agree_photo_records,
        'agree_marketing_usage', c.agree_marketing_usage,
        'signer_name', c.signer_name,
        'signed_at', c.signed_at,
        'witness_staff_name', sp.full_name,
        'status', c.status
    ) ORDER BY c.signed_at DESC), '[]'::JSONB)
    INTO v_consents
    FROM treatment_consents c
    LEFT JOIN staff_profiles sp ON sp.id = c.witness_staff_id
    WHERE c.organization_id = p_org_id AND c.customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'customer_id', p_customer_id,
        'treatment_plans', v_plans,
        'treatment_sessions', v_sessions,
        'treatment_photos', v_photos,
        'treatment_consents', v_consents
    );
END;
$$;

-- Cấp quyền thực thi RPCs
GRANT EXECUTE ON FUNCTION rpc_create_treatment_session TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_update_treatment_session TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_confirm_treatment_session TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_get_customer_treatment_history TO anon, authenticated, service_role;
