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
