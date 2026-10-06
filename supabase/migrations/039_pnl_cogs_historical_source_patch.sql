-- =============================================================================
-- MIGRATION 039: BẢN VÁ HOÀN CHỈNH BÁO CÁO KẾT QUẢ KINH DOANH VẬN HÀNH (P&L)
-- Mục tiêu:
-- 1. Bảo mật đa tầng: Kiểm tra auth.uid(), quyền tổ chức và chi nhánh người gọi.
-- 2. Khớp chuẩn P7.2: Doanh thu thực hiện (Recognized Revenue) tách bạch với Bán gói trả trước (Deferred).
-- 3. Phân bổ doanh thu liệu trình theo snapshot dòng hóa đơn (sale_items), không lấy total_amount của cả đơn.
-- 4. Thu tiền (cash_collected) lấy từ sổ thanh toán (payments) phát sinh trong kỳ (khớp P7.1).
-- 5. Xử lý hoàn hàng, hoàn chi khác kỳ theo thời điểm phát sinh bút toán điều chỉnh.
-- =============================================================================

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
    -- 0. Biến kiểm tra quyền
    v_user_org_id UUID;
    v_user_role VARCHAR(50);

    -- Mốc thời gian chính xác theo múi giờ Việt Nam [start_ts, next_day_ts)
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

    -- Góc nhìn 1: Bán hàng & Dòng tiền (P7.1 Invoicing & Cashflow)
    v_gross_sales BIGINT := 0;
    v_total_discounts BIGINT := 0;
    v_net_invoiced_sales BIGINT := 0;
    v_cash_collected BIGINT := 0;
    v_cash_refunded BIGINT := 0;
    v_net_cash_collected BIGINT := 0;

    -- Góc nhìn 2: Doanh thu & Lợi nhuận vận hành thực hiện (P7.2 Recognized Performance)
    v_recognized_product_sales BIGINT := 0;
    v_recognized_single_services BIGINT := 0;
    v_earned_treatment_revenue BIGINT := 0;
    v_total_recognized_revenue BIGINT := 0;

    -- Giá vốn COGS
    v_cogs_products BIGINT := 0;
    v_material_cost BIGINT := 0;
    v_total_cogs BIGINT := 0;
    v_gross_profit BIGINT := 0;

    -- Chi phí vận hành & Hoa hồng
    v_staff_commissions BIGINT := 0;
    v_operating_expenses BIGINT := 0;
    v_expense_reversals BIGINT := 0;
    v_net_operating_expenses BIGINT := 0;
    v_operating_surplus BIGINT := 0;

    v_category_breakdown JSONB;
BEGIN
    -- -------------------------------------------------------------------------
    -- 0. KIỂM TRA BẢO MẬT & QUYỀN TỔ CHỨC / CHI NHÁNH (SECURITY DEFINER GUARD)
    -- -------------------------------------------------------------------------
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Truy cập trái phép: Yêu cầu đăng nhập.';
    END IF;

    SELECT sp.organization_id, om.role::TEXT
    INTO v_user_org_id, v_user_role
    FROM staff_profiles sp
    JOIN organization_memberships om ON sp.id = om.staff_id AND sp.organization_id = om.organization_id
    WHERE sp.auth_user_id = auth.uid()
      AND om.is_active = TRUE
      AND sp.is_active = TRUE
    LIMIT 1;

    IF v_user_org_id IS NULL OR v_user_org_id <> p_org_id THEN
        RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này hoặc tài khoản đã bị vô hiệu hóa.';
    END IF;

    IF v_user_role NOT IN ('owner_admin', 'branch_manager') THEN
        RAISE EXCEPTION 'Truy cập trái phép: Chỉ Chủ cơ sở hoặc Quản lý chi nhánh mới có quyền xem báo cáo tài chính P&L.';
    END IF;

    IF p_branch_id IS NOT NULL AND v_user_role <> 'owner_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM staff_branches
            WHERE staff_id = (SELECT id FROM staff_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
              AND branch_id = p_branch_id
        ) THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không có quyền truy cập dữ liệu chi nhánh này.';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- 1. GÓC NHÌN BÁN HÀNG & DÒNG TIỀN (P7.1 INVOICING & CASHFLOW KPI)
    -- -------------------------------------------------------------------------
    -- A. Tổng giá trị hóa đơn xuất trong kỳ (không tính hóa đơn huỷ)
    SELECT 
        COALESCE(SUM(total_amount + discount_amount), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(total_amount), 0)
    INTO v_gross_sales, v_total_discounts, v_net_invoiced_sales
    FROM sales
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status <> 'cancelled'
      AND created_at >= v_start_ts AND created_at < v_next_day_ts;

    -- B. Dòng tiền thực thu & hoàn tiền trong kỳ (Lọc theo thời điểm thanh toán thực tế)
    SELECT 
        COALESCE(SUM(CASE WHEN p.payment_type IN ('sale', 'debt_collection', 'deposit') AND p.payment_method IN ('cash', 'transfer_vietqr', 'card') AND p.reconciliation_status = 'confirmed' THEN p.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN p.amount ELSE 0 END), 0)
    INTO v_cash_collected, v_cash_refunded
    FROM payments p
    WHERE p.organization_id = p_org_id
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND p.created_at >= v_start_ts AND p.created_at < v_next_day_ts;

    v_net_cash_collected := v_cash_collected - v_cash_refunded;

    -- -------------------------------------------------------------------------
    -- 2. GÓC NHÌN DOANH THU THỰC HIỆN VẬN HÀNH (P7.2 RECOGNIZED REVENUE KPI)
    -- -------------------------------------------------------------------------
    -- A. Doanh thu Sản phẩm bán lẻ trong kỳ (sau phân bổ giảm giá hóa đơn)
    SELECT COALESCE(SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0))))), 0)
    INTO v_recognized_product_sales
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.status <> 'cancelled'
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND si.item_type = 'product';

    -- B. Doanh thu Dịch vụ lẻ làm ngay trong kỳ (sau phân bổ giảm giá hóa đơn)
    SELECT COALESCE(SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0))))), 0)
    INTO v_recognized_single_services
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.status <> 'cancelled'
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND si.item_type = 'service';

    -- C. Doanh thu Trừ buổi Liệu trình thực hiện trong kỳ (Phân bổ theo snapshot giá trị dòng gói/liệu trình)
    SELECT COALESCE(SUM(
        ROUND(
            sd.sessions_deducted::NUMERIC * (
                COALESCE(
                    (
                        SELECT (si.line_total * (1 - (COALESCE(s.discount_amount, 0)::NUMERIC / NULLIF(s.subtotal, 0)))) / NULLIF(cc.total_sessions, 0)
                        FROM sale_items si
                        WHERE si.sale_id = cc.sale_id
                          AND (si.item_ref_id = cc.package_id OR si.item_ref_id = cc.service_id)
                        LIMIT 1
                    ),
                    -- Dự phòng an toàn nếu thẻ liệu trình không gắn dòng sale_item cụ thể
                    COALESCE(s.total_amount::NUMERIC / NULLIF(cc.total_sessions, 0), 0)
                )
            )
        )
    ), 0)
    INTO v_earned_treatment_revenue
    FROM session_deductions sd
    JOIN customer_courses cc ON cc.id = sd.course_id
    LEFT JOIN sales s ON s.id = cc.sale_id
    WHERE cc.organization_id = p_org_id
      AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
      AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts;

    -- Tổng doanh thu thực hiện vận hành (Recognized Revenue)
    v_total_recognized_revenue := v_recognized_product_sales + v_recognized_single_services + v_earned_treatment_revenue;

    -- -------------------------------------------------------------------------
    -- 3. GIÁ VỐN HÀNG BÁN & VẬT TƯ TIÊU HAO (COGS - SNAPSHOT LỊCH SỬ P7.2)
    -- -------------------------------------------------------------------------
    -- A. Giá vốn sản phẩm bán lẻ trong kỳ
    SELECT COALESCE(SUM(si.quantity * si.cost_price_snapshot), 0)
    INTO v_cogs_products
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.status <> 'cancelled'
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND si.item_type = 'product';

    -- B. Giá vốn vật tư tiêu hao ca dịch vụ / liệu trình thực tế
    SELECT COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0)
    INTO v_material_cost
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.status = 'confirmed'
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts;

    -- Tổng COGS hợp nhất
    v_total_cogs := v_cogs_products + v_material_cost;

    -- LỢI NHUẬN GỘP SAU COGS (Gross Profit)
    v_gross_profit := v_total_recognized_revenue - v_total_cogs;

    -- -------------------------------------------------------------------------
    -- 4. HOA HỒNG NHÂN SỰ & CHI PHÍ VẬN HÀNH (OPEX)
    -- -------------------------------------------------------------------------
    -- A. Hoa hồng KTV & Bác sĩ phát sinh trong kỳ
    SELECT COALESCE(SUM(final_commission), 0) INTO v_staff_commissions
    FROM commission_records
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status IN ('eligible', 'approved', 'paid')
      AND occurred_at >= v_start_ts AND occurred_at < v_next_day_ts;

    -- B. Chi phí vận hành đã thực chi trong kỳ (OPEX)
    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
    FROM expense_vouchers
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'disbursed'
      AND expense_date BETWEEN p_start_date AND p_end_date;

    -- C. Bút toán hoàn chi phát sinh trong kỳ (Expense Reversals)
    SELECT COALESCE(SUM(amount), 0) INTO v_expense_reversals
    FROM cashflow_ledger
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND entry_type = 'expense_reversal'
      AND occurred_at >= v_start_ts AND occurred_at < v_next_day_ts;

    v_net_operating_expenses := v_operating_expenses - v_expense_reversals;

    -- LỢI NHUẬN HOẠT ĐỘNG SƠ BỘ (OPERATING SURPLUS)
    v_operating_surplus := v_gross_profit - v_staff_commissions - v_net_operating_expenses;

    -- -------------------------------------------------------------------------
    -- 5. PHÂN RÃ CHI PHÍ THEO DANH MỤC
    -- -------------------------------------------------------------------------
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
        'invoicing_and_cashflow_kpi', jsonb_build_object(
            'gross_sales', v_gross_sales,
            'total_discounts', v_total_discounts,
            'net_invoiced_sales', v_net_invoiced_sales,
            'cash_collected', v_cash_collected,
            'cash_refunded', v_cash_refunded,
            'net_cash_collected', v_net_cash_collected
        ),
        'recognized_revenue_kpi', jsonb_build_object(
            'recognized_product_sales', v_recognized_product_sales,
            'recognized_single_services', v_recognized_single_services,
            'earned_treatment_revenue', v_earned_treatment_revenue,
            'total_recognized_revenue', v_total_recognized_revenue
        ),
        'cogs_and_gross_profit', jsonb_build_object(
            'cogs_products', v_cogs_products,
            'material_cost', v_material_cost,
            'total_cogs', v_total_cogs,
            'gross_profit_after_cogs', v_gross_profit,
            'gross_profit_margin_pct', CASE WHEN v_total_recognized_revenue > 0 THEN ROUND((v_gross_profit::NUMERIC / v_total_recognized_revenue) * 100, 2) ELSE 0 END
        ),
        'operating_deductions', jsonb_build_object(
            'staff_commissions', v_staff_commissions,
            'operating_expenses_gross', v_operating_expenses,
            'expense_reversals', v_expense_reversals,
            'net_operating_expenses', v_net_operating_expenses
        ),
        'operating_surplus_preliminary', jsonb_build_object(
            'amount', v_operating_surplus,
            'operating_margin_pct', CASE WHEN v_total_recognized_revenue > 0 THEN ROUND((v_operating_surplus::NUMERIC / v_total_recognized_revenue) * 100, 2) ELSE 0 END
        ),
        'expense_categories', v_category_breakdown
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION rpc_get_operating_pnl_report(UUID, UUID, DATE, DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_get_operating_pnl_report(UUID, UUID, DATE, DATE) TO authenticated, service_role;
