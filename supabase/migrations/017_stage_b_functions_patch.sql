-- =============================================================================
-- PATCH MIGRATION: FIX RPC FUNCTIONS CHO ĐỢT B (ĐIỀU CHUYỂN KHO)
-- =============================================================================

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

GRANT EXECUTE ON FUNCTION rpc_create_branch_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_receive_branch_transfer(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
