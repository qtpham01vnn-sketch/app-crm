-- =============================================================================
-- MIGRATION 019: INVENTORY DIFFERENCE RESOLUTION & AUDIT DELTA CONCURRENCY HARDENING
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. NÂNG CẤP RPC RECEIVE TRANSFER: CHUYỂN TRẠNG THÁI 'difference_pending' KHI CÓ HÀNG HỎNG/THIẾU
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

    IF v_transfer.status NOT IN ('dispatched', 'partially_received', 'difference_pending') THEN
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

        -- 2.2 HÀNG HỎNG / VỠ: ĐƯA VÀO KHO CÁCH LY TẠI B, KHÔNG CỘNG TỒN BÁN
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

    -- 3. Kiểm tra toàn bộ các dòng
    FOR v_item IN SELECT * FROM branch_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        IF v_item.quantity_received < v_item.quantity_dispatched THEN
            v_all_completed := FALSE;
        END IF;
        IF v_item.quantity_damaged > 0 OR v_item.quantity_missing > 0 THEN
            v_has_difference := TRUE;
        END IF;
    END LOOP;

    -- QUY TẮC CHẶT CHẼ: NẾU CÓ HỎNG HOẶC THIẾU, CHUYỂN SANG 'difference_pending' (CHỜ QUẢN LÝ XÁC NHẬN)
    IF v_has_difference THEN
        v_final_status := 'difference_pending';
    ELSIF v_all_completed THEN
        v_final_status := 'completed';
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
        jsonb_build_object('action', 'Xác nhận kiểm nhận hàng tại chi nhánh đích', 'status', v_final_status, 'has_difference', v_has_difference, 'items_received', p_items)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', v_final_status,
        'all_completed', v_all_completed,
        'has_difference', v_has_difference,
        'message', CASE 
            WHEN v_has_difference THEN 'Đã ghi nhận kiểm nhận. Có chênh lệch (hàng hỏng/thiếu) cần cấp quản lý phê duyệt xử lý.'
            WHEN v_all_completed THEN 'Đã nhận đủ toàn bộ hàng chuyển kho thành công.'
            ELSE 'Đã nhận một phần hàng chuyển kho. Phần còn lại tiếp tục theo dõi in-transit.'
        END
    );
END;
$$;

-- 2. RPC NGHIỆP VỤ: XÁC NHẬN PHÊ DUYỆT XỬ LÝ CHÊNH LỆCH ĐIỀU CHUYỂN
CREATE OR REPLACE FUNCTION rpc_resolve_transfer_difference(
    p_org_id UUID,
    p_transfer_id UUID,
    p_staff_id UUID,
    p_resolution_type VARCHAR(50), -- 'approved_write_off', 'return_missing_to_sender', 'close_with_audit_note'
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer RECORD;
    v_total_dam INT := 0;
    v_total_mis INT := 0;
BEGIN
    SELECT * INTO v_transfer
    FROM branch_transfers
    WHERE id = p_transfer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu điều chuyển.');
    END IF;

    IF v_transfer.status NOT IN ('difference_pending', 'partially_received') THEN
        RETURN jsonb_build_object('success', FALSE, 'message', format('Phiếu ở trạng thái "%s", không thể duyệt xử lý chênh lệch.', v_transfer.status));
    END IF;

    -- Tính tổng số lượng hỏng và thiếu
    SELECT 
        COALESCE(SUM(quantity_damaged), 0),
        COALESCE(SUM(quantity_missing), 0)
    INTO v_total_dam, v_total_mis
    FROM branch_transfer_items
    WHERE transfer_id = p_transfer_id;

    -- Đổi trạng thái sang 'difference_resolved'
    UPDATE branch_transfers
    SET status = 'difference_resolved',
        notes = COALESCE(notes || E'\n[Đã Xử Lý Chênh Lệch]: ' || p_notes, '[Đã Xử Lý Chênh Lệch]: ' || p_notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_transfer_id;

    -- Ghi nhật ký sự kiện kiểm toán
    INSERT INTO branch_transfer_events (
        transfer_id,
        event_type,
        actor_staff_id,
        details
    ) VALUES (
        p_transfer_id,
        'difference_resolved',
        p_staff_id,
        jsonb_build_object(
            'action', 'Phê duyệt xử lý chênh lệch chuyển kho',
            'resolution_type', p_resolution_type,
            'total_damaged', v_total_dam,
            'total_missing', v_total_mis,
            'notes', p_notes
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', p_transfer_id,
        'transfer_number', v_transfer.transfer_number,
        'status', 'difference_resolved',
        'message', 'Đã phê duyệt xử lý chênh lệch điều chuyển thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_receive_branch_transfer(UUID, UUID, UUID, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_resolve_transfer_difference(UUID, UUID, UUID, VARCHAR, TEXT) TO authenticated, anon;
