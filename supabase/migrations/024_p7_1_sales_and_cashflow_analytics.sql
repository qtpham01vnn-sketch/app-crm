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
    -- Lọc theo ngày tạo hóa đơn (created_at trong ranh giới thời gian)
    SELECT jsonb_build_object(
        'gross_sales', COALESCE(SUM(si.line_total + si.line_discount), 0),
        'total_discount', COALESCE(SUM(s.discount_amount), 0),
        'net_invoiced_sales', COALESCE(SUM(s.total_amount), 0),
        'invoice_count', COUNT(DISTINCT s.id),
        'avg_order_value', CASE WHEN COUNT(DISTINCT s.id) > 0 THEN ROUND(COALESCE(SUM(s.total_amount), 0) / COUNT(DISTINCT s.id)) ELSE 0 END,
        'new_customer_debt', COALESCE(SUM(GREATEST(0, s.total_amount - s.paid_amount)), 0),
        'package_course_sales', COALESCE(SUM(CASE WHEN si.item_type = 'package' THEN si.line_total ELSE 0 END), 0)
    ) INTO v_sales_summary
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at BETWEEN v_start_ts AND v_end_ts
      AND s.status <> 'cancelled';

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
                'payment_method', p.payment_method,
                'total_amount', SUM(p.amount),
                'transaction_count', COUNT(*)
            )
        ), '[]'::jsonb
    ) INTO v_method_breakdown
    FROM payments p
    WHERE p.organization_id = p_org_id
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND p.created_at BETWEEN v_start_ts AND v_end_ts
      AND p.payment_type IN ('sale', 'deposit', 'debt_collection')
      AND p.reconciliation_status = 'confirmed'
    GROUP BY p.payment_method;

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
                'customer_name', c.name,
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
                'customer_name', c.name,
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
