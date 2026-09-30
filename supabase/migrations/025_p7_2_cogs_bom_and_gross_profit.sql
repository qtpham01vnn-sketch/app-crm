-- =============================================================================
-- MIGRATION 025: BI & ANALYTICS PHASE P7.2 — COGS, SERVICE BOM & DIRECT CONTRIBUTION
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG ĐỊNH MỨC VẬT TƯ TIÊU HAO THEO DỊCH VỤ (SERVICE_BOMS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_boms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    standard_quantity NUMERIC(10, 3) NOT NULL CHECK (standard_quantity > 0),
    unit_of_measure VARCHAR(50) NOT NULL, -- e.g. 'ml', 'gram', 'mieng', 'ong', 'tuyp'
    conversion_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0 CHECK (conversion_rate > 0), -- Tỷ lệ quy đổi ra đơn vị kho cơ sở
    version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_active_bom_item UNIQUE (service_id, product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_service_bom_service ON service_boms (service_id, is_active);

ALTER TABLE service_boms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_service_boms_all ON service_boms;
CREATE POLICY rls_service_boms_all ON service_boms FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. SỔ CÁI TIÊU HAO VẬT TƯ THỰC TẾ THEO CA DỊCH VỤ (SESSION_MATERIAL_USAGES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_material_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    session_deduction_id UUID REFERENCES session_deductions(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    standard_quantity NUMERIC(10, 3) NOT NULL DEFAULT 0,
    actual_quantity NUMERIC(10, 3) NOT NULL CHECK (actual_quantity > 0),
    unit_of_measure VARCHAR(50) NOT NULL,
    base_quantity_deducted NUMERIC(10, 3) NOT NULL CHECK (base_quantity_deducted > 0),
    cost_price_snapshot BIGINT NOT NULL DEFAULT 0, -- Snapshot giá vốn tại thời điểm xuất dùng
    is_missing_cost_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
    performer_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'adjusted', 'reversed'
    notes TEXT,
    used_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_material_usage_service_date ON session_material_usages (branch_id, used_at, service_id);

ALTER TABLE session_material_usages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_session_material_usages_all ON session_material_usages;
CREATE POLICY rls_session_material_usages_all ON session_material_usages FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. RPC XUẤT TIÊU HAO VẬT TƯ CHO CA DỊCH VỤ (ATOMIC USAGE & STOCK DEDUCTION)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_record_service_material_usage(
    p_org_id UUID,
    p_branch_id UUID,
    p_service_id UUID,
    p_staff_id UUID,
    p_session_deduction_id UUID DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::JSONB, -- [{ product_id, actual_quantity, unit_of_measure, lot_number }]
    p_idempotency_key VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item RECORD;
    v_stock RECORD;
    v_bom RECORD;
    v_conversion_rate NUMERIC(10, 4);
    v_base_qty NUMERIC(10, 3);
    v_unit_cost BIGINT;
    v_is_missing_cost BOOLEAN := FALSE;
    v_usage_id UUID;
    v_inserted_count INT := 0;
    v_total_cost BIGINT := 0;
BEGIN
    -- Kiểm tra Idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM session_material_usages WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'is_duplicate', TRUE,
                'message', 'Giao dịch xuất vật tư đã được ghi nhận trước đó (Idempotent replay).'
            );
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Danh sách vật tư tiêu hao trống.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        actual_quantity NUMERIC,
        unit_of_measure VARCHAR,
        lot_number VARCHAR
    )
    LOOP
        IF v_item.actual_quantity <= 0 THEN
            RAISE EXCEPTION 'Số lượng vật tư tiêu hao phải lớn hơn 0 (Sản phẩm: %)', v_item.product_id;
        END IF;

        -- Tìm định mức và hệ số quy đổi
        SELECT * INTO v_bom
        FROM service_boms
        WHERE organization_id = p_org_id 
          AND service_id = p_service_id 
          AND product_id = v_item.product_id 
          AND is_active = TRUE
        ORDER BY effective_from DESC
        LIMIT 1;

        v_conversion_rate := COALESCE(v_bom.conversion_rate, 1.0);
        v_base_qty := ROUND(v_item.actual_quantity * v_conversion_rate, 3);

        -- Khóa bản ghi tồn kho để chống âm kho và lấy snapshot giá vốn
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE organization_id = p_org_id AND branch_id = p_branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Vật tư chưa được khởi tạo kho tại chi nhánh này (ID: %)', v_item.product_id;
        END IF;

        IF v_stock.stock_on_hand < CEIL(v_base_qty) THEN
            RAISE EXCEPTION 'Không đủ tồn kho khả dụng để xuất vật tư. Tồn hiện tại: %, Cần xuất: %', v_stock.stock_on_hand, v_base_qty;
        END IF;

        v_unit_cost := v_stock.cost_price;
        IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
            v_is_missing_cost := TRUE;
            v_unit_cost := 0;
        END IF;

        -- Trừ tồn kho cơ sở
        UPDATE inventory_stocks
        SET stock_on_hand = stock_on_hand - CEIL(v_base_qty),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_stock.id;

        -- Ghi sổ cái tiêu hao vật tư
        INSERT INTO session_material_usages (
            organization_id, branch_id, service_id, session_deduction_id,
            sale_id, appointment_id, product_id, lot_number,
            standard_quantity, actual_quantity, unit_of_measure,
            base_quantity_deducted, cost_price_snapshot, is_missing_cost_snapshot,
            performer_staff_id, idempotency_key, notes, used_at
        ) VALUES (
            p_org_id, p_branch_id, p_service_id, p_session_deduction_id,
            p_sale_id, p_appointment_id, v_item.product_id, v_item.lot_number,
            COALESCE(v_bom.standard_quantity, 0), v_item.actual_quantity, COALESCE(v_item.unit_of_measure, 'don_vi'),
            v_base_qty, v_unit_cost, v_is_missing_cost,
            p_staff_id, p_idempotency_key, p_notes, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_usage_id;

        -- Ghi sổ cái xuất kho (consumable_out)
        INSERT INTO inventory_transactions (
            organization_id, branch_id, product_id, transaction_type,
            reference_id, quantity_change, stock_before, stock_after,
            notes, actor_staff_id, created_at
        ) VALUES (
            p_org_id, p_branch_id, v_item.product_id, 'consumable_out',
            v_usage_id, -CEIL(v_base_qty), v_stock.stock_on_hand, v_stock.stock_on_hand - CEIL(v_base_qty),
            COALESCE(p_notes, 'Xuất vật tư ca dịch vụ'), p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        v_inserted_count := v_inserted_count + 1;
        v_total_cost := v_total_cost + ROUND(v_base_qty * v_unit_cost);
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'items_deducted', v_inserted_count,
        'total_material_cost', v_total_cost,
        'message', 'Đã ghi nhận tiêu hao vật tư và trừ tồn kho thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_service_material_usage(UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, TEXT) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. RPC BÁO CÁO GIÁ VỐN & CHÊNH LỆCH LỢI NHUẬN TRỰC TIẾP (P7.2 ANALYTICS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_cogs_and_gross_profit_report(
    p_org_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_service_id UUID DEFAULT NULL,
    p_category VARCHAR DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Ranh giới nửa khoảng mở chính xác múi giờ VN [start_ts, next_day_ts)
    v_start_ts TIMESTAMPTZ := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
    v_next_day_ts TIMESTAMPTZ := ((p_end_date + INTERVAL '1 day')::DATE::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

    v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 50));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_page_size, 50)));

    -- KPI Tổng Hợp
    v_total_recognized_revenue BIGINT := 0;
    v_total_cogs_products BIGINT := 0;
    v_total_material_cost BIGINT := 0;
    v_total_direct_commission BIGINT := 0;
    v_direct_contribution BIGINT := 0;
    v_margin_pct NUMERIC(5, 2) := NULL;
    v_missing_cost_warning_count INT := 0;

    v_summary JSONB;
    v_service_breakdown JSONB;
    v_variance_breakdown JSONB;
    v_drilldown_items JSONB;
    v_total_records INT := 0;
BEGIN
    -- 1. TỔNG HỢP DOANH THU THỰC HIỆN DỊCH VỤ & SẢN PHẨM BÁN LẺ
    -- A. Doanh thu Sản phẩm bán lẻ trong kỳ (kèm giá vốn snapshot)
    SELECT 
        COALESCE(SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0))))), 0),
        COALESCE(SUM(si.quantity * si.cost_price_snapshot), 0),
        COALESCE(SUM(CASE WHEN si.cost_price_snapshot = 0 THEN 1 ELSE 0 END), 0)
    INTO v_total_recognized_revenue, v_total_cogs_products, v_missing_cost_warning_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
      AND s.status <> 'cancelled'
      AND si.item_type = 'product';

    -- B. Doanh thu Dịch vụ lẻ làm ngay
    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND(si.line_total * (1 - (s.discount_amount::NUMERIC / NULLIF(s.subtotal, 0)))))
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.organization_id = p_org_id
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND s.created_at >= v_start_ts AND s.created_at < v_next_day_ts
          AND s.status <> 'cancelled'
          AND si.item_type = 'service'
          AND (p_service_id IS NULL OR si.item_ref_id = p_service_id)
    ), 0);

    -- C. Doanh thu Trừ buổi Liệu trình thực tế
    v_total_recognized_revenue := v_total_recognized_revenue + COALESCE((
        SELECT SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(s.total_amount, 0)))
        FROM session_deductions sd
        JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales s ON s.id = cc.sale_id
        WHERE (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
          AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
          AND (p_service_id IS NULL OR cc.service_id = p_service_id)
    ), 0);

    -- 2. TỔNG HỢP CHI PHÍ VẬT TƯ TIÊU HAO THỰC TẾ
    SELECT 
        COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0),
        COALESCE(SUM(CASE WHEN smu.is_missing_cost_snapshot THEN 1 ELSE 0 END), 0)
    INTO v_total_material_cost, v_missing_cost_warning_count
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND smu.status = 'confirmed'
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    -- 3. TỔNG HỢP HOA HỒNG TRỰC TIẾP (Eligible, Approved, Paid)
    SELECT COALESCE(SUM(cr.final_commission), 0)
    INTO v_total_direct_commission
    FROM commission_records cr
    WHERE cr.organization_id = p_org_id
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
      AND cr.occurred_at >= v_start_ts AND cr.occurred_at < v_next_day_ts
      AND cr.status IN ('eligible', 'approved', 'paid');

    -- 4. TÍNH CHÊNH LỆCH TRỰC TIẾP & TỶ SUẤT %
    v_direct_contribution := v_total_recognized_revenue - (v_total_cogs_products + v_total_material_cost + v_total_direct_commission);
    
    IF v_total_recognized_revenue > 0 THEN
        v_margin_pct := ROUND((v_direct_contribution::NUMERIC / v_total_recognized_revenue) * 100, 2);
    ELSE
        v_margin_pct := NULL; -- Trả về null khi doanh thu = 0
    END IF;

    v_summary := jsonb_build_object(
        'recognized_revenue', v_total_recognized_revenue,
        'cogs_products', v_total_cogs_products,
        'material_cost', v_total_material_cost,
        'direct_commission', v_total_direct_commission,
        'direct_contribution', v_direct_contribution,
        'margin_pct', v_margin_pct,
        'missing_cost_warning_count', v_missing_cost_warning_count,
        'disclaimer', 'Chênh lệch trực tiếp sau giá vốn, vật tư và hoa hồng (chưa bao gồm chi phí khấu hao máy móc, tiền điện, mặt bằng và lương cứng).'
    );

    -- 5. PHÂN TÍCH THEO DỊCH VỤ (SERVICE BREAKDOWN)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'service_id', sb.service_id,
                'service_name', sb.service_name,
                'category', sb.category,
                'session_count', sb.session_count,
                'recognized_revenue', sb.revenue,
                'material_cost', sb.material_cost,
                'direct_contribution', (sb.revenue - sb.material_cost),
                'margin_pct', CASE WHEN sb.revenue > 0 THEN ROUND(((sb.revenue - sb.material_cost)::NUMERIC / sb.revenue) * 100, 2) ELSE NULL END
            )
        ), '[]'::jsonb
    ) INTO v_service_breakdown
    FROM (
        SELECT 
            s.id AS service_id,
            s.name AS service_name,
            s.category,
            COUNT(DISTINCT sd.id) AS session_count,
            COALESCE(SUM(ROUND((sd.sessions_deducted::NUMERIC / NULLIF(cc.total_sessions, 0)) * COALESCE(sa.total_amount, 0))), 0) AS revenue,
            COALESCE(SUM(ROUND(smu.base_quantity_deducted * smu.cost_price_snapshot)), 0) AS material_cost
        FROM services s
        LEFT JOIN session_deductions sd ON sd.course_id IN (SELECT id FROM customer_courses WHERE service_id = s.id)
            AND sd.performed_at >= v_start_ts AND sd.performed_at < v_next_day_ts
            AND (p_branch_id IS NULL OR sd.branch_id = p_branch_id)
        LEFT JOIN customer_courses cc ON cc.id = sd.course_id
        LEFT JOIN sales sa ON sa.id = cc.sale_id
        LEFT JOIN session_material_usages smu ON smu.session_deduction_id = sd.id
        WHERE s.organization_id = p_org_id
          AND (p_service_id IS NULL OR s.id = p_service_id)
          AND (p_category IS NULL OR s.category = p_category)
        GROUP BY s.id, s.name, s.category
        HAVING COUNT(DISTINCT sd.id) > 0 OR SUM(smu.base_quantity_deducted) > 0
    ) sb;

    -- 6. PHÂN TÍCH 5 LOẠI CHÊNH LỆCH VẬT TƯ & TỒN KHO
    SELECT jsonb_build_object(
        'bom_variance', COALESCE((
            SELECT SUM(ROUND((smu.actual_quantity - smu.standard_quantity) * smu.cost_price_snapshot))
            FROM session_material_usages smu
            WHERE smu.organization_id = p_org_id
              AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
              AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
        ), 0),
        'audit_shrinkage', COALESCE((
            SELECT SUM(it.quantity_change * it.cost_before)
            FROM (
                SELECT it.*, COALESCE(s.cost_price, 0) AS cost_before 
                FROM inventory_transactions it
                JOIN inventory_stocks s ON s.branch_id = it.branch_id AND s.product_id = it.product_id
                WHERE it.organization_id = p_org_id 
                  AND (p_branch_id IS NULL OR it.branch_id = p_branch_id)
                  AND it.transaction_type = 'audit_adjustment'
                  AND it.created_at >= v_start_ts AND it.created_at < v_next_day_ts
            ) it
        ), 0),
        'damaged_expired_loss', 0,
        'transfer_variance', 0,
        'unassigned_usage', 0
    ) INTO v_variance_breakdown;

    -- 7. DANH SÁCH CHI TIẾT DRILL-DOWN CÓ PHÂN TRANG PHÍA SERVER
    SELECT COUNT(*) INTO v_total_records
    FROM session_material_usages smu
    WHERE smu.organization_id = p_org_id
      AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
      AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
      AND (p_service_id IS NULL OR smu.service_id = p_service_id);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', d.id,
                'used_at', d.used_at,
                'branch_name', d.branch_name,
                'service_name', d.service_name,
                'product_name', d.product_name,
                'standard_qty', d.standard_quantity,
                'actual_qty', d.actual_quantity,
                'unit', d.unit_of_measure,
                'cost_price_snapshot', d.cost_price_snapshot,
                'total_cost', ROUND(d.base_quantity_deducted * d.cost_price_snapshot),
                'is_missing_cost_snapshot', d.is_missing_cost_snapshot,
                'performer_name', d.performer_name,
                'notes', d.notes
            )
            ORDER BY d.used_at DESC
        ), '[]'::jsonb
    ) INTO v_drilldown_items
    FROM (
        SELECT 
            smu.*,
            b.name AS branch_name,
            s.name AS service_name,
            p.name AS product_name,
            st.full_name AS performer_name
        FROM session_material_usages smu
        JOIN branches b ON b.id = smu.branch_id
        JOIN services s ON s.id = smu.service_id
        JOIN products p ON p.id = smu.product_id
        LEFT JOIN staff_profiles st ON st.id = smu.performer_staff_id
        WHERE smu.organization_id = p_org_id
          AND (p_branch_id IS NULL OR smu.branch_id = p_branch_id)
          AND smu.used_at >= v_start_ts AND smu.used_at < v_next_day_ts
          AND (p_service_id IS NULL OR smu.service_id = p_service_id)
        ORDER BY smu.used_at DESC
        LIMIT v_limit OFFSET v_offset
    ) d;

    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'timezone', 'Asia/Ho_Chi_Minh (UTC+7)'
        ),
        'summary', v_summary,
        'service_breakdown', v_service_breakdown,
        'variance_breakdown', v_variance_breakdown,
        'drilldown', jsonb_build_object(
            'total_records', v_total_records,
            'page', p_page,
            'page_size', p_page_size,
            'items', v_drilldown_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_cogs_and_gross_profit_report(UUID, UUID, DATE, DATE, UUID, VARCHAR, INT, INT) TO authenticated, anon;
