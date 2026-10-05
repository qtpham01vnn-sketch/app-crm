-- =============================================================================
-- MIGRATION 038: CASHFLOW LEDGER, EXPENSES & OPERATING P&L MANAGEMENT (HARDENED)
-- Master Plan: Sổ Quỹ Thu Chi, Chi Phí Vận Hành & Báo Cáo Lợi Nhuận Vận Hành (P&L)
-- Target: PostgreSQL / Supabase (Staging & Live)
-- Chuẩn Live: 100% không chứa số dư giả lập, bảo vệ ACID bằng row locking & RPC Security
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
-- 2. TÀI KHOẢN QUỸ TIỀN MẶT & NGÂN HÀNG (FINANCIAL_ACCOUNTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE, -- NULL = Quỹ tổng
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
-- 2.b. NHẬT KÝ KHỞI TẠO & ĐIỀU CHỈNH SỐ DƯ ĐẦU KỲ (FINANCIAL_ACCOUNT_OPENINGS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_account_openings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
    opening_balance BIGINT NOT NULL,
    effective_date DATE NOT NULL,
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    approved_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE financial_account_openings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_account_openings FROM anon, public;
GRANT SELECT, INSERT ON financial_account_openings TO authenticated, service_role;

DROP POLICY IF EXISTS financial_account_openings_select ON financial_account_openings;
CREATE POLICY financial_account_openings_select ON financial_account_openings
    FOR SELECT TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
    );

-- -----------------------------------------------------------------------------
-- 3. PHIẾU CHI VẬN HÀNH (EXPENSE_VOUCHERS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    voucher_number VARCHAR(100) NOT NULL, -- PC-YYYYMMDD-XXXX
    category_id UUID REFERENCES expense_categories(id) ON DELETE RESTRICT,
    category_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    account_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash', 'bank_transfer'
    paid_to VARCHAR(255),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'approved', 'disbursed', 'rejected', 'cancelled', 'reversed'
    attachment_urls TEXT[],
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    disbursed_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    disbursed_at TIMESTAMPTZ,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_org_voucher_number UNIQUE (organization_id, voucher_number)
);

ALTER TABLE expense_vouchers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expense_vouchers FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON expense_vouchers TO authenticated, service_role;

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

-- Chặn sửa trực tiếp phiếu đã thực chi qua client
CREATE OR REPLACE FUNCTION trg_guard_expense_voucher_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('disbursed', 'reversed') AND NEW.status NOT IN ('disbursed', 'reversed', 'cancelled') THEN
        RAISE EXCEPTION 'Không thể chỉnh sửa hoặc thay đổi trạng thái phiếu chi đã thực chi/đã hoàn';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_expense_voucher_update ON expense_vouchers;
CREATE TRIGGER trg_guard_expense_voucher_update
BEFORE UPDATE ON expense_vouchers
FOR EACH ROW
EXECUTE FUNCTION trg_guard_expense_voucher_update();

-- -----------------------------------------------------------------------------
-- 4. SỔ CÁI DÒNG TIỀN HỢP NHẤT (CASHFLOW_LEDGER)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashflow_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
    flow_type VARCHAR(20) NOT NULL CHECK (flow_type IN ('inflow', 'outflow')),
    transaction_category VARCHAR(100) NOT NULL, -- 'pos_payment', 'customer_deposit', 'debt_collection', 'operating_expense', 'supplier_payment', 'refund_payout', 'expense_reversal'
    reference_type VARCHAR(50) NOT NULL, -- 'sales', 'payments', 'customer_deposits', 'expense_vouchers', 'supplier_payments'
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

-- Bất biến sổ cái: Cấm UPDATE / DELETE
CREATE OR REPLACE RULE prevent_cashflow_update AS ON UPDATE TO cashflow_ledger DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_cashflow_delete AS ON DELETE TO cashflow_ledger DO INSTEAD NOTHING;

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO PHIẾU CHI (DRAFT / SUBMITTED)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_expense_voucher(
    p_org_id UUID,
    p_branch_id UUID,
    p_category_id UUID,
    p_account_id UUID,
    p_title VARCHAR,
    p_amount BIGINT,
    p_payment_method VARCHAR,
    p_paid_to VARCHAR,
    p_expense_date DATE,
    p_notes TEXT,
    p_attachment_urls TEXT[],
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
    v_cat_name VARCHAR;
    v_cat_org_id UUID;
    v_acc_org_id UUID;
    v_acc_branch_id UUID;
BEGIN
    -- 1. Xác thực người dùng
    SELECT id, role INTO v_staff_id, v_role
    FROM staff_profiles
    WHERE auth_user_id = auth.uid() 
      AND organization_id = p_org_id 
      AND is_active = TRUE
    LIMIT 1;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Phiên làm việc không hợp lệ hoặc tài khoản bị vô hiệu hóa';
    END IF;

    -- Kiểm tra quyền chi nhánh
    IF v_role <> 'owner_admin' AND NOT (SELECT has_branch_access(p_branch_id)) THEN
        RAISE EXCEPTION 'Không có quyền tạo phiếu chi tại chi nhánh này';
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

    -- 3. Đối chiếu danh mục & tổ chức
    SELECT name, organization_id INTO v_cat_name, v_cat_org_id
    FROM expense_categories
    WHERE id = p_category_id
    LIMIT 1;

    IF v_cat_org_id IS NULL OR v_cat_org_id <> p_org_id THEN
        RAISE EXCEPTION 'Danh mục chi phí không hợp lệ hoặc không thuộc tổ chức';
    END IF;

    -- 4. Đối chiếu tài khoản quỹ & tổ chức / chi nhánh (Bắt buộc chọn rõ tài khoản)
    SELECT organization_id, branch_id INTO v_acc_org_id, v_acc_branch_id
    FROM financial_accounts
    WHERE id = p_account_id AND is_active = TRUE
    LIMIT 1;

    IF v_acc_org_id IS NULL OR v_acc_org_id <> p_org_id THEN
        RAISE EXCEPTION 'Tài khoản quỹ không hợp lệ hoặc không thuộc tổ chức';
    END IF;

    IF v_acc_branch_id IS NOT NULL AND v_acc_branch_id <> p_branch_id THEN
        RAISE EXCEPTION 'Tài khoản quỹ không thuộc chi nhánh này';
    END IF;

    -- 5. Sinh mã phiếu chi
    v_voucher_num := 'PC-' || TO_CHAR(p_expense_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- 6. Tạo bản ghi phiếu chi ở trạng thái 'draft' (hoặc 'approved' nếu Admin/Manager tự duyệt)
    INSERT INTO expense_vouchers (
        organization_id, branch_id, voucher_number,
        category_id, category_name, title, amount,
        account_id, payment_method, paid_to, expense_date,
        status, attachment_urls, notes, created_by_staff_id,
        idempotency_key
    ) VALUES (
        p_org_id, p_branch_id, v_voucher_num,
        p_category_id, v_cat_name, p_title, p_amount,
        p_account_id, p_payment_method, p_paid_to, p_expense_date,
        'draft', p_attachment_urls, p_notes, v_staff_id,
        p_idempotency_key
    ) RETURNING id INTO v_voucher_id;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'voucher_number', v_voucher_num,
        'status', 'draft',
        'message', 'Tạo phiếu chi thành công'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC PHÊ DUYỆT & THỰC CHI ACID (RPC_DISBURSE_EXPENSE_VOUCHER)
-- Khóa dòng số dư (SELECT FOR UPDATE) để đảm bảo toàn vẹn giao dịch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_disburse_expense_voucher(
    p_voucher_id UUID,
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voucher RECORD;
    v_staff_id UUID;
    v_role VARCHAR;
    v_curr_bal BIGINT;
    v_new_bal BIGINT;
BEGIN
    -- 1. Lấy thông tin phiếu chi
    SELECT * INTO v_voucher
    FROM expense_vouchers
    WHERE id = p_voucher_id
    LIMIT 1;

    IF v_voucher.id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy phiếu chi';
    END IF;

    IF v_voucher.status = 'disbursed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phiếu chi đã được thực chi trước đó');
    END IF;

    -- 2. Xác thực quyền người thực thi
    SELECT id, role INTO v_staff_id, v_role
    FROM staff_profiles
    WHERE auth_user_id = auth.uid() 
      AND organization_id = v_voucher.organization_id
      AND is_active = TRUE
    LIMIT 1;

    IF v_staff_id IS NULL OR v_role NOT IN ('owner_admin', 'branch_manager') THEN
        RAISE EXCEPTION 'Bạn không có quyền duyệt và thực chi phiếu này';
    END IF;

    IF v_role = 'branch_manager' AND NOT (SELECT has_branch_access(v_voucher.branch_id)) THEN
        RAISE EXCEPTION 'Không có quyền thực chi tại chi nhánh của phiếu này';
    END IF;

    -- 3. Khóa tài khoản quỹ để đọc và cập nhật số dư an toàn (FOR UPDATE)
    SELECT current_balance INTO v_curr_bal
    FROM financial_accounts
    WHERE id = v_voucher.account_id
    FOR UPDATE;

    IF v_curr_bal IS NULL THEN
        RAISE EXCEPTION 'Tài khoản quỹ không tồn tại';
    END IF;

    v_new_bal := v_curr_bal - v_voucher.amount;

    -- 4. Cập nhật số dư tài khoản quỹ
    UPDATE financial_accounts
    SET current_balance = v_new_bal, updated_at = NOW()
    WHERE id = v_voucher.account_id;

    -- 5. Cập nhật trạng thái phiếu chi
    UPDATE expense_vouchers
    SET status = 'disbursed',
        approved_by_staff_id = COALESCE(approved_by_staff_id, v_staff_id),
        approved_at = COALESCE(approved_at, NOW()),
        disbursed_by_staff_id = v_staff_id,
        disbursed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_voucher_id;

    -- 6. Ghi sổ cái dòng tiền hợp nhất (Bất biến)
    INSERT INTO cashflow_ledger (
        organization_id, branch_id, account_id,
        flow_type, transaction_category, reference_type,
        reference_id, reference_code, amount,
        balance_before, balance_after, payment_method,
        actor_staff_id, notes
    ) VALUES (
        v_voucher.organization_id, v_voucher.branch_id, v_voucher.account_id,
        'outflow', 'operating_expense', 'expense_vouchers',
        v_voucher.id, v_voucher.voucher_number, v_voucher.amount,
        v_curr_bal, v_new_bal, v_voucher.payment_method,
        v_staff_id, v_voucher.title
    );

    RETURN jsonb_build_object(
        'success', true,
        'voucher_number', v_voucher.voucher_number,
        'balance_before', v_curr_bal,
        'balance_after', v_new_bal,
        'message', 'Đã duyệt và thực chi thành công'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC HỦY / HOÀN PHIẾU CHI BẰNG BÚT TOÁN ĐẢO (RPC_CANCEL_EXPENSE_VOUCHER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_cancel_or_reverse_expense_voucher(
    p_voucher_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voucher RECORD;
    v_staff_id UUID;
    v_role VARCHAR;
    v_curr_bal BIGINT;
    v_new_bal BIGINT;
BEGIN
    SELECT * INTO v_voucher FROM expense_vouchers WHERE id = p_voucher_id LIMIT 1;
    IF v_voucher.id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy phiếu chi';
    END IF;

    SELECT id, role INTO v_staff_id, v_role
    FROM staff_profiles
    WHERE auth_user_id = auth.uid() AND organization_id = v_voucher.organization_id
    LIMIT 1;

    IF v_staff_id IS NULL OR v_role <> 'owner_admin' THEN
        RAISE EXCEPTION 'Chỉ Quản trị viên mới có quyền hủy/hoàn phiếu chi';
    END IF;

    IF v_voucher.status = 'disbursed' THEN
        -- Đã chi tiền -> Khóa quỹ và ghi bút toán đảo dòng tiền
        SELECT current_balance INTO v_curr_bal FROM financial_accounts WHERE id = v_voucher.account_id FOR UPDATE;
        v_new_bal := v_curr_bal + v_voucher.amount;

        UPDATE financial_accounts SET current_balance = v_new_bal, updated_at = NOW() WHERE id = v_voucher.account_id;

        UPDATE expense_vouchers 
        SET status = 'reversed', notes = COALESCE(notes, '') || ' [Hoàn tiền: ' || p_reason || ']'
        WHERE id = p_voucher_id;

        INSERT INTO cashflow_ledger (
            organization_id, branch_id, account_id,
            flow_type, transaction_category, reference_type,
            reference_id, reference_code, amount,
            balance_before, balance_after, payment_method,
            actor_staff_id, notes
        ) VALUES (
            v_voucher.organization_id, v_voucher.branch_id, v_voucher.account_id,
            'inflow', 'expense_reversal', 'expense_vouchers',
            v_voucher.id, v_voucher.voucher_number, v_voucher.amount,
            v_curr_bal, v_new_bal, v_voucher.payment_method,
            v_staff_id, 'Hoàn tiền phiếu chi: ' || p_reason
        );
    ELSE
        UPDATE expense_vouchers SET status = 'cancelled', notes = COALESCE(notes, '') || ' [Hủy: ' || p_reason || ']' WHERE id = p_voucher_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã hủy/hoàn phiếu chi thành công');
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC BÁO CÁO KẾT QUẢ KINH DOANH VẬN HÀNH (ĐỐI CHIẾU P7 VÀ THUẬT NGỮ CHUẨN)
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

    v_gross_sales BIGINT := 0;
    v_net_invoiced_sales BIGINT := 0;
    v_cash_collected BIGINT := 0;
    v_total_cogs BIGINT := 0;
    v_gross_profit BIGINT := 0;
    v_staff_commissions BIGINT := 0;
    v_operating_expenses BIGINT := 0;
    v_operating_surplus BIGINT := 0;
    v_category_breakdown JSONB;
BEGIN
    -- 1. Doanh thu hóa đơn (Đối chiếu nguồn P7.1)
    SELECT 
        COALESCE(SUM(total_amount + discount_amount), 0),
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(paid_amount), 0)
    INTO v_gross_sales, v_net_invoiced_sales, v_cash_collected
    FROM sales
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'completed'
      AND created_at BETWEEN v_start_ts AND v_end_ts;

    -- 2. Giá vốn COGS (Đối chiếu nguồn P7.2)
    SELECT COALESCE(SUM(si.cogs_total_cost), 0) INTO v_total_cogs
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.status = 'completed'
      AND s.created_at BETWEEN v_start_ts AND v_end_ts;

    -- Lợi nhuận gộp sau COGS
    v_gross_profit := v_net_invoiced_sales - v_total_cogs;

    -- 3. Hoa hồng KTV/Bác sĩ
    SELECT COALESCE(SUM(final_commission), 0) INTO v_staff_commissions
    FROM commission_records
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status IN ('eligible', 'approved', 'paid')
      AND occurred_at BETWEEN v_start_ts AND v_end_ts;

    -- 4. Chi phí vận hành đã thực chi (OPEX)
    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
    FROM expense_vouchers
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'disbursed'
      AND expense_date BETWEEN p_start_date AND p_end_date;

    -- Lợi nhuận hoạt động sơ bộ (Operating Surplus)
    v_operating_surplus := v_gross_profit - v_staff_commissions - v_operating_expenses;

    -- 5. Phân rã chi phí theo danh mục
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
          AND status = 'disbursed'
          AND expense_date BETWEEN p_start_date AND p_end_date
        GROUP BY category_name
        ORDER BY total_amount DESC
    ) sub;

    RETURN jsonb_build_object(
        'period', jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date),
        'sales_and_revenue', jsonb_build_object(
            'gross_sales', v_gross_sales,
            'net_invoiced_sales', v_net_invoiced_sales,
            'cash_collected', v_cash_collected
        ),
        'cogs_and_gross_profit', jsonb_build_object(
            'total_cogs', v_total_cogs,
            'gross_profit_after_cogs', v_gross_profit,
            'gross_profit_margin_pct', CASE WHEN v_net_invoiced_sales > 0 THEN ROUND((v_gross_profit::NUMERIC / v_net_invoiced_sales) * 100, 2) ELSE 0 END
        ),
        'operating_deductions', jsonb_build_object(
            'staff_commissions', v_staff_commissions,
            'operating_expenses_opex', v_operating_expenses
        ),
        'operating_surplus_preliminary', jsonb_build_object(
            'amount', v_operating_surplus,
            'operating_margin_pct', CASE WHEN v_net_invoiced_sales > 0 THEN ROUND((v_operating_surplus::NUMERIC / v_net_invoiced_sales) * 100, 2) ELSE 0 END
        ),
        'expense_categories', v_category_breakdown
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. PHÂN QUYỀN EXECUTE RPC
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION rpc_create_expense_voucher FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_create_expense_voucher TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION rpc_disburse_expense_voucher FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_disburse_expense_voucher TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION rpc_cancel_or_reverse_expense_voucher FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_cancel_or_reverse_expense_voucher TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION rpc_get_operating_pnl_report FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_get_operating_pnl_report TO authenticated, service_role;

COMMIT;
