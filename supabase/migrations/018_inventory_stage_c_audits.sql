-- =============================================================================
-- MIGRATION 018: INVENTORY PROCUREMENT PHASE C — INVENTORY AUDITS & STOCK ADJUSTMENTS
-- Phase: Kho vận sau P5 — Đợt C: Kiểm kê kho & Điều chỉnh chênh lệch tồn thực tế
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG PHIẾU KIỂM KÊ KHO (INVENTORY AUDITS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    audit_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'counting', 'completed', 'cancelled'
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    auditor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    total_items INT NOT NULL DEFAULT 0,
    total_book_quantity INT NOT NULL DEFAULT 0,
    total_actual_quantity INT NOT NULL DEFAULT 0,
    total_difference_quantity INT NOT NULL DEFAULT 0,
    total_difference_value BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CHI TIẾT SẢN PHẨM KIỂM KÊ (INVENTORY AUDIT ITEMS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id UUID NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    expiry_date DATE,
    unit_cost BIGINT NOT NULL DEFAULT 0,
    system_quantity INT NOT NULL DEFAULT 0, -- Tồn sổ sách tại thời điểm snapshot
    actual_quantity INT NOT NULL DEFAULT 0, -- Tồn kiểm đếm thực tế
    difference_quantity INT NOT NULL DEFAULT 0, -- actual_quantity - system_quantity
    difference_value BIGINT NOT NULL DEFAULT 0, -- difference_quantity * unit_cost
    reason TEXT, -- Lý do chênh lệch: Hao hụt tự nhiên, Đổ vỡ, Thất thoát, Đếm nhầm...
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 3. BẢNG NHẬT KÝ KIỂM TOÁN LỊCH SỬ KIỂM KÊ (INVENTORY AUDIT EVENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id UUID NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'started_counting', 'counted', 'approved_and_adjusted', 'cancelled'
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_inv_audits_read ON inventory_audits;
CREATE POLICY rls_inv_audits_read ON inventory_audits
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_inv_audits_write ON inventory_audits;
CREATE POLICY rls_inv_audits_write ON inventory_audits
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_items_read ON inventory_audit_items;
CREATE POLICY rls_inv_audit_items_read ON inventory_audit_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_items_write ON inventory_audit_items;
CREATE POLICY rls_inv_audit_items_write ON inventory_audit_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_events_read ON inventory_audit_events;
CREATE POLICY rls_inv_audit_events_read ON inventory_audit_events
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_inv_audit_events_write ON inventory_audit_events;
CREATE POLICY rls_inv_audit_events_write ON inventory_audit_events
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO PHIẾU KIỂM KÊ & TỰ ĐỘNG CHỤP SNAPSHOT TỒN SỔ SÁCH (DRAFT / COUNTING)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_inventory_audit(
    p_org_id UUID,
    p_branch_id UUID,
    p_staff_id UUID,
    p_product_ids UUID[] DEFAULT NULL, -- NULL = Kiểm kê toàn bộ kho, hoặc mảng UUID = kiểm kê nhóm SP
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit_id UUID;
    v_audit_number VARCHAR(100);
    v_item RECORD;
    v_total_items INT := 0;
    v_total_book_qty INT := 0;
BEGIN
    v_audit_number := 'KK' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO inventory_audits (
        organization_id,
        branch_id,
        audit_number,
        status,
        snapshot_at,
        auditor_staff_id,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        v_audit_number,
        'draft',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_audit_id;

    -- Tự động snapshot tồn sổ sách hiện tại của các mặt hàng trong kho
    FOR v_item IN
        SELECT 
            s.product_id,
            s.stock_on_hand,
            COALESCE(s.cost_price, p.cost_price, 0) AS unit_cost
        FROM inventory_stocks s
        JOIN products p ON p.id = s.product_id
        WHERE s.branch_id = p_branch_id
          AND (p_product_ids IS NULL OR s.product_id = ANY(p_product_ids))
    LOOP
        INSERT INTO inventory_audit_items (
            audit_id,
            product_id,
            unit_cost,
            system_quantity,
            actual_quantity,
            difference_quantity,
            difference_value
        ) VALUES (
            v_audit_id,
            v_item.product_id,
            v_item.unit_cost,
            v_item.stock_on_hand,
            v_item.stock_on_hand, -- Mặc định khởi tạo bằng tồn sổ sách
            0,
            0
        );

        v_total_items := v_total_items + 1;
        v_total_book_qty := v_total_book_qty + v_item.stock_on_hand;
    END LOOP;

    -- Cập nhật tổng số dòng và tổng tồn sổ sách vào phiếu
    UPDATE inventory_audits
    SET total_items = v_total_items,
        total_book_quantity = v_total_book_qty,
        total_actual_quantity = v_total_book_qty
    WHERE id = v_audit_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO inventory_audit_events (
        audit_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        v_audit_id,
        'created',
        p_staff_id,
        jsonb_build_object('action', 'Tạo phiếu kiểm kê kho & Chụp snapshot tồn sổ sách', 'total_items', v_total_items, 'total_book_qty', v_total_book_qty)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'audit_id', v_audit_id,
        'audit_number', v_audit_number,
        'total_items', v_total_items,
        'total_book_quantity', v_total_book_qty,
        'status', 'draft',
        'message', 'Đã khởi tạo phiếu kiểm kê kho và lưu vết tồn sổ sách tại thời điểm snapshot thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC CẬP NHẬT SỐ LƯỢNG KIỂM ĐẾM THỰC TẾ (SUBMIT COUNTING)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_submit_inventory_audit_counts(
    p_org_id UUID,
    p_audit_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"item_id": UUID, "actual_quantity": INT, "reason": TEXT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit RECORD;
    v_entry JSONB;
    v_item_id UUID;
    v_actual_qty INT;
    v_reason TEXT;
    v_notes TEXT;
    v_item RECORD;
    v_diff_qty INT;
    v_diff_val BIGINT;
    v_total_actual INT := 0;
    v_total_diff_qty INT := 0;
    v_total_diff_val BIGINT := 0;
BEGIN
    SELECT * INTO v_audit
    FROM inventory_audits
    WHERE id = p_audit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu kiểm kê.');
    END IF;

    IF v_audit.status = 'completed' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu kiểm kê đã được duyệt và chốt sổ, không thể sửa đổi.');
    END IF;

    -- Cập nhật số đếm từng dòng
    FOR v_entry IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_entry->>'item_id')::UUID;
        v_actual_qty := GREATEST(0, COALESCE((v_entry->>'actual_quantity')::INT, 0));
        v_reason := v_entry->>'reason';
        v_notes := v_entry->>'notes';

        SELECT * INTO v_item
        FROM inventory_audit_items
        WHERE id = v_item_id AND audit_id = p_audit_id
        FOR UPDATE;

        IF FOUND THEN
            v_diff_qty := v_actual_qty - v_item.system_quantity;
            v_diff_val := v_diff_qty * v_item.unit_cost;

            UPDATE inventory_audit_items
            SET actual_quantity = v_actual_qty,
                difference_quantity = v_diff_qty,
                difference_value = v_diff_val,
                reason = COALESCE(v_reason, reason),
                notes = COALESCE(v_notes, notes)
            WHERE id = v_item_id;
        END IF;
    END LOOP;

    -- Tính lại tổng số lượng thực tế và tổng chênh lệch
    SELECT 
        COALESCE(SUM(actual_quantity), 0),
        COALESCE(SUM(difference_quantity), 0),
        COALESCE(SUM(difference_value), 0)
    INTO v_total_actual, v_total_diff_qty, v_total_diff_val
    FROM inventory_audit_items
    WHERE audit_id = p_audit_id;

    UPDATE inventory_audits
    SET status = 'counting',
        total_actual_quantity = v_total_actual,
        total_difference_quantity = v_total_diff_qty,
        total_difference_value = v_total_diff_val,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_audit_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO inventory_audit_events (
        audit_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_audit_id,
        'counted',
        p_staff_id,
        jsonb_build_object('action', 'Cập nhật số liệu kiểm đếm thực tế', 'total_actual', v_total_actual, 'total_diff_qty', v_total_diff_qty, 'total_diff_val', v_total_diff_val)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'audit_id', p_audit_id,
        'status', 'counting',
        'total_actual_quantity', v_total_actual,
        'total_difference_quantity', v_total_diff_qty,
        'total_difference_value', v_total_diff_val,
        'message', 'Đã lưu kết quả kiểm đếm thực tế và tính toán chênh lệch thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC DUYỆT KIỂM KÊ & ĐIỀU CHỈNH TỒN KHO TỰ ĐỘNG (APPROVE & ADJUST STOCK)
-- Khóa bản ghi nguyên tử, sinh bút toán audit_adjustment, cập nhật tồn kho chính xác
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_approve_inventory_audit(
    p_org_id UUID,
    p_audit_id UUID,
    p_staff_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_audit RECORD;
    v_item RECORD;
    v_stock RECORD;
    v_stock_after INT;
BEGIN
    -- 1. Khóa phiếu kiểm kê bằng FOR UPDATE
    SELECT * INTO v_audit
    FROM inventory_audits
    WHERE id = p_audit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu kiểm kê.');
    END IF;

    IF v_audit.status = 'completed' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu kiểm kê này đã được duyệt và điều chỉnh trước đó.');
    END IF;

    IF v_audit.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu kiểm kê đã bị hủy, không thể duyệt.');
    END IF;

    -- 2. Duyệt từng dòng chi tiết để sinh bút toán điều chỉnh và cập nhật tồn kho
    FOR v_item IN
        SELECT * FROM inventory_audit_items WHERE audit_id = p_audit_id
    LOOP
        -- Khóa tồn kho hiện tại tại chi nhánh kiểm kê
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE branch_id = v_audit.branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF FOUND THEN
            -- Nếu có chênh lệch giữa thực tế và sổ sách hiện hành
            IF v_item.difference_quantity <> 0 THEN
                -- Cập nhật tồn kho theo số lượng thực tế
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_item.difference_quantity,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_stock.id
                RETURNING stock_on_hand INTO v_stock_after;

                -- Ghi sổ nhật ký biến động kho audit_adjustment
                INSERT INTO inventory_transactions (
                    organization_id,
                    branch_id,
                    product_id,
                    transaction_type,
                    reference_id,
                    quantity_change,
                    stock_before,
                    stock_after,
                    notes,
                    actor_staff_id
                ) VALUES (
                    p_org_id,
                    v_audit.branch_id,
                    v_item.product_id,
                    'audit_adjustment',
                    p_audit_id,
                    v_item.difference_quantity,
                    v_stock.stock_on_hand,
                    v_stock_after,
                    format('Điều chỉnh tồn kho theo phiếu kiểm kê #%s (Lý do: %s)', v_audit.audit_number, COALESCE(v_item.reason, 'Cân đối kiểm kê định kỳ')),
                    p_staff_id
                );
            END IF;
        ELSE
            -- Nếu mặt hàng chưa có trong kho nhưng đếm thực tế có
            IF v_item.actual_quantity > 0 THEN
                INSERT INTO inventory_stocks (
                    organization_id,
                    branch_id,
                    product_id,
                    stock_on_hand,
                    cost_price,
                    created_at,
                    updated_at
                ) VALUES (
                    p_org_id,
                    v_audit.branch_id,
                    v_item.product_id,
                    v_item.actual_quantity,
                    v_item.unit_cost,
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand INTO v_stock_after;

                INSERT INTO inventory_transactions (
                    organization_id,
                    branch_id,
                    product_id,
                    transaction_type,
                    reference_id,
                    quantity_change,
                    stock_before,
                    stock_after,
                    notes,
                    actor_staff_id
                ) VALUES (
                    p_org_id,
                    v_audit.branch_id,
                    v_item.product_id,
                    'audit_adjustment',
                    p_audit_id,
                    v_item.actual_quantity,
                    0,
                    v_stock_after,
                    format('Khởi tạo tồn kho theo phiếu kiểm kê #%s', v_audit.audit_number),
                    p_staff_id
                );
            END IF;
        END IF;
    END LOOP;

    -- 3. Hoàn tất phiếu kiểm kê
    UPDATE inventory_audits
    SET status = 'completed',
        approved_by_staff_id = p_staff_id,
        approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_audit_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO inventory_audit_events (
        audit_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_audit_id,
        'approved_and_adjusted',
        p_staff_id,
        jsonb_build_object('action', 'Duyệt phiếu kiểm kê & Cân đối điều chỉnh tồn kho thành công', 'audit_number', v_audit.audit_number)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'audit_id', p_audit_id,
        'audit_number', v_audit.audit_number,
        'status', 'completed',
        'message', 'Đã phê duyệt phiếu kiểm kê thành công. Toàn bộ chênh lệch đã được cân đối vào sổ cái kho.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH PHIẾU KIỂM KÊ (AUDITS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_inventory_audits(p_branch_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'organization_id', a.organization_id,
                'branch_id', a.branch_id,
                'branch_name', COALESCE(b.name, 'Chi nhánh'),
                'audit_number', a.audit_number,
                'status', a.status,
                'snapshot_at', a.snapshot_at,
                'auditor_name', COALESCE(sp_auditor.full_name, 'Nhân viên kiểm kê'),
                'approved_by_name', COALESCE(sp_approver.full_name, ''),
                'approved_at', a.approved_at,
                'total_items', a.total_items,
                'total_book_quantity', a.total_book_quantity,
                'total_actual_quantity', a.total_actual_quantity,
                'total_difference_quantity', a.total_difference_quantity,
                'total_difference_value', a.total_difference_value,
                'notes', a.notes,
                'created_at', a.created_at,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ai.id,
                            'product_id', ai.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'product_code', COALESCE(p.code, ''),
                            'product_unit', COALESCE(p.unit, 'đơn vị'),
                            'lot_number', ai.lot_number,
                            'expiry_date', ai.expiry_date,
                            'unit_cost', ai.unit_cost,
                            'system_quantity', ai.system_quantity,
                            'actual_quantity', ai.actual_quantity,
                            'difference_quantity', ai.difference_quantity,
                            'difference_value', ai.difference_value,
                            'reason', ai.reason,
                            'notes', ai.notes
                        )
                    )
                    FROM inventory_audit_items ai
                    LEFT JOIN products p ON p.id = ai.product_id
                    WHERE ai.audit_id = a.id
                ), '[]'::jsonb),
                'events', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ae.id,
                            'event_type', ae.event_type,
                            'actor_name', COALESCE(sp.full_name, 'Hệ thống'),
                            'details', ae.details,
                            'created_at', ae.created_at
                        )
                    )
                    FROM inventory_audit_events ae
                    LEFT JOIN staff_profiles sp ON sp.id = ae.actor_staff_id
                    WHERE ae.audit_id = a.id
                    ORDER BY ae.created_at ASC
                ), '[]'::jsonb)
            )
            ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM inventory_audits a
    LEFT JOIN branches b ON b.id = a.branch_id
    LEFT JOIN staff_profiles sp_auditor ON sp_auditor.id = a.auditor_staff_id
    LEFT JOIN staff_profiles sp_approver ON sp_approver.id = a.approved_by_staff_id
    WHERE (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- CẤP QUYỀN THỰC THI CHO CẢ AUTHENTICATED VÀ ANON
GRANT EXECUTE ON FUNCTION rpc_create_inventory_audit(UUID, UUID, UUID, UUID[], TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_submit_inventory_audit_counts(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_approve_inventory_audit(UUID, UUID, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_inventory_audits(UUID) TO authenticated, anon;
