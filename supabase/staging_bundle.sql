-- =============================================================================
-- PHUONG NAM CRM — FULL STAGING DATABASE INITIALIZATION SCRIPT
-- Target: Staging Project (yvwsitkgpujeqlgeiuge)
-- Generated at: 2026-10-02T09:17:10.028Z
-- =============================================================================


-- -----------------------------------------------------------------------------
-- FILE: 001_core_organization_membership_rls.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 001: CORE ORGANIZATIONS, BRANCHES, MEMBERSHIPS, ROLES & AUDIT
-- Phase: P2A — Database Foundation & Infrastructure
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMS FOR SYSTEM ROLES & STATUSES
DO $$ BEGIN CREATE TYPE user_role_enum AS ENUM (
    'owner_admin',          -- Chủ cơ sở: Toàn quyền toàn hệ thống
    'branch_manager',       -- Quản lý chi nhánh: Toàn quyền tại chi nhánh được gán
    'cashier_receptionist', -- Lễ tân / Thu ngân: Tiếp đón, đặt lịch, thu tiền POS
    'technician_doctor'     -- Kỹ thuật viên / Bác sĩ: Xem lịch, trừ buổi liệu trình
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE branch_status_enum AS ENUM ('active', 'inactive', 'suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
    SELECT sp.organization_id
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



-- -----------------------------------------------------------------------------
-- FILE: 002_master_data_and_catalogs.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 002: MASTER DATA & CATALOGS (KHÁCH HÀNG, DỊCH VỤ, KHO, NHÀ CUNG CẤP)
-- Phase: P2A & P3 Preparation
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. TABLE: CUSTOMERS (Hồ sơ Khách hàng — Cấp Tổ chức Org Level)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    primary_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    gender VARCHAR(20) DEFAULT 'other',
    birth_date DATE,
    address TEXT,
    tier VARCHAR(50) NOT NULL DEFAULT 'standard', -- 'standard', 'silver', 'gold', 'vip'
    total_spent BIGINT NOT NULL DEFAULT 0, -- Số tiền nguyên VND
    debt_balance BIGINT NOT NULL DEFAULT 0, -- Công nợ phải thu nguyên VND
    medical_notes TEXT, -- Tiền sử bệnh, dị ứng mỹ phẩm
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_customer_phone_per_org UNIQUE (organization_id, phone)
);

-- 2. TABLE: SERVICES (Danh mục Dịch vụ Chuẩn Cấp Org)
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'facial', 'laser', 'dental_care', 'body'
    base_price BIGINT NOT NULL CHECK (base_price >= 0),
    duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    default_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (default_commission_pct >= 0 AND default_commission_pct <= 100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_service_code_per_org UNIQUE (organization_id, code)
);

-- 3. TABLE: BRANCH_SERVICE_PRICES (Bảng giá tùy chỉnh theo Chi nhánh)
CREATE TABLE IF NOT EXISTS branch_service_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    custom_price BIGINT NOT NULL CHECK (custom_price >= 0),
    custom_duration_minutes INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_service_per_branch UNIQUE (branch_id, service_id)
);

-- 4. TABLE: PACKAGES (Combo Gói Dịch vụ Liệu trình)
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    total_sessions INT NOT NULL CHECK (total_sessions > 0),
    package_price BIGINT NOT NULL CHECK (package_price >= 0),
    validity_days INT NOT NULL DEFAULT 365,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_package_code_per_org UNIQUE (organization_id, code)
);

-- 5. TABLE: PRODUCTS (Danh mục Hàng hóa Sản phẩm)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'chai',
    retail_price BIGINT NOT NULL CHECK (retail_price >= 0),
    cost_price BIGINT NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    min_stock_alert INT NOT NULL DEFAULT 5 CHECK (min_stock_alert >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_product_code_per_org UNIQUE (organization_id, code)
);

-- 6. TABLE: INVENTORY_STOCKS (Tồn kho thực tế từng Kho Chi nhánh)
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    stock_on_hand INT NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0), -- Tuyệt đối không cho phép tồn kho âm
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_product_stock_per_branch UNIQUE (branch_id, product_id)
);

-- 7. TABLE: SUPPLIERS (Nhà Cung Cấp)
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    address TEXT,
    debt_balance BIGINT NOT NULL DEFAULT 0, -- Công nợ phải trả NCC
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 8. TABLE: PROMOTIONS (Mã Khuyến Mãi / Voucher)
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- 'percentage' | 'fixed_amount'
    discount_value BIGINT NOT NULL CHECK (discount_value > 0),
    min_order_value BIGINT NOT NULL DEFAULT 0,
    max_discount_amount BIGINT,
    usage_limit INT,
    used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_promo_code_per_org UNIQUE (organization_id, code)
);



-- -----------------------------------------------------------------------------
-- FILE: 003_operations_pos_and_courses.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 003: OPERATIONS, APPOINTMENTS, POS, PAYMENTS, COURSES & INVENTORY
-- Phase: P2A & P4/P5 Preparation
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. TABLE: APPOINTMENTS (Lịch hẹn Tiếp đón)
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    status VARCHAR(50) NOT NULL DEFAULT 'booked', -- 'booked', 'confirmed', 'in_progress', 'completed', 'cancelled'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 2. TABLE: SALES (Hóa đơn Bán lẻ POS)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL, -- Format: HD-YYYYMMDD-XXXX
    idempotency_key VARCHAR(255) UNIQUE, -- Khóa chống thanh toán trùng do mạng lag
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    promo_code VARCHAR(50),
    tax_amount BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    tip_amount BIGINT NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'completed', -- 'draft', 'completed', 'refunded', 'cancelled'
    cashier_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_invoice_number_per_org UNIQUE (organization_id, invoice_number)
);

-- 3. TABLE: SALE_ITEMS (Chi tiết Mặt hàng trong Hóa đơn POS — Có Snapshot Giá)
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL, -- 'service', 'product', 'package'
    item_ref_id UUID NOT NULL, -- ID của service, product hoặc package
    item_name VARCHAR(255) NOT NULL, -- Snapshot tên tại thời điểm bán
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0), -- Snapshot đơn giá gốc
    quantity INT NOT NULL CHECK (quantity > 0),
    line_discount BIGINT NOT NULL DEFAULT 0, -- Snapshot chiết khấu dòng
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    performer_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL, -- KTV/Bác sĩ thực hiện
    commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0, -- Snapshot tỷ lệ hoa hồng
    commission_amount BIGINT NOT NULL DEFAULT 0, -- Số tiền hoa hồng thực tế chốt cho KTV
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 4. TABLE: PAYMENTS (Phiếu thu / Giao dịch Tiền vào)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    payment_number VARCHAR(100) NOT NULL, -- PT-YYYYMMDD-XXXX
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL, -- 'cash', 'transfer_vietqr', 'card', 'debt'
    payment_type VARCHAR(50) NOT NULL DEFAULT 'sale', -- 'sale', 'debt_collection', 'deposit', 'refund'
    received_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 5. TABLE: PAYMENT_ALLOCATIONS (Bảng Phân bổ Thanh toán vào Hóa đơn)
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount_allocated BIGINT NOT NULL CHECK (amount_allocated > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 6. TABLE: CUSTOMER_COURSES (Sổ Thẻ Liệu trình Khách đã mua)
CREATE TABLE IF NOT EXISTS customer_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    total_sessions INT NOT NULL CHECK (total_sessions > 0),
    used_sessions INT NOT NULL DEFAULT 0 CHECK (used_sessions >= 0 AND used_sessions <= total_sessions),
    expiry_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'expired'
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 7. TABLE: SESSION_DEDUCTIONS (Ledger Bất biến Trừ Buổi Liệu trình)
CREATE TABLE IF NOT EXISTS session_deductions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES customer_courses(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    sessions_deducted INT NOT NULL DEFAULT 1 CHECK (sessions_deducted > 0),
    notes TEXT,
    customer_signature TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- Bất biến: Không được xóa hoặc sửa bản ghi trừ buổi
CREATE OR REPLACE RULE prevent_deduction_update AS ON UPDATE TO session_deductions DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_deduction_delete AS ON DELETE TO session_deductions DO INSTEAD NOTHING;

-- 8. TABLE: PURCHASE_ORDERS & GOODS_RECEIPT_NOTES (Quản lý Nhập hàng & Kho)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number VARCHAR(100) NOT NULL,
    total_amount BIGINT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'ordered', -- 'draft', 'ordered', 'received', 'cancelled'
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE TABLE IF NOT EXISTS goods_receipt_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    grn_number VARCHAR(100) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    received_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    total_value BIGINT NOT NULL CHECK (total_value >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 9. TABLE: EXPENSES (Sổ Quỹ & Chi phí Vận hành)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- 'rent', 'utilities', 'marketing', 'salary', 'other'
    amount BIGINT NOT NULL CHECK (amount > 0),
    recipient VARCHAR(255),
    notes TEXT,
    paid_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);



-- -----------------------------------------------------------------------------
-- FILE: 004_rls_security_policies.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 004: ROW LEVEL SECURITY (RLS) POLICIES & MULTI-BRANCH ISOLATION
-- Phase: P2A — Security & Multi-tenant Protection
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 1. POLICIES: ORGANIZATIONS & BRANCHES
-- -----------------------------------------------------------------------------
CREATE POLICY org_isolation_policy ON organizations
    FOR ALL
    USING (id = get_current_user_org_id());

CREATE POLICY branch_isolation_policy ON branches
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

CREATE POLICY branch_admin_write_policy ON branches
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- -----------------------------------------------------------------------------
-- 2. POLICIES: CUSTOMERS (Org Level Isolation)
-- -----------------------------------------------------------------------------
CREATE POLICY customers_org_policy ON customers
    FOR ALL
    USING (organization_id = get_current_user_org_id());

-- -----------------------------------------------------------------------------
-- 3. POLICIES: SERVICES, PACKAGES & PRODUCTS (Org Level Catalog)
-- -----------------------------------------------------------------------------
CREATE POLICY services_read_policy ON services
    FOR SELECT USING (organization_id = get_current_user_org_id());

CREATE POLICY services_admin_write_policy ON services
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY products_read_policy ON products
    FOR SELECT USING (organization_id = get_current_user_org_id());

CREATE POLICY products_admin_write_policy ON products
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND (get_current_user_role() IN ('owner_admin', 'branch_manager'))
    );

-- -----------------------------------------------------------------------------
-- 4. POLICIES: INVENTORY STOCKS (Branch Access Filter)
-- -----------------------------------------------------------------------------
CREATE POLICY inventory_stocks_branch_policy ON inventory_stocks
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 5. POLICIES: APPOINTMENTS (Branch & Role Filter)
-- -----------------------------------------------------------------------------
CREATE POLICY appointments_branch_policy ON appointments
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 6. POLICIES: SALES & PAYMENTS (Branch & Role Filter)
-- -----------------------------------------------------------------------------
CREATE POLICY sales_branch_policy ON sales
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

CREATE POLICY payments_branch_policy ON payments
    FOR ALL
    USING (
        organization_id = get_current_user_org_id()
        AND has_branch_access(branch_id)
    );

CREATE POLICY sale_items_policy ON sale_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM sales s
            WHERE s.id = sale_items.sale_id
              AND s.organization_id = get_current_user_org_id()
              AND has_branch_access(s.branch_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 7. POLICIES: CUSTOMER COURSES & SESSION DEDUCTIONS
-- -----------------------------------------------------------------------------
CREATE POLICY customer_courses_org_policy ON customer_courses
    FOR ALL
    USING (organization_id = get_current_user_org_id());

CREATE POLICY session_deductions_branch_policy ON session_deductions
    FOR ALL
    USING (
        has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 8. POLICIES: AUDIT EVENTS (Owner Admin & Branch Manager View, Append by System)
-- -----------------------------------------------------------------------------
CREATE POLICY audit_events_read_policy ON audit_events
    FOR SELECT
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY audit_events_insert_policy ON audit_events
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
    );



-- -----------------------------------------------------------------------------
-- FILE: 005_auth_sync_and_auto_link.sql
-- -----------------------------------------------------------------------------
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



-- -----------------------------------------------------------------------------
-- FILE: 005_seed_mock_data.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 005: SEED MOCK DATA FOR DEVELOPMENT & TESTING
-- Target: PostgreSQL / Supabase
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_b1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_b2_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_b3_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    v_staff_admin UUID := '99999999-9999-9999-9999-999999999991';
    v_staff_mgr UUID := '99999999-9999-9999-9999-999999999992';
    v_staff_cashier UUID := '99999999-9999-9999-9999-999999999993';
    v_staff_doc UUID := '99999999-9999-9999-9999-999999999994';

    v_cust1_id UUID := '77777777-7777-7777-7777-777777777771';
    v_cust2_id UUID := '77777777-7777-7777-7777-777777777772';
    v_cust3_id UUID := '77777777-7777-7777-7777-777777777773';

    v_svc1_id UUID := '55555555-5555-5555-5555-555555555551';
    v_svc2_id UUID := '55555555-5555-5555-5555-555555555552';
    v_svc3_id UUID := '55555555-5555-5555-5555-555555555553';

    v_prod1_id UUID := '44444444-4444-4444-4444-444444444441';
    v_prod2_id UUID := '44444444-4444-4444-4444-444444444442';

    v_pkg1_id UUID := '66666666-6666-6666-6666-666666666661';
BEGIN
    -- 1. Insert Organization
    INSERT INTO organizations (id, name, tax_code, phone, email, address)
    VALUES (v_org_id, 'Phuong Nam Beauty & Dental Clinic', '0312345678', '0901234567', 'contact@phuongnamclinic.vn', '123 Lê Lợi, Bến Nghé, Quận 1, TP.HCM')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Insert Branches
    INSERT INTO branches (id, organization_id, name, code, phone, address, is_headquarters)
    VALUES 
        (v_b1_id, v_org_id, 'Chi Nhánh Quận 1 (Trụ sở)', 'CN-Q1', '02838221111', '123 Lê Lợi, P. Bến Nghé, Quận 1', TRUE),
        (v_b2_id, v_org_id, 'Chi Nhánh Quận 7 (Phú Mỹ Hưng)', 'CN-Q7', '02854112222', '456 Nguyễn Văn Linh, P. Tân Phong, Quận 7', FALSE),
        (v_b3_id, v_org_id, 'Chi Nhánh TP. Thủ Đức', 'CN-TD', '02873003333', '789 Võ Văn Ngân, TP. Thủ Đức', FALSE)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Insert Staff Profiles
    INSERT INTO staff_profiles (id, organization_id, full_name, code, phone, email, title)
    VALUES
        (v_staff_admin, v_org_id, 'Trần Phương Nam', 'NV-ADMIN', '0909000001', 'admin@phuongnam.vn', 'Tổng Giám Đốc'),
        (v_staff_mgr, v_org_id, 'Nguyễn Thị Hương', 'NV-QLQ1', '0909000002', 'huong.nguyen@phuongnam.vn', 'Quản Lý Chi Nhánh Q1'),
        (v_staff_cashier, v_org_id, 'Lê Thu Thảo', 'NV-LT01', '0909000003', 'thao.le@phuongnam.vn', 'Lễ Tân / Thu Ngân'),
        (v_staff_doc, v_org_id, 'BS. Phạm Minh Tuấn', 'NV-BS01', '0909000004', 'tuan.pham@phuongnam.vn', 'Bác Sĩ Trưởng Khoa Da Liễu')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Insert Organization Memberships
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids)
    VALUES
        (v_staff_admin, v_org_id, 'owner_admin', ARRAY[]::UUID[]),
        (v_staff_mgr, v_org_id, 'branch_manager', ARRAY[v_b1_id]::UUID[]),
        (v_staff_cashier, v_org_id, 'cashier_receptionist', ARRAY[v_b1_id]::UUID[]),
        (v_staff_doc, v_org_id, 'technician_doctor', ARRAY[v_b1_id, v_b2_id]::UUID[])
    ON CONFLICT (staff_id, organization_id) DO NOTHING;

    -- 5. Insert Services
    INSERT INTO services (id, organization_id, code, name, category, base_price, duration_minutes, default_commission_pct)
    VALUES
        (v_svc1_id, v_org_id, 'DV-001', 'Chăm sóc Da Mặt Chuyên Sâu Gold 24K', 'facial', 1200000, 75, 10),
        (v_svc2_id, v_org_id, 'DV-002', 'Laser Pico Trị Nám & Tàn Nhang', 'laser', 2500000, 60, 12),
        (v_svc3_id, v_org_id, 'DV-003', 'Tẩy Trắng Răng Laser Whitening', 'dental_care', 1800000, 45, 8)
    ON CONFLICT (id) DO NOTHING;

    -- 6. Insert Branch Service Prices
    INSERT INTO branch_service_prices (organization_id, branch_id, service_id, custom_price)
    VALUES
        (v_org_id, v_b1_id, v_svc1_id, 1200000),
        (v_org_id, v_b1_id, v_svc2_id, 2500000),
        (v_org_id, v_b2_id, v_svc1_id, 1350000)
    ON CONFLICT (branch_id, service_id) DO NOTHING;

    -- 7. Insert Products & Stocks
    INSERT INTO products (id, organization_id, code, name, category, unit, retail_price, cost_price, min_stock_alert)
    VALUES
        (v_prod1_id, v_org_id, 'SP-001', 'Serum Tế Bào Gốc HA Booster 50ml', 'skincare', 'chai', 850000, 420000, 5),
        (v_prod2_id, v_org_id, 'SP-002', 'Kem Chống Nắng Phổ Rộng SPF50+ 60ml', 'skincare', 'tuýp', 620000, 290000, 10)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
    VALUES
        (v_org_id, v_b1_id, v_prod1_id, 35),
        (v_org_id, v_b1_id, v_prod2_id, 48),
        (v_org_id, v_b2_id, v_prod1_id, 20)
    ON CONFLICT (branch_id, product_id) DO NOTHING;

    -- 8. Insert Packages
    INSERT INTO packages (id, organization_id, code, name, service_id, total_sessions, package_price, validity_days)
    VALUES
        (v_pkg1_id, v_org_id, 'PKG-01', 'Liệu Trình 10 Buổi Chăm Sóc Da Mặt Gold 24K', v_svc1_id, 10, 9600000, 365)
    ON CONFLICT (id) DO NOTHING;

    -- 9. Insert Customers
    INSERT INTO customers (id, organization_id, primary_branch_id, full_name, phone, tier, total_spent, debt_balance, medical_notes)
    VALUES
        (v_cust1_id, v_org_id, v_b1_id, 'Chị Mai Lan', '0918111222', 'vip', 28500000, 0, 'Da nhạy cảm, dị ứng cồn và hương liệu nồng'),
        (v_cust2_id, v_org_id, v_b1_id, 'Anh Hoàng Long', '0983333444', 'gold', 14200000, 1500000, 'Khách niềng răng trong suốt'),
        (v_cust3_id, v_org_id, v_b2_id, 'Chị Bích Trâm', '0907777888', 'silver', 5600000, 0, 'Đang điều trị nám má phải')
    ON CONFLICT (id) DO NOTHING;

    -- 10. Insert Customer Courses
    INSERT INTO customer_courses (id, organization_id, customer_id, package_id, service_id, total_sessions, used_sessions, status)
    VALUES
        ('88888888-8888-8888-8888-888888888881', v_org_id, v_cust1_id, v_pkg1_id, v_svc1_id, 10, 3, 'active')
    ON CONFLICT (id) DO NOTHING;

    -- 11. Insert Appointments
    INSERT INTO appointments (organization_id, branch_id, customer_id, staff_id, service_id, scheduled_at, duration_minutes, status, notes)
    VALUES
        (v_org_id, v_b1_id, v_cust1_id, v_staff_doc, v_svc1_id, NOW() + INTERVAL '1 hour', 75, 'confirmed', 'Khách hẹn buổi thứ 4 liệu trình Gold 24K'),
        (v_org_id, v_b1_id, v_cust2_id, v_staff_doc, v_svc3_id, NOW() + INTERVAL '3 hours', 45, 'booked', 'Tẩy trắng răng định kỳ');

    RAISE NOTICE '✅ MIGRATION 005: Seed mock data successfully loaded!';
END $$;



-- -----------------------------------------------------------------------------
-- FILE: 006_auth_security_hardening.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 006: AUTH SECURITY HARDENING & POSTGREST SCHEMA CACHE REFRESH
-- Target Supabase Project: lskrcerzxltlrcewigrw
-- Date: 2026-09-27
-- =============================================================================

-- ─── 1. SAFE LINKING OF THE 4 IDENTIFIED TEST ACCOUNTS (ONLY IF UNLINKED) ───
-- Only updates the 4 specific test accounts if auth_user_id is currently NULL.
-- Preserves existing links (e.g. 99999999-... or 11111111-...) without conflict.
UPDATE public.staff_profiles sp
SET auth_user_id = au.id, updated_at = NOW()
FROM auth.users au
WHERE sp.email = au.email
  AND sp.email IN (
      'admin@phuongnam.vn',
      'huong.nguyen@phuongnam.vn',
      'thao.le@phuongnam.vn',
      'tuan.pham@phuongnam.vn'
  )
  AND sp.auth_user_id IS NULL;

-- ─── 2. DROP UNSAFE TRIGGERS & OLD FUNCTIONS ────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created_link_staff ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auth_user_linked_to_staff();
DROP FUNCTION IF EXISTS public.claim_or_sync_staff_session();

-- ─── 3. CREATE READ-ONLY get_staff_session() ────────────────────────────────
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
    -- Reject anonymous callers immediately
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

    IF NOT v_is_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Hồ sơ nhân sự đã bị vô hiệu hóa.'
        );
    END IF;

    -- Fetch active membership matching organization
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

-- Strict permission: authenticated only
GRANT EXECUTE ON FUNCTION public.get_staff_session() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_staff_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_session() FROM PUBLIC;

-- ─── 4. HARDEN RLS HELPER FUNCTIONS ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS UUID AS $$
    SELECT sp.organization_id
    FROM staff_profiles sp
    JOIN organization_memberships om 
      ON sp.id = om.staff_id 
     AND sp.organization_id = om.organization_id
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
    JOIN organization_memberships om 
      ON sp.id = om.staff_id 
     AND sp.organization_id = om.organization_id
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
        JOIN organization_memberships om 
          ON sp.id = om.staff_id 
         AND sp.organization_id = om.organization_id
        JOIN branches b 
          ON b.id = target_branch_id 
         AND b.organization_id = sp.organization_id
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
    JOIN organization_memberships om 
      ON sp.id = om.staff_id 
     AND sp.organization_id = om.organization_id
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

-- ─── 6. RLS POLICIES FOR STAFF PROFILES & MEMBERSHIPS ────────────────────────
DROP POLICY IF EXISTS staff_profiles_org_read_policy ON staff_profiles;
CREATE POLICY staff_profiles_org_read_policy ON staff_profiles
    FOR SELECT USING (organization_id = get_current_user_org_id());

DROP POLICY IF EXISTS memberships_org_read_policy ON organization_memberships;
CREATE POLICY memberships_org_read_policy ON organization_memberships
    FOR SELECT USING (organization_id = get_current_user_org_id());

DROP POLICY IF EXISTS staff_profiles_admin_write_policy ON staff_profiles;
CREATE POLICY staff_profiles_admin_write_policy ON staff_profiles
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

DROP POLICY IF EXISTS memberships_admin_write_policy ON organization_memberships;
CREATE POLICY memberships_admin_write_policy ON organization_memberships
    FOR ALL USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- ─── 7. REFRESH POSTGREST SCHEMA CACHE ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';



-- -----------------------------------------------------------------------------
-- FILE: 007_e1_services_pricing_skills_resources.sql
-- -----------------------------------------------------------------------------
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



-- -----------------------------------------------------------------------------
-- FILE: 008_multibranch_enhancements.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 008: MULTI-BRANCH DATA SCOPING & SERVER-SIDE VALIDATION ENHANCEMENTS
-- Reference: Multi-branch Master Plan & Security Verification
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. BỔ SUNG TRƯỜNG CHI NHÁNH & LIÊN CHI NHÁNH CHO SỔ LIỆU TRÌNH (CUSTOMER_COURSES)
ALTER TABLE customer_courses
ADD COLUMN IF NOT EXISTS sold_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS allow_inter_branch BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN customer_courses.sold_branch_id IS 'Chi nhánh phát sinh bán gói liệu trình';
COMMENT ON COLUMN customer_courses.allow_inter_branch IS 'Cờ cho phép thực hiện dịch vụ trừ buổi tại các chi nhánh khác trong chuỗi';

-- 2. BỔ SUNG PHẠM VI CHI NHÁNH ÁP DỤNG CHO VOUCHER / KHUYẾN MÃI (PROMOTIONS)
ALTER TABLE promotions
ADD COLUMN IF NOT EXISTS applicable_branch_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN promotions.applicable_branch_ids IS 'Danh sách UUID chi nhánh áp dụng ({}=Toàn chuỗi)';

-- 3. FUNCTION & RPC: KIỂM TRA TÍNH HỢP LỆ CỦA VOUCHER PHÍA SERVER (SERVER-SIDE VALIDATION)
CREATE OR REPLACE FUNCTION rpc_validate_promo(
    p_org_id UUID,
    p_branch_id UUID,
    p_code TEXT,
    p_subtotal BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_promo RECORD;
    v_discount BIGINT := 0;
BEGIN
    -- Tìm mã khuyến mãi theo mã code và org
    SELECT * INTO v_promo
    FROM promotions
    WHERE organization_id = p_org_id
      AND UPPER(code) = UPPER(TRIM(p_code))
      AND is_active = TRUE
      AND CURRENT_DATE BETWEEN start_date AND end_date;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', 'Mã voucher không tồn tại, đã hết hạn hoặc chưa kích hoạt.'
        );
    END IF;

    -- Kiểm tra giới hạn lượt dùng
    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', 'Mã voucher đã hết lượt sử dụng.'
        );
    END IF;

    -- Kiểm tra phạm vi chi nhánh (Nếu có khai báo applicable_branch_ids và không rỗng)
    IF v_promo.applicable_branch_ids IS NOT NULL AND array_length(v_promo.applicable_branch_ids, 1) > 0 THEN
        IF NOT (p_branch_id = ANY(v_promo.applicable_branch_ids)) THEN
            RETURN jsonb_build_object(
                'is_valid', FALSE,
                'message', 'Mã voucher không áp dụng tại chi nhánh này.'
            );
        END IF;
    END IF;

    -- Kiểm tra đơn hàng tối thiểu
    IF p_subtotal < v_promo.min_order_value THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', format('Đơn hàng tối thiểu để áp dụng là %s VNĐ.', v_promo.min_order_value)
        );
    END IF;

    -- Tính mức giảm
    IF v_promo.discount_type = 'percentage' THEN
        v_discount := ROUND((p_subtotal * v_promo.discount_value) / 100.0);
        IF v_promo.max_discount_amount IS NOT NULL AND v_discount > v_promo.max_discount_amount THEN
            v_discount := v_promo.max_discount_amount;
        END IF;
    ELSE
        v_discount := v_promo.discount_value;
    END IF;

    IF v_discount > p_subtotal THEN
        v_discount := p_subtotal;
    END IF;

    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'promo_id', v_promo.id,
        'code', v_promo.code,
        'discount_type', v_promo.discount_type,
        'discount_value', v_promo.discount_value,
        'calculated_discount', v_discount,
        'message', 'Áp dụng voucher thành công.'
    );
END;
$$;

-- 4. FUNCTION & RPC: TRỪ BUỔI LIỆU TRÌNH AN TOÀN VÀ BẤT BIẾN (ACID RPC)
CREATE OR REPLACE FUNCTION rpc_deduct_course_session(
    p_course_id UUID,
    p_branch_id UUID,
    p_staff_id UUID,
    p_sessions INT DEFAULT 1,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_course RECORD;
    v_deduction_id UUID;
BEGIN
    IF p_sessions <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số buổi trừ phải lớn hơn 0.');
    END IF;

    -- Khóa bản ghi customer_course bằng FOR UPDATE để chống Race Condition trừ trùng
    SELECT * INTO v_course
    FROM customer_courses
    WHERE id = p_course_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy hồ sơ thẻ liệu trình.');
    END IF;

    IF v_course.status <> 'active' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Thẻ liệu trình này không ở trạng thái hoạt động.');
    END IF;

    -- Kiểm tra quyền liên chi nhánh
    IF NOT v_course.allow_inter_branch AND v_course.sold_branch_id IS NOT NULL AND v_course.sold_branch_id <> p_branch_id THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Gói liệu trình này chỉ được phép sử dụng tại chi nhánh đã mua.');
    END IF;

    -- Kiểm tra số buổi còn lại
    IF (v_course.total_sessions - v_course.used_sessions) < p_sessions THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số buổi còn lại trong thẻ không đủ để trừ.');
    END IF;

    -- Ghi sổ cái bất biến session_deductions
    INSERT INTO session_deductions (
        course_id,
        branch_id,
        staff_id,
        sessions_deducted,
        notes,
        performed_at
    ) VALUES (
        p_course_id,
        p_branch_id,
        p_staff_id,
        p_sessions,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_deduction_id;

    -- Cập nhật số buổi đã dùng trong customer_courses
    UPDATE customer_courses
    SET used_sessions = used_sessions + p_sessions,
        status = CASE WHEN (used_sessions + p_sessions) >= total_sessions THEN 'completed' ELSE 'active' END,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_course_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deduction_id', v_deduction_id,
        'used_sessions', v_course.used_sessions + p_sessions,
        'remaining_sessions', v_course.total_sessions - (v_course.used_sessions + p_sessions),
        'message', 'Trừ buổi liệu trình thành công và đã ghi sổ cái bất biến.'
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 009_appointment_dispatch_and_concurrency.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 009: ADVANCED APPOINTMENT DISPATCH, MULTI-BRANCH CONCURRENCY & ROSTER
-- Target: PostgreSQL / Supabase
-- Reference: Master Plan Phase P4 / Đợt E2
-- =============================================================================

-- 1. TABLE: ROSTER_SHIFTS (Phân ca làm việc & Lịch trực theo Chi nhánh)
CREATE TABLE IF NOT EXISTS roster_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL DEFAULT '08:00:00',
    end_time TIME NOT NULL DEFAULT '20:00:00',
    shift_type VARCHAR(50) NOT NULL DEFAULT 'day_shift', -- 'morning', 'afternoon', 'day_shift', 'custom'
    is_off BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_roster_date UNIQUE (organization_id, staff_id, shift_date)
);

-- RLS cho roster_shifts
ALTER TABLE roster_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_roster_shifts_read ON roster_shifts;
CREATE POLICY rls_roster_shifts_read ON roster_shifts
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

DROP POLICY IF EXISTS rls_roster_shifts_admin_modify ON roster_shifts;
CREATE POLICY rls_roster_shifts_admin_modify ON roster_shifts
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
    );

-- 2. BỔ SUNG THUỘC TÍNH NÂNG CAO CHO BẢNG APPOINTMENTS
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS buffer_minutes_after INT NOT NULL DEFAULT 0 CHECK (buffer_minutes_after >= 0),
ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'at_counter',
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- 3. TABLE: APPOINTMENT_EVENTS (Nhật ký Tiến trình & Lịch sử Điều phối — Timeline)
CREATE TABLE IF NOT EXISTS appointment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'status_changed', 'rescheduled', 'staff_reassigned', 'cancelled'
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_appointment_events_read ON appointment_events;
CREATE POLICY rls_appointment_events_read ON appointment_events
    FOR SELECT TO authenticated
    USING (
        appointment_id IN (
            SELECT id FROM appointments
            WHERE organization_id = (SELECT get_current_user_org_id())
        )
    );

-- 4. HARDENED ATOMIC CONCURRENCY RPC: ĐẶT LỊCH CHỐNG TRÙNG TOÀN CHUỖI
CREATE OR REPLACE FUNCTION rpc_book_appointment(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_service_id UUID,
    p_staff_id UUID DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
    p_duration_minutes INT DEFAULT 60,
    p_notes TEXT DEFAULT NULL,
    p_existing_appt_id UUID DEFAULT NULL,
    p_actor_staff_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
    v_appt_date DATE;
    v_appt_time_only TIME;
    v_conflict_staff RECORD;
    v_conflict_resource RECORD;
    v_roster_shift RECORD;
    v_resource_capacity INT := 1;
    v_resource_name VARCHAR(255);
    v_staff_name VARCHAR(255);
    v_appt_id UUID;
    v_is_update BOOLEAN := (p_existing_appt_id IS NOT NULL);
    v_old_status VARCHAR(50);
    v_existing_idempotent RECORD;
    v_peak_overlap INT := 0;
BEGIN
    -- 0. KIỂM TRA CHỐNG XỬ LÝ LẶP (IDEMPOTENCY KEY)
    IF p_idempotency_key IS NOT NULL AND NOT v_is_update THEN
        SELECT id, scheduled_at, duration_minutes INTO v_existing_idempotent
        FROM appointments
        WHERE organization_id = p_org_id
          AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'is_idempotent_replay', TRUE,
                'appointment_id', v_existing_idempotent.id,
                'message', 'Lịch hẹn đã được ghi nhận trước đó (Idempotent replay).'
            );
        END IF;
    END IF;

    IF p_scheduled_at IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Vui lòng chọn ngày và giờ hẹn hợp lệ.');
    END IF;

    IF p_duration_minutes <= 0 THEN
        p_duration_minutes := 60;
    END IF;

    v_start_time := p_scheduled_at;
    v_end_time := p_scheduled_at + (p_duration_minutes * INTERVAL '1 minute');
    v_appt_date := (p_scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
    v_appt_time_only := (p_scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::TIME;

    -- 1. THỨ TỰ KHÓA GIAO DỊCH NHẤT QUÁN ĐỂ TRÁNH DEADLOCK (STAFF -> RESOURCE)
    IF p_staff_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('lock_staff_' || p_staff_id::text));
    END IF;

    IF p_resource_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('lock_resource_' || p_resource_id::text));
    END IF;

    -- 2. KIỂM TRA CA LÀM CỦA KTV (NẾU CÓ BẢNG PHÂN CA ROSTER)
    IF p_staff_id IS NOT NULL THEN
        SELECT * INTO v_roster_shift
        FROM roster_shifts
        WHERE organization_id = p_org_id
          AND staff_id = p_staff_id
          AND shift_date = v_appt_date;

        IF FOUND THEN
            IF v_roster_shift.is_off THEN
                SELECT full_name INTO v_staff_name FROM staff_profiles WHERE id = p_staff_id;
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict_type', 'staff_day_off',
                    'message', format('Kỹ thuật viên "%s" có lịch nghỉ vào ngày %s.', COALESCE(v_staff_name, ''), v_appt_date)
                );
            END IF;

            IF v_roster_shift.branch_id <> p_branch_id THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict_type', 'staff_different_branch_roster',
                    'message', format('Kỹ thuật viên này được xếp ca tại chi nhánh khác vào ngày %s.', v_appt_date)
                );
            END IF;
        END IF;
    END IF;

    -- 3. KIỂM TRA TRÙNG LỊCH KTV TRÊN TOÀN BỘ TỔ CHỨC (MULTI-BRANCH OVERLAP CHECK)
    IF p_staff_id IS NOT NULL THEN
        SELECT a.id, a.branch_id, b.name AS branch_name, a.scheduled_at, a.duration_minutes, s.full_name INTO v_conflict_staff
        FROM appointments a
        LEFT JOIN staff_profiles s ON s.id = a.staff_id
        LEFT JOIN branches b ON b.id = a.branch_id
        WHERE a.organization_id = p_org_id
          AND a.staff_id = p_staff_id
          AND a.status NOT IN ('cancelled')
          AND (v_is_update = FALSE OR a.id <> p_existing_appt_id)
          AND (
              -- Nếu khác chi nhánh: thêm 30 phút đệm di chuyển giữa các cơ sở
              CASE WHEN a.branch_id <> p_branch_id THEN
                  (a.scheduled_at - INTERVAL '30 minutes' < v_end_time 
                   AND (a.scheduled_at + (a.duration_minutes + a.buffer_minutes_after + 30) * INTERVAL '1 minute') > v_start_time)
              ELSE
                  (a.scheduled_at < v_end_time 
                   AND (a.scheduled_at + (a.duration_minutes + a.buffer_minutes_after) * INTERVAL '1 minute') > v_start_time)
              END
          )
        LIMIT 1;

        IF FOUND THEN
            SELECT full_name INTO v_staff_name FROM staff_profiles WHERE id = p_staff_id;
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'staff_overlap',
                'conflict_branch_id', v_conflict_staff.branch_id,
                'message', format('Kỹ thuật viên "%s" đã có lịch hẹn tại %s trong khung giờ %s - %s.',
                    COALESCE(v_staff_name, 'được chọn'),
                    COALESCE(v_conflict_staff.branch_name, 'chi nhánh khác'),
                    to_char(v_conflict_staff.scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
                    to_char((v_conflict_staff.scheduled_at + (v_conflict_staff.duration_minutes * INTERVAL '1 minute')) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI')
                )
            );
        END IF;
    END IF;

    -- 4. KIỂM TRA SỨC CHỨA TÀI NGUYÊN (PHÒNG/GIƯỜNG/MÁY MÓC) THEO PEAK OVERLAP
    IF p_resource_id IS NOT NULL THEN
        SELECT name, capacity INTO v_resource_name, v_resource_capacity
        FROM resources
        WHERE id = p_resource_id AND branch_id = p_branch_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'resource_not_found',
                'message', 'Tài nguyên phòng/giường không tồn tại hoặc đã ngừng hoạt động tại chi nhánh này.'
            );
        END IF;

        -- Đếm số ca đồng thời tối đa trong khoảng thời gian
        SELECT COUNT(*) INTO v_peak_overlap
        FROM appointments a
        WHERE a.organization_id = p_org_id
          AND a.branch_id = p_branch_id
          AND a.resource_id = p_resource_id
          AND a.status NOT IN ('cancelled')
          AND (v_is_update = FALSE OR a.id <> p_existing_appt_id)
          AND (a.scheduled_at < v_end_time AND (a.scheduled_at + (a.duration_minutes * INTERVAL '1 minute')) > v_start_time);

        IF v_peak_overlap >= v_resource_capacity THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'resource_capacity_exceeded',
                'message', format('Phòng/Giường "%s" đã hết công suất phục vụ trong khung giờ này (Sức chứa tối đa: %s khách).',
                    COALESCE(v_resource_name, 'được chọn'),
                    v_resource_capacity
                )
            );
        END IF;
    END IF;

    -- 5. THỰC HIỆN GHI / CẬP NHẬT DATABASE
    IF v_is_update THEN
        SELECT status INTO v_old_status FROM appointments WHERE id = p_existing_appt_id;

        UPDATE appointments
        SET customer_id = p_customer_id,
            service_id = p_service_id,
            staff_id = p_staff_id,
            resource_id = p_resource_id,
            scheduled_at = v_start_time,
            duration_minutes = p_duration_minutes,
            notes = p_notes,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_existing_appt_id
        RETURNING id INTO v_appt_id;

        -- Ghi timeline event trong cùng transaction
        INSERT INTO appointment_events (
            appointment_id,
            event_type,
            actor_staff_id,
            from_status,
            to_status,
            notes
        ) VALUES (
            v_appt_id,
            'rescheduled',
            p_actor_staff_id,
            v_old_status,
            v_old_status,
            'Cập nhật điều phối thời gian và nhân sự phục vụ'
        );
    ELSE
        INSERT INTO appointments (
            organization_id,
            branch_id,
            customer_id,
            service_id,
            staff_id,
            resource_id,
            scheduled_at,
            duration_minutes,
            status,
            notes,
            idempotency_key
        ) VALUES (
            p_org_id,
            p_branch_id,
            p_customer_id,
            p_service_id,
            p_staff_id,
            p_resource_id,
            v_start_time,
            p_duration_minutes,
            'confirmed',
            p_notes,
            p_idempotency_key
        )
        RETURNING id INTO v_appt_id;

        -- Ghi timeline event trong cùng transaction
        INSERT INTO appointment_events (
            appointment_id,
            event_type,
            actor_staff_id,
            to_status,
            notes
        ) VALUES (
            v_appt_id,
            'created',
            p_actor_staff_id,
            'confirmed',
            'Đặt lịch hẹn mới qua hệ thống điều phối'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'appointment_id', v_appt_id,
        'scheduled_at', v_start_time,
        'duration_minutes', p_duration_minutes,
        'message', 'Đã lưu lịch hẹn và khóa tài nguyên an toàn trên hệ thống.'
    );
END;
$$;

-- 5. BẬT REALTIME REPLICATION CHO BẢNG APPOINTMENTS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'appointments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;



-- -----------------------------------------------------------------------------
-- FILE: 010_pos_acid_checkout_and_financial_ledger.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 010: POS ATOMIC CHECKOUT, FINANCIAL LEDGER, DEPOSITS & REFUNDS
-- Phase: Master Plan Phase P5 (POS & Thu Ngân Chuẩn Spa/Nha Khoa)
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. BẢNG TIỀN ĐẶT CỌC & SỔ DƯ TÀI KHOẢN KHÁCH HÀNG (CUSTOMER_DEPOSITS)
CREATE TABLE IF NOT EXISTS customer_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    deposit_number VARCHAR(100) NOT NULL, -- PC-YYYYMMDD-XXXX
    total_deposited BIGINT NOT NULL CHECK (total_deposited > 0),
    used_amount BIGINT NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
    remaining_balance BIGINT GENERATED ALWAYS AS (total_deposited - used_amount) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'depleted', 'refunded'
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE customer_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_customer_deposits_read ON customer_deposits;
CREATE POLICY rls_customer_deposits_read ON customer_deposits
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- 2. SỔ CÁI BIẾN ĐỘNG XUẤT NHẬP TỒN KHO (INVENTORY_TRANSACTIONS)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(50) NOT NULL, -- 'sale_out', 'return_in', 'grn_in', 'adjustment'
    reference_id UUID, -- ID của Sale hoặc Goods Receipt
    quantity_change INT NOT NULL, -- Dương khi nhập, âm khi xuất
    stock_before INT NOT NULL,
    stock_after INT NOT NULL,
    notes TEXT,
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_inventory_transactions_read ON inventory_transactions;
CREATE POLICY rls_inventory_transactions_read ON inventory_transactions
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- Bất biến sổ cái kho: Không được UPDATE/DELETE
CREATE OR REPLACE RULE prevent_inventory_trans_update AS ON UPDATE TO inventory_transactions DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_inventory_trans_delete AS ON DELETE TO inventory_transactions DO INSTEAD NOTHING;

-- 3. CẤU HÌNH THỜI GIAN DI CHUYỂN GIỮA CÁC CẶP CHI NHÁNH (BRANCH_TRAVEL_MATRIX)
CREATE TABLE IF NOT EXISTS branch_travel_matrix (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    to_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    travel_buffer_minutes INT NOT NULL DEFAULT 30 CHECK (travel_buffer_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_branch_travel_pair UNIQUE (organization_id, from_branch_id, to_branch_id)
);

-- 4. BẢNG CHỨNG TỪ HỦY ĐƠN & HOÀN TIỀN (SALE_REFUNDS)
CREATE TABLE IF NOT EXISTS sale_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    refund_number VARCHAR(100) NOT NULL, -- PT-HOAN-YYYYMMDD-XXXX
    refund_amount BIGINT NOT NULL CHECK (refund_amount > 0),
    refund_method VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash', 'transfer', 'deposit_return'
    reason TEXT NOT NULL,
    return_stock BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_by_staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 5. RPC CHECKOUT GIAO DỊCH BÁN HÀNG TOÀN VẸN (ATOMIC POS CHECKOUT)
CREATE OR REPLACE FUNCTION rpc_pos_checkout(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_cashier_staff_id UUID,
    p_items JSONB,              -- Mảng JSON các món: [{type: 'service'|'product'|'package', id: '...', qty: 1, performer_id: '...'}]
    p_payment_method VARCHAR(50), -- 'cash', 'transfer_vietqr', 'card', 'split', 'debt'
    p_paid_amount BIGINT,       -- Số tiền thực trả
    p_promo_code TEXT DEFAULT NULL,
    p_manual_discount_amount BIGINT DEFAULT 0,
    p_manual_discount_reason TEXT DEFAULT NULL,
    p_use_deposit_amount BIGINT DEFAULT 0,
    p_appointment_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_sale RECORD;
    v_sale_id UUID;
    v_invoice_number VARCHAR(100);
    v_item RECORD;
    v_item_type VARCHAR(20);
    v_item_id UUID;
    v_item_qty INT;
    v_performer_id UUID;
    v_item_name VARCHAR(255);
    v_item_price BIGINT;
    v_item_commission_pct NUMERIC(5, 2) := 0;
    v_line_total BIGINT;
    v_subtotal BIGINT := 0;
    v_promo_discount BIGINT := 0;
    v_total_discount BIGINT := 0;
    v_final_total BIGINT := 0;
    v_debt_amount BIGINT := 0;
    v_payment_id UUID;
    v_payment_number VARCHAR(100);
    v_stock_curr RECORD;
    v_deposit_rec RECORD;
    v_rem_deposit_to_use BIGINT := COALESCE(p_use_deposit_amount, 0);
    v_course_pkg RECORD;
    v_course_id UUID;
BEGIN
    -- 0. KIỂM TRA IDEMPOTENCY KEY (Chống bấm đúp / gửi lại do mạng)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, invoice_number, total_amount, paid_amount INTO v_existing_sale
        FROM sales
        WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'is_idempotent_replay', TRUE,
                'sale_id', v_existing_sale.id,
                'invoice_no', v_existing_sale.invoice_number,
                'total_amount', v_existing_sale.total_amount,
                'message', 'Đơn hàng đã được thanh toán trước đó (Idempotent replay).'
            );
        END IF;
    END IF;

    -- Kiểm tra giỏ hàng
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Giỏ hàng trống, không thể thanh toán.');
    END IF;

    -- 1. DUYỆT QUA GIỎ HÀNG VÀ TÍNH TIỀN PHÍA SERVER TỪ SNAPSHOT CHÍNH XÁC
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        type TEXT,
        id UUID,
        qty INT,
        performer_id UUID
    )
    LOOP
        v_item_type := v_item.type;
        v_item_id := v_item.id;
        v_item_qty := COALESCE(v_item.qty, 1);
        v_performer_id := v_item.performer_id;

        IF v_item_qty <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng món hàng phải lớn hơn 0.');
        END IF;

        IF v_item_type = 'service' THEN
            -- Lấy giá dịch vụ theo chi nhánh (ưu tiên branch_service_prices rồi tới services)
            SELECT COALESCE(bsp.custom_price, s.base_price), s.name, s.default_commission_pct 
            INTO v_item_price, v_item_name, v_item_commission_pct
            FROM services s
            LEFT JOIN branch_service_prices bsp ON bsp.service_id = s.id AND bsp.branch_id = p_branch_id AND bsp.is_active = TRUE
            WHERE s.id = v_item_id AND s.organization_id = p_org_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', FALSE, 'message', 'Dịch vụ không tồn tại hoặc đã ngừng hoạt động.');
            END IF;

        ELSIF v_item_type = 'product' THEN
            -- Khóa bản ghi tồn kho chi nhánh bằng FOR UPDATE để chống bán vượt tồn đồng thời
            SELECT s.stock_on_hand, p.name, p.retail_price
            INTO v_stock_curr
            FROM inventory_stocks s
            JOIN products p ON p.id = s.product_id
            WHERE s.branch_id = p_branch_id AND s.product_id = v_item_id AND p.organization_id = p_org_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', FALSE, 'message', 'Sản phẩm chưa được khởi tạo kho tại chi nhánh này.');
            END IF;

            IF v_stock_curr.stock_on_hand < v_item_qty THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict_type', 'insufficient_stock',
                    'message', format('Sản phẩm "%s" chỉ còn %s trong kho chi nhánh, không đủ số lượng bán (%s).', 
                        v_stock_curr.name, v_stock_curr.stock_on_hand, v_item_qty)
                );
            END IF;

            v_item_name := v_stock_curr.name;
            v_item_price := v_stock_curr.retail_price;

        ELSIF v_item_type = 'package' THEN
            -- Lấy gói liệu trình
            SELECT p.name, p.package_price, p.total_sessions, p.service_id
            INTO v_course_pkg
            FROM packages p
            WHERE p.id = v_item_id AND p.organization_id = p_org_id AND p.is_active = TRUE;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', FALSE, 'message', 'Gói liệu trình không tồn tại hoặc đã ngừng kinh doanh.');
            END IF;

            v_item_name := v_course_pkg.name;
            v_item_price := v_course_pkg.package_price;
        ELSE
            RETURN jsonb_build_object('success', FALSE, 'message', format('Loại mặt hàng "%s" không hợp lệ.', v_item_type));
        END IF;

        v_line_total := v_item_price * v_item_qty;
        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    -- 2. TÍNH KHUYẾN MÃI VOUCHER (NẾU CÓ) PHÍA SERVER
    IF p_promo_code IS NOT NULL AND TRIM(p_promo_code) <> '' THEN
        DECLARE
            v_promo_res JSONB;
        BEGIN
            v_promo_res := rpc_validate_promo(p_org_id, p_branch_id, p_promo_code, v_subtotal);
            IF (v_promo_res->>'is_valid')::BOOLEAN = TRUE THEN
                v_promo_discount := (v_promo_res->>'calculated_discount')::BIGINT;
                -- Tăng lượt dùng voucher
                UPDATE promotions
                SET used_count = used_count + 1
                WHERE organization_id = p_org_id AND UPPER(code) = UPPER(TRIM(p_promo_code));
            ELSE
                RETURN jsonb_build_object('success', FALSE, 'message', v_promo_res->>'message');
            END IF;
        END;
    END IF;

    -- Tổng giảm giá
    v_total_discount := v_promo_discount + COALESCE(p_manual_discount_amount, 0);
    IF v_total_discount > v_subtotal THEN
        v_total_discount := v_subtotal;
    END IF;

    v_final_total := v_subtotal - v_total_discount;

    -- 3. XỬ LÝ KHẤU TRỪ TIỀN CỌC (NẾU CÓ)
    IF v_rem_deposit_to_use > 0 THEN
        FOR v_deposit_rec IN 
            SELECT id, remaining_balance
            FROM customer_deposits
            WHERE customer_id = p_customer_id AND organization_id = p_org_id AND status = 'active'
            ORDER BY created_at ASC
            FOR UPDATE
        LOOP
            IF v_rem_deposit_to_use <= 0 THEN EXIT; END IF;

            IF v_deposit_rec.remaining_balance > 0 THEN
                DECLARE
                    v_deduct BIGINT := LEAST(v_rem_deposit_to_use, v_deposit_rec.remaining_balance);
                BEGIN
                    UPDATE customer_deposits
                    SET used_amount = used_amount + v_deduct,
                        status = CASE WHEN (used_amount + v_deduct) >= total_deposited THEN 'depleted' ELSE 'active' END,
                        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    WHERE id = v_deposit_rec.id;

                    v_rem_deposit_to_use := v_rem_deposit_to_use - v_deduct;
                END;
            END IF;
        END LOOP;

        IF v_rem_deposit_to_use > 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số dư tiền cọc khả dụng không đủ để thanh toán.');
        END IF;
    END IF;

    -- Tính số tiền nợ lại (nếu thanh toán thiếu)
    IF (p_paid_amount + COALESCE(p_use_deposit_amount, 0)) < v_final_total THEN
        v_debt_amount := v_final_total - (p_paid_amount + COALESCE(p_use_deposit_amount, 0));
    ELSE
        v_debt_amount := 0;
    END IF;

    -- Sinh số hóa đơn: HDYYMMDD-XXXX
    v_invoice_number := 'HD' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    v_payment_number := 'PT' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 4. TẠO HÓA ĐƠN BÁN HÀNG (SALES)
    INSERT INTO sales (
        organization_id,
        branch_id,
        customer_id,
        invoice_number,
        idempotency_key,
        subtotal,
        discount_amount,
        promo_code,
        tax_amount,
        tip_amount,
        total_amount,
        paid_amount,
        status,
        cashier_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_customer_id,
        v_invoice_number,
        p_idempotency_key,
        v_subtotal,
        v_total_discount,
        p_promo_code,
        0,
        0,
        v_final_total,
        p_paid_amount + COALESCE(p_use_deposit_amount, 0),
        'completed',
        p_cashier_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_sale_id;

    -- 5. TẠO CHI TIẾT DÒNG HÀNG & TRỪ KHO / TẠO THẺ LIỆU TRÌNH
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        type TEXT,
        id UUID,
        qty INT,
        performer_id UUID
    )
    LOOP
        v_item_type := v_item.type;
        v_item_id := v_item.id;
        v_item_qty := COALESCE(v_item.qty, 1);
        v_performer_id := v_item.performer_id;

        IF v_item_type = 'service' THEN
            SELECT COALESCE(bsp.custom_price, s.base_price), s.name, s.default_commission_pct 
            INTO v_item_price, v_item_name, v_item_commission_pct
            FROM services s
            LEFT JOIN branch_service_prices bsp ON bsp.service_id = s.id AND bsp.branch_id = p_branch_id
            WHERE s.id = v_item_id;

        ELSIF v_item_type = 'product' THEN
            SELECT retail_price, name INTO v_item_price, v_item_name FROM products WHERE id = v_item_id;

            -- Trừ tồn kho thực tế
            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand - v_item_qty,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = p_branch_id AND product_id = v_item_id
            RETURNING stock_on_hand INTO v_stock_curr.stock_on_hand;

            -- Ghi sổ cái xuất nhập tồn kho
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_item_id,
                'sale_out',
                v_sale_id,
                -v_item_qty,
                v_stock_curr.stock_on_hand + v_item_qty,
                v_stock_curr.stock_on_hand,
                format('Xuất bán đơn hàng #%s', v_invoice_number),
                p_cashier_staff_id
            );

        ELSIF v_item_type = 'package' THEN
            SELECT name, package_price, total_sessions, service_id
            INTO v_course_pkg
            FROM packages
            WHERE id = v_item_id;

            v_item_name := v_course_pkg.name;
            v_item_price := v_course_pkg.package_price;

            -- TỰ ĐỘNG KHỞI TẠO THẺ LIỆU TRÌNH MỚI CHO KHÁCH (CHƯA TRỪ BUỔI ĐẦU TIÊN!)
            INSERT INTO customer_courses (
                organization_id,
                customer_id,
                package_id,
                service_id,
                sale_id,
                sold_branch_id,
                allow_inter_branch,
                total_sessions,
                used_sessions,
                expiry_date,
                status
            ) VALUES (
                p_org_id,
                p_customer_id,
                v_item_id,
                v_course_pkg.service_id,
                v_sale_id,
                p_branch_id,
                TRUE,
                v_course_pkg.total_sessions * v_item_qty,
                0, -- Bắt đầu bằng 0 buổi đã dùng
                CURRENT_DATE + INTERVAL '365 days',
                'active'
            )
            RETURNING id INTO v_course_id;
        END IF;

        -- Ghi bản ghi chi tiết sale_items (Snapshot giá và hoa hồng KTV)
        INSERT INTO sale_items (
            sale_id,
            item_type,
            item_ref_id,
            item_name,
            unit_price,
            quantity,
            line_discount,
            line_total,
            performer_staff_id,
            commission_pct,
            commission_amount
        ) VALUES (
            v_sale_id,
            v_item_type,
            v_item_id,
            v_item_name,
            v_item_price,
            v_item_qty,
            0,
            v_item_price * v_item_qty,
            v_performer_id,
            v_item_commission_pct,
            ROUND((v_item_price * v_item_qty * v_item_commission_pct) / 100.0)
        );
    END LOOP;

    -- 6. GHI PHIẾU THU TIỀN (NẾU CÓ TIỀN THỰC THU HOẶC TIỀN CỌC)
    IF (p_paid_amount + COALESCE(p_use_deposit_amount, 0)) > 0 THEN
        INSERT INTO payments (
            organization_id,
            branch_id,
            customer_id,
            payment_number,
            amount,
            payment_method,
            payment_type,
            received_by_staff_id,
            note
        ) VALUES (
            p_org_id,
            p_branch_id,
            p_customer_id,
            v_payment_number,
            p_paid_amount + COALESCE(p_use_deposit_amount, 0),
            p_payment_method,
            'sale',
            p_cashier_staff_id,
            format('Thu tiền đơn hàng #%s', v_invoice_number)
        )
        RETURNING id INTO v_payment_id;

        INSERT INTO payment_allocations (payment_id, sale_id, amount_allocated)
        VALUES (v_payment_id, v_sale_id, p_paid_amount + COALESCE(p_use_deposit_amount, 0));
    END IF;

    -- 7. CẬP NHẬT CÔNG NỢ & TỔNG CHI TIÊU KHÁCH HÀNG
    UPDATE customers
    SET total_spent = total_spent + v_final_total,
        debt_balance = debt_balance + v_debt_amount,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_customer_id;

    -- 8. NẾU CHECKOUT TỪ LỊCH HẸN: ĐỔI TRẠNG THÁI LỊCH SANG 'completed'
    IF p_appointment_id IS NOT NULL THEN
        UPDATE appointments
        SET status = 'completed',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_appointment_id AND organization_id = p_org_id;

        INSERT INTO appointment_events (
            appointment_id,
            event_type,
            actor_staff_id,
            from_status,
            to_status,
            notes
        ) VALUES (
            p_appointment_id,
            'status_changed',
            p_cashier_staff_id,
            'confirmed',
            'completed',
            format('Hoàn tất và xuất hóa đơn #%s tại quầy thu ngân', v_invoice_number)
        );
    END IF;

    -- TRẢ KẾT QUẢ THÀNH CÔNG VỚI ĐẦY ĐỦ THÔNG TIN BÁN HÀNG
    RETURN jsonb_build_object(
        'success', TRUE,
        'sale_id', v_sale_id,
        'invoice_no', v_invoice_number,
        'subtotal', v_subtotal,
        'discount_amount', v_total_discount,
        'total_amount', v_final_total,
        'paid_amount', p_paid_amount + COALESCE(p_use_deposit_amount, 0),
        'debt_amount', v_debt_amount,
        'message', 'Thanh toán đơn hàng và hạch toán toàn vẹn thành công.'
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 011_pos_refunds_deposits_bank_audit.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 011: ADVANCED FINANCIAL LEDGER, DEPOSITS, REFUNDS & BANK AUDIT
-- Phase: Master Plan Phase P5 (POS & Hoàn Thiện Sổ Cái Tài Chính)
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. BỔ SUNG TRƯỜNG XÁC THỰC NGÂN HÀNG TRONG BẢNG PAYMENTS
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) NOT NULL DEFAULT 'verified', -- 'pending_verification', 'verified', 'rejected'
ADD COLUMN IF NOT EXISTS verified_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bank_ref_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. RPC NẠP TIỀN ĐẶT CỌC / VÍ TRẢ TRƯỚC (CUSTOMER DEPOSITS)
CREATE OR REPLACE FUNCTION rpc_deposit_money(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_amount BIGINT,
    p_payment_method VARCHAR(50), -- 'cash', 'transfer_vietqr', 'card'
    p_staff_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deposit_number VARCHAR(100);
    v_deposit_id UUID;
    v_payment_id UUID;
    v_payment_number VARCHAR(100);
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số tiền nạp cọc phải lớn hơn 0.');
    END IF;

    v_deposit_number := 'PC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    v_payment_number := 'PT' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Ghi nhận khoản nạp cọc
    INSERT INTO customer_deposits (
        organization_id,
        branch_id,
        customer_id,
        deposit_number,
        total_deposited,
        used_amount,
        status,
        notes,
        created_by_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_customer_id,
        v_deposit_number,
        p_amount,
        0,
        'active',
        COALESCE(p_notes, 'Nạp tiền đặt cọc / ví trả trước'),
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_deposit_id;

    -- Ghi phiếu thu tiền vào quỹ
    INSERT INTO payments (
        organization_id,
        branch_id,
        customer_id,
        payment_number,
        amount,
        payment_method,
        payment_type,
        received_by_staff_id,
        verification_status,
        note
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_customer_id,
        v_payment_number,
        p_amount,
        p_payment_method,
        'deposit',
        p_staff_id,
        'verified',
        format('Thu tiền cọc #%s', v_deposit_number)
    )
    RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deposit_id', v_deposit_id,
        'deposit_number', v_deposit_number,
        'amount', p_amount,
        'message', 'Nạp tiền đặt cọc vào tài khoản khách hàng thành công.'
    );
END;
$$;

-- 3. RPC HỦY ĐƠN HÀNG & HOÀN TIỀN CÓ KIỂM SOÁT (SALE REFUND & REVERSAL)
CREATE OR REPLACE FUNCTION rpc_refund_sale(
    p_org_id UUID,
    p_branch_id UUID,
    p_sale_id UUID,
    p_authorized_staff_id UUID,
    p_reason TEXT,
    p_return_stock BOOLEAN DEFAULT TRUE,
    p_refund_method VARCHAR(50) DEFAULT 'cash' -- 'cash', 'transfer', 'deposit_return'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_course RECORD;
    v_refund_number VARCHAR(100);
    v_refund_id UUID;
    v_stock_after INT;
    v_debt_to_reduce BIGINT := 0;
    v_actual_cash_refund BIGINT := 0;
BEGIN
    -- 1. Khóa bản ghi sale bằng FOR UPDATE
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy hóa đơn cần hủy/hoàn tiền.');
    END IF;

    IF v_sale.status = 'refunded' OR v_sale.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Hóa đơn này đã được hủy/hoàn tiền trước đó.');
    END IF;

    -- 2. Kiểm tra các gói liệu trình trong đơn: Nếu đã sử dụng (used_sessions > 0) thì CHẶN HOÀN TIỀN TỰ ĐỘNG!
    FOR v_course IN 
        SELECT c.id, COALESCE(p.name, s.name, 'Gói liệu trình') AS course_name, c.total_sessions, c.used_sessions 
        FROM customer_courses c
        LEFT JOIN packages p ON p.id = c.package_id
        LEFT JOIN services s ON s.id = c.service_id
        WHERE c.sale_id = p_sale_id
    LOOP
        IF v_course.used_sessions > 0 THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'course_already_used',
                'message', format('Không thể hoàn hóa đơn vì gói liệu trình "%s" đã được thực hiện %s/%s buổi. Vui lòng xử lý đổi trả thủ công.',
                    v_course.course_name, v_course.used_sessions, v_course.total_sessions)
            );
        END IF;
    END LOOP;

    -- 3. Xử lý tồn kho nếu có yêu cầu nhập lại kho (p_return_stock = TRUE)
    IF p_return_stock THEN
        FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id AND item_type = 'product'
        LOOP
            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand + v_item.quantity,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = v_sale.branch_id AND product_id = v_item.item_ref_id
            RETURNING stock_on_hand INTO v_stock_after;

            -- Ghi sổ cái nhập kho hoàn trả
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                v_sale.branch_id,
                v_item.item_ref_id,
                'return_in',
                p_sale_id,
                v_item.quantity,
                v_stock_after - v_item.quantity,
                v_stock_after,
                format('Nhập lại kho do hủy hóa đơn #%s', v_sale.invoice_number),
                p_authorized_staff_id
            );
        END LOOP;
    END IF;

    -- 4. Thu hồi các thẻ liệu trình chưa dùng đã tạo từ đơn này
    DELETE FROM customer_courses WHERE sale_id = p_sale_id AND used_sessions = 0;

    -- 5. Tính toán số tiền hoàn thực tế & hoàn nợ
    IF (v_sale.total_amount - v_sale.paid_amount) > 0 THEN
        v_debt_to_reduce := v_sale.total_amount - v_sale.paid_amount;
    END IF;
    v_actual_cash_refund := v_sale.paid_amount;

    -- Giảm công nợ và chi tiêu khách hàng
    UPDATE customers
    SET total_spent = GREATEST(0, total_spent - v_sale.total_amount),
        debt_balance = GREATEST(0, debt_balance - v_debt_to_reduce),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = v_sale.customer_id;

    -- 6. Ghi chứng từ hoàn tiền
    v_refund_number := 'HOAN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO sale_refunds (
        organization_id,
        branch_id,
        sale_id,
        refund_number,
        refund_amount,
        refund_method,
        reason,
        return_stock,
        authorized_by_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_sale_id,
        v_refund_number,
        v_sale.total_amount,
        p_refund_method,
        p_reason,
        p_return_stock,
        p_authorized_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_refund_id;

    -- 7. Đổi trạng thái Sale sang 'refunded'
    UPDATE sales
    SET status = 'refunded',
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'refund_id', v_refund_id,
        'refund_number', v_refund_number,
        'refund_amount', v_actual_cash_refund,
        'debt_reduced', v_debt_to_reduce,
        'stock_returned', p_return_stock,
        'message', 'Đã hủy hóa đơn, hoàn tiền và cập nhật sổ cái tài chính thành công.'
    );
END;
$$;

-- 4. RPC XÁC NHẬN TIỀN CHUYỂN KHOẢN VIETQR (AUDITED BANK CONFIRMATION)
CREATE OR REPLACE FUNCTION rpc_confirm_bank_payment(
    p_org_id UUID,
    p_payment_id UUID,
    p_staff_id UUID,
    p_bank_ref_code VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay RECORD;
BEGIN
    SELECT * INTO v_pay
    FROM payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu thu thanh toán.');
    END IF;

    UPDATE payments
    SET verification_status = 'verified',
        verified_by_staff_id = p_staff_id,
        bank_ref_code = COALESCE(p_bank_ref_code, bank_ref_code),
        verified_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        note = CASE WHEN p_notes IS NOT NULL THEN COALESCE(note, '') || ' | ' || p_notes ELSE note END
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', p_payment_id,
        'message', 'Đã xác nhận khớp tiền tài khoản ngân hàng thành công.'
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 012_p5_pos_hardening_and_procurement_a.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 012: P5 HARDENING (REFUND/DAMAGED/BANK) & INVENTORY PROCUREMENT PHASE A
-- Phase: Kho vận sau P5 — Đợt A: Nhập hàng & Nhà cung cấp
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHẦN 1: QUẢN LÝ HÀNG LỖI / HỎNG / CÁCH LY (DAMAGED INVENTORY)
-- Tuyệt đối không cộng vào tồn khả dụng để bán
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS damaged_inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    quantity INT NOT NULL CHECK (quantity > 0),
    source_type VARCHAR(50) NOT NULL, -- 'sale_refund_damaged', 'grn_rejection', 'stocktake_damaged', 'expired'
    reference_id UUID, -- sale_id, grn_id, hoặc stocktake_id
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'quarantined', -- 'quarantined' (cách ly), 'returned_to_supplier' (trả NCC), 'disposed' (tiêu hủy)
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE damaged_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_damaged_inventory_read ON damaged_inventory_items;
CREATE POLICY rls_damaged_inventory_read ON damaged_inventory_items
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

DROP POLICY IF EXISTS rls_damaged_inventory_write ON damaged_inventory_items;
CREATE POLICY rls_damaged_inventory_write ON damaged_inventory_items
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- -----------------------------------------------------------------------------
-- PHẦN 2: CHỐT CHẶN P5 — NÂNG CẤP RPC HOÀN TIỀN & NHẬP LẠI KHO CÓ ĐIỀU KIỆN
-- Tách bạch: Số tiền hoàn, số lượng nhận lại, số lượng nhập kho, số lượng hàng hỏng
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_refund_sale(
    p_org_id UUID,
    p_branch_id UUID,
    p_sale_id UUID,
    p_authorized_staff_id UUID,
    p_reason TEXT,
    p_return_stock BOOLEAN DEFAULT TRUE,
    p_refund_method VARCHAR(50) DEFAULT 'cash', -- 'cash', 'transfer', 'deposit_return'
    p_returned_items JSONB DEFAULT NULL -- Chi tiết: [{"product_id": UUID, "refund_qty": INT, "received_back_qty": INT, "restockable_qty": INT, "damaged_qty": INT, "damage_reason": TEXT}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_course RECORD;
    v_refund_number VARCHAR(100);
    v_refund_id UUID;
    v_stock_after INT;
    v_debt_to_reduce BIGINT := 0;
    v_actual_cash_refund BIGINT := 0;
    v_already_refunded BIGINT := 0;
    v_max_refundable BIGINT := 0;
    v_json_item JSONB;
    v_prod_id UUID;
    v_restock_qty INT;
    v_damaged_qty INT;
    v_damage_reason TEXT;
    v_deposit_number VARCHAR(100);
BEGIN
    -- 1. Khóa bản ghi sale bằng FOR UPDATE
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy hóa đơn cần hủy/hoàn tiền.');
    END IF;

    IF v_sale.status = 'refunded' OR v_sale.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Hóa đơn này đã được hủy/hoàn tiền trước đó.');
    END IF;

    -- 2. Kiểm tra các gói liệu trình trong đơn: Nếu đã sử dụng (used_sessions > 0) thì CHẶN HOÀN TIỀN TỰ ĐỘNG!
    FOR v_course IN 
        SELECT c.id, COALESCE(p.name, s.name, 'Gói liệu trình') AS course_name, c.total_sessions, c.used_sessions 
        FROM customer_courses c
        LEFT JOIN packages p ON p.id = c.package_id
        LEFT JOIN services s ON s.id = c.service_id
        WHERE c.sale_id = p_sale_id
    LOOP
        IF v_course.used_sessions > 0 THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'course_already_used',
                'message', format('Không thể hoàn hóa đơn vì gói liệu trình "%s" đã được thực hiện %s/%s buổi. Vui lòng xử lý đổi trả thủ công.',
                    v_course.course_name, v_course.used_sessions, v_course.total_sessions)
            );
        END IF;
    END LOOP;

    -- 3. Tính toán số tiền hoàn tối đa: Không được vượt quá số tiền khách đã thực trả
    SELECT COALESCE(SUM(refund_amount), 0) INTO v_already_refunded
    FROM sale_refunds
    WHERE sale_id = p_sale_id;

    v_max_refundable := GREATEST(0, v_sale.paid_amount - v_already_refunded);

    -- Nếu đơn có phần nợ (chưa thanh toán đủ): Xóa phần nợ trước
    IF (v_sale.total_amount - v_sale.paid_amount) > 0 THEN
        v_debt_to_reduce := v_sale.total_amount - v_sale.paid_amount;
    END IF;

    -- Tiền hoàn thực tế trả lại khách (tiền mặt / chuyển khoản / trả về ví cọc)
    v_actual_cash_refund := v_max_refundable;

    -- 4. Xử lý tồn kho theo cấu trúc chi tiết hoặc fallback tương thích
    IF p_returned_items IS NOT NULL AND jsonb_array_length(p_returned_items) > 0 THEN
        -- Duyệt từng sản phẩm có cấu trúc phân loại rõ ràng
        FOR v_json_item IN SELECT * FROM jsonb_array_elements(p_returned_items)
        LOOP
            v_prod_id := (v_json_item->>'product_id')::UUID;
            v_restock_qty := COALESCE((v_json_item->>'restockable_qty')::INT, 0);
            v_damaged_qty := COALESCE((v_json_item->>'damaged_qty')::INT, 0);
            v_damage_reason := COALESCE(v_json_item->>'damage_reason', 'Hàng hoàn bị lỗi/hỏng/hết hạn');

            -- 4.1 Hàng đủ điều kiện tái bán: Tăng kho khả dụng
            IF v_restock_qty > 0 THEN
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_restock_qty,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = v_sale.branch_id AND product_id = v_prod_id
                RETURNING stock_on_hand INTO v_stock_after;

                INSERT INTO inventory_transactions (
                    organization_id,
                    branch_id,
                    product_id,
                    transaction_type,
                    reference_id,
                    quantity_change,
                    stock_before,
                    stock_after,
                    notes,
                    actor_staff_id
                ) VALUES (
                    p_org_id,
                    v_sale.branch_id,
                    v_prod_id,
                    'return_in',
                    p_sale_id,
                    v_restock_qty,
                    v_stock_after - v_restock_qty,
                    v_stock_after,
                    format('Nhập lại kho đủ chuẩn từ hoàn đơn #%s', v_sale.invoice_number),
                    p_authorized_staff_id
                );
            END IF;

            -- 4.2 Hàng hỏng / lỗi: Ghi nhận cách ly, TUYỆT ĐỐI KHÔNG CỘNG VÀO TỒN BÁN
            IF v_damaged_qty > 0 THEN
                INSERT INTO damaged_inventory_items (
                    organization_id,
                    branch_id,
                    product_id,
                    quantity,
                    source_type,
                    reference_id,
                    reason,
                    status,
                    created_by_staff_id
                ) VALUES (
                    p_org_id,
                    v_sale.branch_id,
                    v_prod_id,
                    v_damaged_qty,
                    'sale_refund_damaged',
                    p_sale_id,
                    v_damage_reason,
                    'quarantined',
                    p_authorized_staff_id
                );
            END IF;
        END LOOP;
    ELSIF p_return_stock THEN
        -- Fallback tương thích: Nếu không chỉ định chi tiết mà yêu cầu hoàn kho, hoàn toàn bộ sản phẩm
        FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id AND item_type = 'product'
        LOOP
            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand + v_item.quantity,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = v_sale.branch_id AND product_id = v_item.item_ref_id
            RETURNING stock_on_hand INTO v_stock_after;

            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                v_sale.branch_id,
                v_item.item_ref_id,
                'return_in',
                p_sale_id,
                v_item.quantity,
                v_stock_after - v_item.quantity,
                v_stock_after,
                format('Nhập lại kho do hủy hóa đơn #%s', v_sale.invoice_number),
                p_authorized_staff_id
            );
        END LOOP;
    END IF;

    -- 5. Thu hồi thẻ liệu trình chưa dùng sinh ra từ đơn này
    DELETE FROM customer_courses WHERE sale_id = p_sale_id AND used_sessions = 0;

    -- 6. Điều chỉnh công nợ và chi tiêu khách hàng
    UPDATE customers
    SET total_spent = GREATEST(0, total_spent - v_sale.total_amount),
        debt_balance = GREATEST(0, debt_balance - v_debt_to_reduce),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = v_sale.customer_id;

    -- 7. Nếu chọn phương thức hoàn về ví cọc (deposit_return), nạp lại vào ví cọc khách
    IF p_refund_method = 'deposit_return' AND v_actual_cash_refund > 0 THEN
        v_deposit_number := 'HC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
        INSERT INTO customer_deposits (
            organization_id,
            branch_id,
            customer_id,
            deposit_number,
            total_deposited,
            used_amount,
            status,
            notes,
            created_by_staff_id
        ) VALUES (
            p_org_id,
            v_sale.branch_id,
            v_sale.customer_id,
            v_deposit_number,
            v_actual_cash_refund,
            0,
            'active',
            format('Hoàn tiền hóa đơn #%s vào ví cọc', v_sale.invoice_number),
            p_authorized_staff_id
        );
    END IF;

    -- 8. Ghi chứng từ hoàn tiền
    v_refund_number := 'HOAN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO sale_refunds (
        organization_id,
        branch_id,
        sale_id,
        refund_number,
        refund_amount,
        refund_method,
        reason,
        return_stock,
        authorized_by_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_sale_id,
        v_refund_number,
        v_actual_cash_refund,
        p_refund_method,
        p_reason,
        p_return_stock,
        p_authorized_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_refund_id;

    -- 9. Đổi trạng thái Sale sang 'refunded'
    UPDATE sales
    SET status = 'refunded',
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'refund_id', v_refund_id,
        'refund_number', v_refund_number,
        'refund_amount', v_actual_cash_refund,
        'debt_reduced', v_debt_to_reduce,
        'refund_method', p_refund_method,
        'message', 'Đã xử lý hủy đơn, đối soát tiền hoàn và cập nhật kho phân loại thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- PHẦN 3: CHỐT CHẶN P5 — XÁC NHẬN CHUYỂN KHOẢN NGÂN HÀNG CHỐNG XỬ LÝ LẶP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_confirm_bank_payment(
    p_org_id UUID,
    p_payment_id UUID,
    p_staff_id UUID,
    p_bank_ref_code VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay RECORD;
BEGIN
    SELECT * INTO v_pay
    FROM payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu thu thanh toán.');
    END IF;

    -- Chống xác nhận lặp (Idempotent)
    IF v_pay.verification_status = 'verified' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'already_verified', TRUE,
            'payment_id', p_payment_id,
            'message', 'Khoản thanh toán ngân hàng này đã được xác nhận trước đó, không ghi nhận trùng lặp.'
        );
    END IF;

    UPDATE payments
    SET verification_status = 'verified',
        verified_by_staff_id = p_staff_id,
        bank_ref_code = COALESCE(p_bank_ref_code, bank_ref_code),
        verified_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        note = CASE WHEN p_notes IS NOT NULL THEN COALESCE(note, '') || ' | ' || p_notes ELSE note END
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'already_verified', FALSE,
        'payment_id', p_payment_id,
        'message', 'Đã xác nhận khớp tiền chuyển khoản ngân hàng thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- PHẦN 4: ĐỢT A — KHO VẬN: SCHEMA CHI TIẾT NHẬP HÀNG & NHÀ CUNG CẤP
-- -----------------------------------------------------------------------------

-- 4.1 Chi tiết Đơn Đặt Hàng (Purchase Order Items)
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    purchase_unit VARCHAR(50) NOT NULL DEFAULT 'đơn vị',
    conversion_rate INT NOT NULL DEFAULT 1 CHECK (conversion_rate >= 1), -- Hệ số quy đổi ra đơn vị bán lẻ (ví dụ 1 thùng = 24 chai)
    quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0), -- Đơn giá mua theo purchase_unit
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_po_items_read ON purchase_order_items;
CREATE POLICY rls_po_items_read ON purchase_order_items FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_po_items_write ON purchase_order_items;
CREATE POLICY rls_po_items_write ON purchase_order_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Bổ sung trường cho purchase_orders nếu chưa có
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Bổ sung trường cho goods_receipt_notes nếu chưa có
ALTER TABLE goods_receipt_notes
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100), -- Số hóa đơn NCC
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- 'draft', 'confirmed', 'cancelled'
ADD COLUMN IF NOT EXISTS confirmed_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 4.2 Chi tiết Phiếu Nhập Hàng Thực Tế (Goods Receipt Items)
CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goods_receipt_id UUID NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    expiry_date DATE,
    purchase_unit VARCHAR(50) NOT NULL DEFAULT 'đơn vị',
    conversion_rate INT NOT NULL DEFAULT 1 CHECK (conversion_rate >= 1),
    quantity_received INT NOT NULL CHECK (quantity_received >= 0), -- Số lượng giao thực tế (theo đơn vị mua)
    quantity_accepted INT NOT NULL CHECK (quantity_accepted >= 0 AND quantity_accepted <= quantity_received), -- Đạt chuẩn
    quantity_rejected INT NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0), -- Hỏng/lỗi/từ chối
    rejection_reason TEXT,
    accepted_base_units INT NOT NULL CHECK (accepted_base_units >= 0), -- Số lượng quy đổi ra đơn vị bán lẻ để cộng kho
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0), -- Đơn giá mua
    line_total BIGINT NOT NULL CHECK (line_total >= 0), -- Tổng tiền tính theo số lượng được chấp nhận
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_grn_items_read ON goods_receipt_items;
CREATE POLICY rls_grn_items_read ON goods_receipt_items FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_grn_items_write ON goods_receipt_items;
CREATE POLICY rls_grn_items_write ON goods_receipt_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- 4.3 Sổ Cái Bất Biến Biến Động Công Nợ Nhà Cung Cấp (Supplier AP Ledger)
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    entry_type VARCHAR(50) NOT NULL, -- 'purchase_invoice' (tăng nợ), 'supplier_payment' (giảm nợ), 'supplier_return' (giảm nợ), 'adjustment'
    reference_type VARCHAR(50) NOT NULL, -- 'grn', 'po', 'payment', 'return'
    reference_id UUID,
    debit_amount BIGINT NOT NULL DEFAULT 0 CHECK (debit_amount >= 0), -- Ghi nợ: Giảm nợ NCC
    credit_amount BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount >= 0), -- Ghi có: Tăng nợ NCC
    balance_after BIGINT NOT NULL, -- Dư nợ sau phát sinh
    notes TEXT,
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_ledger_read ON supplier_ledger;
CREATE POLICY rls_supplier_ledger_read ON supplier_ledger
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- Tính bất biến: Không cho UPDATE / DELETE dòng sổ cái công nợ
CREATE OR REPLACE RULE prevent_supplier_ledger_update AS ON UPDATE TO supplier_ledger DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_supplier_ledger_delete AS ON DELETE TO supplier_ledger DO INSTEAD NOTHING;

-- 4.4 Bảng Phiếu Chi Thanh Toán Nhà Cung Cấp (Supplier Payments)
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    payment_number VARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer', -- 'transfer', 'cash'
    bank_ref_code VARCHAR(100),
    paid_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_supplier_payment_number_per_org UNIQUE (organization_id, payment_number)
);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_payments_read ON supplier_payments;
CREATE POLICY rls_supplier_payments_read ON supplier_payments
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- -----------------------------------------------------------------------------
-- PHẦN 5: CÁC RPC NGHIỆP VỤ NHẬP HÀNG & CÔNG NỢ NHÀ CUNG CẤP (ĐỢT A)
-- -----------------------------------------------------------------------------

-- 5.1 Tạo Đơn Đặt Hàng (Purchase Order) — TUYỆT ĐỐI CHƯA LÀM TĂNG TỒN KHO
CREATE OR REPLACE FUNCTION rpc_create_purchase_order(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "purchase_unit": TEXT, "conversion_rate": INT, "quantity": INT, "unit_cost": BIGINT}]
    p_expected_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_po_number VARCHAR(100);
    v_po_id UUID;
    v_total_amount BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty INT;
    v_cost BIGINT;
    v_line_total BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Đơn đặt hàng phải có ít nhất một mặt hàng.');
    END IF;

    -- Tính tổng tiền đơn PO
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        v_cost := (v_item->>'unit_cost')::BIGINT;
        IF v_qty <= 0 OR v_cost < 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng và giá mua phải hợp lệ.');
        END IF;
        v_total_amount := v_total_amount + (v_qty * v_cost);
    END LOOP;

    v_po_number := 'PO' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO purchase_orders (
        organization_id,
        branch_id,
        supplier_id,
        po_number,
        total_amount,
        status,
        expected_delivery_date,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_po_number,
        v_total_amount,
        'ordered',
        p_expected_date,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_po_id;

    -- Ghi chi tiết từng item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty := (v_item->>'quantity')::INT;
        v_cost := (v_item->>'unit_cost')::BIGINT;
        v_line_total := v_qty * v_cost;

        INSERT INTO purchase_order_items (
            purchase_order_id,
            product_id,
            purchase_unit,
            conversion_rate,
            quantity_ordered,
            quantity_received,
            unit_cost,
            line_total
        ) VALUES (
            v_po_id,
            v_prod_id,
            v_unit,
            v_conv_rate,
            v_qty,
            0,
            v_cost,
            v_line_total
        );
    END LOOP;

    -- Chú ý: TUYỆT ĐỐI KHÔNG TĂNG TỒN KHO KHI TẠO ĐƠN PO
    RETURN jsonb_build_object(
        'success', TRUE,
        'po_id', v_po_id,
        'po_number', v_po_number,
        'total_amount', v_total_amount,
        'message', 'Đã tạo đơn đặt hàng PO thành công (chưa tăng tồn kho).'
    );
END;
$$;

-- 5.2 Nhận Hàng Thực Tế (GRN) — TĂNG TỒN THEO SỐ ĐẠT CHUẨN, GHI NỢ SỔ CÁI NCC, TÍNH GIÁ VỐN WAC
CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID, -- Có thể NULL nếu nhập trực tiếp không qua PO
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"po_item_id": UUID, "product_id": UUID, "lot_number": TEXT, "expiry_date": DATE, "purchase_unit": TEXT, "conversion_rate": INT, "qty_received": INT, "qty_accepted": INT, "qty_rejected": INT, "rejection_reason": TEXT, "unit_cost": BIGINT}]
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_paid BIGINT DEFAULT 0, -- Số tiền đã trả trước (nếu có)
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grn_number VARCHAR(100);
    v_grn_id UUID;
    v_total_accepted_value BIGINT := 0;
    v_item JSONB;
    v_po_item_id UUID;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty_rec INT;
    v_qty_acc INT;
    v_qty_rej INT;
    v_rej_reason TEXT;
    v_cost BIGINT;
    v_base_units INT;
    v_line_total BIGINT;
    v_curr_stock INT;
    v_curr_cost BIGINT;
    v_new_cost BIGINT;
    v_stock_after INT;
    v_all_po_completed BOOLEAN := TRUE;
    v_po RECORD;
    v_supplier RECORD;
    v_new_debt_balance BIGINT;
    v_net_credit BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu nhập kho phải có ít nhất một mặt hàng.');
    END IF;

    -- Khóa Supplier FOR UPDATE để đảm bảo số dư sổ cái và công nợ tuyệt đối chính xác
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    -- Nếu có PO, khóa PO FOR UPDATE
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
        END IF;
    END IF;

    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Tạo phiếu nhận hàng GRN
    INSERT INTO goods_receipt_notes (
        organization_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        grn_number,
        invoice_number,
        status,
        received_at,
        received_by_staff_id,
        confirmed_by_staff_id,
        confirmed_at,
        total_value,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_po_id,
        p_supplier_id,
        v_grn_number,
        p_invoice_number,
        'confirmed',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        0, -- Sẽ update sau
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_grn_id;

    -- 2. Duyệt từng mặt hàng nhận
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := v_item->>'lot_number';
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        IF v_qty_acc < 0 OR v_qty_rec < v_qty_acc THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng chấp nhận không hợp lệ.');
        END IF;

        -- Quy đổi số lượng đạt chuẩn ra đơn vị cơ sở bán lẻ
        v_base_units := v_qty_acc * v_conv_rate;
        v_line_total := v_qty_acc * v_cost;
        v_total_accepted_value := v_total_accepted_value + v_line_total;

        -- Lưu chi tiết dòng GRN
        INSERT INTO goods_receipt_items (
            goods_receipt_id,
            po_item_id,
            product_id,
            lot_number,
            expiry_date,
            purchase_unit,
            conversion_rate,
            quantity_received,
            quantity_accepted,
            quantity_rejected,
            rejection_reason,
            accepted_base_units,
            unit_cost,
            line_total
        ) VALUES (
            v_grn_id,
            v_po_item_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_unit,
            v_conv_rate,
            v_qty_rec,
            v_qty_acc,
            v_qty_rej,
            v_rej_reason,
            v_base_units,
            v_cost,
            v_line_total
        );

        -- Cập nhật số lượng đã nhận trên PO item nếu có
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 2.1 Hàng đạt chuẩn: TĂNG TỒN KHO THỰC TẾ & TÍNH GIÁ VỐN BÌNH QUÂN (WAC)
        IF v_base_units > 0 THEN
            -- Lấy tồn kho và giá vốn hiện tại của sản phẩm
            SELECT cost_price INTO v_curr_cost FROM products WHERE id = v_prod_id;
            
            -- Khóa dòng tồn kho chi nhánh
            SELECT COALESCE(stock_on_hand, 0) INTO v_curr_stock
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
                VALUES (p_org_id, p_branch_id, v_prod_id, v_base_units)
                RETURNING stock_on_hand INTO v_stock_after;
                v_curr_stock := 0;
            ELSE
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_base_units,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            -- Tính giá vốn bình quân gia quyền mới (Weighted Average Cost per Base Unit)
            -- new_cost = ((v_curr_stock * v_curr_cost) + (v_base_units * (v_cost / v_conv_rate))) / (v_curr_stock + v_base_units)
            IF (v_curr_stock + v_base_units) > 0 THEN
                v_new_cost := ((v_curr_stock * COALESCE(v_curr_cost, 0)) + (v_base_units * (v_cost / v_conv_rate))) / (v_curr_stock + v_base_units);
                UPDATE products
                SET cost_price = v_new_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_prod_id;
            END IF;

            -- Ghi sổ cái nhập kho
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                'grn_in',
                v_grn_id,
                v_base_units,
                v_curr_stock,
                v_stock_after,
                format('Nhập kho thực tế từ phiếu #%s (Lô: %s)', v_grn_number, COALESCE(v_lot, 'N/A')),
                p_staff_id
            );
        END IF;

        -- 2.2 Hàng lỗi / hỏng: Đưa vào kho cách ly, TUYỆT ĐỐI KHÔNG CỘNG VÀO TỒN BÁN
        IF v_qty_rej > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_qty_rej * v_conv_rate,
                'grn_rejection',
                v_grn_id,
                COALESCE(v_rej_reason, 'Hàng không đạt chuẩn khi nghiệm thu nhập kho'),
                'quarantined',
                p_staff_id
            );
        END IF;
    END LOOP;

    -- Cập nhật tổng giá trị thực nhận trên GRN
    UPDATE goods_receipt_notes SET total_value = v_total_accepted_value WHERE id = v_grn_id;

    -- 3. Cập nhật trạng thái PO (nếu có PO liên kết)
    IF p_po_id IS NOT NULL THEN
        -- Kiểm tra còn item nào chưa nhận đủ không
        IF EXISTS (SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_po_id AND quantity_received < quantity_ordered) THEN
            UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = p_po_id;
        ELSE
            UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
        END IF;
    END IF;

    -- 4. GHI NHẬN CÔNG NỢ VÀO SỔ CÁI NHÀ CUNG CẤP (SUPPLIER AP LEDGER)
    -- Quy tắc: Thời điểm ghi nợ là khi phiếu nhận hàng đã được chấp nhận.
    -- Nếu đã trả trước (p_advance_paid > 0), tính cấn trừ để không mặc định tăng nợ toàn bộ.
    v_net_credit := GREATEST(0, v_total_accepted_value - COALESCE(p_advance_paid, 0));
    v_new_debt_balance := v_supplier.debt_balance + v_net_credit;

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'purchase_invoice',
        'grn',
        v_grn_id,
        COALESCE(p_advance_paid, 0), -- Giảm trừ phần đã trả trước
        v_total_accepted_value, -- Phát sinh giá trị hàng nhận
        v_new_debt_balance,
        format('Nhập hàng theo phiếu #%s (Hóa đơn NCC: %s)', v_grn_number, COALESCE(p_invoice_number, 'N/A')),
        p_staff_id
    );

    -- Cập nhật số dư công nợ trên bảng suppliers
    UPDATE suppliers
    SET debt_balance = v_new_debt_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_paid', p_advance_paid,
        'net_debt_added', v_net_credit,
        'supplier_debt_balance', v_new_debt_balance,
        'message', 'Đã xác nhận nhập kho thành công: tồn kho đã tăng, sổ cái công nợ đã ghi nhận.'
    );
END;
$$;

-- 5.3 Thanh Toán Tiền Cho Nhà Cung Cấp (Supplier AP Payment)
CREATE OR REPLACE FUNCTION rpc_pay_supplier(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_amount BIGINT,
    p_payment_method VARCHAR(50) DEFAULT 'transfer', -- 'transfer', 'cash'
    p_bank_ref_code VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_supplier RECORD;
    v_payment_number VARCHAR(100);
    v_payment_id UUID;
    v_new_balance BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số tiền thanh toán phải lớn hơn 0.');
    END IF;

    -- Khóa Supplier FOR UPDATE
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    v_payment_number := 'PCNCC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Ghi phiếu chi thanh toán
    INSERT INTO supplier_payments (
        organization_id,
        branch_id,
        supplier_id,
        payment_number,
        amount,
        payment_method,
        bank_ref_code,
        paid_by_staff_id,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_payment_number,
        p_amount,
        p_payment_method,
        p_bank_ref_code,
        p_staff_id,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_payment_id;

    -- 2. Ghi sổ cái công nợ NCC (Supplier Ledger Debit)
    v_new_balance := v_supplier.debt_balance - p_amount; -- Có thể âm nếu trả trước (trả thừa)

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'supplier_payment',
        'payment',
        v_payment_id,
        p_amount, -- Ghi nợ (giảm nợ)
        0,
        v_new_balance,
        format('Thanh toán tiền hàng phiếu chi #%s (PT: %s, Ref: %s)', v_payment_number, p_payment_method, COALESCE(p_bank_ref_code, 'N/A')),
        p_staff_id
    );

    -- 3. Cập nhật số dư công nợ trên bảng suppliers
    UPDATE suppliers
    SET debt_balance = v_new_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    -- 4. Lưu ý kế toán: Chi trả công nợ NCC là dòng tiền ra (Cash Outflow) giảm nợ phải trả (Nợ 331/Có 111,112),
    -- đã được ghi nhận trong supplier_payments và supplier_ledger.
    -- TUYỆT ĐỐI KHÔNG ghi vào bảng expenses (chi phí hoạt động P&L) để tránh tính trùng với giá vốn (COGS) khi xuất bán.

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_number', v_payment_number,
        'amount_paid', p_amount,
        'debt_balance_after', v_new_balance,
        'message', 'Đã thanh toán công nợ NCC, cập nhật sổ cái và quỹ chi phí thành công.'
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 013_inventory_phase_a_hardening.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 013: INVENTORY PHASE A HARDENING & AUDIT INTEGRITY
-- Phase: Kho vận sau P5 — Đợt A Nghiệm thu chuyên sâu
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. GIÁ VỐN THEO CHI NHÁNH & SNAPSHOT GIÁ VỐN XUẤT BÁN
-- -----------------------------------------------------------------------------
ALTER TABLE inventory_stocks
ADD COLUMN IF NOT EXISTS cost_price BIGINT NOT NULL DEFAULT 0;

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS cost_price_snapshot BIGINT NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. THEO DÕI TỒN KHO THEO LÔ & HẠN DÙNG (INVENTORY_LOT_STOCKS)
-- Cho phép truy ra số lượng còn lại chính xác của từng lô tại từng chi nhánh
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_lot_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100) NOT NULL,
    expiry_date DATE,
    quantity_on_hand INT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    cost_price BIGINT NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'near_expiry', 'expired', 'depleted'
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_lot_per_branch UNIQUE (branch_id, product_id, lot_number)
);

ALTER TABLE inventory_lot_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lot_stocks_read ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_read ON inventory_lot_stocks FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_lot_stocks_write ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_write ON inventory_lot_stocks FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. QUẢN LÝ KHOẢN TIỀN TRẢ TRƯỚC NHÀ CUNG CẤP (SUPPLIER_ADVANCES)
-- Khoản trả trước có chứng từ, kiểm tra số dư khả dụng server-side, chống dùng trùng
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_advances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    advance_number VARCHAR(100) NOT NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount > 0),
    used_amount BIGINT NOT NULL DEFAULT 0 CHECK (used_amount >= 0 AND used_amount <= total_amount),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer',
    bank_ref_code VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'available', -- 'available', 'partially_used', 'exhausted'
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_supplier_advance_number UNIQUE (organization_id, advance_number)
);

ALTER TABLE supplier_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_advances_read ON supplier_advances;
CREATE POLICY rls_supplier_advances_read ON supplier_advances FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_supplier_advances_write ON supplier_advances;
CREATE POLICY rls_supplier_advances_write ON supplier_advances FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. BẢNG TRẢ HÀNG NHÀ CUNG CẤP & ĐẢO CHỨNG TỪ (SUPPLIER_RETURNS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    return_number VARCHAR(100) NOT NULL,
    goods_receipt_id UUID REFERENCES goods_receipt_notes(id) ON DELETE SET NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    total_debt_reduction BIGINT NOT NULL DEFAULT 0 CHECK (total_debt_reduction >= 0), -- Số tiền thực sự giảm trừ nợ NCC (0 nếu là hàng giữ hộ)
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- 'draft', 'confirmed', 'cancelled'
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_supplier_return_number UNIQUE (organization_id, return_number)
);

ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_returns_read ON supplier_returns;
CREATE POLICY rls_supplier_returns_read ON supplier_returns FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_supplier_returns_write ON supplier_returns;
CREATE POLICY rls_supplier_returns_write ON supplier_returns FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS supplier_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    is_from_quarantined BOOLEAN NOT NULL DEFAULT FALSE, -- Trả từ kho lỗi hay từ kho bán
    is_holding_rejection BOOLEAN NOT NULL DEFAULT FALSE, -- Hàng giữ hộ từ chối lúc nhận: KHÔNG giảm công nợ
    debt_reduction_amount BIGINT NOT NULL DEFAULT 0,    -- Giá trị giảm công nợ thực tế
    damaged_item_id UUID REFERENCES damaged_inventory_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE supplier_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_return_items_read ON supplier_return_items;
CREATE POLICY rls_supplier_return_items_read ON supplier_return_items FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_supplier_return_items_write ON supplier_return_items;
CREATE POLICY rls_supplier_return_items_write ON supplier_return_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 5. RPC NẠP TIỀN TRẢ TRƯỚC CHO NCC (CREATE ADVANCE PAYMENT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_supplier_advance(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_amount BIGINT,
    p_payment_method VARCHAR(50) DEFAULT 'transfer',
    p_bank_ref_code VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_supplier RECORD;
    v_adv_number VARCHAR(100);
    v_adv_id UUID;
    v_new_balance BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số tiền trả trước phải lớn hơn 0.');
    END IF;

    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    v_adv_number := 'TTNCC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Lưu chứng từ trả trước
    INSERT INTO supplier_advances (
        organization_id,
        branch_id,
        supplier_id,
        advance_number,
        total_amount,
        used_amount,
        payment_method,
        bank_ref_code,
        status,
        notes,
        created_by_staff_id
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_adv_number,
        p_amount,
        0,
        p_payment_method,
        p_bank_ref_code,
        'available',
        p_notes,
        p_staff_id
    )
    RETURNING id INTO v_adv_id;

    -- 2. Ghi sổ cái NCC: Ghi nợ (debit_amount) làm giảm nợ phải trả hoặc tăng dư có trả trước
    v_new_balance := v_supplier.debt_balance - p_amount;

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'supplier_advance',
        'advance',
        v_adv_id,
        p_amount,
        0,
        v_new_balance,
        format('Nộp tiền đặt cọc/trả trước NCC #%s (Ref: %s)', v_adv_number, COALESCE(p_bank_ref_code, 'N/A')),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_new_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'advance_id', v_adv_id,
        'advance_number', v_adv_number,
        'amount', p_amount,
        'supplier_debt_balance', v_new_balance,
        'message', 'Đã tạo chứng từ trả trước cho NCC và ghi nhận sổ cái thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC NÂNG CẤP XÁC NHẬN NHẬP KHO (GRN) VỚI QUẢN LÝ LÔ & TIỀN TRẢ TRƯỚC SERVER-SIDE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB,
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_id UUID DEFAULT NULL, -- ID chứng từ trả trước hợp lệ (nếu có)
    p_advance_amount_to_use BIGINT DEFAULT 0, -- Số tiền cấn trừ từ chứng từ trả trước
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grn_number VARCHAR(100);
    v_grn_id UUID;
    v_total_accepted_value BIGINT := 0;
    v_item JSONB;
    v_po_item_id UUID;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty_rec INT;
    v_qty_acc INT;
    v_qty_rej INT;
    v_rej_reason TEXT;
    v_cost BIGINT;
    v_base_units INT;
    v_base_cost BIGINT;
    v_line_total BIGINT;
    v_curr_branch_stock INT;
    v_curr_branch_cost BIGINT;
    v_new_branch_cost BIGINT;
    v_stock_after INT;
    v_po RECORD;
    v_po_item RECORD;
    v_supplier RECORD;
    v_advance RECORD;
    v_actual_advance_deducted BIGINT := 0;
    v_new_debt_balance BIGINT;
    v_net_credit BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu nhập kho phải có ít nhất một mặt hàng.');
    END IF;

    -- 1. Khóa Supplier FOR UPDATE
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    -- 2. Nếu có PO liên kết, kiểm tra và khóa PO FOR UPDATE
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
        END IF;
    END IF;

    -- 3. Xử lý và kiểm tra chứng từ trả trước (Server-side validation)
    IF p_advance_id IS NOT NULL AND p_advance_amount_to_use > 0 THEN
        SELECT * INTO v_advance
        FROM supplier_advances
        WHERE id = p_advance_id AND supplier_id = p_supplier_id AND organization_id = p_org_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Chứng từ trả trước không tồn tại hoặc không thuộc NCC này.');
        END IF;

        IF (v_advance.total_amount - v_advance.used_amount) < p_advance_amount_to_use THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số dư khả dụng của chứng từ trả trước #%s không đủ (Khả dụng: %sđ, yêu cầu: %sđ).',
                    v_advance.advance_number, (v_advance.total_amount - v_advance.used_amount), p_advance_amount_to_use)
            );
        END IF;

        v_actual_advance_deducted := p_advance_amount_to_use;
    END IF;

    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 4. Tạo Header Phiếu Nhập Kho
    INSERT INTO goods_receipt_notes (
        organization_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        grn_number,
        invoice_number,
        status,
        received_at,
        received_by_staff_id,
        confirmed_by_staff_id,
        confirmed_at,
        total_value,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_po_id,
        p_supplier_id,
        v_grn_number,
        p_invoice_number,
        'confirmed',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        0,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_grn_id;

    -- 5. Duyệt từng dòng nhận hàng
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(NULLIF(TRIM(v_item->>'lot_number'), ''), 'LOT-DEFAULT');
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        -- Kiểm tra không nhận vượt số đặt nếu có PO liên kết
        IF v_po_item_id IS NOT NULL THEN
            SELECT * INTO v_po_item FROM purchase_order_items WHERE id = v_po_item_id FOR UPDATE;
            IF FOUND THEN
                IF (v_po_item.quantity_received + v_qty_acc) > v_po_item.quantity_ordered THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Số lượng nhận đạt chuẩn (%s) vượt quá số lượng còn lại của đơn PO (%s đặt, %s đã nhận).',
                            v_qty_acc, v_po_item.quantity_ordered, v_po_item.quantity_received)
                    );
                END IF;
            END IF;
        END IF;

        IF v_qty_acc < 0 OR v_qty_rec < (v_qty_acc + v_qty_rej) THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng thực nhận, đạt chuẩn hoặc lỗi không hợp lệ.');
        END IF;

        -- Quy đổi đơn vị cơ sở bán lẻ
        v_base_units := v_qty_acc * v_conv_rate;
        v_base_cost := v_cost / v_conv_rate;
        v_line_total := v_qty_acc * v_cost;
        v_total_accepted_value := v_total_accepted_value + v_line_total;

        -- Lưu dòng phiếu nhập GRN
        INSERT INTO goods_receipt_items (
            goods_receipt_id,
            po_item_id,
            product_id,
            lot_number,
            expiry_date,
            purchase_unit,
            conversion_rate,
            quantity_received,
            quantity_accepted,
            quantity_rejected,
            rejection_reason,
            accepted_base_units,
            unit_cost,
            line_total
        ) VALUES (
            v_grn_id,
            v_po_item_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_unit,
            v_conv_rate,
            v_qty_rec,
            v_qty_acc,
            v_qty_rej,
            v_rej_reason,
            v_base_units,
            v_cost,
            v_line_total
        );

        -- Cập nhật số đã nhận trên PO item
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 5.1 Hàng đạt chuẩn: TĂNG TỒN TỔNG CHI NHÁNH & TÍNH GIÁ VỐN WAC THEO CHI NHÁNH
        IF v_base_units > 0 THEN
            SELECT COALESCE(stock_on_hand, 0), COALESCE(cost_price, 0)
            INTO v_curr_branch_stock, v_curr_branch_cost
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand, cost_price)
                VALUES (p_org_id, p_branch_id, v_prod_id, v_base_units, v_base_cost)
                RETURNING stock_on_hand, cost_price INTO v_stock_after, v_new_branch_cost;
                v_curr_branch_stock := 0;
            ELSE
                v_new_branch_cost := ((v_curr_branch_stock * v_curr_branch_cost) + (v_base_units * v_base_cost)) / (v_curr_branch_stock + v_base_units);
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_base_units,
                    cost_price = v_new_branch_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            -- Cập nhật tồn kho theo Lô riêng biệt (inventory_lot_stocks)
            INSERT INTO inventory_lot_stocks (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                expiry_date,
                quantity_on_hand,
                cost_price,
                status
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_expiry,
                v_base_units,
                v_base_cost,
                'active'
            )
            ON CONFLICT (branch_id, product_id, lot_number)
            DO UPDATE SET
                quantity_on_hand = inventory_lot_stocks.quantity_on_hand + v_base_units,
                expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_lot_stocks.expiry_date),
                cost_price = ((inventory_lot_stocks.quantity_on_hand * inventory_lot_stocks.cost_price) + (v_base_units * v_base_cost)) / (inventory_lot_stocks.quantity_on_hand + v_base_units),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());

            -- Ghi sổ cái nhập kho
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                'grn_in',
                v_grn_id,
                v_base_units,
                v_curr_branch_stock,
                v_stock_after,
                format('Nhập kho GRN #%s | Lô: %s | Giá vốn WAC CN: %sđ', v_grn_number, v_lot, v_new_branch_cost),
                p_staff_id
            );
        END IF;

        -- 5.2 Hàng hỏng / lỗi: Cách ly riêng, KHÔNG cộng vào tồn khả dụng
        IF v_qty_rej > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_qty_rej * v_conv_rate,
                'grn_rejection',
                v_grn_id,
                COALESCE(v_rej_reason, 'Lỗi nghiệm thu khi nhận hàng'),
                'quarantined',
                p_staff_id
            );
        END IF;
    END LOOP;

    -- Cập nhật tổng giá trị vào header GRN
    UPDATE goods_receipt_notes SET total_value = v_total_accepted_value WHERE id = v_grn_id;

    -- 6. Cập nhật trạng thái PO
    IF p_po_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_po_id AND quantity_received < quantity_ordered) THEN
            UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = p_po_id;
        ELSE
            UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
        END IF;
    END IF;

    -- 7. Cấn trừ chứng từ trả trước nếu có
    IF v_actual_advance_deducted > 0 THEN
        UPDATE supplier_advances
        SET used_amount = used_amount + v_actual_advance_deducted,
            status = CASE WHEN (used_amount + v_actual_advance_deducted) >= total_amount THEN 'exhausted' ELSE 'partially_used' END,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_advance_id;
    END IF;

    -- 8. Ghi nhận công nợ vào Sổ cái NCC (Supplier Ledger)
    -- Dư nợ tăng thêm = Giá trị nhận đạt chuẩn - Tiền trả trước cấn trừ
    v_net_credit := GREATEST(0, v_total_accepted_value - v_actual_advance_deducted);
    v_new_debt_balance := v_supplier.debt_balance + v_net_credit;

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'purchase_invoice',
        'grn',
        v_grn_id,
        v_actual_advance_deducted,
        v_total_accepted_value,
        v_new_debt_balance,
        format('Nhập hàng GRN #%s | Cấn trừ cọc: %sđ | Nợ phát sinh ròng: %sđ', v_grn_number, v_actual_advance_deducted, v_net_credit),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_new_debt_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_deducted', v_actual_advance_deducted,
        'net_debt_added', v_net_credit,
        'supplier_debt_balance', v_new_debt_balance,
        'message', 'Đã xác nhận nhập kho thành công: tồn kho, tồn lô và sổ cái công nợ đã cập nhật chính xác.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC TRẢ HÀNG NHÀ CUNG CẤP & ĐẢO CHỨNG TỪ (SUPPLIER RETURN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_return_goods_to_supplier(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "lot_number": TEXT, "quantity": INT, "unit_cost": BIGINT, "is_from_quarantined": BOOL, "damaged_item_id": UUID}]
    p_reason TEXT,
    p_grn_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_supplier RECORD;
    v_ret_number VARCHAR(100);
    v_ret_id UUID;
    v_total_return_value BIGINT := 0;
    v_total_debt_reduction BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_qty INT;
    v_cost BIGINT;
    v_is_quarantine BOOLEAN;
    v_is_holding_rejection BOOLEAN;
    v_item_debt_reduction BIGINT;
    v_source_type VARCHAR(50);
    v_dmg_id UUID;
    v_line_total BIGINT;
    v_curr_stock INT;
    v_new_balance BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu trả hàng phải có ít nhất một mặt hàng.');
    END IF;

    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    v_ret_number := 'THNCC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Tạo header phiếu trả hàng
    INSERT INTO supplier_returns (
        organization_id,
        branch_id,
        supplier_id,
        return_number,
        goods_receipt_id,
        total_amount,
        total_debt_reduction,
        reason,
        created_by_staff_id
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_ret_number,
        p_grn_id,
        0, -- Cập nhật sau
        0, -- Cập nhật sau
        p_reason,
        p_staff_id
    )
    RETURNING id INTO v_ret_id;

    -- 2. Duyệt từng mặt hàng trả
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(v_item->>'lot_number', 'LOT-DEFAULT');
        v_qty := (v_item->>'quantity')::INT;
        v_cost := (v_item->>'unit_cost')::BIGINT;
        v_is_quarantine := COALESCE((v_item->>'is_from_quarantined')::BOOLEAN, FALSE);
        v_is_holding_rejection := COALESCE((v_item->>'is_holding_rejection')::BOOLEAN, FALSE);
        v_dmg_id := CASE WHEN v_item->>'damaged_item_id' IS NOT NULL THEN (v_item->>'damaged_item_id')::UUID ELSE NULL END;
        v_line_total := v_qty * v_cost;
        v_total_return_value := v_total_return_value + v_line_total;

        -- Nếu là hàng cách ly, kiểm tra xem có phải nguồn từ chối lúc nhận hàng GRN hay không
        IF v_dmg_id IS NOT NULL THEN
            SELECT source_type INTO v_source_type FROM damaged_inventory_items WHERE id = v_dmg_id;
            IF v_source_type = 'grn_rejection' THEN
                v_is_holding_rejection := TRUE;
            END IF;
        END IF;

        IF v_is_holding_rejection THEN
            -- Hàng giữ hộ từ chối lúc nhận: KHÔNG giảm công nợ vì chưa từng ghi nợ vào sổ cái
            v_item_debt_reduction := 0;
        ELSE
            -- Hàng đã chấp nhận mua rồi mới phát hiện lỗi: GIẢM công nợ NCC
            v_item_debt_reduction := v_line_total;
        END IF;

        v_total_debt_reduction := v_total_debt_reduction + v_item_debt_reduction;

        INSERT INTO supplier_return_items (
            return_id,
            product_id,
            lot_number,
            quantity,
            unit_cost,
            line_total,
            is_from_quarantined,
            is_holding_rejection,
            debt_reduction_amount,
            damaged_item_id
        ) VALUES (
            v_ret_id,
            v_prod_id,
            v_lot,
            v_qty,
            v_cost,
            v_line_total,
            v_is_quarantine,
            v_is_holding_rejection,
            v_item_debt_reduction,
            v_dmg_id
        );

        -- Nếu trả từ kho bán: Giảm tồn khả dụng và tồn lô
        IF NOT v_is_quarantine THEN
            SELECT stock_on_hand INTO v_curr_stock
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF v_curr_stock < v_qty THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'message', format('Tồn kho khả dụng không đủ để xuất trả NCC (Hiện có: %s, yêu cầu trả: %s).', v_curr_stock, v_qty)
                );
            END IF;

            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand - v_qty,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = p_branch_id AND product_id = v_prod_id;

            UPDATE inventory_lot_stocks
            SET quantity_on_hand = GREATEST(0, quantity_on_hand - v_qty),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = p_branch_id AND product_id = v_prod_id AND lot_number = v_lot;

            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                'supplier_return_out',
                v_ret_id,
                -v_qty,
                v_curr_stock,
                v_curr_stock - v_qty,
                format('Xuất trả hàng NCC phiếu #%s | Lô: %s', v_ret_number, v_lot),
                p_staff_id
            );
        ELSE
            -- Trả từ kho cách ly: Cập nhật trạng thái
            IF v_dmg_id IS NOT NULL THEN
                UPDATE damaged_inventory_items
                SET status = 'returned_to_supplier',
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_dmg_id;
            END IF;
        END IF;
    END LOOP;

    UPDATE supplier_returns 
    SET total_amount = v_total_return_value,
        total_debt_reduction = v_total_debt_reduction
    WHERE id = v_ret_id;

    -- 3. Ghi Sổ cái NCC: CHỈ ghi nợ (giảm nợ) nếu v_total_debt_reduction > 0
    IF v_total_debt_reduction > 0 THEN
        v_new_balance := v_supplier.debt_balance - v_total_debt_reduction;

        INSERT INTO supplier_ledger (
            organization_id,
            supplier_id,
            branch_id,
            entry_type,
            reference_type,
            reference_id,
            debit_amount,
            credit_amount,
            balance_after,
            notes,
            actor_staff_id
        ) VALUES (
            p_org_id,
            p_supplier_id,
            p_branch_id,
            'supplier_return',
            'return',
            v_ret_id,
            v_total_debt_reduction,
            0,
            v_new_balance,
            format('Nghiệp vụ trả hàng đã mua phiếu #%s: Giảm nợ %sđ (Lý do: %s)', v_ret_number, v_total_debt_reduction, p_reason),
            p_staff_id
        );

        UPDATE suppliers
        SET debt_balance = v_new_balance,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_supplier_id;
    ELSE
        -- Hàng giữ hộ từ chối lúc nhận: Ghi nhận nhật ký đối soát 0đ, không làm thay đổi dư nợ NCC
        v_new_balance := v_supplier.debt_balance;

        INSERT INTO supplier_ledger (
            organization_id,
            supplier_id,
            branch_id,
            entry_type,
            reference_type,
            reference_id,
            debit_amount,
            credit_amount,
            balance_after,
            notes,
            actor_staff_id
        ) VALUES (
            p_org_id,
            p_supplier_id,
            p_branch_id,
            'supplier_return_holding',
            'return',
            v_ret_id,
            0,
            0,
            v_new_balance,
            format('Xuất trả hàng lỗi giữ hộ (Không trừ công nợ do hàng từ chối chưa từng ghi nợ) phiếu #%s (Lý do: %s)', v_ret_number, p_reason),
            p_staff_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'return_id', v_ret_id,
        'return_number', v_ret_number,
        'total_amount', v_total_return_value,
        'total_debt_reduction', v_total_debt_reduction,
        'debt_balance_after', v_new_balance,
        'message', CASE 
            WHEN v_total_debt_reduction > 0 THEN format('Đã lập phiếu trả hàng và giảm trừ công nợ %sđ thành công.', v_total_debt_reduction)
            ELSE 'Đã lập phiếu xuất trả hàng lỗi giữ hộ thành công (Dư nợ NCC không đổi vì hàng từ chối chưa từng ghi nợ).'
        END
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 014_procurement_rls_and_reads.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 014: PROCUREMENT & INVENTORY RLS POLICIES & SECURE READ RPCS
-- Target: PostgreSQL / Supabase
-- Mục tiêu: Mở quyền truy vấn RLS cho các bảng Kho Vận & Đơn Đặt Hàng (PO),
--          Phiếu Nhập Kho (GRN), Sổ Cái NCC (AP) và cung cấp RPC đọc an toàn.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS POLICIES: PURCHASE_ORDERS & ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_po_read ON purchase_orders;
CREATE POLICY rls_po_read ON purchase_orders
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_po_write ON purchase_orders;
CREATE POLICY rls_po_write ON purchase_orders
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_po_items_read ON purchase_order_items;
CREATE POLICY rls_po_items_read ON purchase_order_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_po_items_write ON purchase_order_items;
CREATE POLICY rls_po_items_write ON purchase_order_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. RLS POLICIES: GOODS_RECEIPT_NOTES & ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE goods_receipt_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_grn_read ON goods_receipt_notes;
CREATE POLICY rls_grn_read ON goods_receipt_notes
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_grn_write ON goods_receipt_notes;
CREATE POLICY rls_grn_write ON goods_receipt_notes
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_grn_items_read ON goods_receipt_items;
CREATE POLICY rls_grn_items_read ON goods_receipt_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_grn_items_write ON goods_receipt_items;
CREATE POLICY rls_grn_items_write ON goods_receipt_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES: SUPPLIER_LEDGER, ADVANCES & LOT STOCKS
-- -----------------------------------------------------------------------------
ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_supplier_ledger_read ON supplier_ledger;
CREATE POLICY rls_supplier_ledger_read ON supplier_ledger
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_supplier_ledger_write ON supplier_ledger;
CREATE POLICY rls_supplier_ledger_write ON supplier_ledger
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE supplier_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_supplier_advances_read ON supplier_advances;
CREATE POLICY rls_supplier_advances_read ON supplier_advances
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_supplier_advances_write ON supplier_advances;
CREATE POLICY rls_supplier_advances_write ON supplier_advances
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

ALTER TABLE inventory_lot_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_lot_stocks_read ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_read ON inventory_lot_stocks
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_lot_stocks_write ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_write ON inventory_lot_stocks
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH ĐƠN ĐẶT HÀNG (PO)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_purchase_orders(p_branch_id UUID DEFAULT NULL)
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
                'id', po.id,
                'organization_id', po.organization_id,
                'branch_id', po.branch_id,
                'supplier_id', po.supplier_id,
                'supplier_name', COALESCE(s.name, 'Nhà cung cấp'),
                'po_number', po.po_number,
                'order_date', to_char(po.created_at, 'YYYY-MM-DD'),
                'expected_delivery_date', po.expected_delivery_date,
                'total_amount', po.total_amount,
                'status', po.status,
                'notes', po.notes,
                'created_at', po.created_at,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', poi.id,
                            'product_id', poi.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'purchase_unit', poi.purchase_unit,
                            'conversion_rate', poi.conversion_rate,
                            'quantity_ordered', poi.quantity_ordered,
                            'quantity_received', poi.quantity_received,
                            'unit_cost', poi.unit_cost,
                            'line_total', poi.line_total
                        )
                    )
                    FROM purchase_order_items poi
                    LEFT JOIN products p ON p.id = poi.product_id
                    WHERE poi.purchase_order_id = po.id
                ), '[]'::jsonb)
            )
            ORDER BY po.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE (p_branch_id IS NULL OR po.branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH PHIẾU NHẬP KHO (GRN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_goods_receipts(p_branch_id UUID DEFAULT NULL)
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
                'id', grn.id,
                'organization_id', grn.organization_id,
                'branch_id', grn.branch_id,
                'purchase_order_id', grn.purchase_order_id,
                'supplier_id', grn.supplier_id,
                'supplier_name', COALESCE(s.name, 'Nhà cung cấp'),
                'grn_number', grn.grn_number,
                'invoice_number', grn.invoice_number,
                'status', grn.status,
                'received_at', grn.received_at,
                'total_value', grn.total_value,
                'notes', grn.notes,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', gri.id,
                            'po_item_id', gri.po_item_id,
                            'product_id', gri.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'lot_number', gri.lot_number,
                            'expiry_date', gri.expiry_date,
                            'purchase_unit', gri.purchase_unit,
                            'conversion_rate', gri.conversion_rate,
                            'quantity_received', gri.quantity_received,
                            'quantity_accepted', gri.quantity_accepted,
                            'quantity_rejected', gri.quantity_rejected,
                            'rejection_reason', gri.rejection_reason,
                            'accepted_base_units', gri.accepted_base_units,
                            'unit_cost', gri.unit_cost,
                            'line_total', gri.line_total
                        )
                    )
                    FROM goods_receipt_items gri
                    LEFT JOIN products p ON p.id = gri.product_id
                    WHERE gri.goods_receipt_id = grn.id
                ), '[]'::jsonb)
            )
            ORDER BY grn.received_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM goods_receipt_notes grn
    LEFT JOIN suppliers s ON s.id = grn.supplier_id
    WHERE (p_branch_id IS NULL OR grn.branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- CẤP QUYỀN THỰC THI CHO CẢ AUTHENTICATED VÀ ANON
GRANT EXECUTE ON FUNCTION rpc_get_purchase_orders(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_goods_receipts(UUID) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 015_prevent_duplicate_grn_and_auto_close_po.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 015: CHỐNG NHẬP KHO TRÙNG LẶP & TỰ ĐỘNG ĐÓNG ĐƠN PO
-- Target: PostgreSQL / Supabase
-- Mục tiêu: 
-- 1. Chặn tuyệt đối việc nhập kho lặp lại cho đơn PO đã "Đã Nhập Đủ" (received/completed).
-- 2. Tự động khớp mặt hàng theo product_id nếu po_item_id không được truyền.
-- 3. Khóa chống nhận vượt quá số lượng đặt mua (quantity_ordered - quantity_received).
-- 4. Điều chỉnh cân bằng lại tồn kho SP-TEST-62 (loại bỏ 100 đơn vị bị cộng trùng).
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB,
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_id UUID DEFAULT NULL,
    p_advance_amount_to_use BIGINT DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grn_number VARCHAR(100);
    v_grn_id UUID;
    v_total_accepted_value BIGINT := 0;
    v_item JSONB;
    v_po_item_id UUID;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty_rec INT;
    v_qty_acc INT;
    v_qty_rej INT;
    v_rej_reason TEXT;
    v_cost BIGINT;
    v_base_units INT;
    v_base_cost BIGINT;
    v_line_total BIGINT;
    v_po_item RECORD;
    v_po RECORD;
    v_supplier RECORD;
    v_curr_branch_stock INT;
    v_curr_branch_cost BIGINT;
    v_stock_after INT;
    v_new_branch_cost BIGINT;
    v_supplier_debt_after BIGINT;
    v_advance RECORD;
    v_actual_advance_deducted BIGINT := 0;
    v_net_debt_added BIGINT := 0;
    v_remaining_order INT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu nhập kho phải có ít nhất một mặt hàng.');
    END IF;

    -- 1. Khóa Supplier FOR UPDATE
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    -- 2. Nếu có PO liên kết, kiểm tra và khóa PO FOR UPDATE — CHỐNG NHẬP LẶP
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
        END IF;

        IF v_po.status = 'received' OR v_po.status = 'completed' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Đơn đặt hàng #%s đã được nhập đủ trước đó, không thể nhập thêm.', v_po.po_number)
            );
        END IF;
    END IF;

    -- 3. Xử lý và kiểm tra chứng từ trả trước (Server-side validation)
    IF p_advance_id IS NOT NULL AND p_advance_amount_to_use > 0 THEN
        SELECT * INTO v_advance
        FROM supplier_advances
        WHERE id = p_advance_id AND supplier_id = p_supplier_id AND organization_id = p_org_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Chứng từ trả trước không tồn tại hoặc không thuộc NCC này.');
        END IF;

        IF (v_advance.total_amount - v_advance.used_amount) < p_advance_amount_to_use THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số dư khả dụng của chứng từ trả trước #%s không đủ (Khả dụng: %sđ, yêu cầu: %sđ).',
                    v_advance.advance_number, (v_advance.total_amount - v_advance.used_amount), p_advance_amount_to_use)
            );
        END IF;

        v_actual_advance_deducted := p_advance_amount_to_use;
    END IF;

    -- 4. Tạo Header Phiếu Nhập Kho GRN
    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO goods_receipt_notes (
        organization_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        grn_number,
        invoice_number,
        status,
        received_at,
        received_by_staff_id,
        confirmed_by_staff_id,
        confirmed_at,
        total_value,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_po_id,
        p_supplier_id,
        v_grn_number,
        p_invoice_number,
        'confirmed',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        0,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_grn_id;

    -- 5. Duyệt từng dòng nhận hàng
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL AND (v_item->>'po_item_id') <> '' THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(NULLIF(TRIM(v_item->>'lot_number'), ''), 'LOT-DEFAULT');
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL AND (v_item->>'expiry_date') <> '' THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        -- Tự động khớp po_item_id nếu frontend không gửi
        IF v_po_item_id IS NULL AND p_po_id IS NOT NULL THEN
            SELECT id INTO v_po_item_id
            FROM purchase_order_items
            WHERE purchase_order_id = p_po_id AND product_id = v_prod_id
            LIMIT 1;
        END IF;

        -- Kiểm tra không nhận vượt số đặt nếu có PO liên kết
        IF v_po_item_id IS NOT NULL THEN
            SELECT * INTO v_po_item FROM purchase_order_items WHERE id = v_po_item_id FOR UPDATE;
            IF FOUND THEN
                v_remaining_order := GREATEST(0, v_po_item.quantity_ordered - v_po_item.quantity_received);
                IF v_remaining_order <= 0 THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Mặt hàng trong đơn PO đã được nhập đủ (%s/%s), không thể nhận thêm.',
                            v_po_item.quantity_received, v_po_item.quantity_ordered)
                    );
                END IF;
                IF (v_po_item.quantity_received + v_qty_acc) > v_po_item.quantity_ordered THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Số lượng nhận đạt chuẩn (%s) vượt quá số lượng còn lại của đơn PO (%s còn chờ giao).',
                            v_qty_acc, v_remaining_order)
                    );
                END IF;
            END IF;
        END IF;

        IF v_qty_acc < 0 OR v_qty_rec < (v_qty_acc + v_qty_rej) THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng thực nhận, đạt chuẩn hoặc lỗi không hợp lệ.');
        END IF;

        -- Quy đổi đơn vị cơ sở bán lẻ
        v_base_units := v_qty_acc * v_conv_rate;
        v_base_cost := v_cost / v_conv_rate;
        v_line_total := v_qty_acc * v_cost;
        v_total_accepted_value := v_total_accepted_value + v_line_total;

        -- Lưu dòng phiếu nhập GRN
        INSERT INTO goods_receipt_items (
            goods_receipt_id,
            po_item_id,
            product_id,
            lot_number,
            expiry_date,
            purchase_unit,
            conversion_rate,
            quantity_received,
            quantity_accepted,
            quantity_rejected,
            rejection_reason,
            accepted_base_units,
            unit_cost,
            line_total
        ) VALUES (
            v_grn_id,
            v_po_item_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_unit,
            v_conv_rate,
            v_qty_rec,
            v_qty_acc,
            v_qty_rej,
            v_rej_reason,
            v_base_units,
            v_cost,
            v_line_total
        );

        -- Cập nhật số lượng đã nhận trong PO item
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 5.1 Hàng đạt chuẩn: TĂNG TỒN BÁN VÀ TÍNH GIÁ VỐN BÌNH QUÂN GIA QUYỀN (WAC)
        IF v_base_units > 0 THEN
            SELECT stock_on_hand, COALESCE(cost_price, 0)
            INTO v_curr_branch_stock, v_curr_branch_cost
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_curr_branch_stock := 0;
                v_curr_branch_cost := 0;
                INSERT INTO inventory_stocks (
                    organization_id, branch_id, product_id, stock_on_hand, cost_price, updated_at
                ) VALUES (
                    p_org_id, p_branch_id, v_prod_id, v_base_units, v_base_cost, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand, cost_price INTO v_stock_after, v_new_branch_cost;
            ELSE
                v_stock_after := v_curr_branch_stock + v_base_units;
                IF v_stock_after > 0 THEN
                    v_new_branch_cost := ((v_curr_branch_stock * v_curr_branch_cost) + (v_base_units * v_base_cost)) / v_stock_after;
                ELSE
                    v_new_branch_cost := v_base_cost;
                END IF;

                UPDATE inventory_stocks
                SET stock_on_hand = v_stock_after,
                    cost_price = v_new_branch_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id;
            END IF;

            -- Cập nhật tồn kho theo Lô riêng biệt (inventory_lot_stocks)
            INSERT INTO inventory_lot_stocks (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                expiry_date,
                quantity_on_hand,
                cost_price,
                status,
                created_at,
                updated_at
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_expiry,
                v_base_units,
                v_base_cost,
                'active',
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            )
            ON CONFLICT (branch_id, product_id, lot_number)
            DO UPDATE SET
                quantity_on_hand = inventory_lot_stocks.quantity_on_hand + v_base_units,
                expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_lot_stocks.expiry_date),
                cost_price = ((inventory_lot_stocks.quantity_on_hand * inventory_lot_stocks.cost_price) + (v_base_units * v_base_cost)) / (inventory_lot_stocks.quantity_on_hand + v_base_units),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());

            -- Ghi sổ cái giao dịch kho (inventory_transactions)
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                'grn_in',
                v_grn_id,
                v_base_units,
                v_curr_branch_stock,
                v_stock_after,
                format('Nhập kho GRN #%s | Lô: %s | Giá vốn WAC CN: %sđ', v_grn_number, v_lot, v_new_branch_cost),
                p_staff_id
            );
        END IF;

        -- 5.2 Hàng hỏng / lỗi: Cách ly riêng, KHÔNG cộng vào tồn khả dụng
        IF v_qty_rej > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_qty_rej * v_conv_rate,
                'grn_rejection',
                v_grn_id,
                COALESCE(v_rej_reason, 'Lỗi nghiệm thu khi nhận hàng'),
                'quarantined',
                p_staff_id
            );
        END IF;
    END LOOP;

    -- Cập nhật tổng giá trị vào header GRN
    UPDATE goods_receipt_notes SET total_value = v_total_accepted_value WHERE id = v_grn_id;

    -- 6. Cập nhật trạng thái PO
    IF p_po_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_po_id AND quantity_received < quantity_ordered) THEN
            UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = p_po_id;
        ELSE
            UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
        END IF;
    END IF;

    -- 7. Cấn trừ chứng từ trả trước nếu có
    IF v_actual_advance_deducted > 0 THEN
        UPDATE supplier_advances
        SET used_amount = used_amount + v_actual_advance_deducted,
            status = CASE WHEN (used_amount + v_actual_advance_deducted) >= total_amount THEN 'exhausted' ELSE 'partially_used' END,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_advance_id;
    END IF;

    -- 8. GHI SỔ CÁI CÔNG NỢ NCC (SUPPLIER AP LEDGER)
    v_net_debt_added := GREATEST(0, v_total_accepted_value - v_actual_advance_deducted);
    v_supplier_debt_after := v_supplier.debt_balance + v_net_debt_added;

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'purchase_invoice',
        'grn',
        v_grn_id,
        0,
        v_total_accepted_value,
        v_supplier_debt_after,
        format('Nhập hàng phiếu #%s (Tổng nhận: %sđ, Cấn trừ cọc: %sđ, Nợ tăng ròng: %sđ)',
            v_grn_number, v_total_accepted_value, v_actual_advance_deducted, v_net_debt_added),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_supplier_debt_after,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_paid', v_actual_advance_deducted,
        'net_debt_added', v_net_debt_added,
        'supplier_debt_balance', v_supplier_debt_after,
        'message', 'Đã xác nhận nhập kho, cập nhật tồn kho theo lô và ghi nhận công nợ NCC thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_confirm_goods_receipt(UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, UUID, BIGINT, TEXT) TO authenticated, anon;

-- 9. ĐIỀU CHỈNH LẠI TỒN KHO SP-TEST-62 VỀ ĐÚNG 5 (NẾU ĐANG BỊ 105 DO BẤM LẶP)
UPDATE inventory_stocks
SET stock_on_hand = 5, updated_at = NOW()
WHERE product_id = '9a35b69f-ff87-40b1-adae-4ed64570096d' AND stock_on_hand > 5;



-- -----------------------------------------------------------------------------
-- FILE: 016_po_auto_close_and_complete_cycle.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 016: HOÀN TẤT CHU KỲ PO & TỰ ĐỘNG ĐÓNG ĐƠN KHÔNG BỊ VÒNG LẶP
-- Target: PostgreSQL / Supabase
-- Mục tiêu:
-- 1. Thêm tham số p_close_po (mặc định TRUE) cho rpc_confirm_goods_receipt.
--    Nếu đơn hàng có sản phẩm bị lỗi/từ chối, người dùng có thể đóng đơn PO ngay 
--    (trạng thái chuyển thành 'received' / Đã Nhập Đủ) mà KHÔNG bị treo 'partially_received'
--    dẫn đến nút xanh nhận hàng vẫn còn và bị bấm lặp.
-- 2. Cung cấp hàm rpc_close_purchase_order cho phép đóng bất kỳ đơn PO nào chỉ với 1 click.
-- 3. Cân bằng lại tồn kho SP-TEST-62 về đúng 50 (5 ban đầu + 45 chai đạt chuẩn thực tế).
-- =============================================================================

-- Xóa chữ ký cũ nếu có để tránh lỗi trùng lặp tham số mặc định
DROP FUNCTION IF EXISTS rpc_confirm_goods_receipt(UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS rpc_confirm_goods_receipt(UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, UUID, BIGINT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB,
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_id UUID DEFAULT NULL,
    p_advance_amount_to_use BIGINT DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_close_po BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grn_number VARCHAR(100);
    v_grn_id UUID;
    v_total_accepted_value BIGINT := 0;
    v_item JSONB;
    v_po_item_id UUID;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty_rec INT;
    v_qty_acc INT;
    v_qty_rej INT;
    v_rej_reason TEXT;
    v_cost BIGINT;
    v_base_units INT;
    v_base_cost BIGINT;
    v_line_total BIGINT;
    v_po_item RECORD;
    v_po RECORD;
    v_supplier RECORD;
    v_curr_branch_stock INT;
    v_curr_branch_cost BIGINT;
    v_stock_after INT;
    v_new_branch_cost BIGINT;
    v_supplier_debt_after BIGINT;
    v_advance RECORD;
    v_actual_advance_deducted BIGINT := 0;
    v_net_debt_added BIGINT := 0;
    v_remaining_order INT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu nhập kho phải có ít nhất một mặt hàng.');
    END IF;

    -- 1. Khóa Supplier FOR UPDATE
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    -- 2. Nếu có PO liên kết, kiểm tra và khóa PO FOR UPDATE — CHỐNG NHẬP LẶP
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
        END IF;

        IF v_po.status = 'received' OR v_po.status = 'completed' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Đơn đặt hàng #%s đã được hoàn tất/nhập đủ trước đó, không thể nhận thêm.', v_po.po_number)
            );
        END IF;
    END IF;

    -- 3. Xử lý và kiểm tra chứng từ trả trước (Server-side validation)
    IF p_advance_id IS NOT NULL AND p_advance_amount_to_use > 0 THEN
        SELECT * INTO v_advance
        FROM supplier_advances
        WHERE id = p_advance_id AND supplier_id = p_supplier_id AND organization_id = p_org_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Chứng từ trả trước không tồn tại hoặc không thuộc NCC này.');
        END IF;

        IF (v_advance.total_amount - v_advance.used_amount) < p_advance_amount_to_use THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số dư khả dụng của chứng từ trả trước #%s không đủ (Khả dụng: %sđ, yêu cầu: %sđ).',
                    v_advance.advance_number, (v_advance.total_amount - v_advance.used_amount), p_advance_amount_to_use)
            );
        END IF;

        v_actual_advance_deducted := p_advance_amount_to_use;
    END IF;

    -- 4. Tạo Header Phiếu Nhập Kho GRN
    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO goods_receipt_notes (
        organization_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        grn_number,
        invoice_number,
        status,
        received_at,
        received_by_staff_id,
        confirmed_by_staff_id,
        confirmed_at,
        total_value,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_po_id,
        p_supplier_id,
        v_grn_number,
        p_invoice_number,
        'confirmed',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        0,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_grn_id;

    -- 5. Duyệt từng dòng nhận hàng
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL AND (v_item->>'po_item_id') <> '' THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(NULLIF(TRIM(v_item->>'lot_number'), ''), 'LOT-DEFAULT');
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL AND (v_item->>'expiry_date') <> '' THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        -- Tự động khớp po_item_id nếu frontend không gửi
        IF v_po_item_id IS NULL AND p_po_id IS NOT NULL THEN
            SELECT id INTO v_po_item_id
            FROM purchase_order_items
            WHERE purchase_order_id = p_po_id AND product_id = v_prod_id
            LIMIT 1;
        END IF;

        -- Kiểm tra không nhận vượt số đặt nếu có PO liên kết
        IF v_po_item_id IS NOT NULL THEN
            SELECT * INTO v_po_item FROM purchase_order_items WHERE id = v_po_item_id FOR UPDATE;
            IF FOUND THEN
                v_remaining_order := GREATEST(0, v_po_item.quantity_ordered - v_po_item.quantity_received);
                IF v_remaining_order <= 0 THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Mặt hàng trong đơn PO đã được nhập đủ (%s/%s), không thể nhận thêm.',
                            v_po_item.quantity_received, v_po_item.quantity_ordered)
                    );
                END IF;
                IF (v_po_item.quantity_received + v_qty_acc) > v_po_item.quantity_ordered THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Số lượng nhận đạt chuẩn (%s) vượt quá số lượng còn lại của đơn PO (%s còn chờ giao).',
                            v_qty_acc, v_remaining_order)
                    );
                END IF;
            END IF;
        END IF;

        IF v_qty_acc < 0 OR v_qty_rec < (v_qty_acc + v_qty_rej) THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng thực nhận, đạt chuẩn hoặc lỗi không hợp lệ.');
        END IF;

        -- Quy đổi đơn vị cơ sở bán lẻ
        v_base_units := v_qty_acc * v_conv_rate;
        v_base_cost := v_cost / v_conv_rate;
        v_line_total := v_qty_acc * v_cost;
        v_total_accepted_value := v_total_accepted_value + v_line_total;

        -- Lưu dòng phiếu nhập GRN
        INSERT INTO goods_receipt_items (
            goods_receipt_id,
            po_item_id,
            product_id,
            lot_number,
            expiry_date,
            purchase_unit,
            conversion_rate,
            quantity_received,
            quantity_accepted,
            quantity_rejected,
            rejection_reason,
            accepted_base_units,
            unit_cost,
            line_total
        ) VALUES (
            v_grn_id,
            v_po_item_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_unit,
            v_conv_rate,
            v_qty_rec,
            v_qty_acc,
            v_qty_rej,
            v_rej_reason,
            v_base_units,
            v_cost,
            v_line_total
        );

        -- Cập nhật số lượng đã nhận trong PO item
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 5.1 Hàng đạt chuẩn: TĂNG TỒN BÁN VÀ TÍNH GIÁ VỐN BÌNH QUÂN GIA QUYỀN (WAC)
        IF v_base_units > 0 THEN
            SELECT stock_on_hand, COALESCE(cost_price, 0)
            INTO v_curr_branch_stock, v_curr_branch_cost
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_curr_branch_stock := 0;
                v_curr_branch_cost := 0;
                INSERT INTO inventory_stocks (
                    organization_id, branch_id, product_id, stock_on_hand, cost_price, updated_at
                ) VALUES (
                    p_org_id, p_branch_id, v_prod_id, v_base_units, v_base_cost, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand, cost_price INTO v_stock_after, v_new_branch_cost;
            ELSE
                v_stock_after := v_curr_branch_stock + v_base_units;
                IF v_stock_after > 0 THEN
                    v_new_branch_cost := ((v_curr_branch_stock * v_curr_branch_cost) + (v_base_units * v_base_cost)) / v_stock_after;
                ELSE
                    v_new_branch_cost := v_base_cost;
                END IF;

                UPDATE inventory_stocks
                SET stock_on_hand = v_stock_after,
                    cost_price = v_new_branch_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id;
            END IF;

            -- Cập nhật tồn kho theo Lô riêng biệt (inventory_lot_stocks)
            INSERT INTO inventory_lot_stocks (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                expiry_date,
                quantity_on_hand,
                cost_price,
                status,
                created_at,
                updated_at
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_expiry,
                v_base_units,
                v_base_cost,
                'active',
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            )
            ON CONFLICT (branch_id, product_id, lot_number)
            DO UPDATE SET
                quantity_on_hand = inventory_lot_stocks.quantity_on_hand + v_base_units,
                expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_lot_stocks.expiry_date),
                cost_price = ((inventory_lot_stocks.quantity_on_hand * inventory_lot_stocks.cost_price) + (v_base_units * v_base_cost)) / (inventory_lot_stocks.quantity_on_hand + v_base_units),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());

            -- Ghi sổ cái giao dịch kho (inventory_transactions)
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                'grn_in',
                v_grn_id,
                v_base_units,
                v_curr_branch_stock,
                v_stock_after,
                format('Nhập kho GRN #%s | Lô: %s | Giá vốn WAC CN: %sđ', v_grn_number, v_lot, v_new_branch_cost),
                p_staff_id
            );
        END IF;

        -- 5.2 Hàng hỏng / lỗi: Cách ly riêng, KHÔNG cộng vào tồn khả dụng
        IF v_qty_rej > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_qty_rej * v_conv_rate,
                'grn_rejection',
                v_grn_id,
                COALESCE(v_rej_reason, 'Lỗi nghiệm thu khi nhận hàng'),
                'quarantined',
                p_staff_id
            );
        END IF;
    END LOOP;

    -- Cập nhật tổng giá trị vào header GRN
    UPDATE goods_receipt_notes SET total_value = v_total_accepted_value WHERE id = v_grn_id;

    -- 6. Cập nhật trạng thái PO (QUYẾT ĐỊNH ĐÓNG ĐƠN / NHẬN MỘT PHẦN)
    IF p_po_id IS NOT NULL THEN
        -- Nếu người dùng chọn đóng đơn (p_close_po = TRUE) HOẶC toàn bộ mặt hàng đã đủ
        IF p_close_po OR NOT EXISTS (SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_po_id AND quantity_received < quantity_ordered) THEN
            UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
        ELSE
            UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = p_po_id;
        END IF;
    END IF;

    -- 7. Cấn trừ chứng từ trả trước nếu có
    IF v_actual_advance_deducted > 0 THEN
        UPDATE supplier_advances
        SET used_amount = used_amount + v_actual_advance_deducted,
            status = CASE WHEN (used_amount + v_actual_advance_deducted) >= total_amount THEN 'exhausted' ELSE 'partially_used' END,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_advance_id;
    END IF;

    -- 8. GHI SỔ CÁI CÔNG NỢ NCC (SUPPLIER AP LEDGER)
    v_net_debt_added := GREATEST(0, v_total_accepted_value - v_actual_advance_deducted);
    v_supplier_debt_after := v_supplier.debt_balance + v_net_debt_added;

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'purchase_invoice',
        'grn',
        v_grn_id,
        0,
        v_total_accepted_value,
        v_supplier_debt_after,
        format('Nhập hàng phiếu #%s (Tổng nhận: %sđ, Cấn trừ cọc: %sđ, Nợ tăng ròng: %sđ)',
            v_grn_number, v_total_accepted_value, v_actual_advance_deducted, v_net_debt_added),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_supplier_debt_after,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_paid', v_actual_advance_deducted,
        'net_debt_added', v_net_debt_added,
        'supplier_debt_balance', v_supplier_debt_after,
        'message', 'Đã xác nhận nhập kho thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_confirm_goods_receipt(UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, UUID, BIGINT, TEXT, BOOLEAN) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. HÀM ĐÓNG VÀ HOÀN TẤT ĐƠN ĐẶT HÀNG PO TRỰC TIẾP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_close_purchase_order(
    p_po_id UUID,
    p_reason TEXT DEFAULT 'Đóng đơn kết thúc nghiệm thu'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE purchase_orders
    SET status = 'received',
        notes = CASE 
            WHEN notes IS NULL OR notes = '' THEN p_reason 
            ELSE notes || ' | ' || p_reason 
        END,
        updated_at = NOW()
    WHERE id = p_po_id;

    RETURN jsonb_build_object('success', TRUE, 'message', 'Đã hoàn tất và đóng đơn đặt hàng thành công.');
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_close_purchase_order(UUID, TEXT) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. CÂN BẰNG LẠI TỒN KHO SP-TEST-62 VỀ ĐÚNG 50
-- (5 hộp nhập từ PO trước + 45 chai đạt chuẩn từ PO260929-8913)
-- -----------------------------------------------------------------------------
UPDATE inventory_stocks
SET stock_on_hand = 50, updated_at = NOW()
WHERE product_id = '9a35b69f-ff87-40b1-adae-4ed64570096d';



-- -----------------------------------------------------------------------------
-- FILE: 017_inventory_stage_b_transfers.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 017: INVENTORY PROCUREMENT PHASE B — INTER-BRANCH TRANSFERS
-- Phase: Kho vận sau P5 — Đợt B: Điều chuyển kho đa chi nhánh
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG PHIẾU ĐIỀU CHUYỂN KHO (BRANCH TRANSFERS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    transfer_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'dispatched', 'partially_received', 'completed', 'difference_resolved', 'cancelled'
    total_items INT NOT NULL DEFAULT 0,
    total_value BIGINT NOT NULL DEFAULT 0,
    dispatch_date TIMESTAMPTZ,
    dispatched_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    received_date TIMESTAMPTZ,
    received_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT chk_diff_branches CHECK (from_branch_id <> to_branch_id)
);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CHI TIẾT SẢN PHẨM ĐIỀU CHUYỂN (BRANCH TRANSFER ITEMS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES branch_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    expiry_date DATE,
    unit_cost BIGINT NOT NULL DEFAULT 0,
    quantity_requested INT NOT NULL CHECK (quantity_requested > 0),
    quantity_dispatched INT NOT NULL DEFAULT 0 CHECK (quantity_dispatched >= 0),
    quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    quantity_accepted INT NOT NULL DEFAULT 0 CHECK (quantity_accepted >= 0),
    quantity_damaged INT NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_missing INT NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
    quantity_returned INT NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 3. BẢNG NHẬT KÝ KIỂM TOÁN LỊCH SỬ ĐIỀU CHUYỂN (BRANCH TRANSFER EVENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfer_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES branch_transfers(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'dispatched', 'partially_received', 'received', 'difference_resolved', 'cancelled', 'returned'
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 4. BẢO VỆ DỮ LIỆU BẰNG ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_branch_transfers_read ON branch_transfers;
CREATE POLICY rls_branch_transfers_read ON branch_transfers
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_branch_transfers_write ON branch_transfers;
CREATE POLICY rls_branch_transfers_write ON branch_transfers
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_items_read ON branch_transfer_items;
CREATE POLICY rls_branch_transfer_items_read ON branch_transfer_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_items_write ON branch_transfer_items;
CREATE POLICY rls_branch_transfer_items_write ON branch_transfer_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_events_read ON branch_transfer_events;
CREATE POLICY rls_branch_transfer_events_read ON branch_transfer_events
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_events_write ON branch_transfer_events;
CREATE POLICY rls_branch_transfer_events_write ON branch_transfer_events
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO PHIẾU ĐIỀU CHUYỂN KHO NHÁP (DRAFT) — TUYỆT ĐỐI CHƯA ĐỔI TỒN KHO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_branch_transfer(
    p_org_id UUID,
    p_from_branch_id UUID,
    p_to_branch_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "lot_number": TEXT, "expiry_date": DATE, "quantity": INT, "unit_cost": BIGINT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer_id UUID;
    v_transfer_number VARCHAR(100);
    v_total_items INT := 0;
    v_total_value BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_qty INT;
    v_cost BIGINT;
    v_item_notes TEXT;
BEGIN
    IF p_from_branch_id = p_to_branch_id THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Chi nhánh xuất và nhận phải khác nhau.');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu điều chuyển phải có ít nhất một mặt hàng.');
    END IF;

    v_transfer_number := 'DC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Tính tổng số lượng và giá trị điều chuyển
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        v_cost := COALESCE((v_item->>'unit_cost')::BIGINT, 0);
        IF v_qty <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng chuyển phải lớn hơn 0.');
        END IF;
        v_total_items := v_total_items + v_qty;
        v_total_value := v_total_value + (v_qty * v_cost);
    END LOOP;

    INSERT INTO branch_transfers (
        organization_id,
        from_branch_id,
        to_branch_id,
        transfer_number,
        status,
        total_items,
        total_value,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_from_branch_id,
        p_to_branch_id,
        v_transfer_number,
        'draft',
        v_total_items,
        v_total_value,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_transfer_id;

    -- Thêm chi tiết các dòng
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := v_item->>'lot_number';
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_qty := (v_item->>'quantity')::INT;
        v_cost := COALESCE((v_item->>'unit_cost')::BIGINT, 0);
        v_item_notes := v_item->>'notes';

        INSERT INTO branch_transfer_items (
            transfer_id,
            product_id,
            lot_number,
            expiry_date,
            unit_cost,
            quantity_requested,
            quantity_dispatched,
            quantity_received,
            quantity_accepted,
            quantity_damaged,
            quantity_missing,
            quantity_returned,
            notes
        ) VALUES (
            v_transfer_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_cost,
            v_qty,
            0, -- Chưa xuất kho
            0,
            0,
            0,
            0,
            0,
            v_item_notes
        );
    END LOOP;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        v_transfer_id,
        'created',
        p_staff_id,
        jsonb_build_object('action', 'Tạo phiếu chuyển nháp', 'total_items', v_total_items, 'total_value', v_total_value)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', v_transfer_id,
        'transfer_number', v_transfer_number,
        'total_items', v_total_items,
        'total_value', v_total_value,
        'status', 'draft',
        'message', 'Đã tạo phiếu điều chuyển kho nháp thành công (chưa thay đổi tồn kho).'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC XÁC NHẬN XUẤT CHUYỂN KHO (DISPATCH) — GIẢM TỒN A, CHUYỂN IN-TRANSIT
-- Khóa tồn bằng FOR UPDATE để chống bán hàng âm kho đồng thời
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_dispatch_branch_transfer(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_stock RECORD;
    v_lot_stock RECORD;
    v_stock_after INT;
BEGIN
    -- 1. Khóa bản ghi transfer bằng FOR UPDATE
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status <> 'draft' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu đang ở trạng thái "%s", không thể xuất kho lặp lại.', v_transfer.status));
    END IF;

    -- 2. Duyệt từng sản phẩm: Khóa tồn kho tại chi nhánh gửi A và kiểm tra đủ hàng
    FOR v_item IN
        SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        -- Khóa tồn kho tổng hợp tại chi nhánh A
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE branch_id = v_transfer.from_branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND OR v_stock.stock_on_hand < v_item.quantity_requested THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Tồn kho không đủ để xuất chuyển (Hiện có: %s, Yêu cầu xuất: %s).', COALESCE(v_stock.stock_on_hand, 0), v_item.quantity_requested)
            );
        END IF;

        -- Nếu có số lô cụ thể, khóa và kiểm tra tồn theo lô
        IF v_item.lot_number IS NOT NULL AND v_item.lot_number <> '' THEN
            SELECT * INTO v_lot_stock
            FROM inventory_lot_stocks
            WHERE branch_id = v_transfer.from_branch_id AND product_id = v_item.product_id AND lot_number = v_item.lot_number
            FOR UPDATE;

            IF NOT FOUND OR v_lot_stock.quantity_on_hand < v_item.quantity_requested THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'message', format('Lô hàng [%s] không đủ tồn để xuất (Hiện có: %s, Cần: %s).', v_item.lot_number, COALESCE(v_lot_stock.quantity_on_hand, 0), v_item.quantity_requested)
                );
            END IF;

            -- Giảm tồn theo lô tại A
            UPDATE inventory_lot_stocks
            SET quantity_on_hand = quantity_on_hand - v_item.quantity_requested,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE id = v_lot_stock.id;
        END IF;

        -- Giảm tồn kho tổng hợp tại A
        UPDATE inventory_stocks
        SET stock_on_hand = stock_on_hand - v_item.quantity_requested,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_stock.id
        RETURNING stock_on_hand INTO v_stock_after;

        -- Ghi sổ biến động kho xuất chuyển
        INSERT INTO inventory_transactions (
            organization_id,
            branch_id,
            product_id,
            transaction_type,
            reference_id,
            quantity_change,
            stock_before,
            stock_after,
            notes,
            actor_staff_id
        ) VALUES (
            p_org_id,
            v_transfer.from_branch_id,
            v_item.product_id,
            'transfer_out',
            p_transfer_id,
            -v_item.quantity_requested,
            v_stock.stock_on_hand,
            v_stock_after,
            format('Xuất chuyển kho sang chi nhánh đích theo phiếu #%s', v_transfer.transfer_number),
            p_staff_id
        );

        -- Cập nhật số lượng đã xuất trên dòng chi tiết
        UPDATE branch_transfer_items
        SET quantity_dispatched = quantity_requested
        WHERE id = v_item.id;
    END LOOP;

    -- 3. Đổi trạng thái phiếu sang 'dispatched' (Đang vận chuyển)
    UPDATE branch_transfers
    SET status = 'dispatched',
        dispatch_date = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        dispatched_by_staff_id = p_staff_id,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        'dispatched',
        p_staff_id,
        jsonb_build_object('action', 'Xác nhận xuất kho chuyển đi', 'from_branch_id', v_transfer.from_branch_id, 'to_branch_id', v_transfer.to_branch_id)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', 'dispatched',
        'message', 'Đã xuất kho chuyển đi thành công. Tồn kho chi nhánh gửi đã giảm và ghi nhận hàng đang vận chuyển.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC XÁC NHẬN NHẬP KHO TẠI CHI NHÁNH ĐÍCH (RECEIVE TRANSFER)
-- Hỗ trợ: Nhận đủ, nhận 1 phần, tách hàng lỗi/hỏng vào cách ly, ghi nhận thiếu hụt
-- Chống nhận lặp (Idempotent) & tự động hoàn tất phiếu
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_receive_branch_transfer(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"transfer_item_id": UUID, "qty_accepted": INT, "qty_damaged": INT, "qty_missing": INT, "damage_reason": TEXT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_receive_entry JSONB;
    v_item_id UUID;
    v_qty_acc INT;
    v_qty_dam INT;
    v_qty_mis INT;
    v_dam_reason TEXT;
    v_dest_stock RECORD;
    v_lot_stock RECORD;
    v_stock_after INT;
    v_all_completed BOOLEAN := TRUE;
    v_has_difference BOOLEAN := FALSE;
    v_final_status VARCHAR(50);
BEGIN
    -- 1. Khóa bản ghi transfer bằng FOR UPDATE
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status NOT IN ('dispatched', 'partially_received') THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu ở trạng thái "%s", không thể nhận hàng.', v_transfer.status));
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Vui lòng cung cấp chi tiết số lượng nhận hàng.');
    END IF;

    -- 2. Xử lý từng dòng nhận
    FOR v_receive_entry IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_receive_entry->>'transfer_item_id')::UUID;
        v_qty_acc := GREATEST(0, COALESCE((v_receive_entry->>'qty_accepted')::INT, 0));
        v_qty_dam := GREATEST(0, COALESCE((v_receive_entry->>'qty_damaged')::INT, 0));
        v_qty_mis := GREATEST(0, COALESCE((v_receive_entry->>'qty_missing')::INT, 0));
        v_dam_reason := v_receive_entry->>'damage_reason';

        SELECT * INTO v_item
        FROM branch_transfer_items
        WHERE id = v_item_id AND transfer_id = p_transfer_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Dòng sản phẩm chuyển kho không hợp lệ.');
        END IF;

        -- Kiểm tra tổng số lượng nhận đợt này không vượt quá số lượng còn chờ nhận
        IF (v_qty_acc + v_qty_dam + v_qty_mis) > (v_item.quantity_dispatched - v_item.quantity_received) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số lượng nhận (%s) vượt quá số lượng còn đang đi đường (%s).', 
                    (v_qty_acc + v_qty_dam + v_qty_mis), 
                    (v_item.quantity_dispatched - v_item.quantity_received)
                )
            );
        END IF;

        -- 2.1 HÀNG ĐẠT CHUẨN: TĂNG TỒN KHO KHẢ DỤNG TẠI CHI NHÁNH ĐÍCH B
        IF v_qty_acc > 0 THEN
            -- Khóa hoặc tạo bản ghi tồn kho tổng hợp tại B
            SELECT * INTO v_dest_stock
            FROM inventory_stocks
            WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (
                    organization_id,
                    branch_id,
                    product_id,
                    stock_on_hand,
                    cost_price,
                    created_at,
                    updated_at
                ) VALUES (
                    p_org_id,
                    v_transfer.to_branch_id,
                    v_item.product_id,
                    v_qty_acc,
                    v_item.unit_cost,
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand INTO v_stock_after;
            ELSE
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_qty_acc,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_dest_stock.id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            -- Nếu có số lô, cộng tồn theo lô tại chi nhánh đích B
            IF v_item.lot_number IS NOT NULL AND v_item.lot_number <> '' THEN
                SELECT * INTO v_lot_stock
                FROM inventory_lot_stocks
                WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id AND lot_number = v_item.lot_number
                FOR UPDATE;

                IF NOT FOUND THEN
                    INSERT INTO inventory_lot_stocks (
                        organization_id,
                        branch_id,
                        product_id,
                        lot_number,
                        expiry_date,
                        quantity_on_hand,
                        cost_price,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (
                        p_org_id,
                        v_transfer.to_branch_id,
                        v_item.product_id,
                        v_item.lot_number,
                        v_item.expiry_date,
                        v_qty_acc,
                        v_item.unit_cost,
                        'active',
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    );
                ELSE
                    UPDATE inventory_lot_stocks
                    SET quantity_on_hand = quantity_on_hand + v_qty_acc,
                        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    WHERE id = v_lot_stock.id;
                END IF;
            END IF;

            -- Ghi sổ biến động kho nhập chuyển
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                'transfer_in',
                p_transfer_id,
                v_qty_acc,
                COALESCE(v_dest_stock.stock_on_hand, 0),
                v_stock_after,
                format('Nhận chuyển kho từ chi nhánh gửi theo phiếu #%s', v_transfer.transfer_number),
                p_staff_id
            );
        END IF;

        -- 2.2 HÀNG HỎNG / VỠ TRONG QUÁ TRÌNH CHUYỂN: ĐƯA VÀO KHO CÁCH LY TẠI B, KHÔNG CỘNG TỒN BÁN
        IF v_qty_dam > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                v_item.lot_number,
                v_qty_dam,
                'transfer_damaged',
                p_transfer_id,
                COALESCE(v_dam_reason, 'Hàng bị hư hỏng / vỡ trong quá trình điều chuyển liên chi nhánh'),
                'quarantined',
                p_staff_id
            );
            v_has_difference := TRUE;
        END IF;

        IF v_qty_mis > 0 THEN
            v_has_difference := TRUE;
        END IF;

        -- Cập nhật số lượng lũy kế trên dòng transfer item
        UPDATE branch_transfer_items
        SET quantity_received = quantity_received + (v_qty_acc + v_qty_dam + v_qty_mis),
            quantity_accepted = quantity_accepted + v_qty_acc,
            quantity_damaged = quantity_damaged + v_qty_dam,
            quantity_missing = quantity_missing + v_qty_mis
        WHERE id = v_item.id;
    END LOOP;

    -- 3. Kiểm tra xem toàn bộ các sản phẩm đã được nhận đủ số lượng xuất chưa
    FOR v_item IN SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        IF v_item.quantity_received < v_item.quantity_dispatched THEN
            v_all_completed := FALSE;
        END IF;
        IF v_item.quantity_damaged > 0 OR v_item.quantity_missing > 0 THEN
            v_has_difference := TRUE;
        END IF;
    END LOOP;

    IF v_all_completed THEN
        IF v_has_difference THEN
            v_final_status := 'difference_resolved';
        ELSE
            v_final_status := 'completed';
        END IF;
    ELSE
        v_final_status := 'partially_received';
    END IF;

    -- Cập nhật trạng thái phiếu chuyển
    UPDATE branch_transfers
    SET status = v_final_status,
        received_date = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        received_by_staff_id = p_staff_id,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        v_final_status,
        p_staff_id,
        jsonb_build_object('action', 'Xác nhận nhận hàng tại chi nhánh đích', 'status', v_final_status, 'items_received', p_items)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', v_final_status,
        'all_completed', v_all_completed,
        'has_difference', v_has_difference,
        'message', 'Xác nhận nhận hàng thành công: Tồn kho khả dụng chi nhánh đích đã tăng theo số đạt chuẩn, hàng hỏng đã được cách ly.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH PHIẾU ĐIỀU CHUYỂN (TRANSFERS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_branch_transfers(p_branch_id UUID DEFAULT NULL)
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
                'id', bt.id,
                'organization_id', bt.organization_id,
                'from_branch_id', bt.from_branch_id,
                'from_branch_name', COALESCE(fb.name, 'Chi nhánh xuất'),
                'to_branch_id', bt.to_branch_id,
                'to_branch_name', COALESCE(tb.name, 'Chi nhánh nhận'),
                'transfer_number', bt.transfer_number,
                'status', bt.status,
                'total_items', bt.total_items,
                'total_value', bt.total_value,
                'dispatch_date', bt.dispatch_date,
                'received_date', bt.received_date,
                'notes', bt.notes,
                'created_at', bt.created_at,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', bti.id,
                            'product_id', bti.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'product_code', COALESCE(p.code, ''),
                            'product_unit', COALESCE(p.unit, 'đơn vị'),
                            'lot_number', bti.lot_number,
                            'expiry_date', bti.expiry_date,
                            'unit_cost', bti.unit_cost,
                            'quantity_requested', bti.quantity_requested,
                            'quantity_dispatched', bti.quantity_dispatched,
                            'quantity_received', bti.quantity_received,
                            'quantity_accepted', bti.quantity_accepted,
                            'quantity_damaged', bti.quantity_damaged,
                            'quantity_missing', bti.quantity_missing,
                            'quantity_returned', bti.quantity_returned,
                            'notes', bti.notes
                        )
                    )
                    FROM branch_transfer_items bti
                    LEFT JOIN products p ON p.id = bti.product_id
                    WHERE bti.transfer_id = bt.id
                ), '[]'::jsonb),
                'events', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', bte.id,
                            'event_type', bte.event_type,
                            'actor_name', COALESCE(sp.full_name, 'Hệ thống'),
                            'details', bte.details,
                            'created_at', bte.created_at
                        )
                    )
                    FROM branch_transfer_events bte
                    LEFT JOIN staff_profiles sp ON sp.id = bte.actor_staff_id
                    WHERE bte.transfer_id = bt.id
                    ORDER BY bte.created_at ASC
                ), '[]'::jsonb)
            )
            ORDER BY bt.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM branch_transfers bt
    LEFT JOIN branches fb ON fb.id = bt.from_branch_id
    LEFT JOIN branches tb ON tb.id = bt.to_branch_id
    WHERE (p_branch_id IS NULL OR bt.from_branch_id = p_branch_id OR bt.to_branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- CẤP QUYỀN THỰC THI CHO CẢ AUTHENTICATED VÀ ANON
GRANT EXECUTE ON FUNCTION rpc_create_branch_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_dispatch_branch_transfer(UUID, UUID, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_receive_branch_transfer(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_branch_transfers(UUID) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 017_stage_b_functions_patch.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- PATCH MIGRATION: FIX RPC FUNCTIONS CHO ĐỢT B (ĐIỀU CHUYỂN KHO)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_create_branch_transfer(
    p_org_id UUID,
    p_from_branch_id UUID,
    p_to_branch_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "lot_number": TEXT, "expiry_date": DATE, "quantity": INT, "unit_cost": BIGINT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer_id UUID;
    v_transfer_number VARCHAR(100);
    v_total_items INT := 0;
    v_total_value BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_qty INT;
    v_cost BIGINT;
    v_item_notes TEXT;
BEGIN
    IF p_from_branch_id = p_to_branch_id THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Chi nhánh xuất và nhận phải khác nhau.');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu điều chuyển phải có ít nhất một mặt hàng.');
    END IF;

    v_transfer_number := 'DC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Tính tổng số lượng và giá trị điều chuyển
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        v_cost := COALESCE((v_item->>'unit_cost')::BIGINT, 0);
        IF v_qty <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng chuyển phải lớn hơn 0.');
        END IF;
        v_total_items := v_total_items + v_qty;
        v_total_value := v_total_value + (v_qty * v_cost);
    END LOOP;

    INSERT INTO branch_transfers (
        organization_id,
        from_branch_id,
        to_branch_id,
        transfer_number,
        status,
        total_items,
        total_value,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_from_branch_id,
        p_to_branch_id,
        v_transfer_number,
        'draft',
        v_total_items,
        v_total_value,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_transfer_id;

    -- Thêm chi tiết các dòng
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := v_item->>'lot_number';
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_qty := (v_item->>'quantity')::INT;
        v_cost := COALESCE((v_item->>'unit_cost')::BIGINT, 0);
        v_item_notes := v_item->>'notes';

        INSERT INTO branch_transfer_items (
            transfer_id,
            product_id,
            lot_number,
            expiry_date,
            unit_cost,
            quantity_requested,
            quantity_dispatched,
            quantity_received,
            quantity_accepted,
            quantity_damaged,
            quantity_missing,
            quantity_returned,
            notes
        ) VALUES (
            v_transfer_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_cost,
            v_qty,
            0, -- Chưa xuất kho
            0,
            0,
            0,
            0,
            0,
            v_item_notes
        );
    END LOOP;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        v_transfer_id,
        'created',
        p_staff_id,
        jsonb_build_object('action', 'Tạo phiếu chuyển nháp', 'total_items', v_total_items, 'total_value', v_total_value)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', v_transfer_id,
        'transfer_number', v_transfer_number,
        'total_items', v_total_items,
        'total_value', v_total_value,
        'status', 'draft',
        'message', 'Đã tạo phiếu điều chuyển kho nháp thành công (chưa thay đổi tồn kho).'
    );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_receive_branch_transfer(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"transfer_item_id": UUID, "qty_accepted": INT, "qty_damaged": INT, "qty_missing": INT, "damage_reason": TEXT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_receive_entry JSONB;
    v_item_id UUID;
    v_qty_acc INT;
    v_qty_dam INT;
    v_qty_mis INT;
    v_dam_reason TEXT;
    v_dest_stock RECORD;
    v_lot_stock RECORD;
    v_stock_after INT;
    v_all_completed BOOLEAN := TRUE;
    v_has_difference BOOLEAN := FALSE;
    v_final_status VARCHAR(50);
BEGIN
    -- 1. Khóa bản ghi transfer bằng FOR UPDATE
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status NOT IN ('dispatched', 'partially_received') THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu ở trạng thái "%s", không thể nhận hàng.', v_transfer.status));
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Vui lòng cung cấp chi tiết số lượng nhận hàng.');
    END IF;

    -- 2. Xử lý từng dòng nhận
    FOR v_receive_entry IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_receive_entry->>'transfer_item_id')::UUID;
        v_qty_acc := GREATEST(0, COALESCE((v_receive_entry->>'qty_accepted')::INT, 0));
        v_qty_dam := GREATEST(0, COALESCE((v_receive_entry->>'qty_damaged')::INT, 0));
        v_qty_mis := GREATEST(0, COALESCE((v_receive_entry->>'qty_missing')::INT, 0));
        v_dam_reason := v_receive_entry->>'damage_reason';

        SELECT * INTO v_item
        FROM branch_transfer_items
        WHERE id = v_item_id AND transfer_id = p_transfer_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Dòng sản phẩm chuyển kho không hợp lệ.');
        END IF;

        -- Kiểm tra tổng số lượng nhận đợt này không vượt quá số lượng còn chờ nhận
        IF (v_qty_acc + v_qty_dam + v_qty_mis) > (v_item.quantity_dispatched - v_item.quantity_received) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số lượng nhận (%s) vượt quá số lượng còn đang đi đường (%s).', 
                    (v_qty_acc + v_qty_dam + v_qty_mis), 
                    (v_item.quantity_dispatched - v_item.quantity_received)
                )
            );
        END IF;

        -- 2.1 HÀNG ĐẠT CHUẨN: TĂNG TỒN KHO KHẢ DỤNG TẠI CHI NHÁNH ĐÍCH B
        IF v_qty_acc > 0 THEN
            -- Khóa hoặc tạo bản ghi tồn kho tổng hợp tại B
            SELECT * INTO v_dest_stock
            FROM inventory_stocks
            WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (
                    organization_id,
                    branch_id,
                    product_id,
                    stock_on_hand,
                    cost_price,
                    created_at,
                    updated_at
                ) VALUES (
                    p_org_id,
                    v_transfer.to_branch_id,
                    v_item.product_id,
                    v_qty_acc,
                    v_item.unit_cost,
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand INTO v_stock_after;
            ELSE
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_qty_acc,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_dest_stock.id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            -- Nếu có số lô, cộng tồn theo lô tại chi nhánh đích B
            IF v_item.lot_number IS NOT NULL AND v_item.lot_number <> '' THEN
                SELECT * INTO v_lot_stock
                FROM inventory_lot_stocks
                WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id AND lot_number = v_item.lot_number
                FOR UPDATE;

                IF NOT FOUND THEN
                    INSERT INTO inventory_lot_stocks (
                        organization_id,
                        branch_id,
                        product_id,
                        lot_number,
                        expiry_date,
                        quantity_on_hand,
                        cost_price,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (
                        p_org_id,
                        v_transfer.to_branch_id,
                        v_item.product_id,
                        v_item.lot_number,
                        v_item.expiry_date,
                        v_qty_acc,
                        v_item.unit_cost,
                        'active',
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    );
                ELSE
                    UPDATE inventory_lot_stocks
                    SET quantity_on_hand = quantity_on_hand + v_qty_acc,
                        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    WHERE id = v_lot_stock.id;
                END IF;
            END IF;

            -- Ghi sổ biến động kho nhập chuyển
            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                'transfer_in',
                p_transfer_id,
                v_qty_acc,
                COALESCE(v_dest_stock.stock_on_hand, 0),
                v_stock_after,
                format('Nhận chuyển kho từ chi nhánh gửi theo phiếu #%s', v_transfer.transfer_number),
                p_staff_id
            );
        END IF;

        -- 2.2 HÀNG HỎNG / VỠ TRONG QUÁ TRÌNH CHUYỂN: ĐƯA VÀO KHO CÁCH LY TẠI B, KHÔNG CỘNG TỒN BÁN
        IF v_qty_dam > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                v_item.lot_number,
                v_qty_dam,
                'transfer_damaged',
                p_transfer_id,
                COALESCE(v_dam_reason, 'Hàng bị hư hỏng / vỡ trong quá trình điều chuyển liên chi nhánh'),
                'quarantined',
                p_staff_id
            );
            v_has_difference := TRUE;
        END IF;

        IF v_qty_mis > 0 THEN
            v_has_difference := TRUE;
        END IF;

        -- Cập nhật số lượng lũy kế trên dòng transfer item
        UPDATE branch_transfer_items
        SET quantity_received = quantity_received + (v_qty_acc + v_qty_dam + v_qty_mis),
            quantity_accepted = quantity_accepted + v_qty_acc,
            quantity_damaged = quantity_damaged + v_qty_dam,
            quantity_missing = quantity_missing + v_qty_mis
        WHERE id = v_item.id;
    END LOOP;

    -- 3. Kiểm tra xem toàn bộ các sản phẩm đã được nhận đủ số lượng xuất chưa
    FOR v_item IN SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        IF v_item.quantity_received < v_item.quantity_dispatched THEN
            v_all_completed := FALSE;
        END IF;
        IF v_item.quantity_damaged > 0 OR v_item.quantity_missing > 0 THEN
            v_has_difference := TRUE;
        END IF;
    END LOOP;

    IF v_all_completed THEN
        IF v_has_difference THEN
            v_final_status := 'difference_resolved';
        ELSE
            v_final_status := 'completed';
        END IF;
    ELSE
        v_final_status := 'partially_received';
    END IF;

    -- Cập nhật trạng thái phiếu chuyển
    UPDATE branch_transfers
    SET status = v_final_status,
        received_date = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        received_by_staff_id = p_staff_id,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        v_final_status,
        p_staff_id,
        jsonb_build_object('action', 'Xác nhận nhận hàng tại chi nhánh đích', 'status', v_final_status, 'items_received', p_items)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', v_final_status,
        'all_completed', v_all_completed,
        'has_difference', v_has_difference,
        'message', 'Xác nhận nhận hàng thành công: Tồn kho khả dụng chi nhánh đích đã tăng theo số đạt chuẩn, hàng hỏng đã được cách ly.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_branch_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_receive_branch_transfer(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 018_inventory_stage_c_audits.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 018: INVENTORY PROCUREMENT PHASE C — INVENTORY AUDITS & STOCK ADJUSTMENTS
-- Phase: Kho vận sau P5 — Đợt C: Kiểm kê kho & Điều chỉnh chênh lệch tồn thực tế
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG PHIẾU KIỂM KÊ KHO (INVENTORY AUDITS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    audit_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'counting', 'completed', 'cancelled'
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    auditor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    total_items INT NOT NULL DEFAULT 0,
    total_book_quantity INT NOT NULL DEFAULT 0,
    total_actual_quantity INT NOT NULL DEFAULT 0,
    total_difference_quantity INT NOT NULL DEFAULT 0,
    total_difference_value BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CHI TIẾT SẢN PHẨM KIỂM KÊ (INVENTORY AUDIT ITEMS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id UUID NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    expiry_date DATE,
    unit_cost BIGINT NOT NULL DEFAULT 0,
    system_quantity INT NOT NULL DEFAULT 0, -- Tồn sổ sách tại thời điểm snapshot
    actual_quantity INT NOT NULL DEFAULT 0, -- Tồn kiểm đếm thực tế
    difference_quantity INT NOT NULL DEFAULT 0, -- actual_quantity - system_quantity
    difference_value BIGINT NOT NULL DEFAULT 0, -- difference_quantity * unit_cost
    reason TEXT, -- Lý do chênh lệch: Hao hụt tự nhiên, Đổ vỡ, Thất thoát, Đếm nhầm...
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 3. BẢNG NHẬT KÝ KIỂM TOÁN LỊCH SỬ KIỂM KÊ (INVENTORY AUDIT EVENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id UUID NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'started_counting', 'counted', 'approved_and_adjusted', 'cancelled'
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_inv_audits_read ON inventory_audits;
CREATE POLICY rls_inv_audits_read ON inventory_audits
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_inv_audits_write ON inventory_audits;
CREATE POLICY rls_inv_audits_write ON inventory_audits
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_items_read ON inventory_audit_items;
CREATE POLICY rls_inv_audit_items_read ON inventory_audit_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_items_write ON inventory_audit_items;
CREATE POLICY rls_inv_audit_items_write ON inventory_audit_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_events_read ON inventory_audit_events;
CREATE POLICY rls_inv_audit_events_read ON inventory_audit_events
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_events_write ON inventory_audit_events;
CREATE POLICY rls_inv_audit_events_write ON inventory_audit_events
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO PHIẾU KIỂM KÊ & TỰ ĐỘNG CHỤP SNAPSHOT TỒN SỔ SÁCH (DRAFT / COUNTING)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_inventory_audit(
    p_org_id UUID,
    p_branch_id UUID,
    p_staff_id UUID,
    p_product_ids UUID[] DEFAULT NULL, -- NULL = Kiểm kê toàn bộ kho, hoặc mảng UUID = kiểm kê nhóm SP
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit_id UUID;
    v_audit_number VARCHAR(100);
    v_item RECORD;
    v_total_items INT := 0;
    v_total_book_qty INT := 0;
BEGIN
    v_audit_number := 'KK' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO inventory_audits (
        organization_id,
        branch_id,
        audit_number,
        status,
        snapshot_at,
        auditor_staff_id,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        v_audit_number,
        'draft',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_audit_id;

    -- Tự động snapshot tồn sổ sách hiện tại của các mặt hàng trong kho
    FOR v_item IN
        SELECT 
            s.product_id,
            s.stock_on_hand,
            COALESCE(s.cost_price, p.cost_price, 0) AS unit_cost
        FROM inventory_stocks s
        JOIN products p ON p.id = s.product_id
        WHERE s.branch_id = p_branch_id
          AND (p_product_ids IS NULL OR s.product_id = ANY(p_product_ids))
    LOOP
        INSERT INTO inventory_audit_items (
            audit_id,
            product_id,
            unit_cost,
            system_quantity,
            actual_quantity,
            difference_quantity,
            difference_value
        ) VALUES (
            v_audit_id,
            v_item.product_id,
            v_item.unit_cost,
            v_item.stock_on_hand,
            v_item.stock_on_hand, -- Mặc định khởi tạo bằng tồn sổ sách
            0,
            0
        );

        v_total_items := v_total_items + 1;
        v_total_book_qty := v_total_book_qty + v_item.stock_on_hand;
    END LOOP;

    -- Cập nhật tổng số dòng và tổng tồn sổ sách vào phiếu
    UPDATE inventory_audits
    SET total_items = v_total_items,
        total_book_quantity = v_total_book_qty,
        total_actual_quantity = v_total_book_qty
    WHERE id = v_audit_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO inventory_audit_events (
        audit_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        v_audit_id,
        'created',
        p_staff_id,
        jsonb_build_object('action', 'Tạo phiếu kiểm kê kho & Chụp snapshot tồn sổ sách', 'total_items', v_total_items, 'total_book_qty', v_total_book_qty)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'audit_id', v_audit_id,
        'audit_number', v_audit_number,
        'total_items', v_total_items,
        'total_book_quantity', v_total_book_qty,
        'status', 'draft',
        'message', 'Đã khởi tạo phiếu kiểm kê kho và lưu vết tồn sổ sách tại thời điểm snapshot thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC CẬP NHẬT SỐ LƯỢNG KIỂM ĐẾM THỰC TẾ (SUBMIT COUNTING)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_submit_inventory_audit_counts(
    p_org_id UUID,
    p_audit_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"item_id": UUID, "actual_quantity": INT, "reason": TEXT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit RECORD;
    v_entry JSONB;
    v_item_id UUID;
    v_actual_qty INT;
    v_reason TEXT;
    v_notes TEXT;
    v_item RECORD;
    v_diff_qty INT;
    v_diff_val BIGINT;
    v_total_actual INT := 0;
    v_total_diff_qty INT := 0;
    v_total_diff_val BIGINT := 0;
BEGIN
    SELECT * INTO v_audit
    FROM inventory_audits
    WHERE id = p_audit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu kiểm kê.');
    END IF;

    IF v_audit.status = 'completed' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu kiểm kê đã được duyệt và chốt sổ, không thể sửa đổi.');
    END IF;

    -- Cập nhật số đếm từng dòng
    FOR v_entry IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_entry->>'item_id')::UUID;
        v_actual_qty := GREATEST(0, COALESCE((v_entry->>'actual_quantity')::INT, 0));
        v_reason := v_entry->>'reason';
        v_notes := v_entry->>'notes';

        SELECT * INTO v_item
        FROM inventory_audit_items
        WHERE id = v_item_id AND audit_id = p_audit_id
        FOR UPDATE;

        IF FOUND THEN
            v_diff_qty := v_actual_qty - v_item.system_quantity;
            v_diff_val := v_diff_qty * v_item.unit_cost;

            UPDATE inventory_audit_items
            SET actual_quantity = v_actual_qty,
                difference_quantity = v_diff_qty,
                difference_value = v_diff_val,
                reason = COALESCE(v_reason, reason),
                notes = COALESCE(v_notes, notes)
            WHERE id = v_item_id;
        END IF;
    END LOOP;

    -- Tính lại tổng số lượng thực tế và tổng chênh lệch
    SELECT 
        COALESCE(SUM(actual_quantity), 0),
        COALESCE(SUM(difference_quantity), 0),
        COALESCE(SUM(difference_value), 0)
    INTO v_total_actual, v_total_diff_qty, v_total_diff_val
    FROM inventory_audit_items
    WHERE audit_id = p_audit_id;

    UPDATE inventory_audits
    SET status = 'counting',
        total_actual_quantity = v_total_actual,
        total_difference_quantity = v_total_diff_qty,
        total_difference_value = v_total_diff_val,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_audit_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO inventory_audit_events (
        audit_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_audit_id,
        'counted',
        p_staff_id,
        jsonb_build_object('action', 'Cập nhật số liệu kiểm đếm thực tế', 'total_actual', v_total_actual, 'total_diff_qty', v_total_diff_qty, 'total_diff_val', v_total_diff_val)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'audit_id', p_audit_id,
        'status', 'counting',
        'total_actual_quantity', v_total_actual,
        'total_difference_quantity', v_total_diff_qty,
        'total_difference_value', v_total_diff_val,
        'message', 'Đã lưu kết quả kiểm đếm thực tế và tính toán chênh lệch thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC DUYỆT KIỂM KÊ & ĐIỀU CHỈNH TỒN KHO TỰ ĐỘNG (APPROVE & ADJUST STOCK)
-- Khóa bản ghi nguyên tử, sinh bút toán audit_adjustment, cập nhật tồn kho chính xác
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_approve_inventory_audit(
    p_org_id UUID,
    p_audit_id UUID,
    p_staff_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit RECORD;
    v_item RECORD;
    v_stock RECORD;
    v_stock_after INT;
BEGIN
    -- 1. Khóa phiếu kiểm kê bằng FOR UPDATE
    SELECT * INTO v_audit
    FROM inventory_audits
    WHERE id = p_audit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu kiểm kê.');
    END IF;

    IF v_audit.status = 'completed' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu kiểm kê này đã được duyệt và điều chỉnh trước đó.');
    END IF;

    IF v_audit.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu kiểm kê đã bị hủy, không thể duyệt.');
    END IF;

    -- 2. Duyệt từng dòng chi tiết để sinh bút toán điều chỉnh và cập nhật tồn kho
    FOR v_item IN
        SELECT * FROM inventory_audit_items WHERE audit_id = p_audit_id
    LOOP
        -- Khóa tồn kho hiện tại tại chi nhánh kiểm kê
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE branch_id = v_audit.branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF FOUND THEN
            -- Nếu có chênh lệch giữa thực tế và sổ sách hiện hành
            IF v_item.difference_quantity <> 0 THEN
                -- Cập nhật tồn kho theo số lượng thực tế
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_item.difference_quantity,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_stock.id
                RETURNING stock_on_hand INTO v_stock_after;

                -- Ghi sổ nhật ký biến động kho audit_adjustment
                INSERT INTO inventory_transactions (
                    organization_id,
                    branch_id,
                    product_id,
                    transaction_type,
                    reference_id,
                    quantity_change,
                    stock_before,
                    stock_after,
                    notes,
                    actor_staff_id
                ) VALUES (
                    p_org_id,
                    v_audit.branch_id,
                    v_item.product_id,
                    'audit_adjustment',
                    p_audit_id,
                    v_item.difference_quantity,
                    v_stock.stock_on_hand,
                    v_stock_after,
                    format('Điều chỉnh tồn kho theo phiếu kiểm kê #%s (Lý do: %s)', v_audit.audit_number, COALESCE(v_item.reason, 'Cân đối kiểm kê định kỳ')),
                    p_staff_id
                );
            END IF;
        ELSE
            -- Nếu mặt hàng chưa có trong kho nhưng đếm thực tế có
            IF v_item.actual_quantity > 0 THEN
                INSERT INTO inventory_stocks (
                    organization_id,
                    branch_id,
                    product_id,
                    stock_on_hand,
                    cost_price,
                    created_at,
                    updated_at
                ) VALUES (
                    p_org_id,
                    v_audit.branch_id,
                    v_item.product_id,
                    v_item.actual_quantity,
                    v_item.unit_cost,
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand INTO v_stock_after;

                INSERT INTO inventory_transactions (
                    organization_id,
                    branch_id,
                    product_id,
                    transaction_type,
                    reference_id,
                    quantity_change,
                    stock_before,
                    stock_after,
                    notes,
                    actor_staff_id
                ) VALUES (
                    p_org_id,
                    v_audit.branch_id,
                    v_item.product_id,
                    'audit_adjustment',
                    p_audit_id,
                    v_item.actual_quantity,
                    0,
                    v_stock_after,
                    format('Khởi tạo tồn kho theo phiếu kiểm kê #%s', v_audit.audit_number),
                    p_staff_id
                );
            END IF;
        END IF;
    END LOOP;

    -- 3. Hoàn tất phiếu kiểm kê
    UPDATE inventory_audits
    SET status = 'completed',
        approved_by_staff_id = p_staff_id,
        approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_audit_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO inventory_audit_events (
        audit_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_audit_id,
        'approved_and_adjusted',
        p_staff_id,
        jsonb_build_object('action', 'Duyệt phiếu kiểm kê & Cân đối điều chỉnh tồn kho thành công', 'audit_number', v_audit.audit_number)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'audit_id', p_audit_id,
        'audit_number', v_audit.audit_number,
        'status', 'completed',
        'message', 'Đã phê duyệt phiếu kiểm kê thành công. Toàn bộ chênh lệch đã được cân đối vào sổ cái kho.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH PHIẾU KIỂM KÊ (AUDITS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_inventory_audits(p_branch_id UUID DEFAULT NULL)
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
                'id', a.id,
                'organization_id', a.organization_id,
                'branch_id', a.branch_id,
                'branch_name', COALESCE(b.name, 'Chi nhánh'),
                'audit_number', a.audit_number,
                'status', a.status,
                'snapshot_at', a.snapshot_at,
                'auditor_name', COALESCE(sp_auditor.full_name, 'Nhân viên kiểm kê'),
                'approved_by_name', COALESCE(sp_approver.full_name, ''),
                'approved_at', a.approved_at,
                'total_items', a.total_items,
                'total_book_quantity', a.total_book_quantity,
                'total_actual_quantity', a.total_actual_quantity,
                'total_difference_quantity', a.total_difference_quantity,
                'total_difference_value', a.total_difference_value,
                'notes', a.notes,
                'created_at', a.created_at,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ai.id,
                            'product_id', ai.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'product_code', COALESCE(p.code, ''),
                            'product_unit', COALESCE(p.unit, 'đơn vị'),
                            'lot_number', ai.lot_number,
                            'expiry_date', ai.expiry_date,
                            'unit_cost', ai.unit_cost,
                            'system_quantity', ai.system_quantity,
                            'actual_quantity', ai.actual_quantity,
                            'difference_quantity', ai.difference_quantity,
                            'difference_value', ai.difference_value,
                            'reason', ai.reason,
                            'notes', ai.notes
                        )
                    )
                    FROM inventory_audit_items ai
                    LEFT JOIN products p ON p.id = ai.product_id
                    WHERE ai.audit_id = a.id
                ), '[]'::jsonb),
                'events', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ae.id,
                            'event_type', ae.event_type,
                            'actor_name', COALESCE(sp.full_name, 'Hệ thống'),
                            'details', ae.details,
                            'created_at', ae.created_at
                        )
                    )
                    FROM inventory_audit_events ae
                    LEFT JOIN staff_profiles sp ON sp.id = ae.actor_staff_id
                    WHERE ae.audit_id = a.id
                    ORDER BY ae.created_at ASC
                ), '[]'::jsonb)
            )
            ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM inventory_audits a
    LEFT JOIN branches b ON b.id = a.branch_id
    LEFT JOIN staff_profiles sp_auditor ON sp_auditor.id = a.auditor_staff_id
    LEFT JOIN staff_profiles sp_approver ON sp_approver.id = a.approved_by_staff_id
    WHERE (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- CẤP QUYỀN THỰC THI CHO CẢ AUTHENTICATED VÀ ANON
GRANT EXECUTE ON FUNCTION rpc_create_inventory_audit(UUID, UUID, UUID, UUID[], TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_submit_inventory_audit_counts(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_approve_inventory_audit(UUID, UUID, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_inventory_audits(UUID) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 019_inventory_difference_resolution_and_hardening.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 019: INVENTORY DIFFERENCE RESOLUTION & AUDIT DELTA CONCURRENCY HARDENING
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. NÂNG CẤP RPC RECEIVE TRANSFER: CHUYỂN TRẠNG THÁI 'difference_pending' KHI CÓ HÀNG HỎNG/THIẾU
CREATE OR REPLACE FUNCTION rpc_receive_branch_transfer(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"transfer_item_id": UUID, "qty_accepted": INT, "qty_damaged": INT, "qty_missing": INT, "damage_reason": TEXT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_receive_entry JSONB;
    v_item_id UUID;
    v_qty_acc INT;
    v_qty_dam INT;
    v_qty_mis INT;
    v_dam_reason TEXT;
    v_dest_stock RECORD;
    v_lot_stock RECORD;
    v_stock_after INT;
    v_all_completed BOOLEAN := TRUE;
    v_has_difference BOOLEAN := FALSE;
    v_final_status VARCHAR(50);
BEGIN
    -- 1. Khóa bản ghi transfer bằng FOR UPDATE
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status NOT IN ('dispatched', 'partially_received', 'difference_pending') THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu ở trạng thái "%s", không thể nhận hàng.', v_transfer.status));
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Vui lòng cung cấp chi tiết số lượng nhận hàng.');
    END IF;

    -- 2. Xử lý từng dòng nhận
    FOR v_receive_entry IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_receive_entry->>'transfer_item_id')::UUID;
        v_qty_acc := GREATEST(0, COALESCE((v_receive_entry->>'qty_accepted')::INT, 0));
        v_qty_dam := GREATEST(0, COALESCE((v_receive_entry->>'qty_damaged')::INT, 0));
        v_qty_mis := GREATEST(0, COALESCE((v_receive_entry->>'qty_missing')::INT, 0));
        v_dam_reason := v_receive_entry->>'damage_reason';

        SELECT * INTO v_item
        FROM branch_transfer_items
        WHERE id = v_item_id AND transfer_id = p_transfer_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Dòng sản phẩm chuyển kho không hợp lệ.');
        END IF;

        -- Kiểm tra tổng số lượng nhận đợt này không vượt quá số lượng còn chờ nhận
        IF (v_qty_acc + v_qty_dam + v_qty_mis) > (v_item.quantity_dispatched - v_item.quantity_received) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số lượng nhận (%s) vượt quá số lượng còn đang đi đường (%s).', 
                    (v_qty_acc + v_qty_dam + v_qty_mis), 
                    (v_item.quantity_dispatched - v_item.quantity_received)
                )
            );
        END IF;

        -- 2.1 HÀNG ĐẠT CHUẨN: TĂNG TỒN KHO KHẢ DỤNG TẠI CHI NHÁNH ĐÍCH B
        IF v_qty_acc > 0 THEN
            SELECT * INTO v_dest_stock
            FROM inventory_stocks
            WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (
                    organization_id,
                    branch_id,
                    product_id,
                    stock_on_hand,
                    cost_price,
                    created_at,
                    updated_at
                ) VALUES (
                    p_org_id,
                    v_transfer.to_branch_id,
                    v_item.product_id,
                    v_qty_acc,
                    v_item.unit_cost,
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand INTO v_stock_after;
            ELSE
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_qty_acc,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_dest_stock.id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            IF v_item.lot_number IS NOT NULL AND v_item.lot_number <> '' THEN
                SELECT * INTO v_lot_stock
                FROM inventory_lot_stocks
                WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id AND lot_number = v_item.lot_number
                FOR UPDATE;

                IF NOT FOUND THEN
                    INSERT INTO inventory_lot_stocks (
                        organization_id,
                        branch_id,
                        product_id,
                        lot_number,
                        expiry_date,
                        quantity_on_hand,
                        cost_price,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (
                        p_org_id,
                        v_transfer.to_branch_id,
                        v_item.product_id,
                        v_item.lot_number,
                        v_item.expiry_date,
                        v_qty_acc,
                        v_item.unit_cost,
                        'active',
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    );
                ELSE
                    UPDATE inventory_lot_stocks
                    SET quantity_on_hand = quantity_on_hand + v_qty_acc,
                        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    WHERE id = v_lot_stock.id;
                END IF;
            END IF;

            INSERT INTO inventory_transactions (
                organization_id,
                branch_id,
                product_id,
                transaction_type,
                reference_id,
                quantity_change,
                stock_before,
                stock_after,
                notes,
                actor_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                'transfer_in',
                p_transfer_id,
                v_qty_acc,
                COALESCE(v_dest_stock.stock_on_hand, 0),
                v_stock_after,
                format('Nhận chuyển kho từ chi nhánh gửi theo phiếu #%s', v_transfer.transfer_number),
                p_staff_id
            );
        END IF;

        -- 2.2 HÀNG HỎNG / VỠ: ĐƯA VÀO KHO CÁCH LY TẠI B, KHÔNG CỘNG TỒN BÁN
        IF v_qty_dam > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                v_item.lot_number,
                v_qty_dam,
                'transfer_damaged',
                p_transfer_id,
                COALESCE(v_dam_reason, 'Hàng bị hư hỏng / vỡ trong quá trình điều chuyển liên chi nhánh'),
                'quarantined',
                p_staff_id
            );
            v_has_difference := TRUE;
        END IF;

        IF v_qty_mis > 0 THEN
            v_has_difference := TRUE;
        END IF;

        -- Cập nhật số lượng lũy kế trên dòng transfer item
        UPDATE branch_transfer_items
        SET quantity_received = quantity_received + (v_qty_acc + v_qty_dam + v_qty_mis),
            quantity_accepted = quantity_accepted + v_qty_acc,
            quantity_damaged = quantity_damaged + v_qty_dam,
            quantity_missing = quantity_missing + v_qty_mis
        WHERE id = v_item.id;
    END LOOP;

    -- 3. Kiểm tra toàn bộ các dòng
    FOR v_item IN SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        IF v_item.quantity_received < v_item.quantity_dispatched THEN
            v_all_completed := FALSE;
        END IF;
        IF v_item.quantity_damaged > 0 OR v_item.quantity_missing > 0 THEN
            v_has_difference := TRUE;
        END IF;
    END LOOP;

    -- QUY TẮC CHẶT CHẼ: NẾU CÓ HỎNG HOẶC THIẾU, CHUYỂN SANG 'difference_pending' (CHỜ QUẢN LÝ XÁC NHẬN)
    IF v_has_difference THEN
        v_final_status := 'difference_pending';
    ELSIF v_all_completed THEN
        v_final_status := 'completed';
    ELSE
        v_final_status := 'partially_received';
    END IF;

    -- Cập nhật trạng thái phiếu chuyển
    UPDATE branch_transfers
    SET status = v_final_status,
        received_date = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        received_by_staff_id = p_staff_id,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        v_final_status,
        p_staff_id,
        jsonb_build_object('action', 'Xác nhận kiểm nhận hàng tại chi nhánh đích', 'status', v_final_status, 'has_difference', v_has_difference, 'items_received', p_items)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', v_final_status,
        'all_completed', v_all_completed,
        'has_difference', v_has_difference,
        'message', CASE 
            WHEN v_has_difference THEN 'Đã ghi nhận kiểm nhận. Có chênh lệch (hàng hỏng/thiếu) cần cấp quản lý phê duyệt xử lý.'
            WHEN v_all_completed THEN 'Đã nhận đủ toàn bộ hàng chuyển kho thành công.'
            ELSE 'Đã nhận một phần hàng chuyển kho. Phần còn lại tiếp tục theo dõi in-transit.'
        END
    );
END;
$$;

-- 2. RPC NGHIỆP VỤ: XÁC NHẬN PHÊ DUYỆT XỬ LÝ CHÊNH LỆCH ĐIỀU CHUYỂN
CREATE OR REPLACE FUNCTION rpc_resolve_transfer_difference(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_resolution_type VARCHAR(50), -- 'approved_write_off', 'return_missing_to_sender', 'close_with_audit_note'
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_total_dam INT := 0;
    v_total_mis INT := 0;
BEGIN
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status NOT IN ('difference_pending', 'partially_received') THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu ở trạng thái "%s", không thể duyệt xử lý chênh lệch.', v_transfer.status));
    END IF;

    -- Tính tổng số lượng hỏng và thiếu
    SELECT 
        COALESCE(SUM(quantity_damaged), 0),
        COALESCE(SUM(quantity_missing), 0)
    INTO v_total_dam, v_total_mis
    FROM branch_transfer_items
    WHERE transfer_id = p_transfer_id;

    -- Đổi trạng thái sang 'difference_resolved'
    UPDATE branch_transfers
    SET status = 'difference_resolved',
        notes = COALESCE(notes || E'\n[Đã Xử Lý Chênh Lệch]: ' || p_notes, '[Đã Xử Lý Chênh Lệch]: ' || p_notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện kiểm toán
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        'difference_resolved',
        p_staff_id,
        jsonb_build_object(
            'action', 'Phê duyệt xử lý chênh lệch chuyển kho',
            'resolution_type', p_resolution_type,
            'total_damaged', v_total_dam,
            'total_missing', v_total_mis,
            'notes', p_notes
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', 'difference_resolved',
        'message', 'Đã phê duyệt xử lý chênh lệch điều chuyển thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_receive_branch_transfer(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_resolve_transfer_difference(UUID, UUID, UUID, VARCHAR, TEXT) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 020_p6_staff_and_branch_assignments.sql
-- -----------------------------------------------------------------------------
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
SET search_path = public, extensions, pg_temp
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
        BEGIN
            v_pin_hash := extensions.crypt(TRIM(p_pin_code), extensions.gen_salt('bf'));
        EXCEPTION WHEN OTHERS THEN
            v_pin_hash := md5(TRIM(p_pin_code));
        END;
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



-- -----------------------------------------------------------------------------
-- FILE: 021_p6_2_roster_and_shifts.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 021: HR PHASE P6.2 — ROSTER, SHIFTS, CROSS-BRANCH CONFLICTS, 
-- LEAVE & SHIFT SWAP MANAGEMENT WITH APPOINTMENT SAFETY
-- Target: PostgreSQL / Supabase
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 0. FIX P6.1 PIN HASH SEARCH PATH (COMPATIBILITY HARDENING)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_upsert_staff_profile(
    p_org_id UUID,
    p_staff_id UUID DEFAULT NULL,
    p_full_name VARCHAR(255) DEFAULT '',
    p_code VARCHAR(50) DEFAULT '',
    p_phone VARCHAR(20) DEFAULT '',
    p_email VARCHAR(100) DEFAULT NULL,
    p_title VARCHAR(100) DEFAULT NULL,
    p_role user_role_enum DEFAULT 'technician_doctor',
    p_primary_branch_id UUID DEFAULT NULL,
    p_branch_ids UUID[] DEFAULT '{}',
    p_base_salary BIGINT DEFAULT 0,
    p_commission_rate NUMERIC DEFAULT 0.00,
    p_employment_status VARCHAR DEFAULT 'active',
    p_pin_code VARCHAR DEFAULT NULL,
    p_skill_ids UUID[] DEFAULT '{}',
    p_effective_from DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_target_staff_id UUID;
    v_code VARCHAR(50);
    v_b_id UUID;
    v_s_id UUID;
    v_pin_hash VARCHAR(255);
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        v_code := 'NV' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    ELSE
        v_code := TRIM(p_code);
    END IF;

    IF p_pin_code IS NOT NULL AND TRIM(p_pin_code) <> '' THEN
        BEGIN
            v_pin_hash := extensions.crypt(TRIM(p_pin_code), extensions.gen_salt('bf'));
        EXCEPTION WHEN OTHERS THEN
            v_pin_hash := md5(TRIM(p_pin_code));
        END;
    ELSE
        v_pin_hash := NULL;
    END IF;

    IF p_staff_id IS NULL THEN
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

        UPDATE organization_memberships
        SET role = p_role,
            assigned_branch_ids = p_branch_ids,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_target_staff_id AND organization_id = p_org_id;
    END IF;

    IF p_branch_ids IS NOT NULL AND array_length(p_branch_ids, 1) > 0 THEN
        UPDATE staff_branch_assignments
        SET is_active = FALSE,
            effective_to = CURRENT_DATE,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_target_staff_id
          AND branch_id <> ALL(p_branch_ids)
          AND is_active = TRUE;

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
-- 1. NÂNG CẤP BẢNG ROSTER_SHIFTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roster_shifts' AND column_name = 'break_minutes') THEN
        ALTER TABLE roster_shifts ADD COLUMN break_minutes INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roster_shifts' AND column_name = 'status') THEN
        ALTER TABLE roster_shifts ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'scheduled'; -- 'scheduled', 'completed', 'canceled', 'leave'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roster_shifts' AND column_name = 'is_locked') THEN
        ALTER TABLE roster_shifts ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- Nới lỏng unique constraint cũ nếu có để hỗ trợ nhiều ca trong 1 ngày (VD: ca sáng ở CN1, ca chiều ở CN2)
ALTER TABLE roster_shifts DROP CONSTRAINT IF EXISTS unique_staff_roster_date;
ALTER TABLE roster_shifts DROP CONSTRAINT IF EXISTS unique_staff_roster_slot;
ALTER TABLE roster_shifts ADD CONSTRAINT unique_staff_roster_slot UNIQUE (staff_id, shift_date, start_time);

-- -----------------------------------------------------------------------------
-- 2. BẢNG NGHỈ PHÉP (LEAVE_REQUESTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    leave_type VARCHAR(50) NOT NULL DEFAULT 'annual_leave', -- 'annual_leave', 'unpaid', 'sick', 'personal'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'canceled'
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_leave_requests_all ON leave_requests;
CREATE POLICY rls_leave_requests_all ON leave_requests
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. BẢNG ĐỔI CA (SHIFT_SWAP_REQUESTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requester_staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    requester_shift_id UUID NOT NULL REFERENCES roster_shifts(id) ON DELETE CASCADE,
    target_staff_id UUID REFERENCES staff_profiles(id) ON DELETE CASCADE,
    target_shift_id UUID REFERENCES roster_shifts(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_peer', -- 'pending_peer', 'pending_manager', 'approved', 'rejected', 'canceled'
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_shift_swap_requests_all ON shift_swap_requests;
CREATE POLICY rls_shift_swap_requests_all ON shift_swap_requests
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. RPC KIỂM TRA XUNG ĐỘT PHÂN CA & THỜI GIAN DI CHUYỂN & LỊCH HẸN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_shift_conflict(
    p_org_id UUID,
    p_staff_id UUID,
    p_shift_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_branch_id UUID,
    p_exclude_shift_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_overlapping_shift RECORD;
    v_leave_record RECORD;
    v_appointment_conflicts JSONB;
    v_travel_buffer_conflict RECORD;
BEGIN
    -- 1. Kiểm tra ca làm trùng giờ trên cùng nhân viên
    SELECT id, branch_id, start_time, end_time INTO v_overlapping_shift
    FROM roster_shifts
    WHERE staff_id = p_staff_id
      AND shift_date = p_shift_date
      AND is_off = FALSE
      AND status <> 'canceled'
      AND (p_exclude_shift_id IS NULL OR id <> p_exclude_shift_id)
      AND (
          (start_time, end_time) OVERLAPS (p_start_time, p_end_time)
      )
    LIMIT 1;

    IF v_overlapping_shift.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'has_conflict', TRUE,
            'conflict_type', 'TIME_OVERLAP',
            'message', 'Nhân viên đã có ca làm việc khác trùng khung giờ này (' || v_overlapping_shift.start_time || ' - ' || v_overlapping_shift.end_time || ').',
            'conflicting_shift_id', v_overlapping_shift.id
        );
    END IF;

    -- 2. Kiểm tra xung đột thời gian di chuyển liên chi nhánh (Tối thiểu 30 phút giữa 2 chi nhánh khác nhau)
    SELECT id, branch_id, start_time, end_time INTO v_travel_buffer_conflict
    FROM roster_shifts
    WHERE staff_id = p_staff_id
      AND shift_date = p_shift_date
      AND is_off = FALSE
      AND status <> 'canceled'
      AND branch_id <> p_branch_id
      AND (p_exclude_shift_id IS NULL OR id <> p_exclude_shift_id)
      AND (
          -- Ca mới bắt đầu ngay sau ca cũ ở CN khác mà nghỉ < 30 phút
          (p_start_time >= end_time AND p_start_time < (end_time + INTERVAL '30 minutes'))
          OR
          -- Ca mới kết thúc trước ca cũ ở CN khác mà cách < 30 phút
          (p_end_time <= start_time AND (p_end_time + INTERVAL '30 minutes') > start_time)
      )
    LIMIT 1;

    IF v_travel_buffer_conflict.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'has_conflict', TRUE,
            'conflict_type', 'TRAVEL_TIME_INSUFFICIENT',
            'message', 'Khoảng cách giữa 2 ca tại 2 chi nhánh khác nhau không đủ thời gian di chuyển (tối thiểu 30 phút).',
            'conflicting_shift_id', v_travel_buffer_conflict.id
        );
    END IF;

    -- 3. Kiểm tra ngày nghỉ phép đã được duyệt
    SELECT id, leave_type INTO v_leave_record
    FROM leave_requests
    WHERE staff_id = p_staff_id
      AND status = 'approved'
      AND p_shift_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_leave_record.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'has_conflict', TRUE,
            'conflict_type', 'APPROVED_LEAVE',
            'message', 'Nhân viên đã được duyệt nghỉ phép vào ngày này (' || v_leave_record.leave_type || ').',
            'leave_id', v_leave_record.id
        );
    END IF;

    -- 4. Kiểm tra các lịch hẹn khách hàng đang gán cho KTV trong khung giờ này
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'appointment_id', a.id,
                'customer_id', a.customer_id,
                'scheduled_at', a.scheduled_at,
                'duration_minutes', a.duration_minutes,
                'status', a.status
            )
        ), '[]'::jsonb
    ) INTO v_appointment_conflicts
    FROM appointments a
    WHERE a.staff_id = p_staff_id
      AND a.scheduled_at::DATE = p_shift_date
      AND a.status IN ('scheduled', 'confirmed', 'arrived', 'in_service')
      AND (
          (a.scheduled_at::TIME, (a.scheduled_at::TIME + (a.duration_minutes || ' minutes')::INTERVAL)) 
          OVERLAPS (p_start_time, p_end_time)
      );

    RETURN jsonb_build_object(
        'has_conflict', FALSE,
        'conflict_type', 'NONE',
        'appointment_conflicts', v_appointment_conflicts
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO / CẬP NHẬT CA LÀM VIỆC (UPSERT ROSTER SHIFT WITH SAFETY CHECK)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_upsert_roster_shift(
    p_org_id UUID,
    p_shift_id UUID DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_shift_date DATE DEFAULT CURRENT_DATE,
    p_start_time TIME DEFAULT '08:00:00',
    p_end_time TIME DEFAULT '17:00:00',
    p_shift_type VARCHAR DEFAULT 'day_shift',
    p_break_minutes INT DEFAULT 0,
    p_is_off BOOLEAN DEFAULT FALSE,
    p_notes TEXT DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE -- Nếu TRUE: Bỏ qua cảnh báo lịch hẹn và chuyển lịch về unassigned
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_conflict_check JSONB;
    v_target_shift_id UUID;
    v_affected_appointments INT := 0;
BEGIN
    -- 1. Nếu không phải là nghỉ (is_off = FALSE), kiểm tra xung đột
    IF NOT p_is_off THEN
        v_conflict_check := rpc_check_shift_conflict(
            p_org_id,
            p_staff_id,
            p_shift_date,
            p_start_time,
            p_end_time,
            p_branch_id,
            p_shift_id
        );

        IF (v_conflict_check->>'has_conflict')::BOOLEAN = TRUE THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', v_conflict_check->>'conflict_type',
                'message', v_conflict_check->>'message'
            );
        END IF;
    ELSE
        -- Nếu đặt là ca nghỉ hoặc hủy ca, kiểm tra xem có lịch hẹn khách hàng nào bị ảnh hưởng không
        SELECT COUNT(*) INTO v_affected_appointments
        FROM appointments
        WHERE staff_id = p_staff_id
          AND scheduled_at::DATE = p_shift_date
          AND status IN ('scheduled', 'confirmed', 'arrived');

        IF v_affected_appointments > 0 AND NOT p_force THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'HAS_ACTIVE_APPOINTMENTS',
                'message', 'Nhân viên đang có ' || v_affected_appointments || ' lịch hẹn khách hàng vào ngày này. Cần điều phối KTV khác trước khi hủy ca.',
                'affected_count', v_affected_appointments
            );
        END IF;

        IF v_affected_appointments > 0 AND p_force THEN
            -- Thu hồi gán KTV của các lịch hẹn bị ảnh hưởng để chờ điều phối lại
            UPDATE appointments
            SET staff_id = NULL,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE staff_id = p_staff_id
              AND scheduled_at::DATE = p_shift_date
              AND status IN ('scheduled', 'confirmed');
        END IF;
    END IF;

    -- 2. Thực hiện Lưu/Cập nhật ca làm
    IF p_shift_id IS NULL THEN
        INSERT INTO roster_shifts (
            organization_id,
            branch_id,
            staff_id,
            shift_date,
            start_time,
            end_time,
            shift_type,
            break_minutes,
            is_off,
            status,
            notes,
            created_at,
            updated_at
        ) VALUES (
            p_org_id,
            p_branch_id,
            p_staff_id,
            p_shift_date,
            p_start_time,
            p_end_time,
            p_shift_type,
            p_break_minutes,
            p_is_off,
            CASE WHEN p_is_off THEN 'leave' ELSE 'scheduled' END,
            p_notes,
            TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_target_shift_id;
    ELSE
        v_target_shift_id := p_shift_id;

        UPDATE roster_shifts
        SET branch_id = COALESCE(p_branch_id, branch_id),
            shift_date = COALESCE(p_shift_date, shift_date),
            start_time = COALESCE(p_start_time, start_time),
            end_time = COALESCE(p_end_time, end_time),
            shift_type = COALESCE(p_shift_type, shift_type),
            break_minutes = COALESCE(p_break_minutes, break_minutes),
            is_off = p_is_off,
            status = CASE WHEN p_is_off THEN 'leave' ELSE 'scheduled' END,
            notes = COALESCE(p_notes, notes),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_target_shift_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'shift_id', v_target_shift_id,
        'message', 'Đã lưu lịch phân ca thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC PHÊ DUYỆT NGHỈ PHÉP (APPROVE / REJECT LEAVE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_leave_request(
    p_request_id UUID,
    p_action VARCHAR, -- 'approved', 'rejected', 'canceled'
    p_manager_staff_id UUID DEFAULT NULL,
    p_rejection_reason TEXT DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_leave RECORD;
    v_appt_count INT;
BEGIN
    SELECT * INTO v_leave FROM leave_requests WHERE id = p_request_id;
    IF v_leave.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn xin nghỉ phép.');
    END IF;

    IF p_action = 'approved' THEN
        -- Kiểm tra lịch hẹn khách hàng
        SELECT COUNT(*) INTO v_appt_count
        FROM appointments
        WHERE staff_id = v_leave.staff_id
          AND scheduled_at::DATE BETWEEN v_leave.start_date AND v_leave.end_date
          AND status IN ('scheduled', 'confirmed');

        IF v_appt_count > 0 AND NOT p_force THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'APPOINTMENTS_REQUIRE_REASSIGNMENT',
                'message', 'KTV có ' || v_appt_count || ' lịch hẹn trong thời gian xin nghỉ. Hãy xác nhận điều phối lại trước khi duyệt.',
                'appointment_count', v_appt_count
            );
        END IF;

        IF v_appt_count > 0 AND p_force THEN
            UPDATE appointments
            SET staff_id = NULL,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE staff_id = v_leave.staff_id
              AND scheduled_at::DATE BETWEEN v_leave.start_date AND v_leave.end_date
              AND status IN ('scheduled', 'confirmed');
        END IF;

        -- Đánh dấu các ca làm việc trong khoảng thời gian này thành ca nghỉ
        UPDATE roster_shifts
        SET is_off = TRUE,
            status = 'leave',
            notes = COALESCE(notes, '') || ' [Nghỉ phép đã duyệt: ' || v_leave.leave_type || ']',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_leave.staff_id
          AND shift_date BETWEEN v_leave.start_date AND v_leave.end_date;

        UPDATE leave_requests
        SET status = 'approved',
            approved_by = p_manager_staff_id,
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã duyệt đơn nghỉ phép thành công.');
    ELSIF p_action = 'rejected' THEN
        UPDATE leave_requests
        SET status = 'rejected',
            approved_by = p_manager_staff_id,
            rejection_reason = p_rejection_reason,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã từ chối đơn xin nghỉ phép.');
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC PHÊ DUYỆT ĐỔI CA (PROCESS SHIFT SWAP)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_shift_swap(
    p_swap_id UUID,
    p_action VARCHAR, -- 'approve', 'reject'
    p_manager_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_swap RECORD;
    v_req_shift RECORD;
    v_tgt_shift RECORD;
BEGIN
    SELECT * INTO v_swap FROM shift_swap_requests WHERE id = p_swap_id;
    IF v_swap.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy yêu cầu đổi ca.');
    END IF;

    IF p_action = 'reject' THEN
        UPDATE shift_swap_requests
        SET status = 'rejected',
            approved_by = p_manager_staff_id,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_swap_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã từ chối yêu cầu đổi ca.');
    END IF;

    IF p_action = 'approve' THEN
        SELECT * INTO v_req_shift FROM roster_shifts WHERE id = v_swap.requester_shift_id;
        SELECT * INTO v_tgt_shift FROM roster_shifts WHERE id = v_swap.target_shift_id;

        -- Hoán đổi nhân viên giữa 2 ca làm
        UPDATE roster_shifts
        SET staff_id = v_swap.target_staff_id,
            notes = COALESCE(notes, '') || ' [Đổi ca từ NV ' || v_swap.requester_staff_id || ']',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_swap.requester_shift_id;

        UPDATE roster_shifts
        SET staff_id = v_swap.requester_staff_id,
            notes = COALESCE(notes, '') || ' [Đổi ca từ NV ' || v_swap.target_staff_id || ']',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_swap.target_shift_id;

        UPDATE shift_swap_requests
        SET status = 'approved',
            approved_by = p_manager_staff_id,
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_swap_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã hoán đổi ca làm việc thành công giữa hai nhân viên.');
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC LẤY DỮ LIỆU BẢNG PHÂN CA & NGHỈ PHÉP & ĐỔI CA THEO TUẦN (GET ROSTER MATRIX)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_roster_matrix(
    p_branch_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shifts JSONB;
    v_leave_requests JSONB;
    v_swap_requests JSONB;
BEGIN
    -- 1. Lấy danh sách ca làm việc trong tuần
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', rs.id,
                'staff_id', rs.staff_id,
                'staff_name', sp.full_name,
                'staff_code', sp.code,
                'branch_id', rs.branch_id,
                'shift_date', rs.shift_date,
                'start_time', rs.start_time,
                'end_time', rs.end_time,
                'shift_type', rs.shift_type,
                'break_minutes', rs.break_minutes,
                'is_off', rs.is_off,
                'status', rs.status,
                'notes', rs.notes,
                'appointments_count', (
                    SELECT COUNT(*)
                    FROM appointments a
                    WHERE a.staff_id = rs.staff_id
                      AND a.scheduled_at::DATE = rs.shift_date
                      AND a.status IN ('scheduled', 'confirmed', 'arrived', 'in_service')
                )
            )
        ), '[]'::jsonb
    ) INTO v_shifts
    FROM roster_shifts rs
    JOIN staff_profiles sp ON sp.id = rs.staff_id
    WHERE (p_branch_id IS NULL OR rs.branch_id = p_branch_id)
      AND rs.shift_date BETWEEN p_start_date AND p_end_date;

    -- 2. Lấy danh sách đơn xin nghỉ phép
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lr.id,
                'staff_id', lr.staff_id,
                'staff_name', sp.full_name,
                'leave_type', lr.leave_type,
                'start_date', lr.start_date,
                'end_date', lr.end_date,
                'reason', lr.reason,
                'status', lr.status,
                'created_at', lr.created_at
            )
        ), '[]'::jsonb
    ) INTO v_leave_requests
    FROM leave_requests lr
    JOIN staff_profiles sp ON sp.id = lr.staff_id
    WHERE (lr.start_date <= p_end_date AND lr.end_date >= p_start_date);

    -- 3. Lấy danh sách yêu cầu đổi ca
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ssr.id,
                'requester_staff_id', ssr.requester_staff_id,
                'requester_name', sp1.full_name,
                'target_staff_id', ssr.target_staff_id,
                'target_name', sp2.full_name,
                'reason', ssr.reason,
                'status', ssr.status,
                'created_at', ssr.created_at
            )
        ), '[]'::jsonb
    ) INTO v_swap_requests
    FROM shift_swap_requests ssr
    JOIN staff_profiles sp1 ON sp1.id = ssr.requester_staff_id
    LEFT JOIN staff_profiles sp2 ON sp2.id = ssr.target_staff_id
    WHERE ssr.status IN ('pending_peer', 'pending_manager');

    RETURN jsonb_build_object(
        'shifts', v_shifts,
        'leave_requests', v_leave_requests,
        'swap_requests', v_swap_requests
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_shift_conflict(UUID, UUID, DATE, TIME, TIME, UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_upsert_roster_shift(UUID, UUID, UUID, UUID, DATE, TIME, TIME, VARCHAR, INT, BOOLEAN, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_leave_request(UUID, VARCHAR, UUID, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_shift_swap(UUID, VARCHAR, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_roster_matrix(UUID, DATE, DATE) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 022_p6_3_timesheets_and_attendance.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 022: HR PHASE P6.3 — TIMESHEETS, REAL-TIME ATTENDANCE, 
-- OVERNIGHT SHIFTS, ADJUSTMENTS & APPROVAL PIPELINE
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. HARDENING ROSTER SHIFTS PARTIAL UNIQUE INDEX & RLS (P6.2 CONTINUITY)
-- -----------------------------------------------------------------------------
ALTER TABLE roster_shifts DROP CONSTRAINT IF EXISTS unique_staff_roster_slot;
DROP INDEX IF EXISTS unique_active_staff_roster_slot;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_staff_roster_slot 
ON roster_shifts (staff_id, shift_date, start_time) 
WHERE is_off = FALSE AND status <> 'canceled';

DROP POLICY IF EXISTS rls_roster_shifts_read ON roster_shifts;
DROP POLICY IF EXISTS rls_roster_shifts_admin_modify ON roster_shifts;
DROP POLICY IF EXISTS rls_roster_shifts_all ON roster_shifts;
CREATE POLICY rls_roster_shifts_all ON roster_shifts
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 1. BẢNG CHẤM CÔNG & GIỜ LÀM THỰC TẾ (ATTENDANCE_RECORDS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES roster_shifts(id) ON DELETE SET NULL,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    check_out_at TIMESTAMPTZ,
    is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
    actual_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    approved_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'working', -- 'working', 'completed', 'pending_approval', 'approved', 'rejected'
    check_in_method VARCHAR(50) NOT NULL DEFAULT 'manual_app', -- 'gps', 'wifi', 'pin', 'manual_app', 'manager_override'
    check_in_meta JSONB DEFAULT '{}'::jsonb, -- { "lat": 10.77, "lng": 106.70, "accuracy": 15, "ip": "...", "device": "..." }
    check_out_meta JSONB DEFAULT '{}'::jsonb,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- Index tra cứu nhanh theo chi nhánh và ngày
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance_records (branch_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance_records (staff_id, work_date);

-- Bật RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_attendance_records_all ON attendance_records;
CREATE POLICY rls_attendance_records_all ON attendance_records
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. BẢNG YÊU CẦU ĐIỀU CHỈNH CHẤM CÔNG & QUÊN CHẤM CÔNG (ATTENDANCE_ADJUSTMENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES attendance_records(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    original_check_in TIMESTAMPTZ,
    original_check_out TIMESTAMPTZ,
    requested_check_in TIMESTAMPTZ NOT NULL,
    requested_check_out TIMESTAMPTZ NOT NULL,
    requested_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_attendance_adjustments_all ON attendance_adjustments;
CREATE POLICY rls_attendance_adjustments_all ON attendance_adjustments
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. RPC CHECK-IN CHẤM CÔNG (CÓ CHỐNG GỬI LẶP & COOLDOWN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_in_attendance(
    p_org_id UUID,
    p_branch_id UUID,
    p_staff_id UUID,
    p_shift_id UUID DEFAULT NULL,
    p_method VARCHAR DEFAULT 'manual_app',
    p_meta JSONB DEFAULT '{}'::jsonb,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_active RECORD;
    v_target_id UUID;
    v_shift RECORD;
    v_is_overnight BOOLEAN := FALSE;
BEGIN
    -- 1. Kiểm tra xem nhân viên có lượt check-in nào đang mở ('working') không
    SELECT * INTO v_existing_active
    FROM attendance_records
    WHERE staff_id = p_staff_id
      AND status = 'working'
    ORDER BY check_in_at DESC
    LIMIT 1;

    IF v_existing_active.id IS NOT NULL THEN
        -- Chống gửi lặp: Nếu mới check-in trong vòng 2 phút thì trả về bản ghi hiện tại
        IF v_existing_active.check_in_at > (TIMEZONE('Asia/Ho_Chi_Minh', NOW()) - INTERVAL '2 minutes') THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'attendance_id', v_existing_active.id,
                'message', 'Bạn vừa check-in thành công trước đó.',
                'is_duplicate', TRUE
            );
        END IF;

        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'ALREADY_CHECKED_IN',
            'message', 'Nhân viên đã check-in lúc ' || TO_CHAR(v_existing_active.check_in_at, 'HH24:MI:SS DD/MM/YYYY') || ' và chưa check-out.',
            'attendance_id', v_existing_active.id
        );
    END IF;

    -- 2. Kiểm tra thông tin ca làm nếu có
    IF p_shift_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM roster_shifts WHERE id = p_shift_id;
        IF v_shift.id IS NOT NULL AND v_shift.end_time < v_shift.start_time THEN
            v_is_overnight := TRUE;
        END IF;
    END IF;

    -- 3. Ghi nhận lượt Check-in
    INSERT INTO attendance_records (
        organization_id,
        branch_id,
        staff_id,
        shift_id,
        work_date,
        check_in_at,
        is_overnight,
        status,
        check_in_method,
        check_in_meta,
        notes,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_staff_id,
        p_shift_id,
        CURRENT_DATE,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        v_is_overnight,
        'working',
        p_method,
        p_meta,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_target_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'attendance_id', v_target_id,
        'check_in_at', TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        'message', 'Check-in thành công vào lúc ' || TO_CHAR(TIMEZONE('Asia/Ho_Chi_Minh', NOW()), 'HH24:MI:SS') || '.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC CHECK-OUT CHẤM CÔNG (TÍNH GIỜ & CA QUA ĐÊM)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_out_attendance(
    p_attendance_id UUID,
    p_method VARCHAR DEFAULT 'manual_app',
    p_meta JSONB DEFAULT '{}'::jsonb,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_checkout_time TIMESTAMPTZ;
    v_actual_hours NUMERIC(6,2);
    v_is_overnight BOOLEAN;
BEGIN
    SELECT * INTO v_rec FROM attendance_records WHERE id = p_attendance_id;
    IF v_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy bản ghi chấm công.');
    END IF;

    IF v_rec.status <> 'working' AND v_rec.check_out_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Ca làm này đã được check-out trước đó.');
    END IF;

    v_checkout_time := TIMEZONE('Asia/Ho_Chi_Minh', NOW());
    
    -- Tính số giờ làm việc thực tế (làm tròn 2 chữ số thập phân)
    v_actual_hours := ROUND((EXTRACT(EPOCH FROM (v_checkout_time - v_rec.check_in_at)) / 3600.0)::NUMERIC, 2);
    
    -- Xác định ca qua đêm nếu ngày check-out khác ngày check-in
    v_is_overnight := (v_checkout_time::DATE > v_rec.check_in_at::DATE) OR v_rec.is_overnight;

    UPDATE attendance_records
    SET check_out_at = v_checkout_time,
        actual_hours = GREATEST(0, v_actual_hours),
        approved_hours = GREATEST(0, v_actual_hours), -- Mặc định giờ duyệt = giờ thực tế
        is_overnight = v_is_overnight,
        status = 'completed',
        check_out_meta = p_meta,
        notes = COALESCE(p_notes, notes),
        updated_at = v_checkout_time
    WHERE id = p_attendance_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'attendance_id', p_attendance_id,
        'check_out_at', v_checkout_time,
        'actual_hours', v_actual_hours,
        'is_overnight', v_is_overnight,
        'message', 'Check-out thành công. Tổng giờ làm: ' || v_actual_hours || ' giờ.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC YÊU CẦU ĐIỀU CHỈNH CHẤM CÔNG (QUÊN CHẤM CÔNG / ĐIỀU CHỈNH GIỜ)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_request_attendance_adjustment(
    p_org_id UUID,
    p_staff_id UUID,
    p_branch_id UUID,
    p_work_date DATE,
    p_requested_check_in TIMESTAMPTZ,
    p_requested_check_out TIMESTAMPTZ,
    p_reason TEXT,
    p_attendance_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orig_in TIMESTAMPTZ := NULL;
    v_orig_out TIMESTAMPTZ := NULL;
    v_hours NUMERIC(6,2);
    v_adj_id UUID;
BEGIN
    IF p_attendance_id IS NOT NULL THEN
        SELECT check_in_at, check_out_at INTO v_orig_in, v_orig_out
        FROM attendance_records
        WHERE id = p_attendance_id;
    END IF;

    IF p_requested_check_out <= p_requested_check_in THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Thời gian check-out phải sau thời gian check-in.');
    END IF;

    v_hours := ROUND((EXTRACT(EPOCH FROM (p_requested_check_out - p_requested_check_in)) / 3600.0)::NUMERIC, 2);

    INSERT INTO attendance_adjustments (
        organization_id,
        attendance_id,
        staff_id,
        branch_id,
        work_date,
        original_check_in,
        original_check_out,
        requested_check_in,
        requested_check_out,
        requested_hours,
        reason,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_attendance_id,
        p_staff_id,
        p_branch_id,
        p_work_date,
        v_orig_in,
        v_orig_out,
        p_requested_check_in,
        p_requested_check_out,
        v_hours,
        p_reason,
        'pending',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_adj_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'adjustment_id', v_adj_id,
        'requested_hours', v_hours,
        'message', 'Đã gửi yêu cầu điều chỉnh chấm công thành công. Chờ quản lý phê duyệt.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC PHÊ DUYỆT ĐIỀU CHỈNH CHẤM CÔNG (APPROVE / REJECT ADJUSTMENT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_attendance_adjustment(
    p_adjustment_id UUID,
    p_action VARCHAR, -- 'approved', 'rejected'
    p_manager_staff_id UUID DEFAULT NULL,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_adj RECORD;
    v_target_att_id UUID;
BEGIN
    SELECT * INTO v_adj FROM attendance_adjustments WHERE id = p_adjustment_id;
    IF v_adj.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy yêu cầu điều chỉnh chấm công.');
    END IF;

    IF p_action = 'rejected' THEN
        UPDATE attendance_adjustments
        SET status = 'rejected',
            approved_by = p_manager_staff_id,
            rejection_reason = p_rejection_reason,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_adjustment_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã từ chối yêu cầu điều chỉnh chấm công.');
    END IF;

    IF p_action = 'approved' THEN
        IF v_adj.attendance_id IS NOT NULL THEN
            -- Cập nhật bản ghi chấm công hiện có
            UPDATE attendance_records
            SET check_in_at = v_adj.requested_check_in,
                check_out_at = v_adj.requested_check_out,
                actual_hours = v_adj.requested_hours,
                approved_hours = v_adj.requested_hours,
                status = 'approved',
                approved_by = p_manager_staff_id,
                approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                notes = COALESCE(notes, '') || ' [Điều chỉnh duyệt: ' || v_adj.reason || ']',
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE id = v_adj.attendance_id;
            v_target_att_id := v_adj.attendance_id;
        ELSE
            -- Bổ sung lượt chấm công mới do quên chấm công
            INSERT INTO attendance_records (
                organization_id,
                branch_id,
                staff_id,
                work_date,
                check_in_at,
                check_out_at,
                actual_hours,
                approved_hours,
                status,
                check_in_method,
                approved_by,
                approved_at,
                notes,
                created_at,
                updated_at
            ) VALUES (
                v_adj.organization_id,
                v_adj.branch_id,
                v_adj.staff_id,
                v_adj.work_date,
                v_adj.requested_check_in,
                v_adj.requested_check_out,
                v_adj.requested_hours,
                v_adj.requested_hours,
                'approved',
                'manager_override',
                p_manager_staff_id,
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                'Bổ sung chấm công đã duyệt: ' || v_adj.reason,
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            )
            RETURNING id INTO v_target_att_id;
        END IF;

        UPDATE attendance_adjustments
        SET status = 'approved',
            attendance_id = v_target_att_id,
            approved_by = p_manager_staff_id,
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_adjustment_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'attendance_id', v_target_att_id,
            'approved_hours', v_adj.requested_hours,
            'message', 'Đã phê duyệt điều chỉnh công thành công.'
        );
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC DUYỆT GIỜ CÔNG TRỰC TIẾP (APPROVE TIMESHEET RECORD)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_approve_timesheet_record(
    p_attendance_id UUID,
    p_approved_hours NUMERIC,
    p_manager_staff_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE attendance_records
    SET approved_hours = GREATEST(0, COALESCE(p_approved_hours, actual_hours)),
        status = 'approved',
        approved_by = p_manager_staff_id,
        approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_attendance_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'attendance_id', p_attendance_id,
        'approved_hours', p_approved_hours,
        'message', 'Đã phê duyệt giờ công thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC LẤY DANH SÁCH BẢNG CÔNG & ĐIỀU CHỈNH (GET TIMESHEETS DIRECTORY)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_timesheets_directory(
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_records JSONB;
    v_adjustments JSONB;
    v_summary JSONB;
BEGIN
    -- 1. Danh sách bản ghi chấm công
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ar.id,
                'staff_id', ar.staff_id,
                'staff_name', sp.full_name,
                'staff_code', sp.code,
                'branch_id', ar.branch_id,
                'branch_name', b.name,
                'work_date', ar.work_date,
                'check_in_at', ar.check_in_at,
                'check_out_at', ar.check_out_at,
                'is_overnight', ar.is_overnight,
                'actual_hours', ar.actual_hours,
                'approved_hours', ar.approved_hours,
                'status', ar.status,
                'check_in_method', ar.check_in_method,
                'is_verified', ar.is_verified,
                'notes', ar.notes,
                'approved_by', ar.approved_by,
                'created_at', ar.created_at
            )
            ORDER BY ar.check_in_at DESC
        ),
        '[]'::jsonb
    ) INTO v_records
    FROM attendance_records ar
    JOIN staff_profiles sp ON sp.id = ar.staff_id
    JOIN branches b ON b.id = ar.branch_id
    WHERE (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
      AND (p_staff_id IS NULL OR ar.staff_id = p_staff_id)
      AND ar.work_date BETWEEN p_start_date AND p_end_date;

    -- 2. Danh sách yêu cầu điều chỉnh chờ duyệt
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', aa.id,
                'attendance_id', aa.attendance_id,
                'staff_id', aa.staff_id,
                'staff_name', sp.full_name,
                'branch_id', aa.branch_id,
                'branch_name', b.name,
                'work_date', aa.work_date,
                'original_check_in', aa.original_check_in,
                'original_check_out', aa.original_check_out,
                'requested_check_in', aa.requested_check_in,
                'requested_check_out', aa.requested_check_out,
                'requested_hours', aa.requested_hours,
                'reason', aa.reason,
                'status', aa.status,
                'created_at', aa.created_at
            )
            ORDER BY aa.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_adjustments
    FROM attendance_adjustments aa
    JOIN staff_profiles sp ON sp.id = aa.staff_id
    JOIN branches b ON b.id = aa.branch_id
    WHERE (p_branch_id IS NULL OR aa.branch_id = p_branch_id)
      AND (p_staff_id IS NULL OR aa.staff_id = p_staff_id)
      AND aa.status = 'pending';

    -- 3. Tổng hợp KPI
    SELECT jsonb_build_object(
        'total_working', COUNT(*) FILTER (WHERE status = 'working'),
        'total_completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'total_approved', COUNT(*) FILTER (WHERE status = 'approved'),
        'total_hours', COALESCE(SUM(approved_hours), 0)
    ) INTO v_summary
    FROM attendance_records
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_staff_id IS NULL OR staff_id = p_staff_id)
      AND work_date BETWEEN p_start_date AND p_end_date;

    RETURN jsonb_build_object(
        'records', v_records,
        'adjustments', v_adjustments,
        'summary', v_summary
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_in_attendance(UUID, UUID, UUID, UUID, VARCHAR, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_check_out_attendance(UUID, VARCHAR, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_request_attendance_adjustment(UUID, UUID, UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_attendance_adjustment(UUID, VARCHAR, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_approve_timesheet_record(UUID, NUMERIC, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_timesheets_directory(UUID, DATE, DATE, UUID) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 023_p6_4_commissions_and_payroll.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 023: HR PHASE P6.4 — COMMISSIONS, PAYROLL PERIODS, 
-- SALARY ADJUSTMENTS & HISTORICAL AUDIT LOCK
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG THEO DÕI HOA HỒNG CHI TIẾT ĐA TRẠNG THÁI (COMMISSION_RECORDS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    service_or_product_name VARCHAR(255) NOT NULL,
    item_type VARCHAR(50) NOT NULL DEFAULT 'service', -- 'service', 'product', 'package', 'course_deduct'
    item_revenue BIGINT NOT NULL DEFAULT 0,
    applied_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- Snapshot % hoa hồng
    applied_fixed_amount BIGINT NOT NULL DEFAULT 0,
    calculated_amount BIGINT NOT NULL DEFAULT 0,
    split_ratio NUMERIC(5,2) NOT NULL DEFAULT 1.00, -- 1.0 = 100%, 0.5 = chia đôi
    final_commission BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'eligible', -- 'expected', 'eligible', 'approved', 'paid', 'reversed'
    reversal_reason TEXT,
    payroll_period_id UUID, -- Sẽ liên kết khi đưa vào kỳ lương
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_commission_staff_date ON commission_records (staff_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_commission_status ON commission_records (status);

ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_commission_records_all ON commission_records;
CREATE POLICY rls_commission_records_all ON commission_records
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. BẢNG KỲ LƯƠNG CHỐT SỔ (PAYROLL_PERIODS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    period_name VARCHAR(100) NOT NULL, -- e.g. "Kỳ lương Tháng 10/2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'locked', 'approved', 'paid'
    total_staff INT NOT NULL DEFAULT 0,
    total_base_salary BIGINT NOT NULL DEFAULT 0,
    total_commission BIGINT NOT NULL DEFAULT 0,
    total_allowance BIGINT NOT NULL DEFAULT 0,
    total_deduction BIGINT NOT NULL DEFAULT 0,
    total_net_salary BIGINT NOT NULL DEFAULT 0,
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_payroll_periods_all ON payroll_periods;
CREATE POLICY rls_payroll_periods_all ON payroll_periods
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. BẢNG CHI TIẾT BẢNG LƯƠNG TỪNG NHÂN VIÊN (PAYROLL_RECORDS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    base_salary BIGINT NOT NULL DEFAULT 0,
    actual_working_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    salary_by_hours BIGINT NOT NULL DEFAULT 0,
    commission_total BIGINT NOT NULL DEFAULT 0,
    allowance BIGINT NOT NULL DEFAULT 0,
    deduction BIGINT NOT NULL DEFAULT 0,
    net_salary BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'approved', 'paid'
    adjustment_notes TEXT,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_payroll_staff_period UNIQUE (payroll_period_id, staff_id)
);

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_payroll_records_all ON payroll_records;
CREATE POLICY rls_payroll_records_all ON payroll_records
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. RPC TẠO / TÍNH TOÁN BẢNG LƯƠNG TỰ ĐỘNG (GENERATE PAYROLL PERIOD)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_generate_payroll_period(
    p_org_id UUID,
    p_branch_id UUID,
    p_period_name VARCHAR,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_period_id UUID;
    v_staff RECORD;
    v_staff_count INT := 0;
    v_total_base BIGINT := 0;
    v_total_comm BIGINT := 0;
    v_total_net BIGINT := 0;
    v_hours NUMERIC(6,2);
    v_comm BIGINT;
    v_salary_by_hours BIGINT;
    v_net BIGINT;
BEGIN
    -- 1. Tạo kỳ lương mới
    INSERT INTO payroll_periods (
        organization_id,
        branch_id,
        period_name,
        start_date,
        end_date,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_period_name,
        p_start_date,
        p_end_date,
        'draft',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_period_id;

    -- 2. Quét toàn bộ nhân viên thuộc chi nhánh hoặc tổ chức
    FOR v_staff IN 
        SELECT sp.id, sp.full_name, sp.base_salary, sp.commission_rate,
               COALESCE((
                   SELECT sba.branch_id 
                   FROM staff_branch_assignments sba 
                   WHERE sba.staff_id = sp.id AND sba.is_active = TRUE 
                   LIMIT 1
               ), p_branch_id) AS staff_branch_id
        FROM staff_profiles sp
        WHERE sp.organization_id = p_org_id
          AND sp.is_active = TRUE
    LOOP
        -- Tính tổng giờ công được duyệt từ attendance_records
        SELECT COALESCE(SUM(approved_hours), 0) INTO v_hours
        FROM attendance_records
        WHERE staff_id = v_staff.id
          AND work_date BETWEEN p_start_date AND p_end_date
          AND status IN ('completed', 'approved');

        -- Tính tổng hoa hồng đủ điều kiện (eligible / approved)
        SELECT COALESCE(SUM(final_commission), 0) INTO v_comm
        FROM commission_records
        WHERE staff_id = v_staff.id
          AND occurred_at::DATE BETWEEN p_start_date AND p_end_date
          AND status IN ('eligible', 'approved');

        -- Lương cơ bản theo tháng
        v_salary_by_hours := v_staff.base_salary;
        v_net := v_salary_by_hours + v_comm;

        -- Ghi nhận dòng lương nhân viên
        INSERT INTO payroll_records (
            organization_id,
            payroll_period_id,
            branch_id,
            staff_id,
            base_salary,
            actual_working_hours,
            salary_by_hours,
            commission_total,
            allowance,
            deduction,
            net_salary,
            status,
            created_at,
            updated_at
        ) VALUES (
            p_org_id,
            v_period_id,
            COALESCE(v_staff.staff_branch_id, p_branch_id),
            v_staff.id,
            v_staff.base_salary,
            v_hours,
            v_salary_by_hours,
            v_comm,
            0,
            0,
            v_net,
            'draft',
            TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        -- Đính kèm payroll_period_id vào commission_records
        UPDATE commission_records
        SET payroll_period_id = v_period_id,
            status = 'approved',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_staff.id
          AND occurred_at::DATE BETWEEN p_start_date AND p_end_date
          AND status = 'eligible';

        v_staff_count := v_staff_count + 1;
        v_total_base := v_total_base + v_salary_by_hours;
        v_total_comm := v_total_comm + v_comm;
        v_total_net := v_total_net + v_net;
    END LOOP;

    -- 3. Cập nhật tổng hợp kỳ lương
    UPDATE payroll_periods
    SET total_staff = v_staff_count,
        total_base_salary = v_total_base,
        total_commission = v_total_comm,
        total_net_salary = v_total_net,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = v_period_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payroll_period_id', v_period_id,
        'total_staff', v_staff_count,
        'total_net_salary', v_total_net,
        'message', 'Đã tính toán kỳ lương "' || p_period_name || '" thành công cho ' || v_staff_count || ' nhân viên.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC ĐIỀU CHỈNH PHỤ CẤP / GIẢM TRỪ TRÊN TỪNG DÒNG LƯƠNG
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_update_payroll_record_adjustments(
    p_record_id UUID,
    p_allowance BIGINT,
    p_deduction BIGINT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_new_net BIGINT;
    v_period_id UUID;
BEGIN
    SELECT * INTO v_rec FROM payroll_records WHERE id = p_record_id;
    IF v_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy dòng lương nhân viên.');
    END IF;

    -- Kiểm tra xem kỳ lương đã bị khóa chưa
    SELECT id INTO v_period_id FROM payroll_periods WHERE id = v_rec.payroll_period_id AND status IN ('locked', 'paid');
    IF v_period_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Kỳ lương này đã bị khóa sổ / quyết toán, không thể chỉnh sửa.');
    END IF;

    v_new_net := v_rec.salary_by_hours + v_rec.commission_total + GREATEST(0, p_allowance) - GREATEST(0, p_deduction);

    UPDATE payroll_records
    SET allowance = GREATEST(0, p_allowance),
        deduction = GREATEST(0, p_deduction),
        net_salary = GREATEST(0, v_new_net),
        adjustment_notes = p_notes,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_record_id;

    -- Tính lại tổng kỳ lương
    UPDATE payroll_periods
    SET total_allowance = (SELECT COALESCE(SUM(allowance), 0) FROM payroll_records WHERE payroll_period_id = v_rec.payroll_period_id),
        total_deduction = (SELECT COALESCE(SUM(deduction), 0) FROM payroll_records WHERE payroll_period_id = v_rec.payroll_period_id),
        total_net_salary = (SELECT COALESCE(SUM(net_salary), 0) FROM payroll_records WHERE payroll_period_id = v_rec.payroll_period_id),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = v_rec.payroll_period_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_net_salary', v_new_net,
        'message', 'Đã cập nhật phụ cấp & giảm trừ thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC KHÓA SỔ / PHÊ DUYỆT / QUYẾT TOÁN CHI TRẢ KỲ LƯƠNG
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_payroll_period_status(
    p_period_id UUID,
    p_action VARCHAR, -- 'lock', 'approve', 'pay'
    p_manager_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_period RECORD;
BEGIN
    SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
    IF v_period.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy kỳ lương.');
    END IF;

    IF p_action = 'lock' THEN
        UPDATE payroll_periods
        SET status = 'locked',
            locked_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            locked_by = p_manager_staff_id,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_period_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã khóa sổ kỳ lương thành công. Không thể chỉnh sửa số liệu.');
    ELSIF p_action = 'approve' THEN
        UPDATE payroll_periods
        SET status = 'approved',
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            approved_by = p_manager_staff_id,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_period_id;

        UPDATE payroll_records
        SET status = 'approved',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE payroll_period_id = p_period_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã phê duyệt toàn bộ bảng lương.');
    ELSIF p_action = 'pay' THEN
        UPDATE payroll_periods
        SET status = 'paid',
            paid_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_period_id;

        UPDATE payroll_records
        SET status = 'paid',
            paid_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE payroll_period_id = p_period_id;

        -- Đánh dấu toàn bộ hoa hồng liên kết sang 'paid'
        UPDATE commission_records
        SET status = 'paid',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE payroll_period_id = p_period_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã quyết toán và chi trả lương thành công.');
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC TRUY VẤN DANH SÁCH BẢNG LƯƠNG & HOA HỒNG (GET PAYROLL OVERVIEW)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_payroll_overview(
    p_branch_id UUID DEFAULT NULL,
    p_period_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_periods JSONB;
    v_records JSONB;
    v_commissions JSONB;
    v_selected_period_id UUID := p_period_id;
BEGIN
    -- 1. Lấy danh sách kỳ lương
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pp.id,
                'period_name', pp.period_name,
                'start_date', pp.start_date,
                'end_date', pp.end_date,
                'status', pp.status,
                'total_staff', pp.total_staff,
                'total_base_salary', pp.total_base_salary,
                'total_commission', pp.total_commission,
                'total_allowance', pp.total_allowance,
                'total_deduction', pp.total_deduction,
                'total_net_salary', pp.total_net_salary,
                'created_at', pp.created_at
            )
            ORDER BY pp.start_date DESC
        ),
        '[]'::jsonb
    ) INTO v_periods
    FROM payroll_periods pp
    WHERE (p_branch_id IS NULL OR pp.branch_id = p_branch_id OR pp.branch_id IS NULL);

    -- Nếu chưa chọn kỳ lương thì lấy kỳ lương mới nhất
    IF v_selected_period_id IS NULL THEN
        SELECT pp.id INTO v_selected_period_id
        FROM payroll_periods pp
        ORDER BY pp.start_date DESC
        LIMIT 1;
    END IF;

    -- 2. Lấy chi tiết các dòng lương của kỳ đang chọn
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pr.id,
                'payroll_period_id', pr.payroll_period_id,
                'staff_id', pr.staff_id,
                'staff_name', sp.full_name,
                'staff_code', sp.code,
                'branch_id', pr.branch_id,
                'base_salary', pr.base_salary,
                'actual_working_hours', pr.actual_working_hours,
                'salary_by_hours', pr.salary_by_hours,
                'commission_total', pr.commission_total,
                'allowance', pr.allowance,
                'deduction', pr.deduction,
                'net_salary', pr.net_salary,
                'status', pr.status,
                'adjustment_notes', pr.adjustment_notes,
                'payment_method', pr.payment_method,
                'paid_at', pr.paid_at
            )
            ORDER BY sp.full_name ASC
        ),
        '[]'::jsonb
    ) INTO v_records
    FROM payroll_records pr
    JOIN staff_profiles sp ON sp.id = pr.staff_id
    WHERE pr.payroll_period_id = v_selected_period_id;

    -- 3. Lấy 50 bản ghi hoa hồng mới nhất
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', cr.id,
                'staff_id', cr.staff_id,
                'staff_name', sp.full_name,
                'service_or_product_name', cr.service_or_product_name,
                'item_type', cr.item_type,
                'item_revenue', cr.item_revenue,
                'applied_rate', cr.applied_rate,
                'final_commission', cr.final_commission,
                'status', cr.status,
                'occurred_at', cr.occurred_at
            )
            ORDER BY cr.occurred_at DESC
        ),
        '[]'::jsonb
    ) INTO v_commissions
    FROM commission_records cr
    JOIN staff_profiles sp ON sp.id = cr.staff_id
    WHERE (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    LIMIT 50;

    RETURN jsonb_build_object(
        'periods', v_periods,
        'selected_period_id', v_selected_period_id,
        'records', v_records,
        'commissions', v_commissions
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_generate_payroll_period(UUID, UUID, VARCHAR, DATE, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_update_payroll_record_adjustments(UUID, BIGINT, BIGINT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_payroll_period_status(UUID, VARCHAR, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_payroll_overview(UUID, UUID) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 024_p7_1_sales_and_cashflow_analytics.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 024: BI & ANALYTICS PHASE P7.1 — SALES & CASHFLOW REPORTING
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BỔ SUNG CỘT ĐỐI SOÁT & TRẠNG THÁI THANH TOÁN VÀO BẢNG PAYMENTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'reconciliation_status') THEN
        ALTER TABLE payments ADD COLUMN reconciliation_status VARCHAR(50) NOT NULL DEFAULT 'confirmed'; -- 'confirmed', 'pending_reconciliation', 'rejected'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'reconciled_at') THEN
        ALTER TABLE payments ADD COLUMN reconciled_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'reconciled_by') THEN
        ALTER TABLE payments ADD COLUMN reconciled_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Index tối ưu tốc độ báo cáo tài chính đa chi nhánh theo mốc ngày
CREATE INDEX IF NOT EXISTS idx_payments_report ON payments (branch_id, created_at, payment_type, reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_sales_report ON sales (branch_id, created_at, status);

-- -----------------------------------------------------------------------------
-- 2. RPC TRUY VẤN BÁO CÁO BÁN HÀNG & DÒNG TIỀN ĐA CHI NHÁNH (P7.1 BI ANALYTICS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_sales_and_cashflow_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL, -- NULL = toàn chuỗi thuộc org
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_payment_method VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Mốc thời gian chính xác theo múi giờ Việt Nam (00:00:00 của start_date đến 23:59:59.999 của end_date)
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_end_ts TIMESTAMPTZ := (p_end_date::TEXT || ' 23:59:59.999+07')::TIMESTAMPTZ;

    v_sales_summary JSONB;
    v_cashflow_summary JSONB;
    v_method_breakdown JSONB;
    v_earned_summary JSONB;
    v_invoices_drilldown JSONB;
    v_payments_drilldown JSONB;
BEGIN
    -- 1. TỔNG HỢP GIÁ TRỊ BÁN HÀNG TRÊN HÓA ĐƠN (SALES INVOICING KPI)
    -- Không duplicate khi hóa đơn có nhiều item; tính chuẩn Gross, Discount, Net, Debt & Package
    SELECT jsonb_build_object(
        'gross_sales', COALESCE(SUM(inv.total_amount + inv.discount_amount), 0),
        'total_discount', COALESCE(SUM(inv.discount_amount), 0),
        'net_invoiced_sales', COALESCE(SUM(inv.total_amount), 0),
        'invoice_count', COUNT(inv.id),
        'avg_order_value', CASE WHEN COUNT(inv.id) > 0 THEN ROUND(COALESCE(SUM(inv.total_amount), 0) / COUNT(inv.id)) ELSE 0 END,
        'new_customer_debt', COALESCE(SUM(GREATEST(0, inv.total_amount - inv.paid_amount)), 0),
        'package_course_sales', COALESCE(
            (
                SELECT SUM(si.line_total)
                FROM sale_items si
                JOIN sales s2 ON s2.id = si.sale_id
                WHERE s2.organization_id = p_org_id
                  AND (p_branch_id IS NULL OR s2.branch_id = p_branch_id)
                  AND s2.created_at BETWEEN v_start_ts AND v_end_ts
                  AND s2.status <> 'cancelled'
                  AND si.item_type = 'package'
            ), 0)
    ) INTO v_sales_summary
    FROM sales inv
    WHERE inv.organization_id = p_org_id
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
      AND inv.created_at BETWEEN v_start_ts AND v_end_ts
      AND inv.status <> 'cancelled';

    -- 2. TỔNG HỢP DÒNG TIỀN THỰC TẾ & ĐỐI SOÁT (CASHFLOW & SETTLEMENT KPI)
    -- Lọc theo thời điểm phát sinh phiếu thu/chi thực tế
    SELECT jsonb_build_object(
        'confirmed_cash_collected', COALESCE(SUM(CASE 
            WHEN p.payment_type IN ('sale', 'debt_collection', 'deposit') 
                 AND p.payment_method IN ('cash', 'transfer_vietqr', 'card')
                 AND p.reconciliation_status = 'confirmed' 
            THEN p.amount ELSE 0 END), 0),
        'pending_bank_transfers', COALESCE(SUM(CASE 
            WHEN p.payment_type IN ('sale', 'deposit', 'debt_collection') 
                 AND p.payment_method = 'transfer_vietqr'
                 AND p.reconciliation_status = 'pending_reconciliation' 
            THEN p.amount ELSE 0 END), 0),
        'new_deposits_collected', COALESCE(SUM(CASE 
            WHEN p.payment_type = 'deposit' AND p.reconciliation_status = 'confirmed' 
            THEN p.amount ELSE 0 END), 0),
        'deposit_redeemed', COALESCE(SUM(CASE 
            WHEN p.payment_method = 'deposit_credit' 
            THEN p.amount ELSE 0 END), 0),
        'debt_recovered', COALESCE(SUM(CASE 
            WHEN p.payment_type = 'debt_collection' AND p.reconciliation_status = 'confirmed' 
            THEN p.amount ELSE 0 END), 0),
        'total_refunds_paid', COALESCE(SUM(CASE 
            WHEN p.payment_type = 'refund' 
            THEN p.amount ELSE 0 END), 0),
        'net_sales_cashflow', COALESCE(SUM(CASE 
            WHEN p.payment_type IN ('sale', 'debt_collection', 'deposit') 
                 AND p.payment_method IN ('cash', 'transfer_vietqr', 'card')
                 AND p.reconciliation_status = 'confirmed' 
            THEN p.amount 
            WHEN p.payment_type = 'refund' 
            THEN -p.amount 
            ELSE 0 END), 0)
    ) INTO v_cashflow_summary
    FROM payments p
    WHERE p.organization_id = p_org_id
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
      AND p.created_at BETWEEN v_start_ts AND v_end_ts;

    -- 3. CƠ CẤU PHƯƠNG THỨC THANH TOÁN (PAYMENT METHOD BREAKDOWN)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'payment_method', mb.payment_method,
                'total_amount', mb.total_amount,
                'transaction_count', mb.transaction_count
            )
        ), '[]'::jsonb
    ) INTO v_method_breakdown
    FROM (
        SELECT 
            p.payment_method,
            SUM(p.amount) AS total_amount,
            COUNT(*) AS transaction_count
        FROM payments p
        WHERE p.organization_id = p_org_id
          AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
          AND p.created_at BETWEEN v_start_ts AND v_end_ts
          AND p.payment_type IN ('sale', 'deposit', 'debt_collection')
          AND p.reconciliation_status = 'confirmed'
        GROUP BY p.payment_method
    ) mb;

    -- 4. DOANH THU THỰC HIỆN DỊCH VỤ / TRỪ THẺ LIỆU TRÌNH (EARNED REVENUE)
    SELECT jsonb_build_object(
        'total_sessions_performed', COALESCE(SUM(sd.sessions_deducted), 0),
        'earned_session_revenue', COALESCE(SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * s.total_amount)), 0)
    ) INTO v_earned_summary
    FROM session_deductions sd
    JOIN customer_courses cc ON cc.id = sd.course_id
    LEFT JOIN sales s ON s.id = cc.sale_id
    WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
      AND sd.performed_at BETWEEN v_start_ts AND v_end_ts;

    -- 5. DANH SÁCH CHỨNG TỪ HÓA ĐƠN DRILL-DOWN (TOP 100 CHI TIẾT)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'invoice_number', s.invoice_number,
                'branch_id', s.branch_id,
                'branch_name', b.name,
                'customer_name', c.full_name,
                'customer_phone', c.phone,
                'total_amount', s.total_amount,
                'paid_amount', s.paid_amount,
                'debt_amount', GREATEST(0, s.total_amount - s.paid_amount),
                'status', s.status,
                'created_at', s.created_at
            )
            ORDER BY s.created_at DESC
        ), '[]'::jsonb
    ) INTO v_invoices_drilldown
    FROM (
        SELECT s.* FROM sales s
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at BETWEEN v_start_ts AND v_end_ts
          AND s.status <> 'cancelled'
        ORDER BY s.created_at DESC
        LIMIT 100
    ) s
    JOIN branches b ON b.id = s.branch_id
    JOIN customers c ON c.id = s.customer_id;

    -- 6. DANH SÁCH CHỨNG TỪ PHIẾU THU/CHI DRILL-DOWN (TOP 100 CHI TIẾT)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'payment_number', p.payment_number,
                'branch_id', p.branch_id,
                'branch_name', b.name,
                'customer_name', c.full_name,
                'amount', p.amount,
                'payment_method', p.payment_method,
                'payment_type', p.payment_type,
                'reconciliation_status', p.reconciliation_status,
                'note', p.note,
                'created_at', p.created_at
            )
            ORDER BY p.created_at DESC
        ), '[]'::jsonb
    ) INTO v_payments_drilldown
    FROM (
        SELECT p.* FROM payments p
        WHERE p.organization_id = p_org_id
          AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
          AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
          AND p.created_at BETWEEN v_start_ts AND v_end_ts
        ORDER BY p.created_at DESC
        LIMIT 100
    ) p
    JOIN branches b ON b.id = p.branch_id
    JOIN customers c ON c.id = p.customer_id;


    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'timezone', 'Asia/Ho_Chi_Minh (UTC+7)'
        ),
        'sales_summary', v_sales_summary,
        'cashflow_summary', v_cashflow_summary,
        'method_breakdown', v_method_breakdown,
        'earned_summary', v_earned_summary,
        'invoices_drilldown', v_invoices_drilldown,
        'payments_drilldown', v_payments_drilldown
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_sales_and_cashflow_report(UUID, UUID, DATE, DATE, VARCHAR) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. RPC TẠO DỮ LIỆU KIỂM THỬ TỰ ĐỘNG CHO P7.1 BI ANALYTICS (E2E TEST HELPER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_test_p7_1_scenarios(
    p_org_id UUID,
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cust_id UUID;
    v_sale_id UUID;
    v_inv_no VARCHAR(100);
BEGIN
    SELECT id INTO v_cust_id FROM customers WHERE organization_id = p_org_id LIMIT 1;
    IF v_cust_id IS NULL THEN
        INSERT INTO customers (organization_id, primary_branch_id, full_name, phone)
        VALUES (p_org_id, p_branch_id, 'Khách Kiểm Thử BI P7.1', '0988776655')
        RETURNING id INTO v_cust_id;
    END IF;

    -- 2. Tạo Đơn Hàng Test (Subtotal 2tr, giảm 200k, Net 1.8tr, Đã thanh toán 1tr, nợ 800k)
    v_inv_no := 'TEST-INV-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT;
    INSERT INTO sales (
        organization_id, branch_id, customer_id, invoice_number, 
        subtotal, discount_amount, total_amount, paid_amount, 
        status, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, v_inv_no, 
        2000000, 200000, 1800000, 1000000, 
        'partial', NOW()
    )
    RETURNING id INTO v_sale_id;

    -- Ghi dòng hàng gói liệu trình
    INSERT INTO sale_items (
        sale_id, item_type, item_ref_id, item_name, 
        quantity, unit_price, line_discount, line_total
    )
    VALUES (
        v_sale_id, 'package', '00000000-0000-0000-0000-000000000001', 'Gói Trị Liệu Trẻ Hóa 10 Buổi Test', 
        1, 2000000, 200000, 1800000
    );

    -- 3. Ghi phiếu thu tiền mặt đã xác nhận (1,000,000đ)
    INSERT INTO payments (
        organization_id, branch_id, customer_id, payment_number, 
        amount, payment_method, payment_type, reconciliation_status, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, 'PT-TEST-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT, 
        1000000, 'cash', 'sale', 'confirmed', NOW()
    );

    -- 4. Ghi giao dịch QR chờ xác nhận (500,000đ - Pending)
    INSERT INTO payments (
        organization_id, branch_id, customer_id, payment_number, 
        amount, payment_method, payment_type, reconciliation_status, note, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, 'QR-TEST-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT, 
        500000, 'transfer_vietqr', 'sale', 'pending_reconciliation', 'Khách quét QR chờ ngân hàng', NOW()
    );

    -- 5. Ghi nhận cọc mới (300,000đ)
    INSERT INTO payments (
        organization_id, branch_id, customer_id, payment_number, 
        amount, payment_method, payment_type, reconciliation_status, note, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, 'PC-TEST-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT, 
        300000, 'cash', 'deposit', 'confirmed', 'Khách nạp cọc mới', NOW()
    );

    -- 6. Ghi nhận cọc cũ cấn trừ (300,000đ)
    INSERT INTO payments (
        organization_id, branch_id, customer_id, payment_number, 
        amount, payment_method, payment_type, reconciliation_status, note, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, 'CT-TEST-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT, 
        300000, 'deposit_credit', 'sale', 'confirmed', 'Cấn trừ cọc vào đơn', NOW()
    );

    -- 7. Ghi nhận thu nợ cũ (400,000đ)
    INSERT INTO payments (
        organization_id, branch_id, customer_id, payment_number, 
        amount, payment_method, payment_type, reconciliation_status, note, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, 'TN-TEST-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT, 
        400000, 'cash', 'debt_collection', 'confirmed', 'Thu nợ hóa đơn trước', NOW()
    );

    -- 8. Ghi nhận hoàn tiền (150,000đ)
    INSERT INTO payments (
        organization_id, branch_id, customer_id, payment_number, 
        amount, payment_method, payment_type, reconciliation_status, note, created_at
    )
    VALUES (
        p_org_id, p_branch_id, v_cust_id, 'HT-TEST-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT, 
        150000, 'cash', 'refund', 'confirmed', 'Hoàn tiền khách hủy dịch vụ', NOW()
    );

    -- Gọi lại hàm báo cáo và trả về toàn bộ kết quả
    RETURN rpc_get_sales_and_cashflow_report(p_org_id, p_branch_id, CURRENT_DATE, CURRENT_DATE);
END;
$$;


GRANT EXECUTE ON FUNCTION rpc_test_p7_1_scenarios(UUID, UUID) TO authenticated, anon;




-- -----------------------------------------------------------------------------
-- FILE: 025_p7_2_cogs_bom_and_gross_profit.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 025: BI & ANALYTICS PHASE P7.2 — COGS, SERVICE BOM & DIRECT CONTRIBUTION
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG ĐỊNH MỨC VẬT TƯ TIÊU HAO THEO DỊCH VỤ (SERVICE_BOMS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_boms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    standard_quantity NUMERIC(10, 3) NOT NULL CHECK (standard_quantity > 0),
    unit_of_measure VARCHAR(50) NOT NULL, -- e.g. 'ml', 'gram', 'mieng', 'ong', 'tuyp'
    conversion_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0 CHECK (conversion_rate > 0), -- Tỷ lệ quy đổi ra đơn vị kho cơ sở
    version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_active_bom_item UNIQUE (service_id, product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_service_bom_service ON service_boms (service_id, is_active);

ALTER TABLE service_boms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_service_boms_all ON service_boms;
CREATE POLICY rls_service_boms_all ON service_boms FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. SỔ CÁI TIÊU HAO VẬT TƯ THỰC TẾ THEO CA DỊCH VỤ (SESSION_MATERIAL_USAGES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_material_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    session_deduction_id UUID REFERENCES session_deductions(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    standard_quantity NUMERIC(10, 3) NOT NULL DEFAULT 0,
    actual_quantity NUMERIC(10, 3) NOT NULL CHECK (actual_quantity > 0),
    unit_of_measure VARCHAR(50) NOT NULL,
    base_quantity_deducted NUMERIC(10, 3) NOT NULL CHECK (base_quantity_deducted > 0),
    cost_price_snapshot BIGINT NOT NULL DEFAULT 0, -- Snapshot giá vốn tại thời điểm xuất dùng
    is_missing_cost_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
    performer_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'adjusted', 'reversed'
    notes TEXT,
    used_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_material_usage_service_date ON session_material_usages (branch_id, used_at, service_id);

ALTER TABLE session_material_usages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_session_material_usages_all ON session_material_usages;
CREATE POLICY rls_session_material_usages_all ON session_material_usages FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. RPC XUẤT TIÊU HAO VẬT TƯ CHO CA DỊCH VỤ (ATOMIC USAGE & STOCK DEDUCTION)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_record_service_material_usage(
    p_org_id UUID,
    p_branch_id UUID,
    p_service_id UUID,
    p_staff_id UUID,
    p_session_deduction_id UUID DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB, -- [{ product_id, actual_quantity, unit_of_measure, lot_number }]
    p_idempotency_key VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item RECORD;
    v_stock RECORD;
    v_bom RECORD;
    v_conversion_rate NUMERIC(10, 4);
    v_base_qty NUMERIC(10, 3);
    v_unit_cost BIGINT;
    v_is_missing_cost BOOLEAN := FALSE;
    v_usage_id UUID;
    v_inserted_count INT := 0;
    v_total_cost BIGINT := 0;
BEGIN
    -- Kiểm tra Idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM session_material_usages WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'is_duplicate', TRUE,
                'message', 'Giao dịch xuất vật tư đã được ghi nhận trước đó (Idempotent replay).'
            );
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Danh sách vật tư tiêu hao trống.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        actual_quantity NUMERIC,
        unit_of_measure VARCHAR,
        lot_number VARCHAR
    )
    LOOP
        IF v_item.actual_quantity <= 0 THEN
            RAISE EXCEPTION 'Số lượng vật tư tiêu hao phải lớn hơn 0 (Sản phẩm: %)', v_item.product_id;
        END IF;

        -- Tìm định mức và hệ số quy đổi
        SELECT * INTO v_bom
        FROM service_boms
        WHERE organization_id = p_org_id 
          AND service_id = p_service_id 
          AND product_id = v_item.product_id 
          AND is_active = TRUE
        ORDER BY effective_from DESC
        LIMIT 1;

        v_conversion_rate := COALESCE(v_bom.conversion_rate, 1.0);
        v_base_qty := ROUND(v_item.actual_quantity * v_conversion_rate, 3);

        -- Khóa bản ghi tồn kho để chống âm kho và lấy snapshot giá vốn
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE organization_id = p_org_id AND branch_id = p_branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Vật tư chưa được khởi tạo kho tại chi nhánh này (ID: %)', v_item.product_id;
        END IF;

        IF v_stock.stock_on_hand < CEIL(v_base_qty) THEN
            RAISE EXCEPTION 'Không đủ tồn kho khả dụng để xuất vật tư. Tồn hiện tại: %, Cần xuất: %', v_stock.stock_on_hand, v_base_qty;
        END IF;

        v_unit_cost := v_stock.cost_price;
        IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
            v_is_missing_cost := TRUE;
            v_unit_cost := 0;
        END IF;

        -- Trừ tồn kho cơ sở
        UPDATE inventory_stocks
        SET stock_on_hand = stock_on_hand - CEIL(v_base_qty),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_stock.id;

        -- Ghi sổ cái tiêu hao vật tư
        INSERT INTO session_material_usages (
            organization_id, branch_id, service_id, session_deduction_id,
            sale_id, appointment_id, product_id, lot_number,
            standard_quantity, actual_quantity, unit_of_measure,
            base_quantity_deducted, cost_price_snapshot, is_missing_cost_snapshot,
            performer_staff_id, idempotency_key, notes, used_at
        ) VALUES (
            p_org_id, p_branch_id, p_service_id, p_session_deduction_id,
            p_sale_id, p_appointment_id, v_item.product_id, v_item.lot_number,
            COALESCE(v_bom.standard_quantity, 0), v_item.actual_quantity, COALESCE(v_item.unit_of_measure, 'don_vi'),
            v_base_qty, v_unit_cost, v_is_missing_cost,
            p_staff_id, p_idempotency_key, p_notes, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_usage_id;

        -- Ghi sổ cái xuất kho (consumable_out)
        INSERT INTO inventory_transactions (
            organization_id, branch_id, product_id, transaction_type,
            reference_id, quantity_change, stock_before, stock_after,
            notes, actor_staff_id, created_at
        ) VALUES (
            p_org_id, p_branch_id, v_item.product_id, 'consumable_out',
            v_usage_id, -CEIL(v_base_qty), v_stock.stock_on_hand, v_stock.stock_on_hand - CEIL(v_base_qty),
            COALESCE(p_notes, 'Xuất vật tư ca dịch vụ'), p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        v_inserted_count := v_inserted_count + 1;
        v_total_cost := v_total_cost + ROUND(v_base_qty * v_unit_cost);
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'items_deducted', v_inserted_count,
        'total_material_cost', v_total_cost,
        'message', 'Đã ghi nhận tiêu hao vật tư và trừ tồn kho thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_service_material_usage(UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, TEXT) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. RPC BÁO CÁO GIÁ VỐN & CHÊNH LỆCH LỢI NHUẬN TRỰC TIẾP (P7.2 ANALYTICS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_cogs_and_gross_profit_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_service_id UUID DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Ranh giới nửa khoảng mở chính xác múi giờ VN [start_ts, next_day_ts)
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    -- KPI Tổng Hợp
    v_total_recognized_revenue BIGINT := 0;
    v_total_cogs_products BIGINT := 0;
    v_total_material_cost BIGINT := 0;
    v_total_direct_commission BIGINT := 0;
    v_direct_contribution BIGINT := 0;
    v_margin_pct NUMERIC(5, 2) := NULL;
    v_missing_cost_warning_count INT := 0;

    v_summary JSONB;
    v_service_breakdown JSONB;
    v_variance_breakdown JSONB;
    v_drilldown_items JSONB;
    v_total_records INT := 0;
BEGIN
    -- 1. TỔNG HỢP DOANH THU THỰC HIỆN DỊCH VỤ & SẢN PHẨM BÁN LẺ
    -- A. Doanh thu Sản phẩm bán lẻ trong kỳ (kèm giá vốn snapshot)
    SELECT 
        COALESCE(SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0))))), 0),
        COALESCE(SUM(si.quantity * si.cost_price_snapshot), 0),
        COALESCE(SUM(CASE WHEN si.cost_price_snapshot = 0 THEN 1 ELSE 0 END), 0)
    INTO v_total_recognized_revenue, v_total_cogs_products, v_missing_cost_warning_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND s.status <> 'cancelled'
      AND si.item_type = 'product';

    -- B. Doanh thu Dịch vụ lẻ làm ngay
    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0)))))
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
          AND s.status <> 'cancelled'
          AND si.item_type = 'service'
          AND (p_service_id IS NULL OR si.item_ref_id = p_service_id)
    ), 0);

    -- C. Doanh thu Trừ buổi Liệu trình thực tế
    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(s.total_amount, 0)))
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales s ON s.id = cc.sale_id
        WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
          AND (p_service_id IS NULL OR cc.service_id = p_service_id)
    ), 0);

    -- 2. TỔNG HỢP CHI PHÍ VẬT TƯ TIÊU HAO THỰC TẾ
    SELECT 
        COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0),
        COALESCE(SUM(CASE WHEN smu.is_missing_cost_snapshot THEN 1 ELSE 0 END), 0)
    INTO v_total_material_cost, v_missing_cost_warning_count
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND smu.status = 'confirmed'
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    -- 3. TỔNG HỢP HOA HỒNG TRỰC TIẾP (Eligible, Approved, Paid)
    SELECT COALESCE(SUM(cr.final_commission), 0)
    INTO v_total_direct_commission
    FROM commission_records cr
    WHERE cr.organization_id = p_org_id
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
      AND cr.occurred_at >= v_start_ts AND cr.occurred_at < v_next_day_ts
      AND cr.status IN ('eligible', 'approved', 'paid');

    -- 4. TÍNH CHÊNH LỆCH TRỰC TIẾP & TỶ SUẤT %
    v_direct_contribution := v_total_recognized_revenue - (v_total_cogs_products + v_total_material_cost + v_total_direct_commission);
    
    IF v_total_recognized_revenue > 0 THEN
        v_margin_pct := ROUND((v_direct_contribution::NUMERIC / v_total_recognized_revenue) * 100, 2);
    ELSE
        v_margin_pct := NULL; -- Trả về null khi doanh thu = 0
    END IF;

    v_summary := jsonb_build_object(
        'recognized_revenue', v_total_recognized_revenue,
        'cogs_products', v_total_cogs_products,
        'material_cost', v_total_material_cost,
        'direct_commission', v_total_direct_commission,
        'direct_contribution', v_direct_contribution,
        'margin_pct', v_margin_pct,
        'missing_cost_warning_count', v_missing_cost_warning_count,
        'disclaimer', 'Chênh lệch trực tiếp sau giá vốn, vật tư và hoa hồng (chưa bao gồm chi phí khấu hao máy móc, tiền điện, mặt bằng và lương cứng).'
    );

    -- 5. PHÂN TÍCH THEO DỊCH VỤ (SERVICE BREAKDOWN)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'service_id', sb.service_id,
                'service_name', sb.service_name,
                'category', sb.category,
                'session_count', sb.session_count,
                'recognized_revenue', sb.revenue,
                'material_cost', sb.material_cost,
                'direct_contribution', (sb.revenue - sb.material_cost),
                'margin_pct', CASE WHEN sb.revenue > 0 THEN ROUND(((sb.revenue - sb.material_cost)::NUMERIC / sb.revenue) * 100, 2) ELSE NULL END
            )
        ), '[]'::jsonb
    ) INTO v_service_breakdown
    FROM (
        SELECT 
            s.id AS service_id,
            s.name AS service_name,
            s.category,
            COUNT(DISTINCT sd.id) AS session_count,
            COALESCE(SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0))), 0) AS revenue,
            COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0) AS material_cost
        FROM services s
        LEFT JOIN session_deductions sd ON sd.course_id IN (SELECT id FROM customer_courses WHERE service_id = s.id)
            AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
            AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
        LEFT JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales sa ON sa.id = cc.sale_id
        LEFT JOIN session_material_usages smu ON smu.session_deduction_id = sd.id
        WHERE s.organization_id = p_org_id
          AND (p_service_id IS NULL OR s.id = p_service_id)
          AND (p_category IS NULL OR s.category = p_category)
        GROUP BY s.id, s.name, s.category
        HAVING COUNT(DISTINCT sd.id) > 0 OR SUM(smu.base_quantity_deducted) > 0
    ) sb;

    -- 6. PHÂN TÍCH 5 LOẠI CHÊNH LỆCH VẬT TƯ & TỒN KHO
    SELECT jsonb_build_object(
        'bom_variance', COALESCE((
            SELECT SUM(ROUND((smu.actual_quantity - smu.standard_quantity) * smu.cost_price_snapshot))
            FROM session_material_usages smu
            WHERE smu.organization_id = p_org_id
              AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
              AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
        ), 0),
        'audit_shrinkage', COALESCE((
            SELECT SUM(it.quantity_change * it.cost_before)
            FROM (
                SELECT it.*, COALESCE(s.cost_price, 0) AS cost_before 
                FROM inventory_transactions it
                JOIN inventory_stocks s ON s.branch_id = it.branch_id AND s.product_id = it.product_id
                WHERE it.organization_id = p_org_id 
                  AND (p_branch_id IS NULL OR it.branch_id = p_branch_id)
                  AND it.transaction_type = 'audit_adjustment'
                  AND it.created_at >= v_start_ts AND it.created_at < v_next_day_ts
            ) it
        ), 0),
        'damaged_expired_loss', 0,
        'transfer_variance', 0,
        'unassigned_usage', 0
    ) INTO v_variance_breakdown;

    -- 7. DANH SÁCH CHI TIẾT DRILL-DOWN CÓ PHÂN TRANG PHÍA SERVER
    SELECT COUNT(*) INTO v_total_records
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', d.id,
                'used_at', d.used_at,
                'branch_name', d.branch_name,
                'service_name', d.service_name,
                'product_name', d.product_name,
                'standard_qty', d.standard_quantity,
                'actual_qty', d.actual_quantity,
                'unit', d.unit_of_measure,
                'cost_price_snapshot', d.cost_price_snapshot,
                'total_cost', ROUND(d.base_quantity_deducted * d.cost_price_snapshot),
                'is_missing_cost_snapshot', d.is_missing_cost_snapshot,
                'performer_name', d.performer_name,
                'notes', d.notes
            )
            ORDER BY d.used_at DESC
        ), '[]'::jsonb
    ) INTO v_drilldown_items
    FROM (
        SELECT 
            smu.*,
            b.name AS branch_name,
            s.name AS service_name,
            p.name AS product_name,
            st.full_name AS performer_name
        FROM session_material_usages smu
        JOIN branches b ON b.id = smu.branch_id
        JOIN services s ON s.id = smu.service_id
        JOIN products p ON p.id = smu.product_id
        LEFT JOIN staff_profiles st ON st.id = smu.performer_staff_id
        WHERE smu.organization_id = p_org_id
          AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
          AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
          AND (p_service_id IS NULL OR smu.service_id = p_service_id)
        ORDER BY smu.used_at DESC
        LIMIT v_limit OFFSET v_offset
    ) d;

    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'timezone', 'Asia/Ho_Chi_Minh (UTC+7)'
        ),
        'summary', v_summary,
        'service_breakdown', v_service_breakdown,
        'variance_breakdown', v_variance_breakdown,
        'drilldown', jsonb_build_object(
            'total_records', v_total_records,
            'page', p_page,
            'page_size', p_page_size,
            'items', v_drilldown_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_cogs_and_gross_profit_report(UUID, UUID, DATE, DATE, UUID, VARCHAR, INT, INT) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 026_p7_2_cogs_bom_and_variance_refinement.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 026: P7.2 REFINEMENT — FRACTIONAL BOM STOCKS, EXACT VARIANCE & REVENUE APPORTIONMENT
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NÂNG CẤP KIỂU DỮ LIỆU TỒN KHO HỖ TRỢ ĐƠN VỊ LẺ (NUMERIC 12, 3)
-- -----------------------------------------------------------------------------
ALTER TABLE inventory_stocks 
ALTER COLUMN stock_on_hand TYPE NUMERIC(12, 3) USING stock_on_hand::NUMERIC(12, 3);

ALTER TABLE inventory_transactions 
ALTER COLUMN quantity_change TYPE NUMERIC(12, 3) USING quantity_change::NUMERIC(12, 3),
ALTER COLUMN stock_before TYPE NUMERIC(12, 3) USING stock_before::NUMERIC(12, 3),
ALTER COLUMN stock_after TYPE NUMERIC(12, 3) USING stock_after::NUMERIC(12, 3);

-- Bổ sung hash payload vào session_material_usages để chống cùng key nhưng khác nội dung
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_material_usages' AND column_name = 'payload_hash') THEN
        ALTER TABLE session_material_usages ADD COLUMN payload_hash VARCHAR(64);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. CẬP NHẬT RPC XUẤT VẬT TƯ TIÊU HAO CHÍNH XÁC (RPC_RECORD_SERVICE_MATERIAL_USAGE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_record_service_material_usage(
    p_org_id UUID,
    p_branch_id UUID,
    p_service_id UUID,
    p_staff_id UUID,
    p_session_deduction_id UUID DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_idempotency_key VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item RECORD;
    v_stock RECORD;
    v_bom RECORD;
    v_conversion_rate NUMERIC(10, 4);
    v_base_qty NUMERIC(12, 3);
    v_unit_cost BIGINT;
    v_is_missing_cost BOOLEAN := FALSE;
    v_usage_id UUID;
    v_inserted_count INT := 0;
    v_total_cost BIGINT := 0;
    v_current_hash VARCHAR(64);
    v_existing_usage RECORD;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Danh sách vật tư tiêu hao trống.');
    END IF;

    v_current_hash := md5(p_items::TEXT || COALESCE(p_service_id::TEXT, '') || COALESCE(p_branch_id::TEXT, ''));

    -- Kiểm tra Idempotency chặt chẽ
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, payload_hash, status INTO v_existing_usage
        FROM session_material_usages
        WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            IF v_existing_usage.payload_hash IS NOT NULL AND v_existing_usage.payload_hash <> v_current_hash THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict', TRUE,
                    'message', 'Lỗi xung đột Idempotency Key: Cùng một khóa nhưng nội dung giao dịch khác nhau.'
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', TRUE,
                    'is_duplicate', TRUE,
                    'message', 'Giao dịch xuất vật tư đã được ghi nhận trước đó (Idempotent replay).'
                );
            END IF;
        END IF;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        actual_quantity NUMERIC,
        unit_of_measure VARCHAR,
        lot_number VARCHAR
    )
    LOOP
        IF v_item.actual_quantity <= 0 THEN
            RAISE EXCEPTION 'Số lượng vật tư tiêu hao phải lớn hơn 0 (Sản phẩm: %)', v_item.product_id;
        END IF;

        -- Tìm định mức và hệ số quy đổi
        SELECT * INTO v_bom
        FROM service_boms
        WHERE organization_id = p_org_id 
          AND service_id = p_service_id 
          AND product_id = v_item.product_id 
          AND is_active = TRUE
        ORDER BY effective_from DESC
        LIMIT 1;

        v_conversion_rate := COALESCE(v_bom.conversion_rate, 1.0);
        v_base_qty := ROUND(v_item.actual_quantity * v_conversion_rate, 3);

        -- Khóa tồn kho để trừ chính xác
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE organization_id = p_org_id AND branch_id = p_branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Vật tư chưa được khởi tạo kho tại chi nhánh này (ID: %)', v_item.product_id;
        END IF;

        IF v_stock.stock_on_hand < v_base_qty THEN
            RAISE EXCEPTION 'Không đủ tồn kho khả dụng để xuất vật tư. Tồn hiện tại: %, Cần xuất: %', v_stock.stock_on_hand, v_base_qty;
        END IF;

        v_unit_cost := v_stock.cost_price;
        IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
            v_is_missing_cost := TRUE;
            v_unit_cost := 0;
        END IF;

        -- Trừ kho chính xác theo số lượng lẻ (không làm tròn CEIL gây sai lệch 10 lần)
        UPDATE inventory_stocks
        SET stock_on_hand = stock_on_hand - v_base_qty,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_stock.id;

        -- Ghi sổ cái tiêu hao vật tư
        INSERT INTO session_material_usages (
            organization_id, branch_id, service_id, session_deduction_id,
            sale_id, appointment_id, product_id, lot_number,
            standard_quantity, actual_quantity, unit_of_measure,
            base_quantity_deducted, cost_price_snapshot, is_missing_cost_snapshot,
            performer_staff_id, idempotency_key, payload_hash, notes, used_at
        ) VALUES (
            p_org_id, p_branch_id, p_service_id, p_session_deduction_id,
            p_sale_id, p_appointment_id, v_item.product_id, v_item.lot_number,
            COALESCE(v_bom.standard_quantity, 0), v_item.actual_quantity, COALESCE(v_item.unit_of_measure, 'don_vi'),
            v_base_qty, v_unit_cost, v_is_missing_cost,
            p_staff_id, p_idempotency_key, v_current_hash, p_notes, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_usage_id;

        -- Ghi sổ cái xuất kho (consumable_out)
        INSERT INTO inventory_transactions (
            organization_id, branch_id, product_id, transaction_type,
            reference_id, quantity_change, stock_before, stock_after,
            notes, actor_staff_id, created_at
        ) VALUES (
            p_org_id, p_branch_id, v_item.product_id, 'consumable_out',
            v_usage_id, -v_base_qty, v_stock.stock_on_hand, v_stock.stock_on_hand - v_base_qty,
            COALESCE(p_notes, 'Xuất vật tư ca dịch vụ'), p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        v_inserted_count := v_inserted_count + 1;
        v_total_cost := v_total_cost + ROUND(v_base_qty * v_unit_cost);
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'items_deducted', v_inserted_count,
        'total_material_cost', v_total_cost,
        'message', 'Đã ghi nhận tiêu hao vật tư và trừ tồn kho thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. CẬP NHẬT BÁO CÁO GIÁ VỐN, ĐỊNH MỨC & CHÊNH LỆCH LỢI NHUẬN TRỰC TIẾP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_cogs_and_gross_profit_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_service_id UUID DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    v_total_recognized_revenue BIGINT := 0;
    v_total_cogs_products BIGINT := 0;
    v_total_material_cost BIGINT := 0;
    v_total_direct_commission BIGINT := 0;
    v_direct_contribution BIGINT := 0;
    v_margin_pct NUMERIC(5, 2) := NULL;
    v_missing_cost_warning_count INT := 0;

    v_summary JSONB;
    v_service_breakdown JSONB;
    v_variance_breakdown JSONB;
    v_drilldown_items JSONB;
    v_total_records INT := 0;
BEGIN
    -- 1. TỔNG HỢP DOANH THU THỰC HIỆN & GIÁ VỐN SẢN PHẨM
    -- A. Sản phẩm bán lẻ trong kỳ (Phân bổ chiết khấu cấp hóa đơn theo dòng)
    SELECT 
        COALESCE(SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0))))), 0),
        COALESCE(SUM(si.quantity * si.cost_price_snapshot), 0),
        COALESCE(SUM(CASE WHEN si.cost_price_snapshot = 0 THEN 1 ELSE 0 END), 0)
    INTO v_total_recognized_revenue, v_total_cogs_products, v_missing_cost_warning_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND s.status <> 'cancelled'
      AND si.item_type = 'product';

    -- B. Dịch vụ lẻ làm ngay trong kỳ (Phân bổ chiết khấu)
    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0)))))
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
          AND s.status <> 'cancelled'
          AND si.item_type = 'service'
          AND (p_service_id IS NULL OR si.item_ref_id = p_service_id)
    ), 0);

    -- C. Doanh thu Trừ buổi Liệu trình thực tế tại chi nhánh phục vụ
    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(s.total_amount, 0)))
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales s ON s.id = cc.sale_id
        WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
          AND (p_service_id IS NULL OR cc.service_id = p_service_id)
    ), 0);

    -- 2. TỔNG HỢP CHI PHÍ VẬT TƯ TIÊU HAO THỰC TẾ
    SELECT 
        COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0),
        v_missing_cost_warning_count + COALESCE(SUM(CASE WHEN smu.is_missing_cost_snapshot THEN 1 ELSE 0 END), 0)
    INTO v_total_material_cost, v_missing_cost_warning_count
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND smu.status = 'confirmed'
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    -- 3. TỔNG HỢP HOA HỒNG TRỰC TIẾP
    SELECT COALESCE(SUM(cr.final_commission), 0)
    INTO v_total_direct_commission
    FROM commission_records cr
    WHERE cr.organization_id = p_org_id
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
      AND cr.occurred_at >= v_start_ts AND cr.occurred_at < v_next_day_ts
      AND cr.status IN ('eligible', 'approved', 'paid');

    -- 4. TÍNH CHÊNH LỆCH TRỰC TIẾP & TỶ SUẤT %
    v_direct_contribution := v_total_recognized_revenue - (v_total_cogs_products + v_total_material_cost + v_total_direct_commission);
    
    IF v_total_recognized_revenue > 0 THEN
        v_margin_pct := ROUND((v_direct_contribution::NUMERIC / v_total_recognized_revenue) * 100, 2);
    ELSE
        v_margin_pct := NULL;
    END IF;

    v_summary := jsonb_build_object(
        'recognized_revenue', v_total_recognized_revenue,
        'cogs_products', v_total_cogs_products,
        'material_cost', v_total_material_cost,
        'direct_commission', v_total_direct_commission,
        'direct_contribution', v_direct_contribution,
        'margin_pct', v_margin_pct,
        'missing_cost_warning_count', v_missing_cost_warning_count,
        'disclaimer', 'Chênh lệch trực tiếp sau giá vốn, vật tư và hoa hồng (chưa bao gồm chi phí khấu hao máy móc, tiền điện, mặt bằng và lương cứng).'
    );

    -- 5. PHÂN TÍCH THEO DỊCH VỤ
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'service_id', sb.service_id,
                'service_name', sb.service_name,
                'category', sb.category,
                'session_count', sb.session_count,
                'recognized_revenue', sb.revenue,
                'material_cost', sb.material_cost,
                'direct_contribution', (sb.revenue - sb.material_cost),
                'margin_pct', CASE WHEN sb.revenue > 0 THEN ROUND(((sb.revenue - sb.material_cost)::NUMERIC / sb.revenue) * 100, 2) ELSE NULL END
            )
        ), '[]'::jsonb
    ) INTO v_service_breakdown
    FROM (
        SELECT 
            s.id AS service_id,
            s.name AS service_name,
            s.category,
            COUNT(DISTINCT sd.id) AS session_count,
            COALESCE(SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0))), 0) AS revenue,
            COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0) AS material_cost
        FROM services s
        LEFT JOIN session_deductions sd ON sd.course_id IN (SELECT id FROM customer_courses WHERE service_id = s.id)
            AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
            AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
        LEFT JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales sa ON sa.id = cc.sale_id
        LEFT JOIN session_material_usages smu ON smu.session_deduction_id = sd.id
        WHERE s.organization_id = p_org_id
          AND (p_service_id IS NULL OR s.id = p_service_id)
          AND (p_category IS NULL OR s.category = p_category)
        GROUP BY s.id, s.name, s.category
        HAVING COUNT(DISTINCT sd.id) > 0 OR SUM(smu.base_quantity_deducted) > 0
    ) sb;

    -- 6. PHÂN TÍCH 5 LOẠI CHÊNH LỆCH VẬT TƯ & TỒN KHO (TÍNH ĐÚNG QUY ĐỔI ĐƠN VỊ)
    SELECT jsonb_build_object(
        'bom_variance', COALESCE((
            SELECT SUM(ROUND((smu.actual_quantity - smu.standard_quantity) * COALESCE(sb.conversion_rate, 1.0) * smu.cost_price_snapshot))
            FROM session_material_usages smu
            LEFT JOIN service_boms sb ON sb.service_id = smu.service_id AND sb.product_id = smu.product_id AND sb.is_active = TRUE
            WHERE smu.organization_id = p_org_id
              AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
              AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
        ), 0),
        'audit_shrinkage', COALESCE((
            SELECT SUM(it.quantity_change * it.cost_before)
            FROM (
                SELECT it.*, COALESCE(s.cost_price, 0) AS cost_before 
                FROM inventory_transactions it
                JOIN inventory_stocks s ON s.branch_id = it.branch_id AND s.product_id = it.product_id
                WHERE it.organization_id = p_org_id 
                  AND (p_branch_id IS NULL OR it.branch_id = p_branch_id)
                  AND it.transaction_type = 'audit_adjustment'
                  AND it.created_at >= v_start_ts AND it.created_at < v_next_day_ts
            ) it
        ), 0),
        'damaged_expired_loss', 0,
        'transfer_variance', 0,
        'unassigned_usage', 0
    ) INTO v_variance_breakdown;

    -- 7. DANH SÁCH CHI TIẾT DRILL-DOWN CÓ PHÂN TRANG
    SELECT COUNT(*) INTO v_total_records
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', d.id,
                'used_at', d.used_at,
                'branch_name', d.branch_name,
                'service_name', d.service_name,
                'product_name', d.product_name,
                'standard_qty', d.standard_quantity,
                'actual_qty', d.actual_quantity,
                'unit', d.unit_of_measure,
                'cost_price_snapshot', d.cost_price_snapshot,
                'total_cost', ROUND(d.base_quantity_deducted * d.cost_price_snapshot),
                'is_missing_cost_snapshot', d.is_missing_cost_snapshot,
                'performer_name', d.performer_name,
                'notes', d.notes
            )
            ORDER BY d.used_at DESC
        ), '[]'::jsonb
    ) INTO v_drilldown_items
    FROM (
        SELECT 
            smu.*,
            b.name AS branch_name,
            s.name AS service_name,
            p.name AS product_name,
            st.full_name AS performer_name
        FROM session_material_usages smu
        JOIN branches b ON b.id = smu.branch_id
        JOIN services s ON s.id = smu.service_id
        JOIN products p ON p.id = smu.product_id
        LEFT JOIN staff_profiles st ON st.id = smu.performer_staff_id
        WHERE smu.organization_id = p_org_id
          AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
          AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
          AND (p_service_id IS NULL OR smu.service_id = p_service_id)
        ORDER BY smu.used_at DESC
        LIMIT v_limit OFFSET v_offset
    ) d;

    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'timezone', 'Asia/Ho_Chi_Minh (UTC+7)'
        ),
        'summary', v_summary,
        'service_breakdown', v_service_breakdown,
        'variance_breakdown', v_variance_breakdown,
        'drilldown', jsonb_build_object(
            'total_records', v_total_records,
            'page', p_page,
            'page_size', p_page_size,
            'items', v_drilldown_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_service_material_usage(UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_cogs_and_gross_profit_report(UUID, UUID, DATE, DATE, UUID, VARCHAR, INT, INT) TO authenticated, anon;



-- -----------------------------------------------------------------------------
-- FILE: 027_p7_2_cogs_snapshot_hardening_and_rls.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 027: HARDENING SNAPSHOT QUY ĐỔI BOM, BẢO MẬT RLS & BẢO TOÀN SỔ CÁI
-- Phân hệ: P7.2 — Giá Vốn COGS, Định Mức Vật Tư & Phân Tích Lợi Nhuận Trực Tiếp
-- Yêu cầu tiên quyết: Đã áp dụng Migrations 001 - 026
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BỔ SUNG CỘT SNAPSHOT QUY ĐỔI VÀ PHIÊN BẢN BOM
-- -----------------------------------------------------------------------------
ALTER TABLE session_material_usages
    ADD COLUMN IF NOT EXISTS conversion_rate_snapshot NUMERIC(10, 4),
    ADD COLUMN IF NOT EXISTS bom_version_snapshot VARCHAR(50);

-- Backfill hệ số quy đổi snapshot từ dữ liệu sổ cái đã trừ kho thực tế
UPDATE session_material_usages
SET conversion_rate_snapshot = ROUND(base_quantity_deducted / NULLIF(actual_quantity, 0), 4),
    bom_version_snapshot = COALESCE(bom_version_snapshot, 'v1.0-historical')
WHERE conversion_rate_snapshot IS NULL;

ALTER TABLE session_material_usages
    ALTER COLUMN conversion_rate_snapshot SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. KHẮC PHỤC TRIỆT ĐỂ LỖ HỔNG BẢO MẬT RLS CHO SERVICE_BOMS VÀ SESSION_MATERIAL_USAGES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_service_boms_all ON service_boms;
DROP POLICY IF EXISTS rls_session_material_usages_all ON session_material_usages;
DROP POLICY IF EXISTS rls_service_boms_org_read ON service_boms;
DROP POLICY IF EXISTS rls_service_boms_admin_write ON service_boms;
DROP POLICY IF EXISTS rls_session_material_usages_org ON session_material_usages;
DROP POLICY IF EXISTS rls_session_material_usages_org_read ON session_material_usages;

ALTER TABLE service_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_material_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_service_boms_org_read ON service_boms
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

CREATE POLICY rls_service_boms_admin_write ON service_boms
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
    )
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
    );

CREATE POLICY rls_session_material_usages_org_read ON session_material_usages
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND has_branch_access(branch_id)
    );

-- -----------------------------------------------------------------------------
-- 3. CẬP NHẬT RPC GHI NHẬN TIÊU HAO VẬT TƯ (XÁC THỰC QUYỀN & SNAPSHOT ATOMIC)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_record_service_material_usage(
    p_org_id UUID,
    p_branch_id UUID,
    p_service_id UUID,
    p_staff_id UUID,
    p_session_deduction_id UUID DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_idempotency_key VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org UUID;
    v_item RECORD;
    v_bom RECORD;
    v_stock RECORD;
    v_usage_id UUID;
    v_conversion_rate NUMERIC(10, 4);
    v_bom_version VARCHAR(50);
    v_base_qty NUMERIC(12, 3);
    v_unit_cost BIGINT;
    v_is_missing_cost BOOLEAN := FALSE;
    v_inserted_count INT := 0;
    v_total_cost BIGINT := 0;
    v_existing_usage RECORD;
    v_current_hash VARCHAR(64);
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_org := get_current_user_org_id();
        IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này.';
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Danh sách vật tư tiêu hao trống.');
    END IF;

    v_current_hash := md5(p_items::TEXT || COALESCE(p_service_id::TEXT, '') || COALESCE(p_branch_id::TEXT, ''));

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, payload_hash, status INTO v_existing_usage
        FROM session_material_usages
        WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            IF v_existing_usage.payload_hash IS NOT NULL AND v_existing_usage.payload_hash <> v_current_hash THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict', TRUE,
                    'message', 'Lỗi xung đột Idempotency Key: Cùng một khóa nhưng nội dung giao dịch khác nhau.'
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', TRUE,
                    'is_duplicate', TRUE,
                    'message', 'Giao dịch xuất vật tư đã được ghi nhận trước đó (Idempotent replay).'
                );
            END IF;
        END IF;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        actual_quantity NUMERIC,
        unit_of_measure VARCHAR,
        lot_number VARCHAR
    )
    LOOP
        IF v_item.actual_quantity <= 0 THEN
            RAISE EXCEPTION 'Số lượng vật tư tiêu hao phải lớn hơn 0 (Sản phẩm: %)', v_item.product_id;
        END IF;

        SELECT * INTO v_bom
        FROM service_boms
        WHERE organization_id = p_org_id 
          AND service_id = p_service_id 
          AND product_id = v_item.product_id 
          AND is_active = TRUE
        ORDER BY effective_from DESC, created_at DESC
        LIMIT 1;

        v_conversion_rate := COALESCE(v_bom.conversion_rate, 1.0);
        v_bom_version := COALESCE(v_bom.version, 'v1.0-default');
        v_base_qty := ROUND(v_item.actual_quantity * v_conversion_rate, 3);

        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE organization_id = p_org_id AND branch_id = p_branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Vật tư chưa được khởi tạo kho tại chi nhánh này (ID: %)', v_item.product_id;
        END IF;

        IF v_stock.stock_on_hand < v_base_qty THEN
            RAISE EXCEPTION 'Không đủ tồn kho khả dụng để xuất vật tư. Tồn hiện tại: %, Cần xuất: %', v_stock.stock_on_hand, v_base_qty;
        END IF;

        v_unit_cost := v_stock.cost_price;
        IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
            v_is_missing_cost := TRUE;
            v_unit_cost := 0;
        END IF;

        UPDATE inventory_stocks
        SET stock_on_hand = stock_on_hand - v_base_qty,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_stock.id;

        INSERT INTO session_material_usages (
            organization_id, branch_id, service_id, session_deduction_id,
            sale_id, appointment_id, product_id, lot_number,
            standard_quantity, actual_quantity, unit_of_measure,
            conversion_rate_snapshot, bom_version_snapshot,
            base_quantity_deducted, cost_price_snapshot, is_missing_cost_snapshot,
            performer_staff_id, idempotency_key, payload_hash, notes, used_at
        ) VALUES (
            p_org_id, p_branch_id, p_service_id, p_session_deduction_id,
            p_sale_id, p_appointment_id, v_item.product_id, v_item.lot_number,
            COALESCE(v_bom.standard_quantity, 0), v_item.actual_quantity, COALESCE(v_item.unit_of_measure, 'don_vi'),
            v_conversion_rate, v_bom_version,
            v_base_qty, v_unit_cost, v_is_missing_cost,
            p_staff_id, p_idempotency_key, v_current_hash, p_notes, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_usage_id;

        INSERT INTO inventory_transactions (
            organization_id, branch_id, product_id, transaction_type,
            reference_id, quantity_change, stock_before, stock_after,
            notes, actor_staff_id, created_at
        ) VALUES (
            p_org_id, p_branch_id, v_item.product_id, 'consumable_out',
            v_usage_id, -v_base_qty, v_stock.stock_on_hand, v_stock.stock_on_hand - v_base_qty,
            COALESCE(p_notes, 'Xuất vật tư ca dịch vụ'), p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        v_inserted_count := v_inserted_count + 1;
        v_total_cost := v_total_cost + ROUND(v_base_qty * v_unit_cost);
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'items_deducted', v_inserted_count,
        'total_material_cost', v_total_cost,
        'message', 'Đã ghi nhận tiêu hao vật tư và trừ tồn kho thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. CẬP NHẬT RPC BÁO CÁO GIÁ VỐN & LỢI NHUẬN TRỰC TIẾP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_cogs_and_gross_profit_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_service_id UUID DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org UUID;
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    v_total_recognized_revenue BIGINT := 0;
    v_total_cogs_products BIGINT := 0;
    v_total_material_cost BIGINT := 0;
    v_total_direct_commission BIGINT := 0;
    v_direct_contribution BIGINT := 0;
    v_margin_pct NUMERIC(5, 2) := NULL;
    v_missing_cost_warning_count INT := 0;

    v_summary JSONB;
    v_service_breakdown JSONB;
    v_variance_breakdown JSONB;
    v_drilldown_items JSONB;
    v_total_records INT := 0;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_org := get_current_user_org_id();
        IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này.';
        END IF;
    END IF;

    -- 1. Doanh thu thực hiện & Giá vốn sản phẩm
    SELECT 
        COALESCE(SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0))))), 0),
        COALESCE(SUM(si.quantity * si.cost_price_snapshot), 0),
        COALESCE(SUM(CASE WHEN si.cost_price_snapshot = 0 THEN 1 ELSE 0 END), 0)
    INTO v_total_recognized_revenue, v_total_cogs_products, v_missing_cost_warning_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND s.status <> 'cancelled'
      AND si.item_type = 'product';

    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0)))))
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
          AND s.status <> 'cancelled'
          AND si.item_type = 'service'
          AND (p_service_id IS NULL OR si.item_ref_id = p_service_id)
    ), 0);

    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(s.total_amount, 0)))
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales s ON s.id = cc.sale_id
        WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
          AND (p_service_id IS NULL OR cc.service_id = p_service_id)
    ), 0);

    -- 2. Chi phí vật tư tiêu hao thực tế
    SELECT 
        COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0),
        v_missing_cost_warning_count + COALESCE(SUM(CASE WHEN smu.is_missing_cost_snapshot THEN 1 ELSE 0 END), 0)
    INTO v_total_material_cost, v_missing_cost_warning_count
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND smu.status = 'confirmed'
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    -- 3. Hoa hồng trực tiếp (Khớp chính xác schema: final_commission & occurred_at)
    SELECT COALESCE(SUM(cr.final_commission), 0)
    INTO v_total_direct_commission
    FROM commission_records cr
    WHERE cr.organization_id = p_org_id
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
      AND cr.occurred_at >= v_start_ts AND cr.occurred_at < v_next_day_ts
      AND cr.status IN ('eligible', 'approved', 'paid');

    -- 4. Chênh lệch trực tiếp & Biên lợi nhuận
    v_direct_contribution := v_total_recognized_revenue - (v_total_cogs_products + v_total_material_cost + v_total_direct_commission);
    
    IF v_total_recognized_revenue > 0 THEN
        v_margin_pct := ROUND((v_direct_contribution::NUMERIC / v_total_recognized_revenue) * 100, 2);
    ELSE
        v_margin_pct := NULL;
    END IF;

    v_summary := jsonb_build_object(
        'recognized_revenue', v_total_recognized_revenue,
        'cogs_products', v_total_cogs_products,
        'material_cost', v_total_material_cost,
        'direct_commission', v_total_direct_commission,
        'direct_contribution', v_direct_contribution,
        'margin_pct', v_margin_pct,
        'missing_cost_warning_count', v_missing_cost_warning_count,
        'disclaimer', 'Chênh lệch trực tiếp sau giá vốn, vật tư và hoa hồng (chưa bao gồm chi phí khấu hao máy móc, tiền điện, mặt bằng và lương cứng).'
    );

    -- 5. Phân tích theo dịch vụ
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'service_id', sb.service_id,
                'service_name', sb.service_name,
                'category', sb.category,
                'session_count', sb.session_count,
                'recognized_revenue', sb.revenue,
                'material_cost', sb.material_cost,
                'direct_contribution', (sb.revenue - sb.material_cost),
                'margin_pct', CASE WHEN sb.revenue > 0 THEN ROUND(((sb.revenue - sb.material_cost)::NUMERIC / sb.revenue) * 100, 2) ELSE NULL END
            )
        ), '[]'::jsonb
    ) INTO v_service_breakdown
    FROM (
        SELECT 
            s.id AS service_id,
            s.name AS service_name,
            s.category,
            COUNT(DISTINCT sd.id) AS session_count,
            COALESCE(SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0))), 0) AS revenue,
            COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0) AS material_cost
        FROM services s
        LEFT JOIN session_deductions sd ON sd.course_id IN (SELECT id FROM customer_courses WHERE service_id = s.id)
            AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
            AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
        LEFT JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales sa ON sa.id = cc.sale_id
        LEFT JOIN session_material_usages smu ON smu.session_deduction_id = sd.id
        WHERE s.organization_id = p_org_id
          AND (p_service_id IS NULL OR s.id = p_service_id)
          AND (p_category IS NULL OR s.category = p_category)
        GROUP BY s.id, s.name, s.category
        HAVING COUNT(DISTINCT sd.id) > 0 OR SUM(smu.base_quantity_deducted) > 0
    ) sb;

    -- 6. Phân tích 5 loại chênh lệch vật tư & tồn kho
    SELECT jsonb_build_object(
        'bom_variance', COALESCE((
            SELECT SUM(ROUND((smu.actual_quantity - smu.standard_quantity) * smu.conversion_rate_snapshot * smu.cost_price_snapshot))
            FROM session_material_usages smu
            WHERE smu.organization_id = p_org_id
              AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
              AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
        ), 0),
        'audit_shrinkage', COALESCE((
            SELECT SUM(it.quantity_change * it.cost_before)
            FROM (
                SELECT it.*, COALESCE(s.cost_price, 0) AS cost_before 
                FROM inventory_transactions it
                JOIN inventory_stocks s ON s.branch_id = it.branch_id AND s.product_id = it.product_id
                WHERE it.organization_id = p_org_id 
                  AND (p_branch_id IS NULL OR it.branch_id = p_branch_id)
                  AND it.transaction_type = 'audit_adjustment'
                  AND it.created_at >= v_start_ts AND it.created_at < v_next_day_ts
            ) it
        ), 0),
        'damaged_expired_loss', 0,
        'transfer_variance', 0,
        'unassigned_usage', 0
    ) INTO v_variance_breakdown;

    -- 7. Chi tiết drill-down có phân trang
    SELECT COUNT(*) INTO v_total_records
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', d.id,
                'used_at', d.used_at,
                'branch_name', d.branch_name,
                'service_name', d.service_name,
                'product_name', d.product_name,
                'standard_qty', d.standard_quantity,
                'actual_qty', d.actual_quantity,
                'unit_of_measure', d.unit_of_measure,
                'conversion_rate', d.conversion_rate_snapshot,
                'bom_version', d.bom_version_snapshot,
                'base_qty', d.base_quantity_deducted,
                'cost_price', d.cost_price_snapshot,
                'total_cost', ROUND(d.base_quantity_deducted * d.cost_price_snapshot),
                'bom_variance_amount', ROUND((d.actual_quantity - d.standard_quantity) * d.conversion_rate_snapshot * d.cost_price_snapshot),
                'is_missing_cost', d.is_missing_cost_snapshot,
                'staff_name', d.staff_name,
                'idempotency_key', d.idempotency_key,
                'notes', d.notes
            )
        ), '[]'::jsonb
    ) INTO v_drilldown_items
    FROM (
        SELECT 
            smu.id,
            smu.used_at,
            b.name AS branch_name,
            s.name AS service_name,
            p.name AS product_name,
            smu.standard_quantity,
            smu.actual_quantity,
            smu.unit_of_measure,
            smu.conversion_rate_snapshot,
            smu.bom_version_snapshot,
            smu.base_quantity_deducted,
            smu.cost_price_snapshot,
            smu.is_missing_cost_snapshot,
            COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
            smu.idempotency_key,
            smu.notes
        FROM session_material_usages smu
        JOIN branches b ON b.id = smu.branch_id
        JOIN services s ON s.id = smu.service_id
        JOIN products p ON p.id = smu.product_id
        LEFT JOIN staff_profiles sp ON sp.id = smu.performer_staff_id
        WHERE smu.organization_id = p_org_id
          AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
          AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
          AND (p_service_id IS NULL OR smu.service_id = p_service_id)
        ORDER BY smu.used_at DESC, smu.created_at DESC
        LIMIT v_limit OFFSET v_offset
    ) d;

    RETURN jsonb_build_object(
        'timezone', 'Asia/Ho_Chi_Minh (UTC+7)',
        'start_date', p_start_date,
        'end_date', p_end_date,
        'summary', v_summary,
        'service_breakdown', v_service_breakdown,
        'variance_breakdown', v_variance_breakdown,
        'drilldown_items', v_drilldown_items,
        'pagination', jsonb_build_object(
            'page', COALESCE(p_page, 1),
            'page_size', v_limit,
            'total_records', v_total_records,
            'total_pages', CEIL(v_total_records::NUMERIC / NULLIF(v_limit, 0))
        )
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 028_p7_3_staff_and_resource_utilization.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 028: PHÂN HỆ P7.3 — BÁO CÁO HIỆU SUẤT NHÂN SỰ, BÁC SĨ & CÔNG SUẤT TÀI NGUYÊN
-- Phân hệ: P7.3 — Staff Performance, Time Utilization & Resource Seat Capacity
-- Target: PostgreSQL / Supabase
-- Yêu cầu tiên quyết: Migrations 001 - 027
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC BÁO CÁO HIỆU SUẤT NHÂN SỰ & CÔNG SUẤT PHÒNG/GHẾ/GIƯỜNG (P7.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_staff_and_resource_utilization_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_staff_id UUID DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org UUID;
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_days_count INT := (p_end_date - p_start_date + 1);

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    v_staff_metrics JSONB;
    v_resource_metrics JSONB;
    v_drilldown_sessions JSONB;
    v_total_records INT := 0;

    v_total_sales_rep_revenue BIGINT := 0;
    v_total_service_exec_revenue BIGINT := 0;
    v_total_sessions_count INT := 0;
    v_total_unique_clients INT := 0;
    v_total_hands_on_hours NUMERIC(10, 2) := 0;
    v_total_approved_work_hours NUMERIC(10, 2) := 0;
    v_overall_utilization_pct NUMERIC(5, 2) := NULL;
BEGIN
    -- 0. Kiểm tra quyền truy cập RLS ngữ cảnh tổ chức
    IF auth.uid() IS NOT NULL THEN
        v_caller_org := get_current_user_org_id();
        IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này.';
        END IF;
    END IF;

    -- =========================================================================
    -- 1. TỔNG HỢP HIỆU SUẤT TỪNG NHÂN VIÊN / BÁC SĨ / KTV
    -- =========================================================================
    WITH staff_sales AS (
        -- Doanh số tư vấn / bán hàng (Sales by Rep)
        SELECT 
            s.cashier_staff_id AS staff_id,
            COALESCE(SUM(s.total_amount), 0) AS sales_invoiced
        FROM sales s
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
          AND s.status = 'completed'
        GROUP BY s.cashier_staff_id
    ),
    staff_service_exec AS (
        -- Doanh thu thực hiện dịch vụ lẻ (POS Service Execution)
        SELECT 
            sd.staff_id,
            sd.branch_id,
            sd.session_id,
            sd.customer_id,
            sd.service_id,
            sd.session_revenue,
            sd.duration_hours,
            sd.is_estimated_duration,
            sd.performed_at
        FROM (
            -- Dịch vụ lẻ làm tại POS
            SELECT 
                si.id AS session_id,
                s.id AS sale_id,
                s.cashier_staff_id AS staff_id,
                s.customer_id,
                s.branch_id,
                si.item_ref_id AS service_id,
                ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0)))) AS session_revenue,
                COALESCE(srv.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours,
                TRUE AS is_estimated_duration,
                s.created_at AS performed_at
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN services srv ON srv.id = si.item_ref_id
            WHERE s.organization_id = p_org_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
              AND s.status = 'completed'
              AND si.item_type = 'service'

            UNION ALL

            -- Trừ buổi gói liệu trình thực tế
            SELECT 
                sd.id AS session_id,
                cc.sale_id,
                sd.staff_id,
                cc.customer_id,
                sd.branch_id,
                cc.service_id,
                ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0)) AS session_revenue,
                COALESCE(srv.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours,
                TRUE AS is_estimated_duration,
                sd.performed_at
            FROM session_deductions sd
            JOIN customer_courses cc ON cc.id = sd.course_id
            LEFT JOIN sales sa ON sa.id = cc.sale_id
            LEFT JOIN services srv ON srv.id = cc.service_id
            WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
              AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
        ) sd
    ),
    staff_hours_approved AS (
        -- Giờ công chấm công đã được duyệt (Approved Hours)
        SELECT 
            ar.staff_id,
            COALESCE(SUM(ar.approved_hours), 0) AS approved_work_hours
        FROM attendance_records ar
        WHERE ar.organization_id = p_org_id
          AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
          AND ar.work_date >= p_start_date AND ar.work_date <= p_end_date
          AND ar.status = 'approved'
        GROUP BY ar.staff_id
    ),
    staff_aggregated AS (
        SELECT 
            sp.id AS staff_id,
            sp.full_name,
            COALESCE(sp.title, 'Chuyên viên') AS job_title,
            COALESCE(
                (SELECT b.name 
                 FROM staff_branch_assignments sba 
                 JOIN branches b ON b.id = sba.branch_id 
                 WHERE sba.staff_id = sp.id AND sba.is_primary = TRUE AND sba.is_active = TRUE 
                 LIMIT 1),
                (SELECT b.name 
                 FROM branches b 
                 WHERE b.organization_id = sp.organization_id 
                 ORDER BY b.is_headquarters DESC, b.created_at ASC 
                 LIMIT 1),
                'Toàn hệ thống'
            ) AS primary_branch_name,
            COALESCE(ss.sales_invoiced, 0) AS sales_invoiced,
            COALESCE(SUM(se.session_revenue), 0) AS service_execution_revenue,
            COUNT(DISTINCT se.session_id) AS sessions_completed_count,
            COUNT(DISTINCT se.customer_id) AS unique_clients_served,
            COALESCE(SUM(se.duration_hours), 0) AS hands_on_hours,
            COALESCE(MAX(sha.approved_work_hours), 0) AS approved_work_hours
        FROM staff_profiles sp
        LEFT JOIN staff_sales ss ON ss.staff_id = sp.id
        LEFT JOIN staff_service_exec se ON se.staff_id = sp.id
        LEFT JOIN staff_hours_approved sha ON sha.staff_id = sp.id
        WHERE sp.organization_id = p_org_id
          AND (p_branch_id IS NULL OR EXISTS (
              SELECT 1 FROM staff_branch_assignments sba 
              WHERE sba.staff_id = sp.id AND sba.branch_id = p_branch_id AND sba.is_active = TRUE
          ) OR EXISTS (
              SELECT 1 FROM organization_memberships om
              WHERE om.staff_id = sp.id AND (p_branch_id = ANY(om.assigned_branch_ids) OR om.assigned_branch_ids = '{}' OR om.role = 'owner_admin')
          ))
          AND (p_staff_id IS NULL OR sp.id = p_staff_id)
          AND sp.is_active = TRUE
        GROUP BY sp.id, sp.full_name, sp.title, sp.organization_id, ss.sales_invoiced
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'staff_id', sa.staff_id,
                'full_name', sa.full_name,
                'job_title', sa.job_title,
                'primary_branch_name', sa.primary_branch_name,
                'sales_invoiced', sa.sales_invoiced,
                'service_execution_revenue', sa.service_execution_revenue,
                'sessions_completed_count', sa.sessions_completed_count,
                'unique_clients_served', sa.unique_clients_served,
                'hands_on_hours', ROUND(sa.hands_on_hours, 2),
                'approved_work_hours', ROUND(sa.approved_work_hours, 2),
                'utilization_pct', CASE 
                    WHEN sa.approved_work_hours > 0 THEN ROUND((sa.hands_on_hours / sa.approved_work_hours) * 100, 2)
                    ELSE NULL 
                END,
                'rating_avg', NULL,
                'rating_count', 0,
                'rating_status', 'Chưa triển khai nguồn dữ liệu đánh giá'
            )
        ), '[]'::jsonb
    ) INTO v_staff_metrics
    FROM staff_aggregated sa;

    -- =========================================================================
    -- 2. TỔNG HỢP CÔNG SUẤT TÀI NGUYÊN (PHÒNG / GIƯỜNG / GHẾ)
    -- =========================================================================
    WITH resource_utilization AS (
        SELECT 
            r.id AS resource_id,
            r.code,
            r.name AS resource_name,
            r.resource_type,
            r.capacity,
            b.name AS branch_name,
            -- Giờ mở cửa tiêu chuẩn khả dụng: Số ngày * 10 giờ/ngày * Sức chứa (Chỗ x Giờ)
            (v_days_count * 10.0 * r.capacity)::NUMERIC(10,2) AS available_seat_hours,
            0.0::NUMERIC(10,2) AS maintenance_seat_hours,
            -- Giờ đặt lịch (Booked)
            COALESCE((
                SELECT SUM(a.duration_minutes::NUMERIC / 60.0)
                FROM appointments a
                WHERE a.resource_id = r.id
                  AND a.scheduled_at >= v_start_ts AND a.scheduled_at < v_next_day_ts
                  AND a.status IN ('booked', 'confirmed', 'completed')
            ), 0.0)::NUMERIC(10,2) AS booked_seat_hours,
            -- Giờ thực tế đã phục vụ (Actual Utilized)
            COALESCE((
                SELECT SUM(a.duration_minutes::NUMERIC / 60.0)
                FROM appointments a
                WHERE a.resource_id = r.id
                  AND a.scheduled_at >= v_start_ts AND a.scheduled_at < v_next_day_ts
                  AND a.status = 'completed'
            ), 0.0)::NUMERIC(10,2) AS actual_used_seat_hours
        FROM resources r
        JOIN branches b ON b.id = r.branch_id
        WHERE r.organization_id = p_org_id
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
          AND (p_resource_id IS NULL OR r.id = p_resource_id)
          AND r.is_active = TRUE
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'resource_id', ru.resource_id,
                'code', ru.code,
                'resource_name', ru.resource_name,
                'resource_type', ru.resource_type,
                'capacity', ru.capacity,
                'branch_name', ru.branch_name,
                'available_seat_hours', ru.available_seat_hours,
                'maintenance_seat_hours', ru.maintenance_seat_hours,
                'booked_seat_hours', ru.booked_seat_hours,
                'actual_used_seat_hours', ru.actual_used_seat_hours,
                'booked_utilization_pct', CASE 
                    WHEN ru.available_seat_hours > 0 THEN ROUND((ru.booked_seat_hours / ru.available_seat_hours) * 100, 2)
                    ELSE NULL 
                END,
                'actual_utilization_pct', CASE 
                    WHEN ru.available_seat_hours > 0 THEN ROUND((ru.actual_used_seat_hours / ru.available_seat_hours) * 100, 2)
                    ELSE NULL 
                END
            )
        ), '[]'::jsonb
    ) INTO v_resource_metrics
    FROM resource_utilization ru;

    -- =========================================================================
    -- 3. DRILL-DOWN CHI TIẾT TỪNG LẦN PHỤC VỤ CÓ PHÂN TRANG
    -- =========================================================================
    WITH all_sessions AS (
        SELECT 
            sd.id AS session_id,
            sd.performed_at,
            b.name AS branch_name,
            c.full_name AS customer_name,
            c.phone AS customer_phone,
            s.name AS service_name,
            COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
            'course_deduct' AS session_source,
            ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0)) AS allocated_revenue,
            COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        JOIN customers c ON c.id = cc.customer_id
        JOIN services s ON s.id = cc.service_id
        JOIN branches b ON b.id = sd.branch_id
        LEFT JOIN staff_profiles sp ON sp.id = sd.staff_id
        LEFT JOIN sales sa ON sa.id = cc.sale_id
        WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
          AND (p_staff_id IS NULL OR sd.staff_id = p_staff_id)

        UNION ALL

        SELECT 
            si.id AS session_id,
            sa.created_at AS performed_at,
            b.name AS branch_name,
            c.full_name AS customer_name,
            c.phone AS customer_phone,
            s.name AS service_name,
            COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
            'pos_service_sale' AS session_source,
            ROUND(si.line_total * (1 - (sa.discount_amount::NUMERIC / NULLIF(sa.subtotal, 0)))) AS allocated_revenue,
            COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
        FROM sale_items si
        JOIN sales sa ON sa.id = si.sale_id
        JOIN customers c ON c.id = sa.customer_id
        JOIN services s ON s.id = si.item_ref_id
        JOIN branches b ON b.id = sa.branch_id
        LEFT JOIN staff_profiles sp ON sp.id = sa.cashier_staff_id
        WHERE sa.organization_id = p_org_id
          AND (p_branch_id IS NULL OR sa.branch_id = p_branch_id)
          AND sa.created_at >= v_start_ts AND sa.created_at < v_next_day_ts
          AND sa.status = 'completed'
          AND si.item_type = 'service'
          AND (p_staff_id IS NULL OR sa.cashier_staff_id = p_staff_id)
    )
    SELECT COUNT(*) INTO v_total_records FROM all_sessions;

    WITH paged_sessions AS (
        SELECT * FROM (
            SELECT 
                sd.id AS session_id,
                sd.performed_at,
                b.name AS branch_name,
                c.full_name AS customer_name,
                c.phone AS customer_phone,
                s.name AS service_name,
                COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
                'course_deduct' AS session_source,
                ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0)) AS allocated_revenue,
                COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
            FROM session_deductions sd
            JOIN customer_courses cc ON cc.id = sd.course_id
            JOIN customers c ON c.id = cc.customer_id
            JOIN services s ON s.id = cc.service_id
            JOIN branches b ON b.id = sd.branch_id
            LEFT JOIN staff_profiles sp ON sp.id = sd.staff_id
            LEFT JOIN sales sa ON sa.id = cc.sale_id
            WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
              AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
              AND (p_staff_id IS NULL OR sd.staff_id = p_staff_id)

            UNION ALL

            SELECT 
                si.id AS session_id,
                sa.created_at AS performed_at,
                b.name AS branch_name,
                c.full_name AS customer_name,
                c.phone AS customer_phone,
                s.name AS service_name,
                COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
                'pos_service_sale' AS session_source,
                ROUND(si.line_total * (1 - (sa.discount_amount::NUMERIC / NULLIF(sa.subtotal, 0)))) AS allocated_revenue,
                COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
            FROM sale_items si
            JOIN sales sa ON sa.id = si.sale_id
            JOIN customers c ON c.id = sa.customer_id
            JOIN services s ON s.id = si.item_ref_id
            JOIN branches b ON b.id = sa.branch_id
            LEFT JOIN staff_profiles sp ON sp.id = sa.cashier_staff_id
            WHERE sa.organization_id = p_org_id
              AND (p_branch_id IS NULL OR sa.branch_id = p_branch_id)
              AND sa.created_at >= v_start_ts AND sa.created_at < v_next_day_ts
              AND sa.status = 'completed'
              AND si.item_type = 'service'
              AND (p_staff_id IS NULL OR sa.cashier_staff_id = p_staff_id)
        ) sub_s
        ORDER BY sub_s.performed_at DESC
        LIMIT v_limit OFFSET v_offset
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'session_id', ps.session_id,
                'performed_at', ps.performed_at,
                'branch_name', ps.branch_name,
                'customer_name', ps.customer_name,
                'customer_phone', ps.customer_phone,
                'service_name', ps.service_name,
                'staff_name', ps.staff_name,
                'session_source', ps.session_source,
                'allocated_revenue', ps.allocated_revenue,
                'duration_hours', ps.duration_hours
            )
        ), '[]'::jsonb
    ) INTO v_drilldown_sessions
    FROM paged_sessions ps;

    -- =========================================================================
    -- 4. TÍNH TỔNG KPI TOÀN CHUỖI / CHI NHÁNH
    -- =========================================================================
    SELECT 
        COALESCE(SUM((x->>'sales_invoiced')::BIGINT), 0),
        COALESCE(SUM((x->>'service_execution_revenue')::BIGINT), 0),
        COALESCE(SUM((x->>'sessions_completed_count')::INT), 0),
        COALESCE(SUM((x->>'hands_on_hours')::NUMERIC), 0),
        COALESCE(SUM((x->>'approved_work_hours')::NUMERIC), 0)
    INTO 
        v_total_sales_rep_revenue,
        v_total_service_exec_revenue,
        v_total_sessions_count,
        v_total_hands_on_hours,
        v_total_approved_work_hours
    FROM jsonb_array_elements(v_staff_metrics) x;

    IF v_total_approved_work_hours > 0 THEN
        v_overall_utilization_pct := ROUND((v_total_hands_on_hours / v_total_approved_work_hours) * 100, 2);
    ELSE
        v_overall_utilization_pct := NULL;
    END IF;

    RETURN jsonb_build_object(
        'timezone', 'Asia/Ho_Chi_Minh (UTC+7)',
        'start_date', p_start_date,
        'end_date', p_end_date,
        'summary', jsonb_build_object(
            'total_sales_rep_revenue', v_total_sales_rep_revenue,
            'total_service_exec_revenue', v_total_service_exec_revenue,
            'total_sessions_count', v_total_sessions_count,
            'total_hands_on_hours', v_total_hands_on_hours,
            'total_approved_work_hours', v_total_approved_work_hours,
            'overall_utilization_pct', v_overall_utilization_pct,
            'disclaimer', 'Hiệu suất thời gian = Giờ phục vụ trực tiếp / Giờ công đã duyệt. Mẫu số = 0 trả về N/A.'
        ),
        'staff_metrics', v_staff_metrics,
        'resource_metrics', v_resource_metrics,
        'drilldown_sessions', v_drilldown_sessions,
        'pagination', jsonb_build_object(
            'page', COALESCE(p_page, 1),
            'page_size', v_limit,
            'total_records', v_total_records,
            'total_pages', CEIL(v_total_records::NUMERIC / NULLIF(v_limit, 0))
        )
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 029_p7_4_customer_retention_and_cohort.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 029: PHÂN HỆ P7.4 — BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT
-- Phân hệ: P7.4 — Customer Analytics, RFM, Service/Purchase Retention & Cohort
-- Target: PostgreSQL / Supabase
-- Yêu cầu tiên quyết: Migrations 001 - 028
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT (P7.4)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_customer_retention_and_cohort_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_segment_filter VARCHAR(50) DEFAULT NULL, -- 'all', 'new', 'returning', 'at_risk', 'inactive', 'unengaged'
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org UUID;
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_ref_date DATE := p_end_date;

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    v_summary JSONB;
    v_rfm_segments JSONB;
    v_cohort_service JSONB;
    v_cohort_repurchase JSONB;
    v_customer_drilldown JSONB;
    v_total_records INT := 0;

    v_total_customers_in_system INT := 0;
    v_total_active_period_buyers INT := 0;
    v_total_active_period_served INT := 0;
    v_new_org_customers INT := 0;
    v_new_branch_customers INT := 0;
    v_returning_buyers INT := 0;
    v_returning_served INT := 0;
BEGIN
    -- 0. Kiểm tra quyền truy cập RLS ngữ cảnh tổ chức
    IF auth.uid() IS NOT NULL THEN
        v_caller_org := get_current_user_org_id();
        IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này.';
        END IF;
    END IF;

    -- =========================================================================
    -- 1. TẠO BẢNG TẠM PHÂN TÍCH TỔNG THỂ KHÁCH HÀNG (TEMP_CUSTOMER_ANALYZED)
    -- =========================================================================
    DROP TABLE IF EXISTS temp_customer_analyzed;
    CREATE TEMP TABLE temp_customer_analyzed ON COMMIT DROP AS
    WITH customer_history AS (
        SELECT 
            c.id AS customer_id,
            c.full_name,
            c.phone,
            c.tier,
            c.created_at AS registered_at,
            -- Ngày mua hàng đầu tiên toàn chuỗi
            (
                SELECT MIN(s.created_at)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND s.organization_id = p_org_id
                  AND s.status = 'completed'
            ) AS first_purchase_org_at,
            -- Ngày mua hàng đầu tiên tại chi nhánh
            (
                SELECT MIN(s.created_at)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.status = 'completed'
            ) AS first_purchase_branch_at,
            -- Ngày được phục vụ đầu tiên toàn chuỗi
            (
                SELECT LEAST(
                    (SELECT MIN(sd.performed_at) FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id WHERE cc.customer_id = c.id),
                    (SELECT MIN(a.scheduled_at) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed')
                )
            ) AS first_service_at,
            -- Lần mua gần nhất tính đến ngày kết thúc kỳ (Recency cơ sở bất biến)
            (
                SELECT MAX(s.created_at)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at < v_next_day_ts
                  AND s.status = 'completed'
            ) AS last_purchase_at,
            -- Lần phục vụ gần nhất tính đến ngày kết thúc kỳ
            (
                SELECT GREATEST(
                    (SELECT MAX(sd.performed_at) FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id WHERE cc.customer_id = c.id AND sd.performed_at < v_next_day_ts AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)),
                    (SELECT MAX(a.scheduled_at) FROM appointments a WHERE a.customer_id = c.id AND a.scheduled_at < v_next_day_ts AND a.status = 'completed' AND (p_branch_id IS NULL OR a.branch_id = p_branch_id))
                )
            ) AS last_service_at,
            -- Số đơn mua hoàn tất trong kỳ
            COALESCE((
                SELECT COUNT(s.id)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
                  AND s.status = 'completed'
            ), 0) AS period_purchase_count,
            -- Số lần phục vụ trong kỳ (buổi liệu trình + lịch hẹn hoàn thành)
            COALESCE((
                SELECT COUNT(DISTINCT sd.id)
                FROM session_deductions sd
                JOIN customer_courses cc ON cc.id = sd.course_id
                WHERE cc.customer_id = c.id
                  AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
                  AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
            ), 0) + COALESCE((
                SELECT COUNT(DISTINCT a.id)
                FROM appointments a
                WHERE a.customer_id = c.id
                  AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
                  AND a.scheduled_at >= v_start_ts AND a.scheduled_at < v_next_day_ts
                  AND a.status = 'completed'
            ), 0) AS period_service_count,
            -- Tổng chi tiêu thực tế tích lũy lịch sử (Historical Net Spend)
            COALESCE((
                SELECT SUM(s.total_amount)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at < v_next_day_ts
                  AND s.status = 'completed'
            ), 0) AS historical_net_spend,
            -- Số buổi liệu trình còn khả dụng
            COALESCE((
                SELECT SUM(cc.total_sessions - cc.used_sessions)
                FROM customer_courses cc
                WHERE cc.customer_id = c.id
                  AND cc.status = 'active'
                  AND (cc.total_sessions - cc.used_sessions) > 0
            ), 0) AS active_remaining_sessions,
            -- Có lịch hẹn sắp tới không (tính từ sau v_ref_date)
            EXISTS (
                SELECT 1 
                FROM appointments a 
                WHERE a.customer_id = c.id 
                  AND a.scheduled_at >= v_next_day_ts 
                  AND a.status IN ('booked', 'confirmed')
            ) AS has_upcoming_appointment
        FROM customers c
        WHERE c.organization_id = p_org_id
    )
    SELECT 
        ch.*,
        -- Recency theo ngày (tính từ last_purchase_at hoặc last_service_at đến v_ref_date)
        CASE 
            WHEN ch.last_purchase_at IS NOT NULL OR ch.last_service_at IS NOT NULL THEN
                (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE))
            ELSE NULL 
        END AS recency_days,
        -- Phân loại Khách Mới vs Khách Quay Lại trong kỳ
        CASE 
            WHEN ch.period_purchase_count = 0 AND ch.period_service_count = 0 THEN 'no_activity_in_period'
            WHEN ch.first_purchase_org_at >= v_start_ts AND ch.first_purchase_org_at < v_next_day_ts THEN 'new_to_org'
            WHEN p_branch_id IS NOT NULL AND ch.first_purchase_branch_at >= v_start_ts AND ch.first_purchase_branch_at < v_next_day_ts THEN 'new_to_branch'
            WHEN ch.period_purchase_count > 0 AND ch.first_purchase_org_at < v_start_ts THEN 'returning_buyer'
            WHEN ch.period_service_count > 0 THEN 'returning_served_only'
            ELSE 'other'
        END AS period_customer_type,
        -- RFM Segment Group (Căn cứ trên Recency & Chi tiêu thực tế)
        CASE 
            WHEN ch.historical_net_spend >= 20000000 AND (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) <= 45 THEN 'vip_champion'
            WHEN ch.historical_net_spend >= 5000000 AND (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) <= 60 THEN 'loyal'
            WHEN (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) <= 30 THEN 'promising_active'
            WHEN (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) BETWEEN 61 AND 120 THEN 'at_risk_care_needed'
            WHEN (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) > 120 THEN 'inactive_dormant'
            ELSE 'unengaged_no_history'
        END AS rfm_segment
    FROM customer_history ch;

    -- 2. TỔNG HỢP SUMMARY
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE ca.period_purchase_count > 0),
        COUNT(*) FILTER (WHERE ca.period_service_count > 0),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'new_to_org'),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'new_to_branch'),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'returning_buyer'),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'returning_served_only')
    INTO 
        v_total_customers_in_system,
        v_total_active_period_buyers,
        v_total_active_period_served,
        v_new_org_customers,
        v_new_branch_customers,
        v_returning_buyers,
        v_returning_served
    FROM temp_customer_analyzed ca;

    v_summary := jsonb_build_object(
        'total_customers_in_system', v_total_customers_in_system,
        'total_active_period_buyers', v_total_active_period_buyers,
        'total_active_period_served', v_total_active_period_served,
        'new_org_customers', v_new_org_customers,
        'new_branch_customers', v_new_branch_customers,
        'returning_buyers', v_returning_buyers,
        'returning_served_only', v_returning_served,
        'repurchase_rate_pct', CASE 
            WHEN (v_new_org_customers + v_returning_buyers) > 0 THEN 
                ROUND((v_returning_buyers::NUMERIC / (v_new_org_customers + v_returning_buyers)) * 100, 2)
            ELSE NULL 
        END,
        'disclaimer', 'Khách sử dụng buổi tiếp theo của gói cũ được ghi nhận là quay lại phục vụ, không tự tính là mua lại.'
    );

    -- 3. TỔNG HỢP PHÂN NHÓM RFM
    WITH segment_counts AS (
        SELECT 
            ca.rfm_segment,
            COUNT(*) AS customer_count,
            COALESCE(SUM(ca.historical_net_spend), 0) AS total_historical_spend,
            ROUND(AVG(NULLIF(ca.recency_days, 0)), 1) AS avg_recency_days
        FROM temp_customer_analyzed ca
        GROUP BY ca.rfm_segment
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'segment_key', sc.rfm_segment,
                'segment_name', CASE sc.rfm_segment
                    WHEN 'vip_champion' THEN 'VIP / Khách Hàng Thân Thiết Cao Cấp'
                    WHEN 'loyal' THEN 'Khách Hàng Trung Thành'
                    WHEN 'promising_active' THEN 'Khách Mới & Đang Hoạt Động Tốt'
                    WHEN 'at_risk_care_needed' THEN 'Cần Xem Xét Chăm Sóc (60-120 ngày chưa đến)'
                    WHEN 'inactive_dormant' THEN 'Chưa Quay Lại (>120 ngày)'
                    ELSE 'Chưa Phát Sinh Giao Dịch'
                END,
                'customer_count', sc.customer_count,
                'total_historical_spend', sc.total_historical_spend,
                'avg_recency_days', sc.avg_recency_days
            )
        ), '[]'::jsonb
    ) INTO v_rfm_segments
    FROM segment_counts sc;

    -- =========================================================================
    -- 4. BÁO CÁO COHORT QUAY LẠI PHỤC VỤ (Service Retention 30 / 60 / 90 Ngày)
    -- =========================================================================
    WITH first_service_cohort_raw AS (
        SELECT 
            ca.customer_id,
            ca.first_service_at::DATE AS cohort_first_date,
            TO_CHAR(ca.first_service_at, 'YYYY-MM') AS cohort_month,
            (v_ref_date >= (ca.first_service_at::DATE + 30)) AS eligible_30d,
            (v_ref_date >= (ca.first_service_at::DATE + 60)) AS eligible_60d,
            (v_ref_date >= (ca.first_service_at::DATE + 90)) AS eligible_90d,
            EXISTS (
                SELECT 1 FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id 
                WHERE cc.customer_id = ca.customer_id AND sd.performed_at > ca.first_service_at AND sd.performed_at <= (ca.first_service_at + INTERVAL '30 days')
            ) OR EXISTS (
                SELECT 1 FROM appointments a 
                WHERE a.customer_id = ca.customer_id AND a.scheduled_at > ca.first_service_at AND a.scheduled_at <= (ca.first_service_at + INTERVAL '30 days') AND a.status = 'completed'
            ) AS returned_within_30d,
            EXISTS (
                SELECT 1 FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id 
                WHERE cc.customer_id = ca.customer_id AND sd.performed_at > ca.first_service_at AND sd.performed_at <= (ca.first_service_at + INTERVAL '60 days')
            ) OR EXISTS (
                SELECT 1 FROM appointments a 
                WHERE a.customer_id = ca.customer_id AND a.scheduled_at > ca.first_service_at AND a.scheduled_at <= (ca.first_service_at + INTERVAL '60 days') AND a.status = 'completed'
            ) AS returned_within_60d,
            EXISTS (
                SELECT 1 FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id 
                WHERE cc.customer_id = ca.customer_id AND sd.performed_at > ca.first_service_at AND sd.performed_at <= (ca.first_service_at + INTERVAL '90 days')
            ) OR EXISTS (
                SELECT 1 FROM appointments a 
                WHERE a.customer_id = ca.customer_id AND a.scheduled_at > ca.first_service_at AND a.scheduled_at <= (ca.first_service_at + INTERVAL '90 days') AND a.status = 'completed'
            ) AS returned_within_90d
        FROM temp_customer_analyzed ca
        WHERE ca.first_service_at IS NOT NULL
    ),
    first_service_cohort_grouped AS (
        SELECT 
            fsc.cohort_month,
            COUNT(*) AS total_cohort_customers,
            COUNT(*) FILTER (WHERE fsc.eligible_30d) AS eligible_30d,
            COUNT(*) FILTER (WHERE fsc.eligible_30d AND fsc.returned_within_30d) AS returned_30d,
            COUNT(*) FILTER (WHERE fsc.eligible_60d) AS eligible_60d,
            COUNT(*) FILTER (WHERE fsc.eligible_60d AND fsc.returned_within_60d) AS returned_60d,
            COUNT(*) FILTER (WHERE fsc.eligible_90d) AS eligible_90d,
            COUNT(*) FILTER (WHERE fsc.eligible_90d AND fsc.returned_within_90d) AS returned_90d
        FROM first_service_cohort_raw fsc
        GROUP BY fsc.cohort_month
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'cohort_month', g.cohort_month,
                'total_cohort_customers', g.total_cohort_customers,
                'retention_30d', jsonb_build_object(
                    'eligible', g.eligible_30d,
                    'returned', g.returned_30d,
                    'pct', CASE WHEN g.eligible_30d > 0 THEN ROUND((g.returned_30d::NUMERIC / g.eligible_30d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_30d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'retention_60d', jsonb_build_object(
                    'eligible', g.eligible_60d,
                    'returned', g.returned_60d,
                    'pct', CASE WHEN g.eligible_60d > 0 THEN ROUND((g.returned_60d::NUMERIC / g.eligible_60d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_60d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'retention_90d', jsonb_build_object(
                    'eligible', g.eligible_90d,
                    'returned', g.returned_90d,
                    'pct', CASE WHEN g.eligible_90d > 0 THEN ROUND((g.returned_90d::NUMERIC / g.eligible_90d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_90d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                )
            ) ORDER BY g.cohort_month DESC
        ), '[]'::jsonb
    ) INTO v_cohort_service
    FROM first_service_cohort_grouped g;

    -- =========================================================================
    -- 5. BÁO CÁO COHORT MUA LẠI (Repurchase Cohort 30 / 60 / 90 Ngày)
    -- =========================================================================
    WITH first_purchase_cohort_raw AS (
        SELECT 
            ca.customer_id,
            ca.first_purchase_org_at::DATE AS cohort_first_date,
            TO_CHAR(ca.first_purchase_org_at, 'YYYY-MM') AS cohort_month,
            (v_ref_date >= (ca.first_purchase_org_at::DATE + 30)) AS eligible_30d,
            (v_ref_date >= (ca.first_purchase_org_at::DATE + 60)) AS eligible_60d,
            (v_ref_date >= (ca.first_purchase_org_at::DATE + 90)) AS eligible_90d,
            EXISTS (
                SELECT 1 FROM sales s 
                WHERE s.customer_id = ca.customer_id AND s.organization_id = p_org_id AND s.status = 'completed'
                  AND s.created_at > ca.first_purchase_org_at AND s.created_at <= (ca.first_purchase_org_at + INTERVAL '30 days')
            ) AS repurchased_within_30d,
            EXISTS (
                SELECT 1 FROM sales s 
                WHERE s.customer_id = ca.customer_id AND s.organization_id = p_org_id AND s.status = 'completed'
                  AND s.created_at > ca.first_purchase_org_at AND s.created_at <= (ca.first_purchase_org_at + INTERVAL '60 days')
            ) AS repurchased_within_60d,
            EXISTS (
                SELECT 1 FROM sales s 
                WHERE s.customer_id = ca.customer_id AND s.organization_id = p_org_id AND s.status = 'completed'
                  AND s.created_at > ca.first_purchase_org_at AND s.created_at <= (ca.first_purchase_org_at + INTERVAL '90 days')
            ) AS repurchased_within_90d
        FROM temp_customer_analyzed ca
        WHERE ca.first_purchase_org_at IS NOT NULL
    ),
    first_purchase_cohort_grouped AS (
        SELECT 
            fpc.cohort_month,
            COUNT(*) AS total_cohort_customers,
            COUNT(*) FILTER (WHERE fpc.eligible_30d) AS eligible_30d,
            COUNT(*) FILTER (WHERE fpc.eligible_30d AND fpc.repurchased_within_30d) AS repurchased_30d,
            COUNT(*) FILTER (WHERE fpc.eligible_60d) AS eligible_60d,
            COUNT(*) FILTER (WHERE fpc.eligible_60d AND fpc.repurchased_within_60d) AS repurchased_60d,
            COUNT(*) FILTER (WHERE fpc.eligible_90d) AS eligible_90d,
            COUNT(*) FILTER (WHERE fpc.eligible_90d AND fpc.repurchased_within_90d) AS repurchased_90d
        FROM first_purchase_cohort_raw fpc
        GROUP BY fpc.cohort_month
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'cohort_month', g.cohort_month,
                'total_cohort_customers', g.total_cohort_customers,
                'repurchase_30d', jsonb_build_object(
                    'eligible', g.eligible_30d,
                    'repurchased', g.repurchased_30d,
                    'pct', CASE WHEN g.eligible_30d > 0 THEN ROUND((g.repurchased_30d::NUMERIC / g.eligible_30d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_30d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'repurchase_60d', jsonb_build_object(
                    'eligible', g.eligible_60d,
                    'repurchased', g.repurchased_60d,
                    'pct', CASE WHEN g.eligible_60d > 0 THEN ROUND((g.repurchased_60d::NUMERIC / g.eligible_60d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_60d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'repurchase_90d', jsonb_build_object(
                    'eligible', g.eligible_90d,
                    'repurchased', g.repurchased_90d,
                    'pct', CASE WHEN g.eligible_90d > 0 THEN ROUND((g.repurchased_90d::NUMERIC / g.eligible_90d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_90d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                )
            ) ORDER BY g.cohort_month DESC
        ), '[]'::jsonb
    ) INTO v_cohort_repurchase
    FROM first_purchase_cohort_grouped g;

    -- =========================================================================
    -- 6. DRILL-DOWN DANH SÁCH KHÁCH HÀNG KÈM PHÂN TRANG
    -- =========================================================================
    WITH filtered_customers AS (
        SELECT *
        FROM temp_customer_analyzed ca
        WHERE (p_segment_filter IS NULL OR p_segment_filter = 'all' OR ca.rfm_segment = p_segment_filter)
    )
    SELECT COUNT(*) INTO v_total_records FROM filtered_customers;

    WITH paged_customers AS (
        SELECT *
        FROM temp_customer_analyzed ca
        WHERE (p_segment_filter IS NULL OR p_segment_filter = 'all' OR ca.rfm_segment = p_segment_filter)
        ORDER BY ca.historical_net_spend DESC, ca.registered_at DESC
        LIMIT v_limit OFFSET v_offset
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'customer_id', pc.customer_id,
                'full_name', pc.full_name,
                'phone', pc.phone,
                'tier', pc.tier,
                'registered_at', pc.registered_at,
                'first_purchase_org_at', pc.first_purchase_org_at,
                'first_service_at', pc.first_service_at,
                'last_purchase_at', pc.last_purchase_at,
                'last_service_at', pc.last_service_at,
                'recency_days', pc.recency_days,
                'period_purchase_count', pc.period_purchase_count,
                'period_service_count', pc.period_service_count,
                'historical_net_spend', pc.historical_net_spend,
                'active_remaining_sessions', pc.active_remaining_sessions,
                'has_upcoming_appointment', pc.has_upcoming_appointment,
                'period_customer_type', pc.period_customer_type,
                'rfm_segment', pc.rfm_segment,
                'care_recommendation', CASE 
                    WHEN pc.has_upcoming_appointment THEN 'Đã có lịch hẹn sắp tới'
                    WHEN pc.active_remaining_sessions > 0 AND pc.recency_days > 45 THEN 'Còn liệu trình chưa dùng — Cần liên hệ nhắc lịch'
                    WHEN pc.rfm_segment = 'at_risk_care_needed' THEN 'Cần xem xét chăm sóc (60-120 ngày chưa đến)'
                    WHEN pc.rfm_segment = 'inactive_dormant' THEN 'Chưa quay lại (>120 ngày) — Xem xét chiến dịch re-engagement'
                    ELSE 'Bình thường'
                END
            )
        ), '[]'::jsonb
    ) INTO v_customer_drilldown
    FROM paged_customers pc;

    RETURN jsonb_build_object(
        'timezone', 'Asia/Ho_Chi_Minh (UTC+7)',
        'start_date', p_start_date,
        'end_date', p_end_date,
        'summary', v_summary,
        'rfm_segments', v_rfm_segments,
        'cohort_service_retention', v_cohort_service,
        'cohort_repurchase_retention', v_cohort_repurchase,
        'customer_drilldown', v_customer_drilldown,
        'pagination', jsonb_build_object(
            'page', COALESCE(p_page, 1),
            'page_size', v_limit,
            'total_records', v_total_records,
            'total_pages', CEIL(v_total_records::NUMERIC / NULLIF(v_limit, 0))
        )
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- FILE: 030_p8_treatment_records_and_before_after.sql
-- -----------------------------------------------------------------------------
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

-- Storage object policies for treatment-photos private bucket
DROP POLICY IF EXISTS "Allow upload to treatment-photos" ON storage.objects;
CREATE POLICY "Allow upload to treatment-photos" ON storage.objects
    FOR INSERT TO authenticated, anon
    WITH CHECK (bucket_id = 'treatment-photos');

DROP POLICY IF EXISTS "Allow select on treatment-photos" ON storage.objects;
CREATE POLICY "Allow select on treatment-photos" ON storage.objects
    FOR SELECT TO authenticated, anon
    USING (bucket_id = 'treatment-photos');

DROP POLICY IF EXISTS "Allow update on treatment-photos" ON storage.objects;
CREATE POLICY "Allow update on treatment-photos" ON storage.objects
    FOR UPDATE TO authenticated, anon
    USING (bucket_id = 'treatment-photos');

DROP POLICY IF EXISTS "Allow delete on treatment-photos" ON storage.objects;
CREATE POLICY "Allow delete on treatment-photos" ON storage.objects
    FOR DELETE TO authenticated, anon
    USING (bucket_id = 'treatment-photos');

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



-- -----------------------------------------------------------------------------
-- FILE: 031_p9_loyalty_and_membership_tiers.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 031: PHASE 9 — LOYALTY ENGINE, MEMBERSHIP TIERS & POINTS LEDGER
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG CẤU HÌNH CHÍNH SÁCH TÍCH / ĐỔI ĐIỂM (LOYALTY_POLICIES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    policy_code VARCHAR(50) NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Mặc định TẮT trên Prod, chờ phê duyệt
    earn_event VARCHAR(50) NOT NULL DEFAULT 'invoice_paid', -- 'invoice_paid', 'service_completed'
    earn_spend_ratio BIGINT NOT NULL DEFAULT 10000, -- 10.000 VNĐ chi tiêu = 1 Điểm
    points_to_currency_ratio BIGINT NOT NULL DEFAULT 100, -- 1 Điểm = 100 VNĐ khi đổi
    max_redeem_percentage INT NOT NULL DEFAULT 50, -- Tối đa đổi 50% giá trị hóa đơn
    points_expiry_days INT NOT NULL DEFAULT 365, -- Điểm hết hạn sau 365 ngày
    allow_combine_with_voucher BOOLEAN NOT NULL DEFAULT FALSE, -- Không gộp voucher theo mặc định
    exclude_deposit_payments BOOLEAN NOT NULL DEFAULT TRUE, -- Loại trừ nạp/dùng cọc để tránh tích đúp
    round_rule VARCHAR(50) NOT NULL DEFAULT 'floor', -- 'floor', 'round', 'ceil'
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_loyalty_policy_code UNIQUE (organization_id, policy_code)
);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CẤU HÌNH HẠNG THÀNH VIÊN (LOYALTY_TIER_POLICIES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_tier_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tier_code VARCHAR(50) NOT NULL, -- 'standard', 'silver', 'gold', 'platinum', 'vip'
    tier_name VARCHAR(100) NOT NULL,
    min_spend_threshold BIGINT NOT NULL DEFAULT 0, -- Chi tiêu tích lũy tối thiểu (VNĐ)
    discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- % Giảm giá đặc quyền
    points_multiplier NUMERIC(3, 2) NOT NULL DEFAULT 1.00, -- Hệ số nhân điểm (VD: Gold x1.2, VIP x1.5)
    evaluation_period_months INT NOT NULL DEFAULT 12, -- Kỳ xét hạng: 12 tháng
    benefits_description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_loyalty_tier_code UNIQUE (organization_id, tier_code)
);

-- -----------------------------------------------------------------------------
-- 3. BẢNG SỐ DƯ ĐIỂM & HẠNG KHÁCH HÀNG TỨC THỜI (CUSTOMER_LOYALTY_BALANCES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_loyalty_balances (
    customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    current_tier VARCHAR(50) NOT NULL DEFAULT 'standard',
    tier_qualifying_spend BIGINT NOT NULL DEFAULT 0,
    tier_updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    tier_expires_at TIMESTAMPTZ,
    available_points INT NOT NULL DEFAULT 0 CHECK (available_points >= 0),
    pending_points INT NOT NULL DEFAULT 0 CHECK (pending_points >= 0),
    total_earned_points INT NOT NULL DEFAULT 0 CHECK (total_earned_points >= 0),
    total_redeemed_points INT NOT NULL DEFAULT 0 CHECK (total_redeemed_points >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_loyalty_balances_org ON customer_loyalty_balances(organization_id, current_tier);

-- -----------------------------------------------------------------------------
-- 4. BẢNG SỔ CÁI ĐIỂM THƯỞNG BẤT BIẾN (LOYALTY_POINTS_LEDGER — APPEND ONLY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'earn', 'redeem', 'expire', 'refund', 'adjust'
    points_delta INT NOT NULL, -- Dương khi tích/hoàn, Âm khi tiêu/hết hạn
    balance_after INT NOT NULL CHECK (balance_after >= 0),
    source_reference_type VARCHAR(50) NOT NULL, -- 'sale', 'refund', 'appointment', 'manual_adjustment'
    source_reference_id UUID,
    idempotency_key VARCHAR(255) UNIQUE,
    reason_for_change TEXT NOT NULL,
    policy_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_customer ON loyalty_points_ledger(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_source ON loyalty_points_ledger(source_reference_type, source_reference_id);

-- -----------------------------------------------------------------------------
-- 5. BẢNG NHẬT KÝ THAY ĐỔI HẠNG THÀNH VIÊN (CUSTOMER_TIER_HISTORY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_tier_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    previous_tier VARCHAR(50) NOT NULL,
    new_tier VARCHAR(50) NOT NULL,
    qualifying_spend_snapshot BIGINT NOT NULL,
    reason TEXT NOT NULL,
    changed_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_tier_history_customer ON customer_tier_history(customer_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE loyalty_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tier_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_loyalty_policies_read ON loyalty_policies;
CREATE POLICY rls_loyalty_policies_read ON loyalty_policies FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_loyalty_policies_write ON loyalty_policies;
CREATE POLICY rls_loyalty_policies_write ON loyalty_policies FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_loyalty_tier_policies_read ON loyalty_tier_policies;
CREATE POLICY rls_loyalty_tier_policies_read ON loyalty_tier_policies FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_loyalty_tier_policies_write ON loyalty_tier_policies;
CREATE POLICY rls_loyalty_tier_policies_write ON loyalty_tier_policies FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_customer_loyalty_balances_read ON customer_loyalty_balances;
CREATE POLICY rls_customer_loyalty_balances_read ON customer_loyalty_balances FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_customer_loyalty_balances_write ON customer_loyalty_balances;
CREATE POLICY rls_customer_loyalty_balances_write ON customer_loyalty_balances FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_loyalty_points_ledger_read ON loyalty_points_ledger;
CREATE POLICY rls_loyalty_points_ledger_read ON loyalty_points_ledger FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_loyalty_points_ledger_write ON loyalty_points_ledger;
CREATE POLICY rls_loyalty_points_ledger_write ON loyalty_points_ledger FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_customer_tier_history_read ON customer_tier_history;
CREATE POLICY rls_customer_tier_history_read ON customer_tier_history FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_customer_tier_history_write ON customer_tier_history;
CREATE POLICY rls_customer_tier_history_write ON customer_tier_history FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

GRANT ALL ON loyalty_policies TO anon, authenticated, service_role;
GRANT ALL ON loyalty_tier_policies TO anon, authenticated, service_role;
GRANT ALL ON customer_loyalty_balances TO anon, authenticated, service_role;
GRANT ALL ON loyalty_points_ledger TO anon, authenticated, service_role;
GRANT ALL ON customer_tier_history TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. RPC FUNCTIONS FOR SECURE LOYALTY OPERATIONS
-- -----------------------------------------------------------------------------

-- RPC 1: Lấy tổng quan Loyalty & Lịch sử sổ điểm của khách hàng
CREATE OR REPLACE FUNCTION rpc_get_customer_loyalty_overview(
    p_org_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance RECORD;
    v_ledger JSONB;
    v_tier_info RECORD;
    v_policy RECORD;
    v_expiring_30d INT := 0;
BEGIN
    -- 1. Lấy hoặc khởi tạo số dư điểm
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    -- 2. Điểm sắp hết hạn trong 30 ngày tới
    SELECT COALESCE(SUM(points_delta), 0) INTO v_expiring_30d
    FROM loyalty_points_ledger
    WHERE customer_id = p_customer_id
      AND transaction_type = 'earn'
      AND expires_at IS NOT NULL
      AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days';

    -- 3. Thông tin cấu hình hạng hiện tại
    SELECT * INTO v_tier_info FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;

    -- 4. Thông tin chính sách tích điểm đang áp dụng
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    -- 5. Lịch sử sổ cái (20 giao dịch gần nhất)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'transaction_type', l.transaction_type,
        'points_delta', l.points_delta,
        'balance_after', l.balance_after,
        'source_reference_type', l.source_reference_type,
        'source_reference_id', l.source_reference_id,
        'reason_for_change', l.reason_for_change,
        'staff_name', sp.full_name,
        'expires_at', l.expires_at,
        'created_at', l.created_at
    ) ORDER BY l.created_at DESC), '[]'::JSONB)
    INTO v_ledger
    FROM loyalty_points_ledger l
    LEFT JOIN staff_profiles sp ON sp.id = l.staff_id
    WHERE l.customer_id = p_customer_id AND l.organization_id = p_org_id;

    RETURN jsonb_build_object(
        'customer_id', p_customer_id,
        'current_tier', v_balance.current_tier,
        'tier_name', COALESCE(v_tier_info.tier_name, UPPER(v_balance.current_tier)),
        'tier_discount_pct', COALESCE(v_tier_info.discount_percentage, 0),
        'tier_qualifying_spend', v_balance.tier_qualifying_spend,
        'available_points', v_balance.available_points,
        'expiring_points_30d', GREATEST(0, v_expiring_30d),
        'total_earned_points', v_balance.total_earned_points,
        'total_redeemed_points', v_balance.total_redeemed_points,
        'policy_active', (v_policy.id IS NOT NULL),
        'earn_spend_ratio', COALESCE(v_policy.earn_spend_ratio, 10000),
        'points_to_currency_ratio', COALESCE(v_policy.points_to_currency_ratio, 100),
        'max_redeem_percentage', COALESCE(v_policy.max_redeem_percentage, 50),
        'ledger_history', v_ledger
    );
END;
$$;

-- RPC 2: Tích điểm an toàn từ Hóa đơn bán hàng (Idempotent & ACID)
CREATE OR REPLACE FUNCTION rpc_earn_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_sale_id UUID,
    p_eligible_amount BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_tier RECORD;
    v_balance RECORD;
    v_multiplier NUMERIC(3, 2) := 1.00;
    v_base_points INT := 0;
    v_final_points INT := 0;
    v_new_balance INT := 0;
    v_new_total_earned INT := 0;
    v_new_qualifying_spend BIGINT := 0;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Kiểm tra idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Giao dịch tích điểm đã được xử lý trước đó (Idempotent).');
        END IF;
    END IF;

    -- 2. Kiểm tra chính sách tích điểm
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Chính sách tích điểm đang TẮT trên hệ thống.');
    END IF;

    IF p_eligible_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Giá trị chi tiêu hợp lệ phải lớn hơn 0.');
    END IF;

    -- 3. Khóa dòng số dư khách hàng (FOR UPDATE)
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    -- 4. Tính toán hệ số nhân theo Hạng
    SELECT * INTO v_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;
    IF FOUND THEN
        v_multiplier := COALESCE(v_tier.points_multiplier, 1.00);
    END IF;

    -- 5. Quy đổi điểm theo chính sách và làm tròn
    v_base_points := FLOOR(p_eligible_amount::NUMERIC / v_policy.earn_spend_ratio);
    v_final_points := FLOOR(v_base_points * v_multiplier);

    IF v_final_points <= 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'points_earned', 0, 'message', 'Chưa đủ ngưỡng tích điểm tối thiểu.');
    END IF;

    v_new_balance := v_balance.available_points + v_final_points;
    v_new_total_earned := v_balance.total_earned_points + v_final_points;
    v_new_qualifying_spend := v_balance.tier_qualifying_spend + p_eligible_amount;
    v_expires_at := TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_policy.points_expiry_days || ' days')::INTERVAL;

    -- 6. Ghi sổ cái điểm (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, expires_at, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'earn', v_final_points,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tích điểm tự động từ hóa đơn mua hàng',
        v_policy.policy_code, p_staff_id, v_expires_at, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 7. Cập nhật số dư & Chi tiêu tích lũy
    UPDATE customer_loyalty_balances SET
        available_points = v_new_balance,
        total_earned_points = v_new_total_earned,
        tier_qualifying_spend = v_new_qualifying_spend,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_earned', v_final_points,
        'balance_after', v_new_balance,
        'message', 'Đã tích ' || v_final_points || ' điểm thành công.'
    );
END;
$$;

-- RPC 3: Đổi / Tiêu điểm thưởng khi thanh toán POS (Chống Overdraw & Race Conditions)
CREATE OR REPLACE FUNCTION rpc_redeem_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_sale_id UUID,
    p_points_to_redeem INT,
    p_bill_total_amount BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_balance RECORD;
    v_discount_value BIGINT := 0;
    v_max_discount BIGINT := 0;
    v_new_balance INT := 0;
    v_new_total_redeemed INT := 0;
BEGIN
    IF p_points_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số điểm tiêu phải lớn hơn 0.');
    END IF;

    -- 1. Kiểm tra idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Giao dịch đổi điểm đã hoàn tất.');
        END IF;
    END IF;

    -- 2. Kiểm tra chính sách
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Chính sách đổi điểm đang TẮT.');
    END IF;

    -- 3. Khóa số dư khách hàng chống tiêu vượt / đồng thời
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND OR v_balance.available_points < p_points_to_redeem THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Số dư điểm không đủ. Khả dụng: ' || COALESCE(v_balance.available_points, 0) || ' điểm.'
        );
    END IF;

    -- 4. Tính toán số tiền quy đổi và kiểm tra trần % hóa đơn
    v_discount_value := p_points_to_redeem * v_policy.points_to_currency_ratio;
    v_max_discount := FLOOR(p_bill_total_amount * v_policy.max_redeem_percentage / 100);

    IF v_discount_value > v_max_discount THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Vượt quá giới hạn đổi điểm tối đa (' || v_policy.max_redeem_percentage || '% hóa đơn = ' || v_max_discount || ' VNĐ).'
        );
    END IF;

    v_new_balance := v_balance.available_points - p_points_to_redeem;
    v_new_total_redeemed := v_balance.total_redeemed_points + p_points_to_redeem;

    -- 5. Ghi Sổ cái điểm
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'redeem', -p_points_to_redeem,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tiêu điểm giảm trừ hóa đơn POS (' || v_discount_value || ' VNĐ)',
        v_policy.policy_code, p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 6. Cập nhật số dư
    UPDATE customer_loyalty_balances SET
        available_points = v_new_balance,
        total_redeemed_points = v_new_total_redeemed,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_redeemed', p_points_to_redeem,
        'discount_amount', v_discount_value,
        'balance_after', v_new_balance,
        'message', 'Đổi ' || p_points_to_redeem || ' điểm thành công (Giảm ' || v_discount_value || ' VNĐ).'
    );
END;
$$;

-- RPC 4: Điều chỉnh điểm thủ công (Bắt buộc lý do & Audit)
CREATE OR REPLACE FUNCTION rpc_adjust_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_points_delta INT,
    p_reason TEXT,
    p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance RECORD;
    v_new_balance INT := 0;
BEGIN
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Bắt buộc nhập lý do điều chỉnh tối thiểu 5 ký tự.');
    END IF;

    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    v_new_balance := v_balance.available_points + p_points_delta;
    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số dư điểm sau điều chỉnh không thể âm.');
    END IF;

    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        reason_for_change, staff_id, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'adjust', p_points_delta,
        v_new_balance, 'manual_adjustment', NULL,
        p_reason, p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    UPDATE customer_loyalty_balances SET
        available_points = v_new_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_delta', p_points_delta,
        'balance_after', v_new_balance,
        'message', 'Đã điều chỉnh điểm thành công.'
    );
END;
$$;

-- RPC 5: Đánh giá & Cập nhật hạng thành viên tự động (Tier Evaluation)
CREATE OR REPLACE FUNCTION rpc_evaluate_customer_tier(
    p_org_id UUID,
    p_customer_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance RECORD;
    v_best_tier RECORD;
    v_old_tier VARCHAR(50);
BEGIN
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Không tìm thấy thông tin khách hàng.');
    END IF;

    v_old_tier := v_balance.current_tier;

    -- Tìm hạng cao nhất thỏa mãn ngưỡng chi tiêu
    SELECT * INTO v_best_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id
      AND is_active = TRUE
      AND min_spend_threshold <= v_balance.tier_qualifying_spend
    ORDER BY min_spend_threshold DESC LIMIT 1;

    IF FOUND AND v_best_tier.tier_code <> v_old_tier THEN
        UPDATE customer_loyalty_balances SET
            current_tier = v_best_tier.tier_code,
            tier_updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            tier_expires_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_best_tier.evaluation_period_months || ' months')::INTERVAL,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE customer_id = p_customer_id;

        -- Ghi nhật ký thăng hạng
        INSERT INTO customer_tier_history (
            customer_id, organization_id, previous_tier, new_tier,
            qualifying_spend_snapshot, reason, changed_by, created_at
        ) VALUES (
            p_customer_id, p_org_id, v_old_tier, v_best_tier.tier_code,
            v_balance.tier_qualifying_spend, 'Thăng hạng tự động theo chi tiêu tích lũy',
            p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        -- Đồng bộ vào cột tier của bảng customers
        UPDATE customers SET
            tier = v_best_tier.tier_code,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_customer_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'tier_changed', TRUE,
            'previous_tier', v_old_tier,
            'new_tier', v_best_tier.tier_code,
            'tier_name', v_best_tier.tier_name,
            'message', 'Đã nâng hạng thành viên lên ' || v_best_tier.tier_name || '.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tier_changed', FALSE,
        'current_tier', v_old_tier,
        'message', 'Hạng thành viên giữ nguyên.'
    );
END;
$$;

-- Cấp quyền RPC
GRANT EXECUTE ON FUNCTION rpc_get_customer_loyalty_overview TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_earn_loyalty_points TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_redeem_loyalty_points TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_adjust_loyalty_points TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_evaluate_customer_tier TO anon, authenticated, service_role;



-- -----------------------------------------------------------------------------
-- FILE: 032_p10_chatbox_and_cskh_inbox.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 032: PHASE 10 — OMNICHANNEL CHATBOX & CSKH INBOX ENGINE (MỐC A, B, C)
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG KẾT NỐI KÊNH HỘI THOẠI (CHANNEL_INTEGRATIONS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    channel_type VARCHAR(50) NOT NULL, -- 'zalo_oa', 'facebook_messenger', 'web_widget', 'hotline_note'
    channel_name VARCHAR(255) NOT NULL,
    account_id VARCHAR(100), -- OA ID / Page ID
    app_id VARCHAR(100),
    secret_key_enc TEXT, -- Lưu an toàn phía server
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMPTZ,
    webhook_verify_token VARCHAR(255),
    is_connected BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_channel_org_account UNIQUE (organization_id, channel_type, account_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_org ON channel_integrations(organization_id, channel_type);

-- -----------------------------------------------------------------------------
-- 2. BẢNG LUỒNG HỘI THOẠI (CONVERSATION_THREADS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES channel_integrations(id) ON DELETE SET NULL,
    channel_type VARCHAR(50) NOT NULL DEFAULT 'web_widget',
    external_user_id VARCHAR(100) NOT NULL, -- Zalo User ID (ZUID) / FB PSID / Web Client ID
    external_user_name VARCHAR(255) NOT NULL DEFAULT 'Khách vãng lai',
    external_user_avatar TEXT,
    external_user_phone VARCHAR(50),
    assigned_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
    priority VARCHAR(50) NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    last_message_preview TEXT,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    unread_count INT NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_thread_external_user UNIQUE (organization_id, channel_type, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_org_status ON conversation_threads(organization_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_customer ON conversation_threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_threads_assigned_staff ON conversation_threads(assigned_staff_id);

-- -----------------------------------------------------------------------------
-- 3. BẢNG TIN NHẮN & GHI CHÚ NỘI BỘ (CHAT_MESSAGES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- 'customer', 'staff', 'system', 'internal_note'
    sender_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    sender_name VARCHAR(255) NOT NULL,
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE, -- Ghi chú nội bộ vàng (chỉ NV thấy)
    message_type VARCHAR(50) NOT NULL DEFAULT 'text', -- 'text', 'image', 'attachment', 'appointment_card'
    content TEXT NOT NULL,
    attachment_urls TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    idempotency_key VARCHAR(255) UNIQUE,
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'delivered', -- 'pending', 'sent', 'delivered', 'read', 'failed'
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 4. BẢNG MẪU TIN NHẮN CSKH / NHẮC LỊCH (MESSAGE_TEMPLATES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_code VARCHAR(100) NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'appointment_reminder', 'post_treatment_care', 'birthday_greeting', 'loyalty_tier_up'
    channel_supported TEXT[] NOT NULL DEFAULT '{"zalo_oa", "facebook_messenger"}',
    content_template TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- Danh sách biến: customer_name, branch_name, appointment_time, doctor_name
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Mặc định TẮT
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_msg_template_code UNIQUE (organization_id, template_code)
);

-- -----------------------------------------------------------------------------
-- 5. BẢNG LỊCH GỬI THÔNG BÁO TỰ ĐỘNG (SCHEDULED_NOTIFICATIONS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    treatment_session_id UUID REFERENCES treatment_sessions(id) ON DELETE SET NULL,
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    channel_type VARCHAR(50) NOT NULL DEFAULT 'zalo_oa',
    scheduled_for TIMESTAMPTZ NOT NULL,
    rendered_content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'cancelled', 'failed'
    sent_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status ON scheduled_notifications(status, scheduled_for ASC);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_appt ON scheduled_notifications(appointment_id);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE channel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_channel_integrations_read ON channel_integrations;
CREATE POLICY rls_channel_integrations_read ON channel_integrations FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_channel_integrations_write ON channel_integrations;
CREATE POLICY rls_channel_integrations_write ON channel_integrations FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_conversation_threads_read ON conversation_threads;
CREATE POLICY rls_conversation_threads_read ON conversation_threads FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_conversation_threads_write ON conversation_threads;
CREATE POLICY rls_conversation_threads_write ON conversation_threads FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_chat_messages_read ON chat_messages;
CREATE POLICY rls_chat_messages_read ON chat_messages FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_chat_messages_write ON chat_messages;
CREATE POLICY rls_chat_messages_write ON chat_messages FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_message_templates_read ON message_templates;
CREATE POLICY rls_message_templates_read ON message_templates FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_message_templates_write ON message_templates;
CREATE POLICY rls_message_templates_write ON message_templates FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_scheduled_notifications_read ON scheduled_notifications;
CREATE POLICY rls_scheduled_notifications_read ON scheduled_notifications FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_scheduled_notifications_write ON scheduled_notifications;
CREATE POLICY rls_scheduled_notifications_write ON scheduled_notifications FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

GRANT ALL ON channel_integrations TO anon, authenticated, service_role;
GRANT ALL ON conversation_threads TO anon, authenticated, service_role;
GRANT ALL ON chat_messages TO anon, authenticated, service_role;
GRANT ALL ON message_templates TO anon, authenticated, service_role;
GRANT ALL ON scheduled_notifications TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. RPC FUNCTIONS FOR SECURE CHATBOX & CSKH
-- -----------------------------------------------------------------------------

-- RPC 1: Lấy danh sách hội thoại Inbox kèm lọc và phân trang
CREATE OR REPLACE FUNCTION rpc_get_conversation_threads(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL, -- NULL = all, 'open', 'in_progress', 'resolved', 'closed'
    p_channel_type VARCHAR DEFAULT NULL,
    p_assigned_staff_id UUID DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(100, GREATEST(1, COALESCE(p_page_size, 50)));
    v_threads JSONB;
    v_total INT := 0;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM conversation_threads t
    WHERE t.organization_id = p_org_id
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
      AND (p_status IS NULL OR p_status = 'all' OR t.status = p_status)
      AND (p_channel_type IS NULL OR p_channel_type = 'all' OR t.channel_type = p_channel_type)
      AND (p_assigned_staff_id IS NULL OR t.assigned_staff_id = p_assigned_staff_id)
      AND (p_search IS NULL OR p_search = '' OR (
          t.external_user_name ILIKE '%' || p_search || '%' OR
          t.external_user_phone ILIKE '%' || p_search || '%' OR
          t.last_message_preview ILIKE '%' || p_search || '%'
      ));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'channel_type', t.channel_type,
        'customer_id', t.customer_id,
        'customer_name', c.full_name,
        'customer_phone', c.phone,
        'external_user_id', t.external_user_id,
        'external_user_name', t.external_user_name,
        'external_user_avatar', t.external_user_avatar,
        'external_user_phone', t.external_user_phone,
        'assigned_staff_id', t.assigned_staff_id,
        'assigned_staff_name', sp.full_name,
        'branch_name', b.name,
        'status', t.status,
        'priority', t.priority,
        'last_message_preview', t.last_message_preview,
        'last_message_at', t.last_message_at,
        'unread_count', t.unread_count,
        'tags', t.tags,
        'created_at', t.created_at
    ) ORDER BY t.last_message_at DESC), '[]'::JSONB)
    INTO v_threads
    FROM (
        SELECT t.*
        FROM conversation_threads t
        WHERE t.organization_id = p_org_id
          AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
          AND (p_status IS NULL OR p_status = 'all' OR t.status = p_status)
          AND (p_channel_type IS NULL OR p_channel_type = 'all' OR t.channel_type = p_channel_type)
          AND (p_assigned_staff_id IS NULL OR t.assigned_staff_id = p_assigned_staff_id)
          AND (p_search IS NULL OR p_search = '' OR (
              t.external_user_name ILIKE '%' || p_search || '%' OR
              t.external_user_phone ILIKE '%' || p_search || '%' OR
              t.last_message_preview ILIKE '%' || p_search || '%'
          ))
        ORDER BY t.last_message_at DESC
        OFFSET v_offset LIMIT v_limit
    ) t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN staff_profiles sp ON sp.id = t.assigned_staff_id
    LEFT JOIN branches b ON b.id = t.branch_id;

    RETURN jsonb_build_object(
        'threads', v_threads,
        'total', v_total,
        'page', p_page,
        'page_size', v_limit
    );
END;
$$;

-- RPC 2: Lấy chi tiết tin nhắn trong một hội thoại
CREATE OR REPLACE FUNCTION rpc_get_thread_messages(
    p_thread_id UUID,
    p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_messages JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'thread_id', m.thread_id,
        'sender_type', m.sender_type,
        'sender_staff_id', m.sender_staff_id,
        'sender_name', m.sender_name,
        'is_internal_note', m.is_internal_note,
        'message_type', m.message_type,
        'content', m.content,
        'attachment_urls', m.attachment_urls,
        'metadata', m.metadata,
        'delivery_status', m.delivery_status,
        'created_at', m.created_at
    ) ORDER BY m.created_at ASC), '[]'::JSONB)
    INTO v_messages
    FROM (
        SELECT *
        FROM chat_messages
        WHERE thread_id = p_thread_id
        ORDER BY created_at DESC
        LIMIT p_limit
    ) m;

    -- Đánh dấu đã đọc
    UPDATE conversation_threads SET
        unread_count = 0,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_thread_id;

    RETURN jsonb_build_object(
        'thread_id', p_thread_id,
        'messages', v_messages
    );
END;
$$;

-- RPC 3: Gửi tin nhắn / Ghi chú nội bộ
CREATE OR REPLACE FUNCTION rpc_send_chat_message(
    p_thread_id UUID,
    p_sender_staff_id UUID,
    p_content TEXT,
    p_is_internal_note BOOLEAN DEFAULT FALSE,
    p_message_type VARCHAR DEFAULT 'text',
    p_attachment_urls TEXT[] DEFAULT '{}',
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_thread RECORD;
    v_staff RECORD;
    v_msg_id UUID;
    v_preview TEXT;
    v_status VARCHAR(50);
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM chat_messages WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Tin nhắn đã được gửi trước đó (Idempotent).');
        END IF;
    END IF;

    SELECT * INTO v_thread FROM conversation_threads WHERE id = p_thread_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Không tìm thấy hội thoại.');
    END IF;

    SELECT * INTO v_staff FROM staff_profiles WHERE id = p_sender_staff_id;

    v_preview := SUBSTRING(TRIM(p_content) FROM 1 FOR 100);
    IF p_is_internal_note THEN
        v_preview := '[Ghi chú nội bộ] ' || v_preview;
    END IF;

    INSERT INTO chat_messages (
        thread_id, organization_id, sender_type, sender_staff_id,
        sender_name, is_internal_note, message_type, content,
        attachment_urls, idempotency_key, delivery_status, created_at
    ) VALUES (
        p_thread_id, v_thread.organization_id,
        CASE WHEN p_is_internal_note THEN 'internal_note' ELSE 'staff' END,
        p_sender_staff_id, COALESCE(v_staff.full_name, 'Tư Vấn Viên'),
        p_is_internal_note, p_message_type, p_content,
        p_attachment_urls, p_idempotency_key, 'delivered', TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    ) RETURNING id INTO v_msg_id;

    -- Cập nhật thread last_message
    UPDATE conversation_threads SET
        last_message_preview = v_preview,
        last_message_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_thread_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message_id', v_msg_id,
        'message', 'Đã lưu tin nhắn thành công.'
    );
END;
$$;

-- RPC 4: Gắn khách hàng & Chuyển trạng thái hội thoại
CREATE OR REPLACE FUNCTION rpc_update_thread_status_and_customer(
    p_thread_id UUID,
    p_status VARCHAR DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_assigned_staff_id UUID DEFAULT NULL,
    p_priority VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE conversation_threads SET
        status = COALESCE(p_status, status),
        customer_id = COALESCE(p_customer_id, customer_id),
        assigned_staff_id = COALESCE(p_assigned_staff_id, assigned_staff_id),
        priority = COALESCE(p_priority, priority),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_thread_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'thread_id', p_thread_id,
        'message', 'Cập nhật trạng thái hội thoại thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_conversation_threads TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_get_thread_messages TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_send_chat_message TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_update_thread_status_and_customer TO anon, authenticated, service_role;



-- -----------------------------------------------------------------------------
-- FILE: 033_p10_webhook_crm_bridge.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 033: PHASE 10 MỐC B — BIDIRECTIONAL BRIDGE VỚI WEBHOOK_CRM
-- Target: PostgreSQL / Supabase
-- Bảo toàn 100% mã nguồn dự án webhook_CRM (Không can thiệp hay sửa file)
-- =============================================================================

-- 0. TABLES: MESSENGER_CONVERSATIONS & MESSENGER_MESSAGES
CREATE TABLE IF NOT EXISTS messenger_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id VARCHAR(100) NOT NULL DEFAULT 'default_page',
    sender_psid VARCHAR(100) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_messenger_page_psid UNIQUE (page_id, sender_psid)
);

CREATE TABLE IF NOT EXISTS messenger_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES messenger_conversations(id) ON DELETE CASCADE,
    event_id VARCHAR(255),
    direction VARCHAR(50) NOT NULL DEFAULT 'inbound',
    sender_psid VARCHAR(100),
    text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 1. TRIGGER SYNC: TỪ MESSENGER_CONVERSATIONS SANG CONVERSATION_THREADS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_messenger_conv_to_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_thread_id UUID;
    v_name VARCHAR(255);
BEGIN
    v_name := COALESCE(NEW.full_name, 'Khách Facebook Fanpage-Tuấn Phạm');

    -- Tìm thread hiện có theo external_user_id (sender_psid)
    SELECT id INTO v_thread_id
    FROM conversation_threads
    WHERE organization_id = v_org_id
      AND channel_type = 'facebook_messenger'
      AND external_user_id = NEW.sender_psid;

    IF v_thread_id IS NULL THEN
        INSERT INTO conversation_threads (
            organization_id,
            channel_type,
            external_user_id,
            external_user_name,
            external_user_phone,
            status,
            priority,
            last_message_at,
            unread_count,
            created_at,
            updated_at
        ) VALUES (
            v_org_id,
            'facebook_messenger',
            NEW.sender_psid,
            v_name,
            NEW.phone,
            'open',
            'normal',
            COALESCE(NEW.last_message_at, NOW()),
            1,
            COALESCE(NEW.created_at, NOW()),
            COALESCE(NEW.updated_at, NOW())
        );
    ELSE
        UPDATE conversation_threads SET
            external_user_name = COALESCE(NEW.full_name, external_user_name),
            external_user_phone = COALESCE(NEW.phone, external_user_phone),
            last_message_at = COALESCE(NEW.last_message_at, NOW()),
            updated_at = NOW()
        WHERE id = v_thread_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_messenger_conv ON messenger_conversations;
CREATE TRIGGER trg_sync_messenger_conv
    AFTER INSERT OR UPDATE ON messenger_conversations
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_messenger_conv_to_thread();

-- -----------------------------------------------------------------------------
-- 2. TRIGGER SYNC: TỪ MESSENGER_MESSAGES SANG CHAT_MESSAGES (HỘP THƯ CRM)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_messenger_msg_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_thread_id UUID;
    v_conv RECORD;
    v_sender_type VARCHAR(50);
    v_sender_name VARCHAR(255);
    v_preview TEXT;
BEGIN
    -- Lấy thông tin conversation tương ứng
    SELECT * INTO v_conv FROM messenger_conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Tìm thread tương ứng trong CRM
    SELECT id INTO v_thread_id
    FROM conversation_threads
    WHERE organization_id = v_org_id
      AND channel_type = 'facebook_messenger'
      AND external_user_id = v_conv.sender_psid;

    IF v_thread_id IS NULL THEN
        -- Tự động tạo thread nếu chưa có
        INSERT INTO conversation_threads (
            organization_id,
            channel_type,
            external_user_id,
            external_user_name,
            status,
            last_message_preview,
            last_message_at,
            unread_count
        ) VALUES (
            v_org_id,
            'facebook_messenger',
            v_conv.sender_psid,
            COALESCE(v_conv.full_name, 'Khách Facebook'),
            'open',
            SUBSTRING(NEW.text FROM 1 FOR 100),
            COALESCE(NEW.created_at, NOW()),
            1
        ) RETURNING id INTO v_thread_id;
    END IF;

    -- Xác định vai trò người gửi
    IF NEW.direction = 'inbound' THEN
        v_sender_type := 'customer';
        v_sender_name := COALESCE(v_conv.full_name, 'Khách Facebook');
    ELSE
        v_sender_type := 'staff';
        v_sender_name := 'Tư Vấn Viên';
    END IF;

    v_preview := SUBSTRING(TRIM(NEW.text) FROM 1 FOR 100);

    -- Chống lưu trùng tin nhắn theo event_id
    IF NEW.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM chat_messages WHERE idempotency_key = NEW.event_id) THEN
        RETURN NEW;
    END IF;

    -- Thêm vào chat_messages
    INSERT INTO chat_messages (
        thread_id,
        organization_id,
        sender_type,
        sender_name,
        is_internal_note,
        message_type,
        content,
        idempotency_key,
        delivery_status,
        created_at
    ) VALUES (
        v_thread_id,
        v_org_id,
        v_sender_type,
        v_sender_name,
        FALSE,
        'text',
        NEW.text,
        NEW.event_id,
        'delivered',
        COALESCE(NEW.created_at, NOW())
    );

    -- Cập nhật last_message trên thread
    UPDATE conversation_threads SET
        last_message_preview = v_preview,
        last_message_at = COALESCE(NEW.created_at, NOW()),
        unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
        updated_at = NOW()
    WHERE id = v_thread_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_messenger_msg ON messenger_messages;
CREATE TRIGGER trg_sync_messenger_msg
    AFTER INSERT ON messenger_messages
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_messenger_msg_to_chat();

-- -----------------------------------------------------------------------------
-- 3. RPC HELPER: MÔ PHỎNG SỰ KIỆN TỪ WEBHOOK_CRM ĐỂ KIỂM THỬ
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_simulate_webhook_crm_inbound(
    p_page_id TEXT,
    p_sender_psid TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conv_id UUID;
    v_msg_id UUID;
BEGIN
    -- Upsert messenger_conversations
    INSERT INTO messenger_conversations (page_id, sender_psid, full_name, phone, status, last_message_at)
    VALUES (p_page_id, p_sender_psid, p_full_name, p_phone, 'collecting', NOW())
    ON CONFLICT (page_id, sender_psid) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, messenger_conversations.phone),
        last_message_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_conv_id;

    -- Insert messenger_messages
    INSERT INTO messenger_messages (conversation_id, event_id, direction, sender_psid, text)
    VALUES (v_conv_id, 'mid.sim_' || gen_random_uuid(), 'inbound', p_sender_psid, p_text)
    RETURNING id INTO v_msg_id;

    RETURN jsonb_build_object('success', TRUE, 'conversation_id', v_conv_id, 'message_id', v_msg_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_simulate_webhook_crm_inbound TO anon, authenticated, service_role;



-- -----------------------------------------------------------------------------
-- FILE: 034_security_hardening_rls_all_tables.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 034: COMPREHENSIVE ROLE-BASED & BRANCH-ISOLATED RLS SECURITY HARDENING
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_staff_id()
RETURNS UUID AS $$
    SELECT sp.id
    FROM staff_profiles sp
    WHERE sp.auth_user_id = auth.uid()
      AND sp.is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1. DROP ALL LEGACY / PERMISSIVE POLICIES
-- -----------------------------------------------------------------------------

-- Treatment & Medical
DROP POLICY IF EXISTS rls_treatment_plans_read ON treatment_plans;
DROP POLICY IF EXISTS rls_treatment_plans_write ON treatment_plans;
DROP POLICY IF EXISTS treatment_plans_select_policy ON treatment_plans;
DROP POLICY IF EXISTS treatment_plans_write_policy ON treatment_plans;
DROP POLICY IF EXISTS rls_treatment_sessions_all ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_select_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_insert_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_update_policy ON treatment_sessions;
DROP POLICY IF EXISTS treatment_sessions_role_policy ON treatment_sessions;
DROP POLICY IF EXISTS rls_treatment_session_audits_all ON treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_select ON treatment_session_audits;
DROP POLICY IF EXISTS treatment_session_audits_insert ON treatment_session_audits;
DROP POLICY IF EXISTS rls_treatment_photos_all ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_select_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_write_policy ON treatment_photos;
DROP POLICY IF EXISTS treatment_photos_role_policy ON treatment_photos;
DROP POLICY IF EXISTS rls_treatment_consents_all ON treatment_consents;
DROP POLICY IF EXISTS treatment_consents_select_policy ON treatment_consents;
DROP POLICY IF EXISTS treatment_consents_write_policy ON treatment_consents;
DROP POLICY IF EXISTS treatment_consents_role_policy ON treatment_consents;

-- HR & Payroll
DROP POLICY IF EXISTS rls_payroll_periods_all ON payroll_periods;
DROP POLICY IF EXISTS payroll_periods_select_policy ON payroll_periods;
DROP POLICY IF EXISTS payroll_periods_write_policy ON payroll_periods;
DROP POLICY IF EXISTS rls_payroll_records_all ON payroll_records;
DROP POLICY IF EXISTS payroll_records_select_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_records_admin_write ON payroll_records;
DROP POLICY IF EXISTS payroll_role_policy ON payroll_records;
DROP POLICY IF EXISTS payroll_admin_write_policy ON payroll_records;
DROP POLICY IF EXISTS rls_commission_records_all ON commission_records;
DROP POLICY IF EXISTS commission_records_select_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_insert_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_update_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_delete_policy ON commission_records;
DROP POLICY IF EXISTS commission_records_admin_write ON commission_records;
DROP POLICY IF EXISTS commission_role_policy ON commission_records;

-- Inventory Transfers & Audits
DROP POLICY IF EXISTS rls_branch_transfers_all ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_select_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_insert_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_update_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_delete_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_access_policy ON branch_transfers;
DROP POLICY IF EXISTS branch_transfers_mgr_write_policy ON branch_transfers;
DROP POLICY IF EXISTS rls_branch_transfer_items_all ON branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_select ON branch_transfer_items;
DROP POLICY IF EXISTS branch_transfer_items_write ON branch_transfer_items;
DROP POLICY IF EXISTS rls_inventory_audits_all ON inventory_audits;
DROP POLICY IF EXISTS inventory_audits_select_policy ON inventory_audits;
DROP POLICY IF EXISTS inventory_audits_write_policy ON inventory_audits;
DROP POLICY IF EXISTS rls_inventory_audit_items_all ON inventory_audit_items;
DROP POLICY IF EXISTS inventory_audit_items_select_policy ON inventory_audit_items;
DROP POLICY IF EXISTS inventory_audit_items_write_policy ON inventory_audit_items;

-- Chatbox & CSKH
DROP POLICY IF EXISTS rls_conversation_threads_all ON conversation_threads;
DROP POLICY IF EXISTS conversation_threads_auth_policy ON conversation_threads;
DROP POLICY IF EXISTS threads_org_policy ON conversation_threads;
DROP POLICY IF EXISTS threads_org_isolation ON conversation_threads;
DROP POLICY IF EXISTS rls_chat_messages_all ON chat_messages;
DROP POLICY IF EXISTS chat_messages_auth_policy ON chat_messages;
DROP POLICY IF EXISTS chat_messages_org_policy ON chat_messages;
DROP POLICY IF EXISTS messages_org_isolation ON chat_messages;
DROP POLICY IF EXISTS channel_integrations_auth_policy ON channel_integrations;
DROP POLICY IF EXISTS message_templates_auth_policy ON message_templates;

-- Loyalty & Memberships
DROP POLICY IF EXISTS rls_loyalty_policies_read ON loyalty_policies;
DROP POLICY IF EXISTS rls_loyalty_policies_write ON loyalty_policies;
DROP POLICY IF EXISTS loyalty_policies_select ON loyalty_policies;
DROP POLICY IF EXISTS loyalty_policies_write ON loyalty_policies;
DROP POLICY IF EXISTS rls_loyalty_tier_policies_read ON loyalty_tier_policies;
DROP POLICY IF EXISTS rls_loyalty_tier_policies_write ON loyalty_tier_policies;
DROP POLICY IF EXISTS loyalty_tier_policies_select ON loyalty_tier_policies;
DROP POLICY IF EXISTS loyalty_tier_policies_write ON loyalty_tier_policies;
DROP POLICY IF EXISTS rls_customer_loyalty_balances_read ON customer_loyalty_balances;
DROP POLICY IF EXISTS rls_customer_loyalty_balances_write ON customer_loyalty_balances;
DROP POLICY IF EXISTS customer_loyalty_balances_select ON customer_loyalty_balances;
DROP POLICY IF EXISTS customer_loyalty_balances_write ON customer_loyalty_balances;
DROP POLICY IF EXISTS rls_loyalty_points_ledger_read ON loyalty_points_ledger;
DROP POLICY IF EXISTS rls_loyalty_points_ledger_write ON loyalty_points_ledger;
DROP POLICY IF EXISTS loyalty_points_ledger_select ON loyalty_points_ledger;
DROP POLICY IF EXISTS loyalty_points_ledger_write ON loyalty_points_ledger;
DROP POLICY IF EXISTS rls_customer_tier_history_read ON customer_tier_history;
DROP POLICY IF EXISTS rls_customer_tier_history_write ON customer_tier_history;
DROP POLICY IF EXISTS customer_tier_history_select ON customer_tier_history;
DROP POLICY IF EXISTS customer_tier_history_write ON customer_tier_history;

-- Revoke direct table permissions from anon
REVOKE ALL ON treatment_plans, treatment_sessions, treatment_session_audits, treatment_photos, treatment_consents FROM anon;
REVOKE ALL ON payroll_periods, payroll_records, commission_records FROM anon;
REVOKE ALL ON branch_transfers, branch_transfer_items, inventory_audits, inventory_audit_items FROM anon;
REVOKE ALL ON loyalty_policies, loyalty_tier_policies, customer_loyalty_balances, loyalty_points_ledger, customer_tier_history FROM anon;
REVOKE ALL ON conversation_threads, chat_messages, channel_integrations, message_templates FROM anon;

-- -----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_session_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_consents ENABLE ROW LEVEL SECURITY;

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE loyalty_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tier_history ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. FINE-GRAINED ROLE & BRANCH RLS POLICIES (AUTHENTICATED ONLY)
-- -----------------------------------------------------------------------------

-- =============================================================================
-- A. HỒ SƠ ĐIỀU TRỊ & Y KHOA
-- =============================================================================

-- --- 1. Phác đồ điều trị (treatment_plans) ---
CREATE POLICY treatment_plans_select_policy ON treatment_plans
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
            OR lead_doctor_id = get_current_staff_id()
        )
    );

CREATE POLICY treatment_plans_write_policy ON treatment_plans
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND has_branch_access(branch_id))
        )
    );

-- --- 2. Buổi điều trị chi tiết (treatment_sessions) ---
-- Đọc: Chủ cơ sở, Quản lý chi nhánh, Lễ tân (thu ngân/đón tiếp), hoặc chính Bác sĩ thực hiện
CREATE POLICY treatment_sessions_select_policy ON treatment_sessions
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
            OR performed_by = get_current_staff_id()
        )
    );

-- Tạo buổi điều trị: Chỉ Bác sĩ/KTV tại chi nhánh được gán hoặc Quản lý chi nhánh / Admin (CHẶN LỄ TÂN)
CREATE POLICY treatment_sessions_insert_policy ON treatment_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND performed_by = get_current_staff_id() AND has_branch_access(branch_id))
        )
    );

-- Sửa buổi điều trị: Chỉ Bác sĩ thực hiện khi còn ở trạng thái draft, hoặc Admin/Manager
CREATE POLICY treatment_sessions_update_policy ON treatment_sessions
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (get_current_user_role() = 'technician_doctor' AND performed_by = get_current_staff_id() AND has_branch_access(branch_id))
        )
    );

-- --- 3. Nhật ký kiểm toán hồ sơ (treatment_session_audits) ---
CREATE POLICY treatment_session_audits_select ON treatment_session_audits
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM treatment_sessions ts
            WHERE ts.id = treatment_session_audits.session_id
              AND ts.organization_id = get_current_user_org_id()
              AND (get_current_user_role() IN ('owner_admin', 'branch_manager') OR ts.performed_by = get_current_staff_id())
        )
    );

CREATE POLICY treatment_session_audits_insert ON treatment_session_audits
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

-- --- 4. Quản lý Ảnh Before/After (treatment_photos) ---
CREATE POLICY treatment_photos_select_policy ON treatment_photos
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
            OR EXISTS (
                SELECT 1 FROM treatment_sessions ts
                WHERE ts.id = treatment_photos.session_id AND ts.performed_by = get_current_staff_id()
            )
        )
    );

-- Ghi ảnh: Kiểm tra chặt chẽ session tồn tại, cùng tổ chức/chi nhánh, đúng khách và Bác sĩ phụ trách
CREATE POLICY treatment_photos_insert_policy ON treatment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR (
                get_current_user_role() = 'technician_doctor'
                AND has_branch_access(branch_id)
                AND EXISTS (
                    SELECT 1 FROM treatment_sessions ts
                    WHERE ts.id = treatment_photos.session_id
                      AND ts.organization_id = get_current_user_org_id()
                      AND ts.branch_id = treatment_photos.branch_id
                      AND ts.customer_id = treatment_photos.customer_id
                      AND ts.performed_by = get_current_staff_id()
                )
            )
        )
    );

-- --- 5. Cam kết điều trị & Chữ ký điện tử (treatment_consents) ---
CREATE POLICY treatment_consents_select_policy ON treatment_consents
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
            OR witness_staff_id = get_current_staff_id()
            OR EXISTS (
                SELECT 1 FROM treatment_sessions ts
                WHERE ts.id = treatment_consents.session_id AND ts.performed_by = get_current_staff_id()
            )
        )
    );

CREATE POLICY treatment_consents_insert_policy ON treatment_consents
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist', 'technician_doctor')
        )
    );

-- =============================================================================
-- B. HR, HOA HỒNG & BẢNG LƯƠNG
-- =============================================================================

-- --- 1. Kỳ lương (payroll_periods) ---
CREATE POLICY payroll_periods_select_policy ON payroll_periods
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
        )
    );

CREATE POLICY payroll_periods_write_policy ON payroll_periods
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- --- 2. Bảng lương chi tiết (payroll_records) ---
CREATE POLICY payroll_records_select_policy ON payroll_records
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR staff_id = get_current_staff_id()
        )
    );

CREATE POLICY payroll_records_admin_write ON payroll_records
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- --- 3. Sổ hoa hồng (commission_records) ---
CREATE POLICY commission_records_select_policy ON commission_records
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
            OR staff_id = get_current_staff_id()
        )
    );

CREATE POLICY commission_records_insert_policy ON commission_records
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY commission_records_update_policy ON commission_records
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY commission_records_delete_policy ON commission_records
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

-- =============================================================================
-- C. ĐIỀU CHUYỂN KHO & KIỂM KÊ
-- =============================================================================

-- --- 1. Điều chuyển liên chi nhánh (branch_transfers) ---
CREATE POLICY branch_transfers_select_policy ON branch_transfers
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(from_branch_id)
            OR has_branch_access(to_branch_id)
        )
    );

CREATE POLICY branch_transfers_insert_policy ON branch_transfers
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(from_branch_id))
        )
    );

CREATE POLICY branch_transfers_update_policy ON branch_transfers
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND (has_branch_access(from_branch_id) OR has_branch_access(to_branch_id)))
        )
    );

CREATE POLICY branch_transfers_delete_policy ON branch_transfers
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY branch_transfer_items_select ON branch_transfer_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM branch_transfers bt
            WHERE bt.id = branch_transfer_items.transfer_id
              AND bt.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR has_branch_access(bt.from_branch_id) OR has_branch_access(bt.to_branch_id))
        )
    );

CREATE POLICY branch_transfer_items_write ON branch_transfer_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM branch_transfers bt
            WHERE bt.id = branch_transfer_items.transfer_id
              AND bt.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR (get_current_user_role() = 'branch_manager' AND has_branch_access(bt.from_branch_id)))
        )
    );

-- --- 2. Kiểm kê kho (inventory_audits & inventory_audit_items) ---
CREATE POLICY inventory_audits_select_policy ON inventory_audits
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR has_branch_access(branch_id)
        )
    );

CREATE POLICY inventory_audits_write_policy ON inventory_audits
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() = 'owner_admin'
            OR (get_current_user_role() = 'branch_manager' AND has_branch_access(branch_id))
        )
    );

CREATE POLICY inventory_audit_items_select_policy ON inventory_audit_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM inventory_audits ia
            WHERE ia.id = inventory_audit_items.audit_id
              AND ia.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR has_branch_access(ia.branch_id))
        )
    );

CREATE POLICY inventory_audit_items_write_policy ON inventory_audit_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM inventory_audits ia
            WHERE ia.id = inventory_audit_items.audit_id
              AND ia.organization_id = get_current_user_org_id()
              AND (get_current_user_role() = 'owner_admin' OR (get_current_user_role() = 'branch_manager' AND has_branch_access(ia.branch_id)))
        )
    );

-- =============================================================================
-- D. HỘP THƯ CSKH & CHATBOX
-- =============================================================================
CREATE POLICY conversation_threads_auth_policy ON conversation_threads
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY chat_messages_auth_policy ON chat_messages
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY channel_integrations_auth_policy ON channel_integrations
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND (
            get_current_user_role() IN ('owner_admin', 'branch_manager', 'cashier_receptionist')
        )
    );

CREATE POLICY message_templates_auth_policy ON message_templates
    FOR ALL TO authenticated
    USING (organization_id = get_current_user_org_id());

-- =============================================================================
-- E. LOYALTY & HẠNG THÀNH VIÊN
-- =============================================================================
CREATE POLICY loyalty_policies_select ON loyalty_policies
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY loyalty_policies_write ON loyalty_policies
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY loyalty_tier_policies_select ON loyalty_tier_policies
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY loyalty_tier_policies_write ON loyalty_tier_policies
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY customer_loyalty_balances_select ON customer_loyalty_balances
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY customer_loyalty_balances_write ON customer_loyalty_balances
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_user_org_id()
        AND get_current_user_role() = 'owner_admin'
    );

CREATE POLICY loyalty_points_ledger_select ON loyalty_points_ledger
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());

CREATE POLICY customer_tier_history_select ON customer_tier_history
    FOR SELECT TO authenticated
    USING (organization_id = get_current_user_org_id());



-- -----------------------------------------------------------------------------
-- FILE: 035_loyalty_server_hardening_and_approval_guard.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- MIGRATION 035: LOYALTY SERVER-SIDE SECURITY, ACID LOCKING & APPROVAL GUARD
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. ADD APPROVAL FLAG TO LOYALTY POLICIES
ALTER TABLE loyalty_policies ADD COLUMN IF NOT EXISTS is_approved_by_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. HARDENED ACID RPC: EARN LOYALTY POINTS (SERVER-SIDE VALIDATION & CONCURRENCY GUARD)
CREATE OR REPLACE FUNCTION rpc_earn_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_sale_id UUID,
    p_eligible_amount BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_tier RECORD;
    v_balance RECORD;
    v_sale RECORD;
    v_actual_spend BIGINT;
    v_multiplier NUMERIC(3, 2) := 1.00;
    v_base_points INT := 0;
    v_final_points INT := 0;
    v_new_balance INT := 0;
    v_new_total_earned INT := 0;
    v_new_qualifying_spend BIGINT := 0;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Kiểm tra quyền và danh tính người gọi
    IF auth.uid() IS NOT NULL THEN
        IF p_org_id != get_current_user_org_id() THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Không có quyền thao tác trên tổ chức này.');
        END IF;
    END IF;

    -- 2. Kiểm tra cờ chính sách đã được phê duyệt bởi Chủ cơ sở hay chưa
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND OR v_policy.is_approved_by_owner = FALSE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'is_policy_blocked', TRUE,
            'error', 'Chính sách Loyalty chưa được Chủ cơ sở phê duyệt kích hoạt. Giao dịch không tự động tích điểm.'
        );
    END IF;

    -- 3. Bắt buộc có hóa đơn hợp lệ (Không cho phép tích điểm không gắn hóa đơn)
    IF p_sale_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Bắt buộc phải có mã hóa đơn hợp lệ để tích điểm.');
    END IF;

    -- Khóa dòng hóa đơn (FOR UPDATE) để chống race condition
    SELECT * INTO v_sale FROM sales
    WHERE id = p_sale_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn không tồn tại trên hệ thống.');
    END IF;

    -- Đối soát hóa đơn phải thuộc đúng khách hàng
    IF v_sale.customer_id != p_customer_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn không thuộc về khách hàng được chỉ định.');
    END IF;

    -- Đối soát hóa đơn phải ở trạng thái completed
    IF v_sale.status != 'completed' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn chưa hoàn tất thanh toán, không đủ điều kiện tích điểm.');
    END IF;

    -- 4. Chống tích trùng 1 hóa đơn bằng 2 khóa khác nhau hoặc 2 yêu cầu đồng thời
    IF EXISTS (
        SELECT 1 FROM loyalty_points_ledger
        WHERE organization_id = p_org_id
          AND source_reference_type = 'sale'
          AND source_reference_id = p_sale_id
          AND transaction_type = 'earn'
    ) THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Hóa đơn này đã được tích điểm trước đó (Chống tích trùng hóa đơn).');
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Yêu cầu tích điểm đã được xử lý (Idempotent).');
        END IF;
    END IF;

    -- 5. Xác định giá trị chi tiêu hợp lệ từ Server (Không tin p_eligible_amount từ Client)
    v_actual_spend := v_sale.paid_amount;
    IF v_actual_spend <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số tiền thực thu của hóa đơn bằng 0, không thể tích điểm.');
    END IF;

    -- 6. Khóa dòng số dư khách hàng (FOR UPDATE)
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    -- 7. Tính hệ số nhân hạng VIP
    SELECT * INTO v_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;
    IF FOUND THEN
        v_multiplier := COALESCE(v_tier.points_multiplier, 1.00);
    END IF;

    -- 8. Quy đổi điểm & tính số dư sau giao dịch (balance_after)
    v_base_points := FLOOR(v_actual_spend::NUMERIC / v_policy.earn_spend_ratio);
    v_final_points := FLOOR(v_base_points * v_multiplier);

    IF v_final_points <= 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'points_earned', 0, 'message', 'Chưa đủ ngưỡng tích điểm tối thiểu.');
    END IF;

    v_new_balance := v_balance.available_points + v_final_points;
    v_new_total_earned := v_balance.total_earned_points + v_final_points;
    v_new_qualifying_spend := v_balance.tier_qualifying_spend + v_actual_spend;
    v_expires_at := TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_policy.points_expiry_days || ' days')::INTERVAL;

    -- 9. Ghi sổ cái điểm (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, expires_at, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'earn', v_final_points,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tích điểm từ hóa đơn #' || v_sale.invoice_number, v_policy.policy_version,
        p_staff_id, v_expires_at, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 10. Cập nhật số dư tổng hợp
    UPDATE customer_loyalty_balances
    SET available_points = v_new_balance,
        total_earned_points = v_new_total_earned,
        tier_qualifying_spend = v_new_qualifying_spend,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_earned', v_final_points,
        'new_balance', v_new_balance,
        'multiplier_applied', v_multiplier,
        'message', 'Đã tích ' || v_final_points || ' điểm thành công.'
    );
END;
$$;

-- 3. HARDENED RPC: REDEEM LOYALTY POINTS (SERVER-SIDE APPROVAL & OVERDRAW GUARDS)
CREATE OR REPLACE FUNCTION rpc_redeem_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_points_to_redeem INT,
    p_sale_id UUID,
    p_bill_total BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_balance RECORD;
    v_discount_amount BIGINT;
    v_max_discount BIGINT;
    v_new_balance INT;
    v_new_total_redeemed INT;
BEGIN
    -- 1. Kiểm tra quyền và danh tính
    IF auth.uid() IS NOT NULL THEN
        IF p_org_id != get_current_user_org_id() THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Không có quyền thao tác trên tổ chức này.');
        END IF;
    END IF;

    -- 2. Kiểm tra cờ chính sách
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND OR v_policy.is_approved_by_owner = FALSE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'is_policy_blocked', TRUE,
            'error', 'Chính sách đổi điểm Loyalty chưa được Chủ cơ sở phê duyệt kích hoạt.'
        );
    END IF;

    IF p_points_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số điểm đổi phải lớn hơn 0.');
    END IF;

    -- 3. Khóa dòng số dư (FOR UPDATE)
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND OR v_balance.available_points < p_points_to_redeem THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số dư điểm không đủ để thực hiện đổi điểm.');
    END IF;

    -- 4. Tính toán giá trị giảm trừ & kiểm tra trần % hóa đơn
    v_discount_amount := p_points_to_redeem * v_policy.points_to_currency_ratio;
    v_max_discount := FLOOR(p_bill_total * (v_policy.max_redeem_percentage / 100.0));

    IF v_discount_amount > v_max_discount THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vượt quá giới hạn đổi điểm tối đa (' || v_policy.max_redeem_percentage || '% hóa đơn).');
    END IF;

    v_new_balance := v_balance.available_points - p_points_to_redeem;
    v_new_total_redeemed := v_balance.total_redeemed_points + p_points_to_redeem;

    -- 5. Ghi sổ cái (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'redeem', -p_points_to_redeem,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Đổi điểm thanh toán hóa đơn', v_policy.policy_version,
        p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 6. Cập nhật số dư
    UPDATE customer_loyalty_balances
    SET available_points = v_new_balance,
        total_redeemed_points = v_new_total_redeemed,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_redeemed', p_points_to_redeem,
        'discount_amount', v_discount_amount,
        'new_balance', v_new_balance,
        'message', 'Đổi ' || p_points_to_redeem || ' điểm thành công (Giảm ' || v_discount_amount || ' VNĐ).'
    );
END;
$$;



-- -----------------------------------------------------------------------------
-- LINK 4 STAGING AUTH USERS DIRECTLY TO STAFF PROFILES & MEMBERSHIPS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_b1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    
    v_uid_admin UUID := '5cd9acc9-b242-47f9-994b-13424441383c';
    v_uid_mgr UUID := 'ab814e90-f2e4-47c7-bbc9-29928f9512ac';
    v_uid_rec UUID := 'f79f20ac-ea80-408e-bc97-0a5cafc46ca4';
    v_uid_doc UUID := 'a3dc50c6-b435-4710-ad08-fbb0a3e00630';

    v_staff_admin UUID := '99999999-9999-9999-9999-999999999991';
    v_staff_mgr UUID := '99999999-9999-9999-9999-999999999992';
    v_staff_cashier UUID := '99999999-9999-9999-9999-999999999993';
    v_staff_doc UUID := '99999999-9999-9999-9999-999999999994';
BEGIN
    -- 1. Admin (Chủ cơ sở)
    UPDATE staff_profiles SET auth_user_id = v_uid_admin, email = 'admin.staging@phuongnam.vn' WHERE id = v_staff_admin;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_admin, v_org_id, 'owner_admin', ARRAY[]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'owner_admin', assigned_branch_ids = ARRAY[]::UUID[], is_active = TRUE;

    -- 2. Manager Q1 (Quản lý Chi nhánh Q1)
    UPDATE staff_profiles SET auth_user_id = v_uid_mgr, email = 'manager.q1@phuongnam.vn' WHERE id = v_staff_mgr;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_mgr, v_org_id, 'branch_manager', ARRAY[v_b1_id]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'branch_manager', assigned_branch_ids = ARRAY[v_b1_id]::UUID[], is_active = TRUE;

    -- 3. Receptionist / Cashier Q1 (Lễ tân / Thu ngân Q1)
    UPDATE staff_profiles SET auth_user_id = v_uid_rec, email = 'reception.q1@phuongnam.vn' WHERE id = v_staff_cashier;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_cashier, v_org_id, 'cashier_receptionist', ARRAY[v_b1_id]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'cashier_receptionist', assigned_branch_ids = ARRAY[v_b1_id]::UUID[], is_active = TRUE;

    -- 4. Doctor Q1 (Bác sĩ / KTV Q1)
    UPDATE staff_profiles SET auth_user_id = v_uid_doc, email = 'doctor.tuan@phuongnam.vn' WHERE id = v_staff_doc;
    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids, is_active)
    VALUES (v_staff_doc, v_org_id, 'technician_doctor', ARRAY[v_b1_id]::UUID[], TRUE)
    ON CONFLICT (staff_id, organization_id) DO UPDATE SET role = 'technician_doctor', assigned_branch_ids = ARRAY[v_b1_id]::UUID[], is_active = TRUE;
END;
$$;
