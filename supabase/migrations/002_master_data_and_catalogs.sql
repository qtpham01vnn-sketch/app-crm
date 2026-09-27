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
