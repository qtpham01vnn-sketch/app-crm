-- =============================================================================
-- MIGRATION 001: CORE ORGANIZATIONS, BRANCHES, MEMBERSHIPS, ROLES & AUDIT
-- Phase: P2A — Database Foundation & Infrastructure
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMS FOR SYSTEM ROLES & STATUSES
CREATE TYPE user_role_enum AS ENUM (
    'owner_admin',          -- Chủ cơ sở: Toàn quyền toàn hệ thống
    'branch_manager',       -- Quản lý chi nhánh: Toàn quyền tại chi nhánh được gán
    'cashier_receptionist', -- Lễ tân / Thu ngân: Tiếp đón, đặt lịch, thu tiền POS
    'technician_doctor'     -- Kỹ thuật viên / Bác sĩ: Xem lịch, trừ buổi liệu trình
);

CREATE TYPE branch_status_enum AS ENUM ('active', 'inactive', 'suspended');

-- 2. TABLE: ORGANIZATIONS (Cấp Doanh nghiệp / Chuỗi)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_code VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 3. TABLE: BRANCHES (Cấp Chi nhánh trực thuộc)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    address TEXT NOT NULL,
    status branch_status_enum NOT NULL DEFAULT 'active',
    is_headquarters BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_branch_code_per_org UNIQUE (organization_id, code)
);

-- 4. TABLE: STAFF_PROFILES (Hồ sơ Nhân sự liên kết Supabase Auth)
CREATE TABLE IF NOT EXISTS staff_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE, -- Liên kết với auth.users của Supabase (Nullable nếu chưa kích hoạt tài khoản web)
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    title VARCHAR(100),
    pin_hash VARCHAR(255), -- Mã PIN đăng nhập nhanh trên iPad POS
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_code_per_org UNIQUE (organization_id, code)
);

-- 5. TABLE: ORGANIZATION_MEMBERSHIPS (Phân quyền thực tế & Chi nhánh phụ trách)
CREATE TABLE IF NOT EXISTS organization_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL DEFAULT 'technician_doctor',
    assigned_branch_ids UUID[] NOT NULL DEFAULT '{}', -- Danh sách ID chi nhánh được phép truy cập ([] = all nếu role là owner_admin)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_org_membership UNIQUE (staff_id, organization_id)
);

-- 6. TABLE: AUDIT_EVENTS (Nhật ký Kiểm toán Bất biến — Append Only)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    actor_role VARCHAR(50) NOT NULL,
    event_action VARCHAR(100) NOT NULL, -- 'auth.login', 'sale.checkout', 'course.deduct', 'inventory.adjust', 'payroll.lock'
    entity_table VARCHAR(100) NOT NULL,
    entity_id UUID,
    before_state JSONB,
    after_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- Bất biến: Không cho phép UPDATE hoặc DELETE trên bảng audit_events
CREATE OR REPLACE RULE prevent_audit_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_audit_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;

-- 7. HELPER FUNCTIONS FOR ROW LEVEL SECURITY (RLS)

-- Hàm lấy organization_id của người dùng hiện tại từ auth.uid()
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id
    FROM staff_profiles sp
    JOIN organization_memberships om ON sp.id = om.staff_id
    WHERE sp.auth_user_id = auth.uid()
      AND om.is_active = TRUE
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Hàm lấy role hiện tại của người dùng
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role_enum AS $$
    SELECT om.role
    FROM staff_profiles sp
    JOIN organization_memberships om ON sp.id = om.staff_id
    WHERE sp.auth_user_id = auth.uid()
      AND om.is_active = TRUE
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Hàm kiểm tra người dùng có quyền trên chi nhánh cụ thể hay không
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
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
