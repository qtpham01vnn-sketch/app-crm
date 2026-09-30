-- =============================================================================
-- MIGRATION 029: PHÂN HỆ P7.4 — BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT
-- Phân hệ: P7.4 — Customer Analytics, RFM, Service/Purchase Retention & Cohort
-- Target: PostgreSQL / Supabase
-- Yêu cầu tiên quyết: Migrations 001 - 028
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT (P7.4)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_customer_retention_and_cohort_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_segment_filter VARCHAR(50) DEFAULT NULL, -- 'all', 'new', 'returning', 'at_risk', 'inactive', 'unengaged'
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
    v_ref_date DATE := p_end_date;

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    v_summary JSONB;
    v_rfm_segments JSONB;
    v_cohort_service JSONB;
    v_cohort_repurchase JSONB;
    v_customer_drilldown JSONB;
    v_total_records INT := 0;

    v_total_customers_in_system INT := 0;
    v_total_active_period_buyers INT := 0;
    v_total_active_period_served INT := 0;
    v_new_org_customers INT := 0;
    v_new_branch_customers INT := 0;
    v_returning_buyers INT := 0;
    v_returning_served INT := 0;
BEGIN
    -- 0. Kiểm tra quyền truy cập RLS ngữ cảnh tổ chức
    IF auth.uid() IS NOT NULL THEN
        v_caller_org := get_current_user_org_id();
        IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
            RAISE EXCEPTION 'Truy cập trái phép: Người dùng không thuộc tổ chức này.';
        END IF;
    END IF;

    -- =========================================================================
    -- 1. TẠO BẢNG TẠM PHÂN TÍCH TỔNG THỂ KHÁCH HÀNG (TEMP_CUSTOMER_ANALYZED)
    -- =========================================================================
    DROP TABLE IF EXISTS temp_customer_analyzed;
    CREATE TEMP TABLE temp_customer_analyzed ON COMMIT DROP AS
    WITH customer_history AS (
        SELECT 
            c.id AS customer_id,
            c.full_name,
            c.phone,
            c.tier,
            c.created_at AS registered_at,
            -- Ngày mua hàng đầu tiên toàn chuỗi
            (
                SELECT MIN(s.created_at)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND s.organization_id = p_org_id
                  AND s.status = 'completed'
            ) AS first_purchase_org_at,
            -- Ngày mua hàng đầu tiên tại chi nhánh
            (
                SELECT MIN(s.created_at)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.status = 'completed'
            ) AS first_purchase_branch_at,
            -- Ngày được phục vụ đầu tiên toàn chuỗi
            (
                SELECT LEAST(
                    (SELECT MIN(sd.performed_at) FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id WHERE cc.customer_id = c.id),
                    (SELECT MIN(a.scheduled_at) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed')
                )
            ) AS first_service_at,
            -- Lần mua gần nhất tính đến ngày kết thúc kỳ (Recency cơ sở bất biến)
            (
                SELECT MAX(s.created_at)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at < v_next_day_ts
                  AND s.status = 'completed'
            ) AS last_purchase_at,
            -- Lần phục vụ gần nhất tính đến ngày kết thúc kỳ
            (
                SELECT GREATEST(
                    (SELECT MAX(sd.performed_at) FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id WHERE cc.customer_id = c.id AND sd.performed_at < v_next_day_ts AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)),
                    (SELECT MAX(a.scheduled_at) FROM appointments a WHERE a.customer_id = c.id AND a.scheduled_at < v_next_day_ts AND a.status = 'completed' AND (p_branch_id IS NULL OR a.branch_id = p_branch_id))
                )
            ) AS last_service_at,
            -- Số đơn mua hoàn tất trong kỳ
            COALESCE((
                SELECT COUNT(s.id)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
                  AND s.status = 'completed'
            ), 0) AS period_purchase_count,
            -- Số lần phục vụ trong kỳ (buổi liệu trình + lịch hẹn hoàn thành)
            COALESCE((
                SELECT COUNT(DISTINCT sd.id)
                FROM session_deductions sd
                JOIN customer_courses cc ON cc.id = sd.course_id
                WHERE cc.customer_id = c.id
                  AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
                  AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
            ), 0) + COALESCE((
                SELECT COUNT(DISTINCT a.id)
                FROM appointments a
                WHERE a.customer_id = c.id
                  AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
                  AND a.scheduled_at >= v_start_ts AND a.scheduled_at < v_next_day_ts
                  AND a.status = 'completed'
            ), 0) AS period_service_count,
            -- Tổng chi tiêu thực tế tích lũy lịch sử (Historical Net Spend)
            COALESCE((
                SELECT SUM(s.total_amount)
                FROM sales s
                WHERE s.customer_id = c.id
                  AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
                  AND s.created_at < v_next_day_ts
                  AND s.status = 'completed'
            ), 0) AS historical_net_spend,
            -- Số buổi liệu trình còn khả dụng
            COALESCE((
                SELECT SUM(cc.total_sessions - cc.used_sessions)
                FROM customer_courses cc
                WHERE cc.customer_id = c.id
                  AND cc.status = 'active'
                  AND (cc.total_sessions - cc.used_sessions) > 0
            ), 0) AS active_remaining_sessions,
            -- Có lịch hẹn sắp tới không (tính từ sau v_ref_date)
            EXISTS (
                SELECT 1 
                FROM appointments a 
                WHERE a.customer_id = c.id 
                  AND a.scheduled_at >= v_next_day_ts 
                  AND a.status IN ('booked', 'confirmed')
            ) AS has_upcoming_appointment
        FROM customers c
        WHERE c.organization_id = p_org_id
    )
    SELECT 
        ch.*,
        -- Recency theo ngày (tính từ last_purchase_at hoặc last_service_at đến v_ref_date)
        CASE 
            WHEN ch.last_purchase_at IS NOT NULL OR ch.last_service_at IS NOT NULL THEN
                (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE))
            ELSE NULL 
        END AS recency_days,
        -- Phân loại Khách Mới vs Khách Quay Lại trong kỳ
        CASE 
            WHEN ch.period_purchase_count = 0 AND ch.period_service_count = 0 THEN 'no_activity_in_period'
            WHEN ch.first_purchase_org_at >= v_start_ts AND ch.first_purchase_org_at < v_next_day_ts THEN 'new_to_org'
            WHEN p_branch_id IS NOT NULL AND ch.first_purchase_branch_at >= v_start_ts AND ch.first_purchase_branch_at < v_next_day_ts THEN 'new_to_branch'
            WHEN ch.period_purchase_count > 0 AND ch.first_purchase_org_at < v_start_ts THEN 'returning_buyer'
            WHEN ch.period_service_count > 0 THEN 'returning_served_only'
            ELSE 'other'
        END AS period_customer_type,
        -- RFM Segment Group (Căn cứ trên Recency & Chi tiêu thực tế)
        CASE 
            WHEN ch.historical_net_spend >= 20000000 AND (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) <= 45 THEN 'vip_champion'
            WHEN ch.historical_net_spend >= 5000000 AND (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) <= 60 THEN 'loyal'
            WHEN (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) <= 30 THEN 'promising_active'
            WHEN (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) BETWEEN 61 AND 120 THEN 'at_risk_care_needed'
            WHEN (v_ref_date - (GREATEST(COALESCE(ch.last_purchase_at, '1970-01-01'::timestamptz), COALESCE(ch.last_service_at, '1970-01-01'::timestamptz))::DATE)) > 120 THEN 'inactive_dormant'
            ELSE 'unengaged_no_history'
        END AS rfm_segment
    FROM customer_history ch;

    -- 2. TỔNG HỢP SUMMARY
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE ca.period_purchase_count > 0),
        COUNT(*) FILTER (WHERE ca.period_service_count > 0),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'new_to_org'),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'new_to_branch'),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'returning_buyer'),
        COUNT(*) FILTER (WHERE ca.period_customer_type = 'returning_served_only')
    INTO 
        v_total_customers_in_system,
        v_total_active_period_buyers,
        v_total_active_period_served,
        v_new_org_customers,
        v_new_branch_customers,
        v_returning_buyers,
        v_returning_served
    FROM temp_customer_analyzed ca;

    v_summary := jsonb_build_object(
        'total_customers_in_system', v_total_customers_in_system,
        'total_active_period_buyers', v_total_active_period_buyers,
        'total_active_period_served', v_total_active_period_served,
        'new_org_customers', v_new_org_customers,
        'new_branch_customers', v_new_branch_customers,
        'returning_buyers', v_returning_buyers,
        'returning_served_only', v_returning_served,
        'repurchase_rate_pct', CASE 
            WHEN (v_new_org_customers + v_returning_buyers) > 0 THEN 
                ROUND((v_returning_buyers::NUMERIC / (v_new_org_customers + v_returning_buyers)) * 100, 2)
            ELSE NULL 
        END,
        'disclaimer', 'Khách sử dụng buổi tiếp theo của gói cũ được ghi nhận là quay lại phục vụ, không tự tính là mua lại.'
    );

    -- 3. TỔNG HỢP PHÂN NHÓM RFM
    WITH segment_counts AS (
        SELECT 
            ca.rfm_segment,
            COUNT(*) AS customer_count,
            COALESCE(SUM(ca.historical_net_spend), 0) AS total_historical_spend,
            ROUND(AVG(NULLIF(ca.recency_days, 0)), 1) AS avg_recency_days
        FROM temp_customer_analyzed ca
        GROUP BY ca.rfm_segment
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'segment_key', sc.rfm_segment,
                'segment_name', CASE sc.rfm_segment
                    WHEN 'vip_champion' THEN 'VIP / Khách Hàng Thân Thiết Cao Cấp'
                    WHEN 'loyal' THEN 'Khách Hàng Trung Thành'
                    WHEN 'promising_active' THEN 'Khách Mới & Đang Hoạt Động Tốt'
                    WHEN 'at_risk_care_needed' THEN 'Cần Xem Xét Chăm Sóc (60-120 ngày chưa đến)'
                    WHEN 'inactive_dormant' THEN 'Chưa Quay Lại (>120 ngày)'
                    ELSE 'Chưa Phát Sinh Giao Dịch'
                END,
                'customer_count', sc.customer_count,
                'total_historical_spend', sc.total_historical_spend,
                'avg_recency_days', sc.avg_recency_days
            )
        ), '[]'::jsonb
    ) INTO v_rfm_segments
    FROM segment_counts sc;

    -- =========================================================================
    -- 4. BÁO CÁO COHORT QUAY LẠI PHỤC VỤ (Service Retention 30 / 60 / 90 Ngày)
    -- =========================================================================
    WITH first_service_cohort_raw AS (
        SELECT 
            ca.customer_id,
            ca.first_service_at::DATE AS cohort_first_date,
            TO_CHAR(ca.first_service_at, 'YYYY-MM') AS cohort_month,
            (v_ref_date >= (ca.first_service_at::DATE + 30)) AS eligible_30d,
            (v_ref_date >= (ca.first_service_at::DATE + 60)) AS eligible_60d,
            (v_ref_date >= (ca.first_service_at::DATE + 90)) AS eligible_90d,
            EXISTS (
                SELECT 1 FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id 
                WHERE cc.customer_id = ca.customer_id AND sd.performed_at > ca.first_service_at AND sd.performed_at <= (ca.first_service_at + INTERVAL '30 days')
            ) OR EXISTS (
                SELECT 1 FROM appointments a 
                WHERE a.customer_id = ca.customer_id AND a.scheduled_at > ca.first_service_at AND a.scheduled_at <= (ca.first_service_at + INTERVAL '30 days') AND a.status = 'completed'
            ) AS returned_within_30d,
            EXISTS (
                SELECT 1 FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id 
                WHERE cc.customer_id = ca.customer_id AND sd.performed_at > ca.first_service_at AND sd.performed_at <= (ca.first_service_at + INTERVAL '60 days')
            ) OR EXISTS (
                SELECT 1 FROM appointments a 
                WHERE a.customer_id = ca.customer_id AND a.scheduled_at > ca.first_service_at AND a.scheduled_at <= (ca.first_service_at + INTERVAL '60 days') AND a.status = 'completed'
            ) AS returned_within_60d,
            EXISTS (
                SELECT 1 FROM session_deductions sd JOIN customer_courses cc ON cc.id = sd.course_id 
                WHERE cc.customer_id = ca.customer_id AND sd.performed_at > ca.first_service_at AND sd.performed_at <= (ca.first_service_at + INTERVAL '90 days')
            ) OR EXISTS (
                SELECT 1 FROM appointments a 
                WHERE a.customer_id = ca.customer_id AND a.scheduled_at > ca.first_service_at AND a.scheduled_at <= (ca.first_service_at + INTERVAL '90 days') AND a.status = 'completed'
            ) AS returned_within_90d
        FROM temp_customer_analyzed ca
        WHERE ca.first_service_at IS NOT NULL
    ),
    first_service_cohort_grouped AS (
        SELECT 
            fsc.cohort_month,
            COUNT(*) AS total_cohort_customers,
            COUNT(*) FILTER (WHERE fsc.eligible_30d) AS eligible_30d,
            COUNT(*) FILTER (WHERE fsc.eligible_30d AND fsc.returned_within_30d) AS returned_30d,
            COUNT(*) FILTER (WHERE fsc.eligible_60d) AS eligible_60d,
            COUNT(*) FILTER (WHERE fsc.eligible_60d AND fsc.returned_within_60d) AS returned_60d,
            COUNT(*) FILTER (WHERE fsc.eligible_90d) AS eligible_90d,
            COUNT(*) FILTER (WHERE fsc.eligible_90d AND fsc.returned_within_90d) AS returned_90d
        FROM first_service_cohort_raw fsc
        GROUP BY fsc.cohort_month
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'cohort_month', g.cohort_month,
                'total_cohort_customers', g.total_cohort_customers,
                'retention_30d', jsonb_build_object(
                    'eligible', g.eligible_30d,
                    'returned', g.returned_30d,
                    'pct', CASE WHEN g.eligible_30d > 0 THEN ROUND((g.returned_30d::NUMERIC / g.eligible_30d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_30d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'retention_60d', jsonb_build_object(
                    'eligible', g.eligible_60d,
                    'returned', g.returned_60d,
                    'pct', CASE WHEN g.eligible_60d > 0 THEN ROUND((g.returned_60d::NUMERIC / g.eligible_60d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_60d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'retention_90d', jsonb_build_object(
                    'eligible', g.eligible_90d,
                    'returned', g.returned_90d,
                    'pct', CASE WHEN g.eligible_90d > 0 THEN ROUND((g.returned_90d::NUMERIC / g.eligible_90d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_90d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                )
            ) ORDER BY g.cohort_month DESC
        ), '[]'::jsonb
    ) INTO v_cohort_service
    FROM first_service_cohort_grouped g;

    -- =========================================================================
    -- 5. BÁO CÁO COHORT MUA LẠI (Repurchase Cohort 30 / 60 / 90 Ngày)
    -- =========================================================================
    WITH first_purchase_cohort_raw AS (
        SELECT 
            ca.customer_id,
            ca.first_purchase_org_at::DATE AS cohort_first_date,
            TO_CHAR(ca.first_purchase_org_at, 'YYYY-MM') AS cohort_month,
            (v_ref_date >= (ca.first_purchase_org_at::DATE + 30)) AS eligible_30d,
            (v_ref_date >= (ca.first_purchase_org_at::DATE + 60)) AS eligible_60d,
            (v_ref_date >= (ca.first_purchase_org_at::DATE + 90)) AS eligible_90d,
            EXISTS (
                SELECT 1 FROM sales s 
                WHERE s.customer_id = ca.customer_id AND s.organization_id = p_org_id AND s.status = 'completed'
                  AND s.created_at > ca.first_purchase_org_at AND s.created_at <= (ca.first_purchase_org_at + INTERVAL '30 days')
            ) AS repurchased_within_30d,
            EXISTS (
                SELECT 1 FROM sales s 
                WHERE s.customer_id = ca.customer_id AND s.organization_id = p_org_id AND s.status = 'completed'
                  AND s.created_at > ca.first_purchase_org_at AND s.created_at <= (ca.first_purchase_org_at + INTERVAL '60 days')
            ) AS repurchased_within_60d,
            EXISTS (
                SELECT 1 FROM sales s 
                WHERE s.customer_id = ca.customer_id AND s.organization_id = p_org_id AND s.status = 'completed'
                  AND s.created_at > ca.first_purchase_org_at AND s.created_at <= (ca.first_purchase_org_at + INTERVAL '90 days')
            ) AS repurchased_within_90d
        FROM temp_customer_analyzed ca
        WHERE ca.first_purchase_org_at IS NOT NULL
    ),
    first_purchase_cohort_grouped AS (
        SELECT 
            fpc.cohort_month,
            COUNT(*) AS total_cohort_customers,
            COUNT(*) FILTER (WHERE fpc.eligible_30d) AS eligible_30d,
            COUNT(*) FILTER (WHERE fpc.eligible_30d AND fpc.repurchased_within_30d) AS repurchased_30d,
            COUNT(*) FILTER (WHERE fpc.eligible_60d) AS eligible_60d,
            COUNT(*) FILTER (WHERE fpc.eligible_60d AND fpc.repurchased_within_60d) AS repurchased_60d,
            COUNT(*) FILTER (WHERE fpc.eligible_90d) AS eligible_90d,
            COUNT(*) FILTER (WHERE fpc.eligible_90d AND fpc.repurchased_within_90d) AS repurchased_90d
        FROM first_purchase_cohort_raw fpc
        GROUP BY fpc.cohort_month
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'cohort_month', g.cohort_month,
                'total_cohort_customers', g.total_cohort_customers,
                'repurchase_30d', jsonb_build_object(
                    'eligible', g.eligible_30d,
                    'repurchased', g.repurchased_30d,
                    'pct', CASE WHEN g.eligible_30d > 0 THEN ROUND((g.repurchased_30d::NUMERIC / g.eligible_30d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_30d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'repurchase_60d', jsonb_build_object(
                    'eligible', g.eligible_60d,
                    'repurchased', g.repurchased_60d,
                    'pct', CASE WHEN g.eligible_60d > 0 THEN ROUND((g.repurchased_60d::NUMERIC / g.eligible_60d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_60d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                ),
                'repurchase_90d', jsonb_build_object(
                    'eligible', g.eligible_90d,
                    'repurchased', g.repurchased_90d,
                    'pct', CASE WHEN g.eligible_90d > 0 THEN ROUND((g.repurchased_90d::NUMERIC / g.eligible_90d) * 100, 2) ELSE NULL END,
                    'status', CASE WHEN g.eligible_90d > 0 THEN 'ready' ELSE 'Chưa đủ thời gian theo dõi' END
                )
            ) ORDER BY g.cohort_month DESC
        ), '[]'::jsonb
    ) INTO v_cohort_repurchase
    FROM first_purchase_cohort_grouped g;

    -- =========================================================================
    -- 6. DRILL-DOWN DANH SÁCH KHÁCH HÀNG KÈM PHÂN TRANG
    -- =========================================================================
    WITH filtered_customers AS (
        SELECT *
        FROM temp_customer_analyzed ca
        WHERE (p_segment_filter IS NULL OR p_segment_filter = 'all' OR ca.rfm_segment = p_segment_filter)
    )
    SELECT COUNT(*) INTO v_total_records FROM filtered_customers;

    WITH paged_customers AS (
        SELECT *
        FROM temp_customer_analyzed ca
        WHERE (p_segment_filter IS NULL OR p_segment_filter = 'all' OR ca.rfm_segment = p_segment_filter)
        ORDER BY ca.historical_net_spend DESC, ca.registered_at DESC
        LIMIT v_limit OFFSET v_offset
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'customer_id', pc.customer_id,
                'full_name', pc.full_name,
                'phone', pc.phone,
                'tier', pc.tier,
                'registered_at', pc.registered_at,
                'first_purchase_org_at', pc.first_purchase_org_at,
                'first_service_at', pc.first_service_at,
                'last_purchase_at', pc.last_purchase_at,
                'last_service_at', pc.last_service_at,
                'recency_days', pc.recency_days,
                'period_purchase_count', pc.period_purchase_count,
                'period_service_count', pc.period_service_count,
                'historical_net_spend', pc.historical_net_spend,
                'active_remaining_sessions', pc.active_remaining_sessions,
                'has_upcoming_appointment', pc.has_upcoming_appointment,
                'period_customer_type', pc.period_customer_type,
                'rfm_segment', pc.rfm_segment,
                'care_recommendation', CASE 
                    WHEN pc.has_upcoming_appointment THEN 'Đã có lịch hẹn sắp tới'
                    WHEN pc.active_remaining_sessions > 0 AND pc.recency_days > 45 THEN 'Còn liệu trình chưa dùng — Cần liên hệ nhắc lịch'
                    WHEN pc.rfm_segment = 'at_risk_care_needed' THEN 'Cần xem xét chăm sóc (60-120 ngày chưa đến)'
                    WHEN pc.rfm_segment = 'inactive_dormant' THEN 'Chưa quay lại (>120 ngày) — Xem xét chiến dịch re-engagement'
                    ELSE 'Bình thường'
                END
            )
        ), '[]'::jsonb
    ) INTO v_customer_drilldown
    FROM paged_customers pc;

    RETURN jsonb_build_object(
        'timezone', 'Asia/Ho_Chi_Minh (UTC+7)',
        'start_date', p_start_date,
        'end_date', p_end_date,
        'summary', v_summary,
        'rfm_segments', v_rfm_segments,
        'cohort_service_retention', v_cohort_service,
        'cohort_repurchase_retention', v_cohort_repurchase,
        'customer_drilldown', v_customer_drilldown,
        'pagination', jsonb_build_object(
            'page', COALESCE(p_page, 1),
            'page_size', v_limit,
            'total_records', v_total_records,
            'total_pages', CEIL(v_total_records::NUMERIC / NULLIF(v_limit, 0))
        )
    );
END;
$$;
