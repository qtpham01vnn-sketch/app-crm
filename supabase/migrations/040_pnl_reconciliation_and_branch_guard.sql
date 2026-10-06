-- SHA256_CHECKSUM: fc7c13a8b3d3ae5ebae9388a015efb5463228d9b34c41ee479713d6be2347e23
-- =============================================================================
-- MIGRATION 040.2-STAGING: BẢN VÁ HOÀN THIỆN NGHIỆP VỤ P&L & BẢO VỆ PHÂN QUYỀN ĐA CHI NHÁNH
-- Target Database: Staging (yvwsitkgpujeqlgeiuge)
-- Environment: STAGING ONLY (DO NOT APPLY TO PRODUCTION)
-- Released: 2026-10-06T10:05:00+07:00
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
    v_staff_id UUID;

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
    v_unreconciled_sessions_count INT := 0;
    v_total_recognized_revenue BIGINT := 0;

    -- Giá vốn COGS
    v_cogs_products BIGINT := 0;
    v_material_cost BIGINT := 0;
    v_total_cogs BIGINT := 0;
    v_gross_profit BIGINT := 0;

    -- Chi phí vận hành & Hoa hồng
    v_staff_commissions BIGINT := 0;
    v_operating_expenses_gross BIGINT := 0;
    v_expense_reversals BIGINT := 0;
    v_net_operating_expenses BIGINT := 0;
    v_operating_surplus BIGINT := 0;

    v_category_breakdown JSONB;
BEGIN
    -- -------------------------------------------------------------------------
    -- 0. KIỂM TRA BẢO MẬT & PHÂN QUYỀN ĐA CHI NHÁNH (SECURITY DEFINER GUARD)
    -- -------------------------------------------------------------------------
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Truy cập trái phép: Yêu cầu đăng nhập.';
    END IF;

    SELECT sp.id, sp.organization_id, om.role::TEXT
    INTO v_staff_id, v_user_org_id, v_user_role
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

    -- Kiểm tra quyền truy cập chi nhánh cụ thể
    IF p_branch_id IS NOT NULL THEN
        IF v_user_role <> 'owner_admin' AND NOT has_branch_access(p_branch_id) THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không có quyền truy cập dữ liệu chi nhánh này.';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- 1. GÓC NHÌN BÁN HÀNG & DÒNG TIỀN (P7.1 INVOICING & CASHFLOW KPI)
    -- -------------------------------------------------------------------------
    SELECT 
        COALESCE(SUM(total_amount + discount_amount), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(total_amount), 0)
    INTO v_gross_sales, v_total_discounts, v_net_invoiced_sales
    FROM sales
    WHERE organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(branch_id)))
      )
      AND status <> 'cancelled'
      AND created_at >= v_start_ts AND created_at < v_next_day_ts;

    SELECT 
        COALESCE(SUM(CASE WHEN p.payment_type IN ('sale', 'debt_collection', 'deposit') AND p.payment_method IN ('cash', 'transfer_vietqr', 'card') AND p.reconciliation_status = 'confirmed' THEN p.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN p.amount ELSE 0 END), 0)
    INTO v_cash_collected, v_cash_refunded
    FROM payments p
    WHERE p.organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND p.branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(p.branch_id)))
      )
      AND p.created_at >= v_start_ts AND p.created_at < v_next_day_ts;

    v_net_cash_collected := v_cash_collected - v_cash_refunded;

    -- -------------------------------------------------------------------------
    -- 2. GÓC NHÌN DOANH THU THỰC HIỆN VẬN HÀNH (P7.2 RECOGNIZED REVENUE KPI)
    -- -------------------------------------------------------------------------
    -- A. Doanh thu Sản phẩm bán lẻ trong kỳ (sau phân bổ giảm giá hóa đơn)
    SELECT COALESCE(SUM(ROUND(si.line_total * (1 - (COALESCE(s.discount_amount, 0)::NUMERIC / NULLIF(s.subtotal, 0))))), 0)
    INTO v_recognized_product_sales
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND s.branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(s.branch_id)))
      )
      AND s.status NOT IN ('cancelled', 'refunded')
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND si.item_type = 'product';

    -- B. Doanh thu Dịch vụ lẻ làm ngay / hoàn thành theo sự kiện thực hiện trong kỳ (sau phân bổ giảm giá)
    WITH single_service_fulfillments AS (
        SELECT 
            si.id AS sale_item_id,
            si.sale_id,
            s.organization_id,
            s.branch_id,
            ROUND(si.line_total * (1 - (COALESCE(s.discount_amount, 0)::NUMERIC / NULLIF(s.subtotal, 0)))) AS net_service_amount,
            COALESCE(
                (
                    SELECT ts.performed_at
                    FROM treatment_sessions ts
                    WHERE ts.organization_id = s.organization_id
                      AND ts.customer_id = s.customer_id
                      AND ts.status = 'completed'
                      AND ts.course_id IS NULL
                      AND ts.performed_at >= s.created_at - INTERVAL '1 day'
                    ORDER BY ts.performed_at ASC
                    LIMIT 1
                ),
                s.created_at
            ) AS service_performed_at
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.organization_id = p_org_id
          AND s.status NOT IN ('cancelled', 'refunded')
          AND si.item_type = 'service'
    )
    SELECT COALESCE(SUM(net_service_amount), 0)
    INTO v_recognized_single_services
    FROM single_service_fulfillments ssf
    WHERE ssf.organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND ssf.branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(ssf.branch_id)))
      )
      AND ssf.service_performed_at >= v_start_ts AND ssf.service_performed_at < v_next_day_ts;

    -- C. Doanh thu Trừ buổi Liệu trình thực hiện trong kỳ (Chống nhân bản dòng khi JOIN & Bỏ hoàn toàn Fallback)
    WITH course_unit_prices AS (
        SELECT 
            cc.id AS course_id,
            cc.total_sessions,
            CASE 
                WHEN cc.sale_id IS NOT NULL THEN (
                    SELECT 
                        SUM(si.line_total * (1 - (COALESCE(s.discount_amount, 0)::NUMERIC / NULLIF(s.subtotal, 0))))
                        / NULLIF((
                            SELECT SUM(cc2.total_sessions)
                            FROM customer_courses cc2
                            WHERE cc2.sale_id = cc.sale_id
                              AND (cc2.package_id IS NOT DISTINCT FROM cc.package_id)
                              AND (cc2.service_id IS NOT DISTINCT FROM cc.service_id)
                        ), 0)
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    WHERE si.sale_id = cc.sale_id
                      AND (si.item_ref_id = cc.package_id OR si.item_ref_id = cc.service_id)
                      AND s.status NOT IN ('cancelled', 'refunded')
                )
                ELSE NULL
            END AS unit_session_price
        FROM customer_courses cc
        WHERE cc.organization_id = p_org_id
    ),
    deduction_calculations AS (
        SELECT 
            sd.id,
            sd.sessions_deducted,
            cup.unit_session_price,
            CASE 
                WHEN cup.unit_session_price IS NOT NULL THEN
                    ROUND(sd.sessions_deducted::NUMERIC * cup.unit_session_price)
                ELSE NULL
            END AS session_revenue
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        JOIN course_unit_prices cup ON cup.course_id = cc.id
        WHERE cc.organization_id = p_org_id
          AND (
              (p_branch_id IS NOT NULL AND sd.branch_id = p_branch_id)
              OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(sd.branch_id)))
          )
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
    )
    SELECT 
        COALESCE(SUM(session_revenue), 0),
        COALESCE(SUM(CASE WHEN session_revenue IS NULL THEN sessions_deducted ELSE 0 END), 0)
    INTO v_earned_treatment_revenue, v_unreconciled_sessions_count
    FROM deduction_calculations;

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
      AND (
          (p_branch_id IS NOT NULL AND s.branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(s.branch_id)))
      )
      AND s.status NOT IN ('cancelled', 'refunded')
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND si.item_type = 'product';

    -- B. Giá vốn vật tư tiêu hao ca dịch vụ / liệu trình thực tế
    SELECT COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0)
    INTO v_material_cost
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND smu.branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(smu.branch_id)))
      )
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
      AND (
          (p_branch_id IS NOT NULL AND branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(branch_id)))
      )
      AND status IN ('eligible', 'approved', 'paid')
      AND occurred_at >= v_start_ts AND occurred_at < v_next_day_ts;

    -- B. Chi phí vận hành đã thực sự giải ngân trong kỳ (Bảo toàn lịch sử: status IN ('disbursed', 'reversed') HOẶC disbursed_at IS NOT NULL)
    SELECT COALESCE(SUM(amount), 0) INTO v_operating_expenses_gross
    FROM expense_vouchers
    WHERE organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(branch_id)))
      )
      AND (
          status IN ('disbursed', 'reversed')
          OR disbursed_at IS NOT NULL
      )
      AND expense_date BETWEEN p_start_date AND p_end_date;

    -- C. Bút toán hoàn chi phát sinh trong kỳ (Expense Reversals theo ngày thực tế xảy ra)
    SELECT COALESCE(SUM(amount), 0) INTO v_expense_reversals
    FROM cashflow_ledger
    WHERE organization_id = p_org_id
      AND (
          (p_branch_id IS NOT NULL AND branch_id = p_branch_id)
          OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(branch_id)))
      )
      AND transaction_category = 'expense_reversal'
      AND occurred_at >= v_start_ts AND occurred_at < v_next_day_ts;

    -- Thực chi ròng trong kỳ (Net OPEX)
    v_net_operating_expenses := v_operating_expenses_gross - v_expense_reversals;

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
          AND (
              (p_branch_id IS NOT NULL AND branch_id = p_branch_id)
              OR (p_branch_id IS NULL AND (v_user_role = 'owner_admin' OR has_branch_access(branch_id)))
          )
          AND (
              status IN ('disbursed', 'reversed')
              OR disbursed_at IS NOT NULL
          )
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
            'unreconciled_sessions_count', v_unreconciled_sessions_count,
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
            'operating_expenses_gross', v_operating_expenses_gross,
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
