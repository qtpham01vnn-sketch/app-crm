-- =============================================================================
-- MIGRATION 028: PHÂN HỆ P7.3 — BÁO CÁO HIỆU SUẤT NHÂN SỰ, BÁC SĨ & CÔNG SUẤT TÀI NGUYÊN
-- Phân hệ: P7.3 — Staff Performance, Time Utilization & Resource Seat Capacity
-- Target: PostgreSQL / Supabase
-- Yêu cầu tiên quyết: Migrations 001 - 027
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC BÁO CÁO HIỆU SUẤT NHÂN SỰ & CÔNG SUẤT PHÒNG/GHẾ/GIƯỜNG (P7.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_staff_and_resource_utilization_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_staff_id UUID DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org UUID;
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_days_count INT := (p_end_date - p_start_date + 1);

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    v_staff_metrics JSONB;
    v_resource_metrics JSONB;
    v_drilldown_sessions JSONB;
    v_total_records INT := 0;

    v_total_sales_rep_revenue BIGINT := 0;
    v_total_service_exec_revenue BIGINT := 0;
    v_total_sessions_count INT := 0;
    v_total_unique_clients INT := 0;
    v_total_hands_on_hours NUMERIC(10, 2) := 0;
    v_total_approved_work_hours NUMERIC(10, 2) := 0;
    v_overall_utilization_pct NUMERIC(5, 2) := NULL;
BEGIN
    -- 0. Kiểm tra quyền truy cập RLS ngữ cảnh tổ chức
    IF auth.uid() IS NOT NULL THEN
        v_caller_org := get_current_user_org_id();
        IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này.';
        END IF;
    END IF;

    -- =========================================================================
    -- 1. TỔNG HỢP HIỆU SUẤT TỪNG NHÂN VIÊN / BÁC SĨ / KTV
    -- =========================================================================
    WITH staff_sales AS (
        -- Doanh số tư vấn / bán hàng (Sales by Rep)
        SELECT 
            s.cashier_staff_id AS staff_id,
            COALESCE(SUM(s.total_amount), 0) AS sales_invoiced
        FROM sales s
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
          AND s.status = 'completed'
        GROUP BY s.cashier_staff_id
    ),
    staff_service_exec AS (
        -- Doanh thu thực hiện dịch vụ lẻ (POS Service Execution)
        SELECT 
            COALESCE(s.cashier_staff_id, sd.staff_id) AS staff_id,
            sd.branch_id,
            sd.id AS session_id,
            sd.customer_id,
            sd.service_id,
            sd.session_revenue,
            sd.duration_hours,
            sd.is_estimated_duration,
            sd.performed_at
        FROM (
            -- Dịch vụ lẻ làm tại POS
            SELECT 
                si.id AS line_id,
                s.id AS sale_id,
                NULL::UUID AS session_deduction_id,
                s.cashier_staff_id AS staff_id,
                s.customer_id,
                s.branch_id,
                si.item_ref_id AS service_id,
                ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0)))) AS session_revenue,
                COALESCE(srv.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours,
                TRUE AS is_estimated_duration,
                s.created_at AS performed_at
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN services srv ON srv.id = si.item_ref_id
            WHERE s.organization_id = p_org_id
              AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
              AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
              AND s.status = 'completed'
              AND si.item_type = 'service'

            UNION ALL

            -- Trừ buổi gói liệu trình thực tế
            SELECT 
                sd.id AS line_id,
                cc.sale_id,
                sd.id AS session_deduction_id,
                sd.staff_id,
                cc.customer_id,
                sd.branch_id,
                cc.service_id,
                ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0)) AS session_revenue,
                COALESCE(srv.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours,
                TRUE AS is_estimated_duration,
                sd.performed_at
            FROM session_deductions sd
            JOIN customer_courses cc ON cc.id = sd.course_id
            LEFT JOIN sales sa ON sa.id = cc.sale_id
            LEFT JOIN services srv ON srv.id = cc.service_id
            WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
              AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
        ) sd
    ),
    staff_hours_approved AS (
        -- Giờ công chấm công đã được duyệt (Approved Hours)
        SELECT 
            ar.staff_id,
            COALESCE(SUM(ar.approved_hours), 0) AS approved_work_hours
        FROM attendance_records ar
        WHERE ar.organization_id = p_org_id
          AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
          AND ar.work_date >= p_start_date AND ar.work_date <= p_end_date
          AND ar.status = 'approved'
        GROUP BY ar.staff_id
    ),
    staff_aggregated AS (
        SELECT 
            sp.id AS staff_id,
            sp.full_name,
            sp.job_title,
            b.name AS primary_branch_name,
            COALESCE(ss.sales_invoiced, 0) AS sales_invoiced,
            COALESCE(SUM(se.session_revenue), 0) AS service_execution_revenue,
            COUNT(DISTINCT se.session_id) AS sessions_completed_count,
            COUNT(DISTINCT se.customer_id) AS unique_clients_served,
            COALESCE(SUM(se.duration_hours), 0) AS hands_on_hours,
            COALESCE(MAX(sha.approved_work_hours), 0) AS approved_work_hours
        FROM staff_profiles sp
        JOIN branches b ON b.id = sp.primary_branch_id
        LEFT JOIN staff_sales ss ON ss.staff_id = sp.id
        LEFT JOIN staff_service_exec se ON se.staff_id = sp.id
        LEFT JOIN staff_hours_approved sha ON sha.staff_id = sp.id
        WHERE sp.organization_id = p_org_id
          AND (p_branch_id IS NULL OR sp.primary_branch_id = p_branch_id)
          AND (p_staff_id IS NULL OR sp.id = p_staff_id)
          AND sp.is_active = TRUE
        GROUP BY sp.id, sp.full_name, sp.job_title, b.name, ss.sales_invoiced
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'staff_id', sa.staff_id,
                'full_name', sa.full_name,
                'job_title', sa.job_title,
                'primary_branch_name', sa.primary_branch_name,
                'sales_invoiced', sa.sales_invoiced,
                'service_execution_revenue', sa.service_execution_revenue,
                'sessions_completed_count', sa.sessions_completed_count,
                'unique_clients_served', sa.unique_clients_served,
                'hands_on_hours', ROUND(sa.hands_on_hours, 2),
                'approved_work_hours', ROUND(sa.approved_work_hours, 2),
                'utilization_pct', CASE 
                    WHEN sa.approved_work_hours > 0 THEN ROUND((sa.hands_on_hours / sa.approved_work_hours) * 100, 2)
                    ELSE NULL 
                END,
                'rating_avg', NULL,
                'rating_count', 0,
                'rating_status', 'Chưa triển khai nguồn dữ liệu đánh giá'
            )
        ), '[]'::jsonb
    ) INTO v_staff_metrics
    FROM staff_aggregated sa;

    -- =========================================================================
    -- 2. TỔNG HỢP CÔNG SUẤT TÀI NGUYÊN (PHÒNG / GIƯỜNG / GHẾ)
    -- =========================================================================
    WITH resource_utilization AS (
        SELECT 
            r.id AS resource_id,
            r.code,
            r.name AS resource_name,
            r.resource_type,
            r.capacity,
            b.name AS branch_name,
            -- Giờ mở cửa tiêu chuẩn khả dụng: Số ngày * 10 giờ/ngày * Sức chứa (Chỗ x Giờ)
            (v_days_count * 10.0 * r.capacity)::NUMERIC(10,2) AS available_seat_hours,
            0.0::NUMERIC(10,2) AS maintenance_seat_hours,
            -- Giờ đặt lịch (Booked)
            COALESCE((
                SELECT SUM(a.duration_minutes::NUMERIC / 60.0)
                FROM appointments a
                WHERE a.resource_id = r.id
                  AND a.scheduled_at >= v_start_ts AND a.scheduled_at < v_next_day_ts
                  AND a.status IN ('booked', 'confirmed', 'completed')
            ), 0.0)::NUMERIC(10,2) AS booked_seat_hours,
            -- Giờ thực tế đã phục vụ (Actual Utilized)
            COALESCE((
                SELECT SUM(a.duration_minutes::NUMERIC / 60.0)
                FROM appointments a
                WHERE a.resource_id = r.id
                  AND a.scheduled_at >= v_start_ts AND a.scheduled_at < v_next_day_ts
                  AND a.status = 'completed'
            ), 0.0)::NUMERIC(10,2) AS actual_used_seat_hours
        FROM resources r
        JOIN branches b ON b.id = r.branch_id
        WHERE r.organization_id = p_org_id
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
          AND (p_resource_id IS NULL OR r.id = p_resource_id)
          AND r.is_active = TRUE
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'resource_id', ru.resource_id,
                'code', ru.code,
                'resource_name', ru.resource_name,
                'resource_type', ru.resource_type,
                'capacity', ru.capacity,
                'branch_name', ru.branch_name,
                'available_seat_hours', ru.available_seat_hours,
                'maintenance_seat_hours', ru.maintenance_seat_hours,
                'booked_seat_hours', ru.booked_seat_hours,
                'actual_used_seat_hours', ru.actual_used_seat_hours,
                'booked_utilization_pct', CASE 
                    WHEN ru.available_seat_hours > 0 THEN ROUND((ru.booked_seat_hours / ru.available_seat_hours) * 100, 2)
                    ELSE NULL 
                END,
                'actual_utilization_pct', CASE 
                    WHEN ru.available_seat_hours > 0 THEN ROUND((ru.actual_used_seat_hours / ru.available_seat_hours) * 100, 2)
                    ELSE NULL 
                END
            )
        ), '[]'::jsonb
    ) INTO v_resource_metrics
    FROM resource_utilization ru;

    -- =========================================================================
    -- 3. DRILL-DOWN CHI TIẾT TỪNG LẦN PHỤC VỤ CÓ PHÂN TRANG
    -- =========================================================================
    WITH all_sessions AS (
        SELECT 
            sd.id AS session_id,
            sd.performed_at,
            b.name AS branch_name,
            c.full_name AS customer_name,
            c.phone AS customer_phone,
            s.name AS service_name,
            COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
            'course_deduct' AS session_source,
            ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0)) AS allocated_revenue,
            COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        JOIN customers c ON c.id = cc.customer_id
        JOIN services s ON s.id = cc.service_id
        JOIN branches b ON b.id = sd.branch_id
        LEFT JOIN staff_profiles sp ON sp.id = sd.staff_id
        LEFT JOIN sales sa ON sa.id = cc.sale_id
        WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
          AND (p_staff_id IS NULL OR sd.staff_id = p_staff_id)

        UNION ALL

        SELECT 
            si.id AS session_id,
            sa.created_at AS performed_at,
            b.name AS branch_name,
            c.full_name AS customer_name,
            c.phone AS customer_phone,
            s.name AS service_name,
            COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
            'pos_service_sale' AS session_source,
            ROUND(si.line_total * (1 - (sa.discount_amount::NUMERIC / NULLIF(sa.subtotal, 0)))) AS allocated_revenue,
            COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
        FROM sale_items si
        JOIN sales sa ON sa.id = si.sale_id
        JOIN customers c ON c.id = sa.customer_id
        JOIN services s ON s.id = si.item_ref_id
        JOIN branches b ON b.id = sa.branch_id
        LEFT JOIN staff_profiles sp ON sp.id = sa.cashier_staff_id
        WHERE sa.organization_id = p_org_id
          AND (p_branch_id IS NULL OR sa.branch_id = p_branch_id)
          AND sa.created_at >= v_start_ts AND sa.created_at < v_next_day_ts
          AND sa.status = 'completed'
          AND si.item_type = 'service'
          AND (p_staff_id IS NULL OR sa.cashier_staff_id = p_staff_id)
    )
    SELECT COUNT(*) INTO v_total_records FROM all_sessions;

    WITH paged_sessions AS (
        SELECT * FROM (
            SELECT 
                sd.id AS session_id,
                sd.performed_at,
                b.name AS branch_name,
                c.full_name AS customer_name,
                c.phone AS customer_phone,
                s.name AS service_name,
                COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
                'course_deduct' AS session_source,
                ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0)) AS allocated_revenue,
                COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
            FROM session_deductions sd
            JOIN customer_courses cc ON cc.id = sd.course_id
            JOIN customers c ON c.id = cc.customer_id
            JOIN services s ON s.id = cc.service_id
            JOIN branches b ON b.id = sd.branch_id
            LEFT JOIN staff_profiles sp ON sp.id = sd.staff_id
            LEFT JOIN sales sa ON sa.id = cc.sale_id
            WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
              AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
              AND (p_staff_id IS NULL OR sd.staff_id = p_staff_id)

            UNION ALL

            SELECT 
                si.id AS session_id,
                sa.created_at AS performed_at,
                b.name AS branch_name,
                c.full_name AS customer_name,
                c.phone AS customer_phone,
                s.name AS service_name,
                COALESCE(sp.full_name, 'Chưa gán') AS staff_name,
                'pos_service_sale' AS session_source,
                ROUND(si.line_total * (1 - (sa.discount_amount::NUMERIC / NULLIF(sa.subtotal, 0)))) AS allocated_revenue,
                COALESCE(s.duration_minutes, 60)::NUMERIC / 60.0 AS duration_hours
            FROM sale_items si
            JOIN sales sa ON sa.id = si.sale_id
            JOIN customers c ON c.id = sa.customer_id
            JOIN services s ON s.id = si.item_ref_id
            JOIN branches b ON b.id = sa.branch_id
            LEFT JOIN staff_profiles sp ON sp.id = sa.cashier_staff_id
            WHERE sa.organization_id = p_org_id
              AND (p_branch_id IS NULL OR sa.branch_id = p_branch_id)
              AND sa.created_at >= v_start_ts AND sa.created_at < v_next_day_ts
              AND sa.status = 'completed'
              AND si.item_type = 'service'
              AND (p_staff_id IS NULL OR sa.cashier_staff_id = p_staff_id)
        ) s
        ORDER BY s.performed_at DESC
        LIMIT v_limit OFFSET v_offset
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'session_id', ps.session_id,
                'performed_at', ps.performed_at,
                'branch_name', ps.branch_name,
                'customer_name', ps.customer_name,
                'customer_phone', ps.customer_phone,
                'service_name', ps.service_name,
                'staff_name', ps.staff_name,
                'session_source', ps.session_source,
                'allocated_revenue', ps.allocated_revenue,
                'duration_hours', ps.duration_hours
            )
        ), '[]'::jsonb
    ) INTO v_drilldown_sessions
    FROM paged_sessions ps;

    -- =========================================================================
    -- 4. TÍNH TỔNG KPI TOÀN CHUỖI / CHI NHÁNH
    -- =========================================================================
    SELECT 
        COALESCE(SUM((x->>'sales_invoiced')::BIGINT), 0),
        COALESCE(SUM((x->>'service_execution_revenue')::BIGINT), 0),
        COALESCE(SUM((x->>'sessions_completed_count')::INT), 0),
        COALESCE(SUM((x->>'hands_on_hours')::NUMERIC), 0),
        COALESCE(SUM((x->>'approved_work_hours')::NUMERIC), 0)
    INTO 
        v_total_sales_rep_revenue,
        v_total_service_exec_revenue,
        v_total_sessions_count,
        v_total_hands_on_hours,
        v_total_approved_work_hours
    FROM jsonb_array_elements(v_staff_metrics) x;

    IF v_total_approved_work_hours > 0 THEN
        v_overall_utilization_pct := ROUND((v_total_hands_on_hours / v_total_approved_work_hours) * 100, 2);
    ELSE
        v_overall_utilization_pct := NULL;
    END IF;

    RETURN jsonb_build_object(
        'timezone', 'Asia/Ho_Chi_Minh (UTC+7)',
        'start_date', p_start_date,
        'end_date', p_end_date,
        'summary', jsonb_build_object(
            'total_sales_rep_revenue', v_total_sales_rep_revenue,
            'total_service_exec_revenue', v_total_service_exec_revenue,
            'total_sessions_count', v_total_sessions_count,
            'total_hands_on_hours', v_total_hands_on_hours,
            'total_approved_work_hours', v_total_approved_work_hours,
            'overall_utilization_pct', v_overall_utilization_pct,
            'disclaimer', 'Hiệu suất thời gian = Giờ phục vụ trực tiếp / Giờ công đã duyệt. Mẫu số = 0 trả về N/A.'
        ),
        'staff_metrics', v_staff_metrics,
        'resource_metrics', v_resource_metrics,
        'drilldown_sessions', v_drilldown_sessions,
        'pagination', jsonb_build_object(
            'page', COALESCE(p_page, 1),
            'page_size', v_limit,
            'total_records', v_total_records,
            'total_pages', CEIL(v_total_records::NUMERIC / NULLIF(v_limit, 0))
        )
    );
END;
$$;
