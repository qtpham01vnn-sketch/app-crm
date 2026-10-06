-- =============================================================================
-- PATCH: FIX RPC_GET_OPERATING_PNL_REPORT
-- Mục tiêu: Khớp nguồn giá vốn lịch sử (cost_price_snapshot) từ P7.2 & P7.1
-- Không thêm cột giả, không mặc định giá vốn = 0 nếu có dữ liệu snapshot lịch sử
-- Khớp thời gian múi giờ VN [start_ts, next_day_ts)
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
    -- Mốc thời gian chính xác theo múi giờ Việt Nam [start_ts, next_day_ts)
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

    v_gross_sales BIGINT := 0;
    v_total_discounts BIGINT := 0;
    v_net_invoiced_sales BIGINT := 0;
    v_cash_collected BIGINT := 0;
    v_earned_treatment_revenue BIGINT := 0;

    v_cogs_products BIGINT := 0;
    v_material_cost BIGINT := 0;
    v_total_cogs BIGINT := 0;
    v_gross_profit BIGINT := 0;

    v_staff_commissions BIGINT := 0;
    v_operating_expenses BIGINT := 0;
    v_operating_surplus BIGINT := 0;
    v_category_breakdown JSONB;
BEGIN
    -- 1. Doanh thu bán hàng hóa đơn (Đối chiếu nguồn P7.1)
    SELECT 
        COALESCE(SUM(total_amount + discount_amount), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(paid_amount), 0)
    INTO v_gross_sales, v_total_discounts, v_net_invoiced_sales, v_cash_collected
    FROM sales
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status NOT IN ('cancelled', 'refunded')
      AND created_at >= v_start_ts AND created_at < v_next_day_ts;

    -- 2. Doanh thu trừ thẻ liệu trình thực hiện trong kỳ (Earned Treatment Revenue - Nguồn P7.1 / P7.2)
    SELECT COALESCE(SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(s.total_amount, 0))), 0)
    INTO v_earned_treatment_revenue
    FROM session_deductions sd
    JOIN customer_courses cc ON cc.id = sd.course_id
    LEFT JOIN sales s ON s.id = cc.sale_id
    WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
      AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts;

    -- 3. Giá vốn Hàng bán & Vật tư tiêu hao (Nguồn P7.2 - Chuẩn hóa snapshot giá vốn lịch sử)
    -- A. Giá vốn sản phẩm bán lẻ trong kỳ
    SELECT COALESCE(SUM(si.quantity * si.cost_price_snapshot), 0)
    INTO v_cogs_products
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.status NOT IN ('cancelled', 'refunded')
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND si.item_type = 'product';

    -- B. Giá vốn vật tư tiêu hao thực tế theo ca dịch vụ / liệu trình
    SELECT COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0)
    INTO v_material_cost
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.status = 'confirmed'
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts;

    -- Tổng COGS hợp nhất
    v_total_cogs := v_cogs_products + v_material_cost;

    -- Lợi nhuận gộp sau COGS
    v_gross_profit := v_net_invoiced_sales - v_total_cogs;

    -- 4. Hoa hồng KTV & Bác sĩ (Nguồn P6.4 / P7.2)
    SELECT COALESCE(SUM(final_commission), 0) INTO v_staff_commissions
    FROM commission_records
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status IN ('eligible', 'approved', 'paid')
      AND occurred_at >= v_start_ts AND occurred_at < v_next_day_ts;

    -- 5. Chi phí vận hành đã thực chi (OPEX - Nguồn P11 038)
    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses
    FROM expense_vouchers
    WHERE organization_id = p_org_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'disbursed'
      AND expense_date BETWEEN p_start_date AND p_end_date;

    -- Lợi nhuận hoạt động sơ bộ (Operating Surplus)
    v_operating_surplus := v_gross_profit - v_staff_commissions - v_operating_expenses;

    -- 6. Phân rã chi phí theo danh mục
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
            'total_discounts', v_total_discounts,
            'net_invoiced_sales', v_net_invoiced_sales,
            'cash_collected', v_cash_collected,
            'earned_treatment_revenue', v_earned_treatment_revenue
        ),
        'cogs_and_gross_profit', jsonb_build_object(
            'cogs_products', v_cogs_products,
            'material_cost', v_material_cost,
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

REVOKE EXECUTE ON FUNCTION rpc_get_operating_pnl_report(UUID, UUID, DATE, DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_get_operating_pnl_report(UUID, UUID, DATE, DATE) TO authenticated, service_role;
