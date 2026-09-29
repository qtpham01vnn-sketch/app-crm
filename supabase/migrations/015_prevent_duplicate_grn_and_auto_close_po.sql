-- =============================================================================
-- MIGRATION 015: CHỐNG NHẬP KHO TRÙNG LẶP & TỰ ĐỘNG ĐÓNG ĐƠN PO
-- Target: PostgreSQL / Supabase
-- Mục tiêu: 
-- 1. Chặn tuyệt đối việc nhập kho lặp lại cho đơn PO đã "Đã Nhập Đủ" (received/completed).
-- 2. Tự động khớp mặt hàng theo product_id nếu po_item_id không được truyền.
-- 3. Khóa chống nhận vượt quá số lượng đặt mua (quantity_ordered - quantity_received).
-- 4. Điều chỉnh cân bằng lại tồn kho SP-TEST-62 (loại bỏ 100 đơn vị bị cộng trùng).
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB,
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_id UUID DEFAULT NULL,
    p_advance_amount_to_use BIGINT DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grn_number VARCHAR(100);
    v_grn_id UUID;
    v_total_accepted_value BIGINT := 0;
    v_item JSONB;
    v_po_item_id UUID;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_expiry DATE;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty_rec INT;
    v_qty_acc INT;
    v_qty_rej INT;
    v_rej_reason TEXT;
    v_cost BIGINT;
    v_base_units INT;
    v_base_cost BIGINT;
    v_line_total BIGINT;
    v_po_item RECORD;
    v_po RECORD;
    v_supplier RECORD;
    v_curr_branch_stock INT;
    v_curr_branch_cost BIGINT;
    v_stock_after INT;
    v_new_branch_cost BIGINT;
    v_supplier_debt_after BIGINT;
    v_advance RECORD;
    v_actual_advance_deducted BIGINT := 0;
    v_net_debt_added BIGINT := 0;
    v_remaining_order INT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu nhập kho phải có ít nhất một mặt hàng.');
    END IF;

    -- 1. Khóa Supplier FOR UPDATE
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    -- 2. Nếu có PO liên kết, kiểm tra và khóa PO FOR UPDATE — CHỐNG NHẬP LẶP
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
        END IF;

        IF v_po.status = 'received' OR v_po.status = 'completed' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Đơn đặt hàng #%s đã được nhập đủ trước đó, không thể nhập thêm.', v_po.po_number)
            );
        END IF;
    END IF;

    -- 3. Xử lý và kiểm tra chứng từ trả trước (Server-side validation)
    IF p_advance_id IS NOT NULL AND p_advance_amount_to_use > 0 THEN
        SELECT * INTO v_advance
        FROM supplier_advances
        WHERE id = p_advance_id AND supplier_id = p_supplier_id AND organization_id = p_org_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Chứng từ trả trước không tồn tại hoặc không thuộc NCC này.');
        END IF;

        IF (v_advance.total_amount - v_advance.used_amount) < p_advance_amount_to_use THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Số dư khả dụng của chứng từ trả trước #%s không đủ (Khả dụng: %sđ, yêu cầu: %sđ).',
                    v_advance.advance_number, (v_advance.total_amount - v_advance.used_amount), p_advance_amount_to_use)
            );
        END IF;

        v_actual_advance_deducted := p_advance_amount_to_use;
    END IF;

    -- 4. Tạo Header Phiếu Nhập Kho GRN
    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO goods_receipt_notes (
        organization_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        grn_number,
        invoice_number,
        status,
        received_at,
        received_by_staff_id,
        confirmed_by_staff_id,
        confirmed_at,
        total_value,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_po_id,
        p_supplier_id,
        v_grn_number,
        p_invoice_number,
        'confirmed',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        p_staff_id,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        0,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_grn_id;

    -- 5. Duyệt từng dòng nhận hàng
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL AND (v_item->>'po_item_id') <> '' THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(NULLIF(TRIM(v_item->>'lot_number'), ''), 'LOT-DEFAULT');
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL AND (v_item->>'expiry_date') <> '' THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        -- Tự động khớp po_item_id nếu frontend không gửi
        IF v_po_item_id IS NULL AND p_po_id IS NOT NULL THEN
            SELECT id INTO v_po_item_id
            FROM purchase_order_items
            WHERE purchase_order_id = p_po_id AND product_id = v_prod_id
            LIMIT 1;
        END IF;

        -- Kiểm tra không nhận vượt số đặt nếu có PO liên kết
        IF v_po_item_id IS NOT NULL THEN
            SELECT * INTO v_po_item FROM purchase_order_items WHERE id = v_po_item_id FOR UPDATE;
            IF FOUND THEN
                v_remaining_order := GREATEST(0, v_po_item.quantity_ordered - v_po_item.quantity_received);
                IF v_remaining_order <= 0 THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Mặt hàng trong đơn PO đã được nhập đủ (%s/%s), không thể nhận thêm.',
                            v_po_item.quantity_received, v_po_item.quantity_ordered)
                    );
                END IF;
                IF (v_po_item.quantity_received + v_qty_acc) > v_po_item.quantity_ordered THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Số lượng nhận đạt chuẩn (%s) vượt quá số lượng còn lại của đơn PO (%s còn chờ giao).',
                            v_qty_acc, v_remaining_order)
                    );
                END IF;
            END IF;
        END IF;

        IF v_qty_acc < 0 OR v_qty_rec < (v_qty_acc + v_qty_rej) THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng thực nhận, đạt chuẩn hoặc lỗi không hợp lệ.');
        END IF;

        -- Quy đổi đơn vị cơ sở bán lẻ
        v_base_units := v_qty_acc * v_conv_rate;
        v_base_cost := v_cost / v_conv_rate;
        v_line_total := v_qty_acc * v_cost;
        v_total_accepted_value := v_total_accepted_value + v_line_total;

        -- Lưu dòng phiếu nhập GRN
        INSERT INTO goods_receipt_items (
            goods_receipt_id,
            po_item_id,
            product_id,
            lot_number,
            expiry_date,
            purchase_unit,
            conversion_rate,
            quantity_received,
            quantity_accepted,
            quantity_rejected,
            rejection_reason,
            accepted_base_units,
            unit_cost,
            line_total
        ) VALUES (
            v_grn_id,
            v_po_item_id,
            v_prod_id,
            v_lot,
            v_expiry,
            v_unit,
            v_conv_rate,
            v_qty_rec,
            v_qty_acc,
            v_qty_rej,
            v_rej_reason,
            v_base_units,
            v_cost,
            v_line_total
        );

        -- Cập nhật số lượng đã nhận trong PO item
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 5.1 Hàng đạt chuẩn: TĂNG TỒN BÁN VÀ TÍNH GIÁ VỐN BÌNH QUÂN GIA QUYỀN (WAC)
        IF v_base_units > 0 THEN
            SELECT stock_on_hand, COALESCE(cost_price, 0)
            INTO v_curr_branch_stock, v_curr_branch_cost
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_curr_branch_stock := 0;
                v_curr_branch_cost := 0;
                INSERT INTO inventory_stocks (
                    organization_id, branch_id, product_id, stock_on_hand, cost_price, updated_at
                ) VALUES (
                    p_org_id, p_branch_id, v_prod_id, v_base_units, v_base_cost, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                )
                RETURNING stock_on_hand, cost_price INTO v_stock_after, v_new_branch_cost;
            ELSE
                v_stock_after := v_curr_branch_stock + v_base_units;
                IF v_stock_after > 0 THEN
                    v_new_branch_cost := ((v_curr_branch_stock * v_curr_branch_cost) + (v_base_units * v_base_cost)) / v_stock_after;
                ELSE
                    v_new_branch_cost := v_base_cost;
                END IF;

                UPDATE inventory_stocks
                SET stock_on_hand = v_stock_after,
                    cost_price = v_new_branch_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id;
            END IF;

            -- Cập nhật tồn kho theo Lô riêng biệt (inventory_lot_stocks)
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
                p_branch_id,
                v_prod_id,
                v_lot,
                v_expiry,
                v_base_units,
                v_base_cost,
                'active',
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            )
            ON CONFLICT (branch_id, product_id, lot_number)
            DO UPDATE SET
                quantity_on_hand = inventory_lot_stocks.quantity_on_hand + v_base_units,
                expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_lot_stocks.expiry_date),
                cost_price = ((inventory_lot_stocks.quantity_on_hand * inventory_lot_stocks.cost_price) + (v_base_units * v_base_cost)) / (inventory_lot_stocks.quantity_on_hand + v_base_units),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());

            -- Ghi sổ cái giao dịch kho (inventory_transactions)
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
                p_branch_id,
                v_prod_id,
                'grn_in',
                v_grn_id,
                v_base_units,
                v_curr_branch_stock,
                v_stock_after,
                format('Nhập kho GRN #%s | Lô: %s | Giá vốn WAC CN: %sđ', v_grn_number, v_lot, v_new_branch_cost),
                p_staff_id
            );
        END IF;

        -- 5.2 Hàng hỏng / lỗi: Cách ly riêng, KHÔNG cộng vào tồn khả dụng
        IF v_qty_rej > 0 THEN
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
                p_branch_id,
                v_prod_id,
                v_lot,
                v_qty_rej * v_conv_rate,
                'grn_rejection',
                v_grn_id,
                COALESCE(v_rej_reason, 'Lỗi nghiệm thu khi nhận hàng'),
                'quarantined',
                p_staff_id
            );
        END IF;
    END LOOP;

    -- Cập nhật tổng giá trị vào header GRN
    UPDATE goods_receipt_notes SET total_value = v_total_accepted_value WHERE id = v_grn_id;

    -- 6. Cập nhật trạng thái PO
    IF p_po_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_po_id AND quantity_received < quantity_ordered) THEN
            UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = p_po_id;
        ELSE
            UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
        END IF;
    END IF;

    -- 7. Cấn trừ chứng từ trả trước nếu có
    IF v_actual_advance_deducted > 0 THEN
        UPDATE supplier_advances
        SET used_amount = used_amount + v_actual_advance_deducted,
            status = CASE WHEN (used_amount + v_actual_advance_deducted) >= total_amount THEN 'exhausted' ELSE 'partially_used' END,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_advance_id;
    END IF;

    -- 8. GHI SỔ CÁI CÔNG NỢ NCC (SUPPLIER AP LEDGER)
    v_net_debt_added := GREATEST(0, v_total_accepted_value - v_actual_advance_deducted);
    v_supplier_debt_after := v_supplier.debt_balance + v_net_debt_added;

    INSERT INTO supplier_ledger (
        organization_id,
        supplier_id,
        branch_id,
        entry_type,
        reference_type,
        reference_id,
        debit_amount,
        credit_amount,
        balance_after,
        notes,
        actor_staff_id
    ) VALUES (
        p_org_id,
        p_supplier_id,
        p_branch_id,
        'purchase_invoice',
        'grn',
        v_grn_id,
        0,
        v_total_accepted_value,
        v_supplier_debt_after,
        format('Nhập hàng phiếu #%s (Tổng nhận: %sđ, Cấn trừ cọc: %sđ, Nợ tăng ròng: %sđ)',
            v_grn_number, v_total_accepted_value, v_actual_advance_deducted, v_net_debt_added),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_supplier_debt_after,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_paid', v_actual_advance_deducted,
        'net_debt_added', v_net_debt_added,
        'supplier_debt_balance', v_supplier_debt_after,
        'message', 'Đã xác nhận nhập kho, cập nhật tồn kho theo lô và ghi nhận công nợ NCC thành công.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_confirm_goods_receipt(UUID, UUID, UUID, UUID, UUID, JSONB, VARCHAR, UUID, BIGINT, TEXT) TO authenticated, anon;

-- 9. ĐIỀU CHỈNH LẠI TỒN KHO SP-TEST-62 VỀ ĐÚNG 5 (NẾU ĐANG BỊ 105 DO BẤM LẶP)
UPDATE inventory_stocks
SET stock_on_hand = 5, updated_at = NOW()
WHERE product_id = '9a35b69f-ff87-40b1-adae-4ed64570096d' AND stock_on_hand > 5;
