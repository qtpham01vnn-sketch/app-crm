-- =============================================================================
-- FULL DATABASE SCHEMA & SEED SETUP: APP CRM SPA & DENTAL
-- Run this in Supabase SQL Editor to initialize all tables, RLS & Seed Data
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS & ENUMS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('owner_admin', 'branch_manager', 'cashier_receptionist', 'technician_doctor');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE branch_status_enum AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. CORE TABLES (ORGANIZATIONS, BRANCHES, STAFF, MEMBERSHIPS, AUDIT)
-- -----------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS staff_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    title VARCHAR(100),
    pin_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_code_per_org UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS organization_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL DEFAULT 'technician_doctor',
    assigned_branch_ids UUID[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_org_membership UNIQUE (staff_id, organization_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    actor_role VARCHAR(50) NOT NULL,
    event_action VARCHAR(100) NOT NULL,
    entity_table VARCHAR(100) NOT NULL,
    entity_id UUID,
    before_state JSONB,
    after_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 3. MASTER DATA (CUSTOMERS, SERVICES, BRANCH PRICES, PACKAGES, PRODUCTS, STOCKS, SUPPLIERS, PROMOTIONS)
-- -----------------------------------------------------------------------------
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
    tier VARCHAR(50) NOT NULL DEFAULT 'standard',
    total_spent BIGINT NOT NULL DEFAULT 0,
    debt_balance BIGINT NOT NULL DEFAULT 0,
    medical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_customer_phone_per_org UNIQUE (organization_id, phone)
);

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    base_price BIGINT NOT NULL CHECK (base_price >= 0),
    duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    default_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (default_commission_pct >= 0 AND default_commission_pct <= 100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_service_code_per_org UNIQUE (organization_id, code)
);

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

CREATE TABLE IF NOT EXISTS inventory_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    stock_on_hand INT NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_product_stock_per_branch UNIQUE (branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    address TEXT,
    debt_balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
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
-- 4. OPERATIONS (APPOINTMENTS, SALES, PAYMENTS, COURSES, EXPENSES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    status VARCHAR(50) NOT NULL DEFAULT 'booked',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    promo_code VARCHAR(50),
    tax_amount BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    tip_amount BIGINT NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    cashier_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_invoice_number_per_org UNIQUE (organization_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL,
    item_ref_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    line_discount BIGINT NOT NULL DEFAULT 0,
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    performer_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
    commission_amount BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    payment_number VARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,
    payment_type VARCHAR(50) NOT NULL DEFAULT 'sale',
    received_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount_allocated BIGINT NOT NULL CHECK (amount_allocated > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

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
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

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

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number VARCHAR(100) NOT NULL,
    total_amount BIGINT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'ordered',
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

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    recipient VARCHAR(255),
    notes TEXT,
    paid_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS & POLICIES
-- -----------------------------------------------------------------------------
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

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6. SEED INITIAL SAMPLE DATA
-- -----------------------------------------------------------------------------
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

    v_svc1_id UUID := '55555555-5555-5555-5555-555555555551';
    v_svc2_id UUID := '55555555-5555-5555-5555-555555555552';
    v_svc3_id UUID := '55555555-5555-5555-5555-555555555553';

    v_prod1_id UUID := '44444444-4444-4444-4444-444444444441';
    v_prod2_id UUID := '44444444-4444-4444-4444-444444444442';

    v_pkg1_id UUID := '66666666-6666-6666-6666-666666666661';
BEGIN
    INSERT INTO organizations (id, name, tax_code, phone, email, address)
    VALUES (v_org_id, 'Phuong Nam Beauty & Dental Clinic', '0312345678', '0901234567', 'contact@phuongnamclinic.vn', '123 Lê Lợi, Bến Nghé, Quận 1, TP.HCM')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO branches (id, organization_id, name, code, phone, address, is_headquarters)
    VALUES 
        (v_b1_id, v_org_id, 'Chi Nhánh Quận 1 (Trụ sở)', 'CN-Q1', '02838221111', '123 Lê Lợi, P. Bến Nghé, Quận 1', TRUE),
        (v_b2_id, v_org_id, 'Chi Nhánh Quận 7 (Phú Mỹ Hưng)', 'CN-Q7', '02854112222', '456 Nguyễn Văn Linh, P. Tân Phong, Quận 7', FALSE),
        (v_b3_id, v_org_id, 'Chi Nhánh TP. Thủ Đức', 'CN-TD', '02873003333', '789 Võ Văn Ngân, TP. Thủ Đức', FALSE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO staff_profiles (id, organization_id, full_name, code, phone, email, title)
    VALUES
        (v_staff_admin, v_org_id, 'Trần Phương Nam', 'NV-ADMIN', '0909000001', 'admin@phuongnam.vn', 'Tổng Giám Đốc'),
        (v_staff_mgr, v_org_id, 'Nguyễn Thị Hương', 'NV-QLQ1', '0909000002', 'huong.nguyen@phuongnam.vn', 'Quản Lý Chi Nhánh Q1'),
        (v_staff_cashier, v_org_id, 'Lê Thu Thảo', 'NV-LT01', '0909000003', 'thao.le@phuongnam.vn', 'Lễ Tân / Thu Ngân'),
        (v_staff_doc, v_org_id, 'BS. Phạm Minh Tuấn', 'NV-BS01', '0909000004', 'tuan.pham@phuongnam.vn', 'Bác Sĩ Trưởng Khoa Da Liễu')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO organization_memberships (staff_id, organization_id, role, assigned_branch_ids)
    VALUES
        (v_staff_admin, v_org_id, 'owner_admin', ARRAY[]::UUID[]),
        (v_staff_mgr, v_org_id, 'branch_manager', ARRAY[v_b1_id]::UUID[]),
        (v_staff_cashier, v_org_id, 'cashier_receptionist', ARRAY[v_b1_id]::UUID[]),
        (v_staff_doc, v_org_id, 'technician_doctor', ARRAY[v_b1_id, v_b2_id]::UUID[])
    ON CONFLICT (staff_id, organization_id) DO NOTHING;

    INSERT INTO services (id, organization_id, code, name, category, base_price, duration_minutes, default_commission_pct)
    VALUES
        (v_svc1_id, v_org_id, 'DV-001', 'Chăm sóc Da Mặt Chuyên Sâu Gold 24K', 'facial', 1200000, 75, 10),
        (v_svc2_id, v_org_id, 'DV-002', 'Laser Pico Trị Nám & Tàn Nhang', 'laser', 2500000, 60, 12),
        (v_svc3_id, v_org_id, 'DV-003', 'Tẩy Trắng Răng Laser Whitening', 'dental_care', 1800000, 45, 8)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO branch_service_prices (organization_id, branch_id, service_id, custom_price)
    VALUES
        (v_org_id, v_b1_id, v_svc1_id, 1200000),
        (v_org_id, v_b1_id, v_svc2_id, 2500000),
        (v_org_id, v_b2_id, v_svc1_id, 1350000)
    ON CONFLICT (branch_id, service_id) DO NOTHING;

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

    INSERT INTO packages (id, organization_id, code, name, service_id, total_sessions, package_price, validity_days)
    VALUES
        (v_pkg1_id, v_org_id, 'PKG-01', 'Liệu Trình 10 Buổi Chăm Sóc Da Mặt Gold 24K', v_svc1_id, 10, 9600000, 365)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customers (id, organization_id, primary_branch_id, full_name, phone, tier, total_spent, debt_balance, medical_notes)
    VALUES
        (v_cust1_id, v_org_id, v_b1_id, 'Chị Mai Lan', '0918111222', 'vip', 28500000, 0, 'Da nhạy cảm, dị ứng cồn'),
        (v_cust2_id, v_org_id, v_b1_id, 'Anh Hoàng Long', '0983333444', 'gold', 14200000, 1500000, 'Khách niềng răng trong suốt')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO customer_courses (id, organization_id, customer_id, package_id, service_id, total_sessions, used_sessions, status)
    VALUES
        ('88888888-8888-8888-8888-888888888881', v_org_id, v_cust1_id, v_pkg1_id, v_svc1_id, 10, 3, 'active')
    ON CONFLICT (id) DO NOTHING;
END $$;
