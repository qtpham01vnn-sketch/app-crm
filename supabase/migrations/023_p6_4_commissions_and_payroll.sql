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
