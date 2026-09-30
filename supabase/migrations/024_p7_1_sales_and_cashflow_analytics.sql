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

