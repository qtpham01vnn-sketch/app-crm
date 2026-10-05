-- =============================================================================
-- MIGRATION 038: CASHFLOW LEDGER, EXPENSES & OPERATING P&L MANAGEMENT
-- Master Plan: Sổ Quỹ Thu Chi, Chi Phí Vận Hành & Báo Cáo Lợi Nhuận Vận Hành (P&L)
-- Target: PostgreSQL / Supabase (Staging & Live)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DANH MỤC HẠNG MỤC CHI PHÍ VẬN HÀNH (EXPENSE_CATEGORIES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    group_type VARCHAR(50) NOT NULL DEFAULT 'operating', -- 'operating', 'cogs', 'administrative', 'marketing', 'capex'
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_org_expense_cat_code UNIQUE (organization_id, code)
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expense_categories FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_categories TO authenticated, service_role;

DROP POLICY IF EXISTS expense_categories_select_policy ON expense_categories;
CREATE POLICY expense_categories_select_policy ON expense_categories
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

DROP POLICY IF EXISTS expense_categories_admin_modify ON expense_categories;
CREATE POLICY expense_categories_admin_modify ON expense_categories
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) = 'owner_admin'
    );

-- -----------------------------------------------------------------------------
-- 2. TÀI KHOẢN QUỸ TIỀN MẶT & NGÂN HÀNG ĐA CHI NHÁNH (FINANCIAL_ACCOUNTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE, -- NULL = Quỹ tổng công ty
    account_code VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash', 'bank', 'e_wallet'
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    initial_balance BIGINT NOT NULL DEFAULT 0,
    current_balance BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_org_fin_account_code UNIQUE (organization_id, account_code)
);

ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_accounts FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_accounts TO authenticated, service_role;

DROP POLICY IF EXISTS financial_accounts_select_policy ON financial_accounts;
CREATE POLICY financial_accounts_select_policy ON financial_accounts
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            branch_id IS NULL 
            OR (SELECT has_branch_access(branch_id))
            OR (SELECT get_current_user_role()) = 'owner_admin'
        )
    );

-- -----------------------------------------------------------------------------
-- 3. PHIẾU CHI VẬN HÀNH (EXPENSE_VOUCHERS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    voucher_number VARCHAR(100) NOT NULL, -- PC-YYYYMMDD-XXXX
    category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    category_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash', 'bank_transfer'
    paid_to VARCHAR(255), -- Người / Đơn vị nhận tiền
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'approved', 'rejected', 'cancelled'
    attachment_urls TEXT[], -- Mảng link ảnh chứng từ, hóa đơn đỏ
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_org_voucher_number UNIQUE (organization_id, voucher_number)
);

ALTER TABLE expense_vouchers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expense_vouchers FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_vouchers TO authenticated, service_role;

DROP POLICY IF EXISTS expense_vouchers_select_policy ON expense_vouchers;
CREATE POLICY expense_vouchers_select_policy ON expense_vouchers
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
            OR created_by_staff_id = (SELECT id FROM staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        )
    );

DROP POLICY IF EXISTS expense_vouchers_insert_policy ON expense_vouchers;
CREATE POLICY expense_vouchers_insert_policy ON expense_vouchers
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
        )
    );

DROP POLICY IF EXISTS expense_vouchers_update_policy ON expense_vouchers;
CREATE POLICY expense_vouchers_update_policy ON expense_vouchers
    FOR UPDATE TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR ((SELECT get_current_user_role()) = 'branch_manager' AND (SELECT has_branch_access(branch_id)))
        )
    );

-- -----------------------------------------------------------------------------
-- 4. SỔ CÁI DÒNG TIỀN HỢP NHẤT (CASHFLOW_LEDGER)
-- Ghi nhận bất biến toàn bộ dòng tiền vào (INFLOW) và ra (OUTFLOW)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashflow_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
    flow_type VARCHAR(20) NOT NULL CHECK (flow_type IN ('inflow', 'outflow')),
    transaction_category VARCHAR(100) NOT NULL, -- 'pos_revenue', 'deposit_received', 'operating_expense', 'supplier_payment', 'refund_payout', 'salary_payout'
    reference_type VARCHAR(50) NOT NULL, -- 'sales', 'payments', 'customer_deposits', 'expense_vouchers', 'supplier_payments', 'payroll_records'
    reference_id UUID,
    reference_code VARCHAR(100),
    amount BIGINT NOT NULL CHECK (amount > 0),
    balance_before BIGINT NOT NULL DEFAULT 0,
    balance_after BIGINT NOT NULL DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash', 'bank_transfer', 'credit_card'
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE cashflow_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cashflow_ledger FROM anon, public;
GRANT SELECT, INSERT ON cashflow_ledger TO authenticated, service_role;

DROP POLICY IF EXISTS cashflow_ledger_select_policy ON cashflow_ledger;
CREATE POLICY cashflow_ledger_select_policy ON cashflow_ledger
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (
            (SELECT get_current_user_role()) = 'owner_admin'
            OR (SELECT has_branch_access(branch_id))
        )
    );

-- Bất biến sổ cái dòng tiền: Cấm UPDATE / DELETE
CREATE OR REPLACE RULE prevent_cashflow_update AS ON UPDATE TO cashflow_ledger DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_cashflow_delete AS ON DELETE TO cashflow_ledger DO INSTEAD NOTHING;

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO VÀ PHÊ DUYỆT PHIẾU CHI ACID (RPC_CREATE_AND_APPROVE_EXPENSE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_expense_voucher(
    p_org_id UUID,
    p_branch_id UUID,
    p_category_code VARCHAR,
    p_title VARCHAR,
    p_amount BIGINT,
    p_payment_method VARCHAR,
    p_paid_to VARCHAR,
    p_expense_date DATE,
    p_notes TEXT,
    p_attachment_urls TEXT[],
    p_auto_approve BOOLEAN,
    p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff_id UUID;
    v_role VARCHAR;
    v_voucher_id UUID;
    v_voucher_num VARCHAR;
    v_cat_id UUID;
    v_cat_name VARCHAR;
    v_account_id UUID;
    v_curr_bal BIGINT := 0;
    v_new_bal BIGINT := 0;
BEGIN
    -- 1. Xác thực người dùng
    SELECT id, role INTO v_staff_id, v_role
    FROM staff_profiles
    WHERE auth_user_id = auth.uid() AND organization_id = p_org_id
    LIMIT 1;

    IF v_staff_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy hồ sơ nhân sự hợp lệ');
    END IF;

    -- 2. Kiểm tra Idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, voucher_number INTO v_voucher_id, v_voucher_num
        FROM expense_vouchers
        WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF v_voucher_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'voucher_id', v_voucher_id,
                'voucher_number', v_voucher_num,
                'is_idempotent', true,
                'message', 'Phiếu chi đã được tạo trước đó'
            );
        END IF;
    END IF;

    -- 3. Xác định danh mục
    SELECT id, name INTO v_cat_id, v_cat_name
    FROM expense_categories
    WHERE organization_id = p_org_id AND code = p_category_code
    LIMIT 1;

    IF v_cat_id IS NULL THEN
        -- Fallback danh mục mặc định
        v_cat_name := COALESCE(p_category_code, 'Chi phí chung');
    END IF;

    -- 4. Sinh mã phiếu chi: PC-YYYYMMDD-XXXX
    v_voucher_num := 'PC-' || TO_CHAR(p_expense_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- 5. Lấy hoặc gắn tài khoản quỹ tương ứng
    SELECT id, current_balance INTO v_account_id, v_curr_bal
    FROM financial_accounts
    WHERE organization_id = p_org_id 
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND account_type = CASE WHEN p_payment_method = 'bank_transfer' THEN 'bank' ELSE 'cash' END
      AND is_active = TRUE
    ORDER BY branch_id NULLS LAST
    LIMIT 1;

    -- 6. Tạo bản ghi phiếu chi
    INSERT INTO expense_vouchers (
        organization_id, branch_id, voucher_number,
        category_id, category_name, title, amount,
        account_id, payment_method, paid_to, expense_date,
        status, attachment_urls, notes, created_by_staff_id,
        idempotency_key
    ) VALUES (
        p_org_id, p_branch_id, v_voucher_num,
        v_cat_id, v_cat_name, p_title, p_amount,
        v_account_id, p_payment_method, p_paid_to, p_expense_date,
        CASE WHEN p_auto_approve AND v_role IN ('owner_admin', 'branch_manager') THEN 'approved' ELSE 'draft' END,
        p_attachment_urls, p_notes, v_staff_id,
        p_idempotency_key
    ) RETURNING id INTO v_voucher_id;

    -- 7. Nếu tự động duyệt (cho Admin / Manager): Cập nhật số dư và ghi sổ cái
    IF p_auto_approve AND v_role IN ('owner_admin', 'branch_manager') THEN
        UPDATE expense_vouchers
        SET approved_by_staff_id = v_staff_id, approved_at = NOW()
        WHERE id = v_voucher_id;

        IF v_account_id IS NOT NULL THEN
            v_new_bal := v_curr_bal - p_amount;
            UPDATE financial_accounts
            SET current_balance = v_new_bal, updated_at = NOW()
            WHERE id = v_account_id;
        END IF;

        INSERT INTO cashflow_ledger (
            organization_id, branch_id, account_id,
            flow_type, transaction_category, reference_type,
            reference_id, reference_code, amount,
            balance_before, balance_after, payment_method,
            actor_staff_id, notes
        ) VALUES (
            p_org_id, p_branch_id, v_account_id,
            'outflow', 'operating_expense', 'expense_vouchers',
            v_voucher_id, v_voucher_num, p_amount,
            v_curr_bal, v_new_bal, p_payment_method,
            v_staff_id, p_title
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'voucher_number', v_voucher_num,
        'status', CASE WHEN p_auto_approve AND v_role IN ('owner_admin', 'branch_manager') THEN 'approved' ELSE 'draft' END,
        'message', 'Tạo phiếu chi thành công'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC BÁO CÁO DÒNG TIỀN VÀ LÃI/LỖ P&L HỢP NHẤT (RPC_GET_OPERATING_PNL_REPORT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_operating_pnl_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_end_ts TIMESTAMPTZ := (p_end_date::TEXT || ' 23:59:59.999+07')::TIMESTAMPTZ;

    v_total_revenue BIGINT := 0;
    v_total_cogs BIGINT := 0;
    v_gross_profit BIGINT := 0;
    v_total_expenses BIGINT := 0;
    v_net_operating_profit BIGINT := 0;
    v_category_breakdown JSONB;
    v_cash_inflow BIGINT := 0;
    v_cash_outflow BIGINT := 0;
    v_net_cashflow BIGINT := 0;
BEGIN
    -- 1. Doanh thu thuần từ hóa đơn POS đã hoàn tất
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_revenue
    FROM sales
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'completed'
      AND created_at BETWEEN v_start_ts AND v_end_ts;

    -- 2. Giá vốn hàng bán (COGS)
    SELECT COALESCE(SUM(si.cogs_total_cost), 0) INTO v_total_cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.status = 'completed'
      AND s.created_at BETWEEN v_start_ts AND v_end_ts;

    -- Lợi nhuận gộp
    v_gross_profit := v_total_revenue - v_total_cogs;

    -- 3. Chi phí vận hành đã duyệt
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM expense_vouchers
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'approved'
      AND expense_date BETWEEN p_start_date AND p_end_date;

    -- Lợi nhuận ròng thuần (Net Operating Profit)
    v_net_operating_profit := v_gross_profit - v_total_expenses;

    -- 4. Phân rã chi phí theo danh mục
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'category_name', sub.category_name,
            'total_amount', sub.total_amount,
            'voucher_count', sub.voucher_count
        )
    ), '[]'::JSONB) INTO v_category_breakdown
    FROM (
        SELECT category_name, SUM(amount) AS total_amount, COUNT(id) AS voucher_count
        FROM expense_vouchers
        WHERE organization_id = p_org_id
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
          AND status = 'approved'
          AND expense_date BETWEEN p_start_date AND p_end_date
        GROUP BY category_name
        ORDER BY total_amount DESC
    ) sub;

    -- 5. Tổng dòng tiền vào/ra từ Sổ cái
    SELECT 
        COALESCE(SUM(CASE WHEN flow_type = 'inflow' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN flow_type = 'outflow' THEN amount ELSE 0 END), 0)
    INTO v_cash_inflow, v_cash_outflow
    FROM cashflow_ledger
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND occurred_at BETWEEN v_start_ts AND v_end_ts;

    v_net_cashflow := v_cash_inflow - v_cash_outflow;

    RETURN jsonb_build_object(
        'period', jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date),
        'pnl', jsonb_build_object(
            'total_revenue', v_total_revenue,
            'total_cogs', v_total_cogs,
            'gross_profit', v_gross_profit,
            'gross_profit_margin', CASE WHEN v_total_revenue > 0 THEN ROUND((v_gross_profit::NUMERIC / v_total_revenue) * 100, 2) ELSE 0 END,
            'total_expenses', v_total_expenses,
            'net_operating_profit', v_net_operating_profit,
            'net_profit_margin', CASE WHEN v_total_revenue > 0 THEN ROUND((v_net_operating_profit::NUMERIC / v_total_revenue) * 100, 2) ELSE 0 END
        ),
        'cashflow', jsonb_build_object(
            'cash_inflow', v_cash_inflow,
            'cash_outflow', v_cash_outflow,
            'net_cashflow', v_net_cashflow
        ),
        'expense_categories', v_category_breakdown
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. SEED DANH MỤC CHI PHÍ VÀ QUỸ MẶC ĐỊNH
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org RECORD;
    v_br RECORD;
BEGIN
    FOR v_org IN SELECT id FROM organizations LOOP
        -- Seed danh mục
        INSERT INTO expense_categories (organization_id, code, name, group_type, description)
        VALUES 
            (v_org.id, 'rent', 'Mặt Bằng & Cơ Sở', 'operating', 'Tiền thuê mặt bằng, bãi đỗ xe'),
            (v_org.id, 'utilities', 'Điện, Nước & Internet', 'operating', 'Chi phí tiện ích hàng tháng'),
            (v_org.id, 'marketing', 'Marketing & Quảng Cáo', 'marketing', 'Facebook Ads, Google Ads, KOL, bảng hiệu'),
            (v_org.id, 'supplies', 'Vật Tư Tiêu Hao & Vệ Sinh', 'operating', 'Găng tay, cồn, khăn spa, đồ bảo hộ'),
            (v_org.id, 'equipment', 'Bảo Trì Thiết Bị / Máy Móc', 'operating', 'Sửa chữa bảo dưỡng ghế máy, thiết bị laser'),
            (v_org.id, 'other', 'Chi Phí Vận Hành Khác', 'operating', 'Tiếp khách, văn phòng phẩm, v.v.')
        ON CONFLICT (organization_id, code) DO NOTHING;

        -- Seed tài khoản quỹ tiền mặt cho từng chi nhánh
        FOR v_br IN SELECT id, name, code FROM branches WHERE organization_id = v_org.id LOOP
            INSERT INTO financial_accounts (organization_id, branch_id, account_code, account_name, account_type, initial_balance, current_balance)
            VALUES 
                (v_org.id, v_br.id, 'CASH_' || v_br.code, 'Quỹ Tiền Mặt - ' || v_br.name, 'cash', 10000000, 10000000),
                (v_org.id, v_br.id, 'BANK_' || v_br.code, 'Tài Khoản VietinBank - ' || v_br.name, 'bank', 50000000, 50000000)
            ON CONFLICT (organization_id, account_code) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

COMMIT;
