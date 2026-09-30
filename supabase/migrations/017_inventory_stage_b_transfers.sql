-- =============================================================================
-- MIGRATION 017: INVENTORY PROCUREMENT PHASE B — INTER-BRANCH TRANSFERS
-- Phase: Kho vận sau P5 — Đợt B: Điều chuyển kho đa chi nhánh
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG PHIẾU ĐIỀU CHUYỂN KHO (BRANCH TRANSFERS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    transfer_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'dispatched', 'partially_received', 'completed', 'difference_resolved', 'cancelled'
    total_items INT NOT NULL DEFAULT 0,
    total_value BIGINT NOT NULL DEFAULT 0,
    dispatch_date TIMESTAMPTZ,
    dispatched_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    received_date TIMESTAMPTZ,
    received_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT chk_diff_branches CHECK (from_branch_id <> to_branch_id)
);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CHI TIẾT SẢN PHẨM ĐIỀU CHUYỂN (BRANCH TRANSFER ITEMS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES branch_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    expiry_date DATE,
    unit_cost BIGINT NOT NULL DEFAULT 0,
    quantity_requested INT NOT NULL CHECK (quantity_requested > 0),
    quantity_dispatched INT NOT NULL DEFAULT 0 CHECK (quantity_dispatched >= 0),
    quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    quantity_accepted INT NOT NULL DEFAULT 0 CHECK (quantity_accepted >= 0),
    quantity_damaged INT NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_missing INT NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
    quantity_returned INT NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 3. BẢNG NHẬT KÝ KIỂM TOÁN LỊCH SỬ ĐIỀU CHUYỂN (BRANCH TRANSFER EVENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_transfer_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES branch_transfers(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'dispatched', 'partially_received', 'received', 'difference_resolved', 'cancelled', 'returned'
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- -----------------------------------------------------------------------------
-- 4. BẢO VỆ DỮ LIỆU BẰNG ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_branch_transfers_read ON branch_transfers;
CREATE POLICY rls_branch_transfers_read ON branch_transfers
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_branch_transfers_write ON branch_transfers;
CREATE POLICY rls_branch_transfers_write ON branch_transfers
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_items_read ON branch_transfer_items;
CREATE POLICY rls_branch_transfer_items_read ON branch_transfer_items
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_items_write ON branch_transfer_items;
CREATE POLICY rls_branch_transfer_items_write ON branch_transfer_items
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_events_read ON branch_transfer_events;
CREATE POLICY rls_branch_transfer_events_read ON branch_transfer_events
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS rls_branch_transfer_events_write ON branch_transfer_events;
CREATE POLICY rls_branch_transfer_events_write ON branch_transfer_events
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO PHIẾU ĐIỀU CHUYỂN KHO NHÁP (DRAFT) — TUYỆT ĐỐI CHƯA ĐỔI TỒN KHO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_branch_transfer(
    p_org_id UUID,
    p_from_branch_id UUID,
    p_to_branch_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "lot_number": TEXT, "expiry_date": DATE, "quantity": INT, "unit_cost": BIGINT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer_id UUID;
    v_transfer_number VARCHAR(100);
    v_total_items INT := 0;
    v_total_value BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_qty INT;
    v_cost BIGINT;
    v_item_notes TEXT;
BEGIN
    IF p_from_branch_id = p_to_branch_id THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Chi nhánh xuất và nhận phải khác nhau.');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu điều chuyển phải có ít nhất một mặt hàng.');
    END IF;

    v_transfer_number := 'DC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Tính tổng số lượng và giá trị điều chuyển
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        v_cost := COALESCE((v_item->>'unit_cost')::BIGINT, 0);
        IF v_qty <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng chuyển phải lớn hơn 0.');
        END IF;
        v_total_items := v_total_items + v_qty;
        v_total_value := v_total_value + (v_qty * v_cost);
    END LOOP;

    INSERT INTO branch_transfers (
        organization_id,
        from_branch_id,
        to_branch_id,
        transfer_number,
        status,
        total_items,
        total_value,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_from_branch_id,
        p_to_branch_id,
        v_transfer_number,
        'draft',
        v_total_items,
        v_total_value,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_transfer_id;

    -- Thêm chi tiết các dòng
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := v_item->>'lot_number';
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_qty := (v_item->>'quantity')::INT;
        v_cost := COALESCE((v_item->>'unit_cost')::BIGINT, 0);
        v_item_notes := v_item->>'notes';

        INSERT INTO branch_transfer_items (
            transfer_id,
            product_id,
            lot_number,
            expiry_date,
            unit_cost,
            quantity_requested,
            quantity_dispatched,
            quantity_received,
            quantity_accepted,
            quantity_damaged,
            quantity_missing,
            quantity_returned,
            notes
        ) VALUES (
            v_transfer_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_cost,
            v_qty,
            0, -- Chưa xuất kho
            0,
            0,
            0,
            0,
            0,
            v_item_notes
        );
    END LOOP;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        v_transfer_id,
        'created',
        p_staff_id,
        jsonb_build_object('action', 'Tạo phiếu chuyển nháp', 'total_items', v_total_items, 'total_value', v_total_value)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', v_transfer_id,
        'transfer_number', v_transfer_number,
        'total_items', v_total_items,
        'total_value', v_total_value,
        'status', 'draft',
        'message', 'Đã tạo phiếu điều chuyển kho nháp thành công (chưa thay đổi tồn kho).'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC XÁC NHẬN XUẤT CHUYỂN KHO (DISPATCH) — GIẢM TỒN A, CHUYỂN IN-TRANSIT
-- Khóa tồn bằng FOR UPDATE để chống bán hàng âm kho đồng thời
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_dispatch_branch_transfer(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_stock RECORD;
    v_lot_stock RECORD;
    v_stock_after INT;
BEGIN
    -- 1. Khóa bản ghi transfer bằng FOR UPDATE
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status <> 'draft' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu đang ở trạng thái "%s", không thể xuất kho lặp lại.', v_transfer.status));
    END IF;

    -- 2. Duyệt từng sản phẩm: Khóa tồn kho tại chi nhánh gửi A và kiểm tra đủ hàng
    FOR v_item IN
        SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        -- Khóa tồn kho tổng hợp tại chi nhánh A
        SELECT * INTO v_stock
        FROM inventory_stocks
        WHERE branch_id = v_transfer.from_branch_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND OR v_stock.stock_on_hand < v_item.quantity_requested THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Tồn kho không đủ để xuất chuyển (Hiện có: %s, Yêu cầu xuất: %s).', COALESCE(v_stock.stock_on_hand, 0), v_item.quantity_requested)
            );
        END IF;

        -- Nếu có số lô cụ thể, khóa và kiểm tra tồn theo lô
        IF v_item.lot_number IS NOT NULL AND v_item.lot_number <> '' THEN
            SELECT * INTO v_lot_stock
            FROM inventory_lot_stocks
            WHERE branch_id = v_transfer.from_branch_id AND product_id = v_item.product_id AND lot_number = v_item.lot_number
            FOR UPDATE;

            IF NOT FOUND OR v_lot_stock.quantity_on_hand < v_item.quantity_requested THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'message', format('Lô hàng [%s] không đủ tồn để xuất (Hiện có: %s, Cần: %s).', v_item.lot_number, COALESCE(v_lot_stock.quantity_on_hand, 0), v_item.quantity_requested)
                );
            END IF;

            -- Giảm tồn theo lô tại A
            UPDATE inventory_lot_stocks
            SET quantity_on_hand = quantity_on_hand - v_item.quantity_requested,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE id = v_lot_stock.id;
        END IF;

        -- Giảm tồn kho tổng hợp tại A
        UPDATE inventory_stocks
        SET stock_on_hand = stock_on_hand - v_item.quantity_requested,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_stock.id
        RETURNING stock_on_hand INTO v_stock_after;

        -- Ghi sổ biến động kho xuất chuyển
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
            v_transfer.from_branch_id,
            v_item.product_id,
            'transfer_out',
            p_transfer_id,
            -v_item.quantity_requested,
            v_stock.stock_on_hand,
            v_stock_after,
            format('Xuất chuyển kho sang chi nhánh đích theo phiếu #%s', v_transfer.transfer_number),
            p_staff_id
        );

        -- Cập nhật số lượng đã xuất trên dòng chi tiết
        UPDATE branch_transfer_items
        SET quantity_dispatched = quantity_requested
        WHERE id = v_item.id;
    END LOOP;

    -- 3. Đổi trạng thái phiếu sang 'dispatched' (Đang vận chuyển)
    UPDATE branch_transfers
    SET status = 'dispatched',
        dispatch_date = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        dispatched_by_staff_id = p_staff_id,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        'dispatched',
        p_staff_id,
        jsonb_build_object('action', 'Xác nhận xuất kho chuyển đi', 'from_branch_id', v_transfer.from_branch_id, 'to_branch_id', v_transfer.to_branch_id)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', 'dispatched',
        'message', 'Đã xuất kho chuyển đi thành công. Tồn kho chi nhánh gửi đã giảm và ghi nhận hàng đang vận chuyển.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC XÁC NHẬN NHẬP KHO TẠI CHI NHÁNH ĐÍCH (RECEIVE TRANSFER)
-- Hỗ trợ: Nhận đủ, nhận 1 phần, tách hàng lỗi/hỏng vào cách ly, ghi nhận thiếu hụt
-- Chống nhận lặp (Idempotent) & tự động hoàn tất phiếu
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_receive_branch_transfer(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"transfer_item_id": UUID, "qty_accepted": INT, "qty_damaged": INT, "qty_missing": INT, "damage_reason": TEXT, "notes": TEXT}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_receive_entry JSONB;
    v_item_id UUID;
    v_qty_acc INT;
    v_qty_dam INT;
    v_qty_mis INT;
    v_dam_reason TEXT;
    v_dest_stock RECORD;
    v_lot_stock RECORD;
    v_stock_after INT;
    v_all_completed BOOLEAN := TRUE;
    v_has_difference BOOLEAN := FALSE;
    v_final_status VARCHAR(50);
BEGIN
    -- 1. Khóa bản ghi transfer bằng FOR UPDATE
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status NOT IN ('dispatched', 'partially_received') THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu ở trạng thái "%s", không thể nhận hàng.', v_transfer.status));
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Vui lòng cung cấp chi tiết số lượng nhận hàng.');
    END IF;

    -- 2. Xử lý từng dòng nhận
    FOR v_receive_entry IN SELECT jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_receive_entry->>'transfer_item_id')::UUID;
        v_qty_acc := GREATEST(0, COALESCE((v_receive_entry->>'qty_accepted')::INT, 0));
        v_qty_dam := GREATEST(0, COALESCE((v_receive_entry->>'qty_damaged')::INT, 0));
        v_qty_mis := GREATEST(0, COALESCE((v_receive_entry->>'qty_missing')::INT, 0));
        v_dam_reason := v_receive_entry->>'damage_reason';

        SELECT * INTO v_item
        FROM branch_transfer_items
        WHERE id = v_item_id AND transfer_id = p_transfer_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Dòng sản phẩm chuyển kho không hợp lệ.');
        END IF;

        -- Kiểm tra tổng số lượng nhận đợt này không vượt quá số lượng còn chờ nhận
        IF (v_qty_acc + v_qty_dam + v_qty_mis) > (v_item.quantity_dispatched - v_item.quantity_received) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số lượng nhận (%s) vượt quá số lượng còn đang đi đường (%s).', 
                    (v_qty_acc + v_qty_dam + v_qty_mis), 
                    (v_item.quantity_dispatched - v_item.quantity_received)
                )
            );
        END IF;

        -- 2.1 HÀNG ĐẠT CHUẨN: TĂNG TỒN KHO KHẢ DỤNG TẠI CHI NHÁNH ĐÍCH B
        IF v_qty_acc > 0 THEN
            -- Khóa hoặc tạo bản ghi tồn kho tổng hợp tại B
            SELECT * INTO v_dest_stock
            FROM inventory_stocks
            WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
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
                    v_transfer.to_branch_id,
                    v_item.product_id,
                    v_qty_acc,
                    v_item.unit_cost,
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                    TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand INTO v_stock_after;
            ELSE
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_qty_acc,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_dest_stock.id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            -- Nếu có số lô, cộng tồn theo lô tại chi nhánh đích B
            IF v_item.lot_number IS NOT NULL AND v_item.lot_number <> '' THEN
                SELECT * INTO v_lot_stock
                FROM inventory_lot_stocks
                WHERE branch_id = v_transfer.to_branch_id AND product_id = v_item.product_id AND lot_number = v_item.lot_number
                FOR UPDATE;

                IF NOT FOUND THEN
                    INSERT INTO inventory_lot_stocks (
                        organization_id,
                        branch_id,
                        product_id,
                        lot_number,
                        expiry_date,
                        quantity_on_hand,
                        cost_price,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (
                        p_org_id,
                        v_transfer.to_branch_id,
                        v_item.product_id,
                        v_item.lot_number,
                        v_item.expiry_date,
                        v_qty_acc,
                        v_item.unit_cost,
                        'active',
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    );
                ELSE
                    UPDATE inventory_lot_stocks
                    SET quantity_on_hand = quantity_on_hand + v_qty_acc,
                        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    WHERE id = v_lot_stock.id;
                END IF;
            END IF;

            -- Ghi sổ biến động kho nhập chuyển
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
                v_transfer.to_branch_id,
                v_item.product_id,
                'transfer_in',
                p_transfer_id,
                v_qty_acc,
                COALESCE(v_dest_stock.stock_on_hand, 0),
                v_stock_after,
                format('Nhận chuyển kho từ chi nhánh gửi theo phiếu #%s', v_transfer.transfer_number),
                p_staff_id
            );
        END IF;

        -- 2.2 HÀNG HỎNG / VỠ TRONG QUÁ TRÌNH CHUYỂN: ĐƯA VÀO KHO CÁCH LY TẠI B, KHÔNG CỘNG TỒN BÁN
        IF v_qty_dam > 0 THEN
            INSERT INTO damaged_inventory_items (
                organization_id,
                branch_id,
                product_id,
                lot_number,
                quantity,
                source_type,
                reference_id,
                reason,
                status,
                created_by_staff_id
            ) VALUES (
                p_org_id,
                v_transfer.to_branch_id,
                v_item.product_id,
                v_item.lot_number,
                v_qty_dam,
                'transfer_damaged',
                p_transfer_id,
                COALESCE(v_dam_reason, 'Hàng bị hư hỏng / vỡ trong quá trình điều chuyển liên chi nhánh'),
                'quarantined',
                p_staff_id
            );
            v_has_difference := TRUE;
        END IF;

        IF v_qty_mis > 0 THEN
            v_has_difference := TRUE;
        END IF;

        -- Cập nhật số lượng lũy kế trên dòng transfer item
        UPDATE branch_transfer_items
        SET quantity_received = quantity_received + (v_qty_acc + v_qty_dam + v_qty_mis),
            quantity_accepted = quantity_accepted + v_qty_acc,
            quantity_damaged = quantity_damaged + v_qty_dam,
            quantity_missing = quantity_missing + v_qty_mis
        WHERE id = v_item.id;
    END LOOP;

    -- 3. Kiểm tra xem toàn bộ các sản phẩm đã được nhận đủ số lượng xuất chưa
    FOR v_item IN SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        IF v_item.quantity_received < v_item.quantity_dispatched THEN
            v_all_completed := FALSE;
        END IF;
        IF v_item.quantity_damaged > 0 OR v_item.quantity_missing > 0 THEN
            v_has_difference := TRUE;
        END IF;
    END LOOP;

    IF v_all_completed THEN
        IF v_has_difference THEN
            v_final_status := 'difference_resolved';
        ELSE
            v_final_status := 'completed';
        END IF;
    ELSE
        v_final_status := 'partially_received';
    END IF;

    -- Cập nhật trạng thái phiếu chuyển
    UPDATE branch_transfers
    SET status = v_final_status,
        received_date = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        received_by_staff_id = p_staff_id,
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        v_final_status,
        p_staff_id,
        jsonb_build_object('action', 'Xác nhận nhận hàng tại chi nhánh đích', 'status', v_final_status, 'items_received', p_items)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', v_final_status,
        'all_completed', v_all_completed,
        'has_difference', v_has_difference,
        'message', 'Xác nhận nhận hàng thành công: Tồn kho khả dụng chi nhánh đích đã tăng theo số đạt chuẩn, hàng hỏng đã được cách ly.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC BẢO MẬT & TỐC ĐỘ CAO: TRUY VẤN DANH SÁCH PHIẾU ĐIỀU CHUYỂN (TRANSFERS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_branch_transfers(p_branch_id UUID DEFAULT NULL)
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
                'id', bt.id,
                'organization_id', bt.organization_id,
                'from_branch_id', bt.from_branch_id,
                'from_branch_name', COALESCE(fb.name, 'Chi nhánh xuất'),
                'to_branch_id', bt.to_branch_id,
                'to_branch_name', COALESCE(tb.name, 'Chi nhánh nhận'),
                'transfer_number', bt.transfer_number,
                'status', bt.status,
                'total_items', bt.total_items,
                'total_value', bt.total_value,
                'dispatch_date', bt.dispatch_date,
                'received_date', bt.received_date,
                'notes', bt.notes,
                'created_at', bt.created_at,
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', bti.id,
                            'product_id', bti.product_id,
                            'product_name', COALESCE(p.name, 'Sản phẩm'),
                            'product_code', COALESCE(p.code, ''),
                            'product_unit', COALESCE(p.unit, 'đơn vị'),
                            'lot_number', bti.lot_number,
                            'expiry_date', bti.expiry_date,
                            'unit_cost', bti.unit_cost,
                            'quantity_requested', bti.quantity_requested,
                            'quantity_dispatched', bti.quantity_dispatched,
                            'quantity_received', bti.quantity_received,
                            'quantity_accepted', bti.quantity_accepted,
                            'quantity_damaged', bti.quantity_damaged,
                            'quantity_missing', bti.quantity_missing,
                            'quantity_returned', bti.quantity_returned,
                            'notes', bti.notes
                        )
                    )
                    FROM branch_transfer_items bti
                    LEFT JOIN products p ON p.id = bti.product_id
                    WHERE bti.transfer_id = bt.id
                ), '[]'::jsonb),
                'events', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', bte.id,
                            'event_type', bte.event_type,
                            'actor_name', COALESCE(sp.full_name, 'Hệ thống'),
                            'details', bte.details,
                            'created_at', bte.created_at
                        )
                    )
                    FROM branch_transfer_events bte
                    LEFT JOIN staff_profiles sp ON sp.id = bte.actor_staff_id
                    WHERE bte.transfer_id = bt.id
                    ORDER BY bte.created_at ASC
                ), '[]'::jsonb)
            )
            ORDER BY bt.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM branch_transfers bt
    LEFT JOIN branches fb ON fb.id = bt.from_branch_id
    LEFT JOIN branches tb ON tb.id = bt.to_branch_id
    WHERE (p_branch_id IS NULL OR bt.from_branch_id = p_branch_id OR bt.to_branch_id = p_branch_id);

    RETURN v_result;
END;
$$;

-- CẤP QUYỀN THỰC THI CHO CẢ AUTHENTICATED VÀ ANON
GRANT EXECUTE ON FUNCTION rpc_create_branch_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_dispatch_branch_transfer(UUID, UUID, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_receive_branch_transfer(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_branch_transfers(UUID) TO authenticated, anon;
