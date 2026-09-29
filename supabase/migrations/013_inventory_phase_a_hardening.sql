-- =============================================================================
-- MIGRATION 013: INVENTORY PHASE A HARDENING & AUDIT INTEGRITY
-- Phase: Kho vận sau P5 — Đợt A Nghiệm thu chuyên sâu
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. GIÁ VỐN THEO CHI NHÁNH & SNAPSHOT GIÁ VỐN XUẤT BÁN
-- -----------------------------------------------------------------------------
ALTER TABLE inventory_stocks
ADD COLUMN IF NOT EXISTS cost_price BIGINT NOT NULL DEFAULT 0;

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS cost_price_snapshot BIGINT NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. THEO DÕI TỒN KHO THEO LÔ & HẠN DÙNG (INVENTORY_LOT_STOCKS)
-- Cho phép truy ra số lượng còn lại chính xác của từng lô tại từng chi nhánh
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_lot_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100) NOT NULL,
    expiry_date DATE,
    quantity_on_hand INT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    cost_price BIGINT NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'near_expiry', 'expired', 'depleted'
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_lot_per_branch UNIQUE (branch_id, product_id, lot_number)
);

ALTER TABLE inventory_lot_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lot_stocks_read ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_read ON inventory_lot_stocks FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_lot_stocks_write ON inventory_lot_stocks;
CREATE POLICY rls_lot_stocks_write ON inventory_lot_stocks FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. QUẢN LÝ KHOẢN TIỀN TRẢ TRƯỚC NHÀ CUNG CẤP (SUPPLIER_ADVANCES)
-- Khoản trả trước có chứng từ, kiểm tra số dư khả dụng server-side, chống dùng trùng
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_advances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    advance_number VARCHAR(100) NOT NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount > 0),
    used_amount BIGINT NOT NULL DEFAULT 0 CHECK (used_amount >= 0 AND used_amount <= total_amount),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer',
    bank_ref_code VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'available', -- 'available', 'partially_used', 'exhausted'
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_supplier_advance_number UNIQUE (organization_id, advance_number)
);

ALTER TABLE supplier_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_advances_read ON supplier_advances;
CREATE POLICY rls_supplier_advances_read ON supplier_advances FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_supplier_advances_write ON supplier_advances;
CREATE POLICY rls_supplier_advances_write ON supplier_advances FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. BẢNG TRẢ HÀNG NHÀ CUNG CẤP & ĐẢO CHỨNG TỪ (SUPPLIER_RETURNS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    return_number VARCHAR(100) NOT NULL,
    goods_receipt_id UUID REFERENCES goods_receipt_notes(id) ON DELETE SET NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    total_debt_reduction BIGINT NOT NULL DEFAULT 0 CHECK (total_debt_reduction >= 0), -- Số tiền thực sự giảm trừ nợ NCC (0 nếu là hàng giữ hộ)
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- 'draft', 'confirmed', 'cancelled'
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_supplier_return_number UNIQUE (organization_id, return_number)
);

ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_returns_read ON supplier_returns;
CREATE POLICY rls_supplier_returns_read ON supplier_returns FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_supplier_returns_write ON supplier_returns;
CREATE POLICY rls_supplier_returns_write ON supplier_returns FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS supplier_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    is_from_quarantined BOOLEAN NOT NULL DEFAULT FALSE, -- Trả từ kho lỗi hay từ kho bán
    is_holding_rejection BOOLEAN NOT NULL DEFAULT FALSE, -- Hàng giữ hộ từ chối lúc nhận: KHÔNG giảm công nợ
    debt_reduction_amount BIGINT NOT NULL DEFAULT 0,    -- Giá trị giảm công nợ thực tế
    damaged_item_id UUID REFERENCES damaged_inventory_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE supplier_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_return_items_read ON supplier_return_items;
CREATE POLICY rls_supplier_return_items_read ON supplier_return_items FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_supplier_return_items_write ON supplier_return_items;
CREATE POLICY rls_supplier_return_items_write ON supplier_return_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 5. RPC NẠP TIỀN TRẢ TRƯỚC CHO NCC (CREATE ADVANCE PAYMENT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_supplier_advance(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_amount BIGINT,
    p_payment_method VARCHAR(50) DEFAULT 'transfer',
    p_bank_ref_code VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_supplier RECORD;
    v_adv_number VARCHAR(100);
    v_adv_id UUID;
    v_new_balance BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số tiền trả trước phải lớn hơn 0.');
    END IF;

    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    v_adv_number := 'TTNCC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Lưu chứng từ trả trước
    INSERT INTO supplier_advances (
        organization_id,
        branch_id,
        supplier_id,
        advance_number,
        total_amount,
        used_amount,
        payment_method,
        bank_ref_code,
        status,
        notes,
        created_by_staff_id
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_adv_number,
        p_amount,
        0,
        p_payment_method,
        p_bank_ref_code,
        'available',
        p_notes,
        p_staff_id
    )
    RETURNING id INTO v_adv_id;

    -- 2. Ghi sổ cái NCC: Ghi nợ (debit_amount) làm giảm nợ phải trả hoặc tăng dư có trả trước
    v_new_balance := v_supplier.debt_balance - p_amount;

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
        'supplier_advance',
        'advance',
        v_adv_id,
        p_amount,
        0,
        v_new_balance,
        format('Nộp tiền đặt cọc/trả trước NCC #%s (Ref: %s)', v_adv_number, COALESCE(p_bank_ref_code, 'N/A')),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_new_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'advance_id', v_adv_id,
        'advance_number', v_adv_number,
        'amount', p_amount,
        'supplier_debt_balance', v_new_balance,
        'message', 'Đã tạo chứng từ trả trước cho NCC và ghi nhận sổ cái thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC NÂNG CẤP XÁC NHẬN NHẬP KHO (GRN) VỚI QUẢN LÝ LÔ & TIỀN TRẢ TRƯỚC SERVER-SIDE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB,
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_id UUID DEFAULT NULL, -- ID chứng từ trả trước hợp lệ (nếu có)
    p_advance_amount_to_use BIGINT DEFAULT 0, -- Số tiền cấn trừ từ chứng từ trả trước
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
    v_curr_branch_stock INT;
    v_curr_branch_cost BIGINT;
    v_new_branch_cost BIGINT;
    v_stock_after INT;
    v_po RECORD;
    v_po_item RECORD;
    v_supplier RECORD;
    v_advance RECORD;
    v_actual_advance_deducted BIGINT := 0;
    v_new_debt_balance BIGINT;
    v_net_credit BIGINT;
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

    -- 2. Nếu có PO liên kết, kiểm tra và khóa PO FOR UPDATE
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
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

    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 4. Tạo Header Phiếu Nhập Kho
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
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(NULLIF(TRIM(v_item->>'lot_number'), ''), 'LOT-DEFAULT');
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        -- Kiểm tra không nhận vượt số đặt nếu có PO liên kết
        IF v_po_item_id IS NOT NULL THEN
            SELECT * INTO v_po_item FROM purchase_order_items WHERE id = v_po_item_id FOR UPDATE;
            IF FOUND THEN
                IF (v_po_item.quantity_received + v_qty_acc) > v_po_item.quantity_ordered THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'message', format('Số lượng nhận đạt chuẩn (%s) vượt quá số lượng còn lại của đơn PO (%s đặt, %s đã nhận).',
                            v_qty_acc, v_po_item.quantity_ordered, v_po_item.quantity_received)
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

        -- Cập nhật số đã nhận trên PO item
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 5.1 Hàng đạt chuẩn: TĂNG TỒN TỔNG CHI NHÁNH & TÍNH GIÁ VỐN WAC THEO CHI NHÁNH
        IF v_base_units > 0 THEN
            SELECT COALESCE(stock_on_hand, 0), COALESCE(cost_price, 0)
            INTO v_curr_branch_stock, v_curr_branch_cost
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand, cost_price)
                VALUES (p_org_id, p_branch_id, v_prod_id, v_base_units, v_base_cost)
                RETURNING stock_on_hand, cost_price INTO v_stock_after, v_new_branch_cost;
                v_curr_branch_stock := 0;
            ELSE
                v_new_branch_cost := ((v_curr_branch_stock * v_curr_branch_cost) + (v_base_units * v_base_cost)) / (v_curr_branch_stock + v_base_units);
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_base_units,
                    cost_price = v_new_branch_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id
                RETURNING stock_on_hand INTO v_stock_after;
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
                status
            ) VALUES (
                p_org_id,
                p_branch_id,
                v_prod_id,
                v_lot,
                v_expiry,
                v_base_units,
                v_base_cost,
                'active'
            )
            ON CONFLICT (branch_id, product_id, lot_number)
            DO UPDATE SET
                quantity_on_hand = inventory_lot_stocks.quantity_on_hand + v_base_units,
                expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_lot_stocks.expiry_date),
                cost_price = ((inventory_lot_stocks.quantity_on_hand * inventory_lot_stocks.cost_price) + (v_base_units * v_base_cost)) / (inventory_lot_stocks.quantity_on_hand + v_base_units),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());

            -- Ghi sổ cái nhập kho
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

    -- 8. Ghi nhận công nợ vào Sổ cái NCC (Supplier Ledger)
    -- Dư nợ tăng thêm = Giá trị nhận đạt chuẩn - Tiền trả trước cấn trừ
    v_net_credit := GREATEST(0, v_total_accepted_value - v_actual_advance_deducted);
    v_new_debt_balance := v_supplier.debt_balance + v_net_credit;

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
        v_actual_advance_deducted,
        v_total_accepted_value,
        v_new_debt_balance,
        format('Nhập hàng GRN #%s | Cấn trừ cọc: %sđ | Nợ phát sinh ròng: %sđ', v_grn_number, v_actual_advance_deducted, v_net_credit),
        p_staff_id
    );

    UPDATE suppliers
    SET debt_balance = v_new_debt_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_deducted', v_actual_advance_deducted,
        'net_debt_added', v_net_credit,
        'supplier_debt_balance', v_new_debt_balance,
        'message', 'Đã xác nhận nhập kho thành công: tồn kho, tồn lô và sổ cái công nợ đã cập nhật chính xác.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC TRẢ HÀNG NHÀ CUNG CẤP & ĐẢO CHỨNG TỪ (SUPPLIER RETURN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_return_goods_to_supplier(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "lot_number": TEXT, "quantity": INT, "unit_cost": BIGINT, "is_from_quarantined": BOOL, "damaged_item_id": UUID}]
    p_reason TEXT,
    p_grn_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_supplier RECORD;
    v_ret_number VARCHAR(100);
    v_ret_id UUID;
    v_total_return_value BIGINT := 0;
    v_total_debt_reduction BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_lot VARCHAR(100);
    v_qty INT;
    v_cost BIGINT;
    v_is_quarantine BOOLEAN;
    v_is_holding_rejection BOOLEAN;
    v_item_debt_reduction BIGINT;
    v_source_type VARCHAR(50);
    v_dmg_id UUID;
    v_line_total BIGINT;
    v_curr_stock INT;
    v_new_balance BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu trả hàng phải có ít nhất một mặt hàng.');
    END IF;

    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    v_ret_number := 'THNCC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Tạo header phiếu trả hàng
    INSERT INTO supplier_returns (
        organization_id,
        branch_id,
        supplier_id,
        return_number,
        goods_receipt_id,
        total_amount,
        total_debt_reduction,
        reason,
        created_by_staff_id
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_ret_number,
        p_grn_id,
        0, -- Cập nhật sau
        0, -- Cập nhật sau
        p_reason,
        p_staff_id
    )
    RETURNING id INTO v_ret_id;

    -- 2. Duyệt từng mặt hàng trả
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := COALESCE(v_item->>'lot_number', 'LOT-DEFAULT');
        v_qty := (v_item->>'quantity')::INT;
        v_cost := (v_item->>'unit_cost')::BIGINT;
        v_is_quarantine := COALESCE((v_item->>'is_from_quarantined')::BOOLEAN, FALSE);
        v_is_holding_rejection := COALESCE((v_item->>'is_holding_rejection')::BOOLEAN, FALSE);
        v_dmg_id := CASE WHEN v_item->>'damaged_item_id' IS NOT NULL THEN (v_item->>'damaged_item_id')::UUID ELSE NULL END;
        v_line_total := v_qty * v_cost;
        v_total_return_value := v_total_return_value + v_line_total;

        -- Nếu là hàng cách ly, kiểm tra xem có phải nguồn từ chối lúc nhận hàng GRN hay không
        IF v_dmg_id IS NOT NULL THEN
            SELECT source_type INTO v_source_type FROM damaged_inventory_items WHERE id = v_dmg_id;
            IF v_source_type = 'grn_rejection' THEN
                v_is_holding_rejection := TRUE;
            END IF;
        END IF;

        IF v_is_holding_rejection THEN
            -- Hàng giữ hộ từ chối lúc nhận: KHÔNG giảm công nợ vì chưa từng ghi nợ vào sổ cái
            v_item_debt_reduction := 0;
        ELSE
            -- Hàng đã chấp nhận mua rồi mới phát hiện lỗi: GIẢM công nợ NCC
            v_item_debt_reduction := v_line_total;
        END IF;

        v_total_debt_reduction := v_total_debt_reduction + v_item_debt_reduction;

        INSERT INTO supplier_return_items (
            return_id,
            product_id,
            lot_number,
            quantity,
            unit_cost,
            line_total,
            is_from_quarantined,
            is_holding_rejection,
            debt_reduction_amount,
            damaged_item_id
        ) VALUES (
            v_ret_id,
            v_prod_id,
            v_lot,
            v_qty,
            v_cost,
            v_line_total,
            v_is_quarantine,
            v_is_holding_rejection,
            v_item_debt_reduction,
            v_dmg_id
        );

        -- Nếu trả từ kho bán: Giảm tồn khả dụng và tồn lô
        IF NOT v_is_quarantine THEN
            SELECT stock_on_hand INTO v_curr_stock
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF v_curr_stock < v_qty THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'message', format('Tồn kho khả dụng không đủ để xuất trả NCC (Hiện có: %s, yêu cầu trả: %s).', v_curr_stock, v_qty)
                );
            END IF;

            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand - v_qty,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = p_branch_id AND product_id = v_prod_id;

            UPDATE inventory_lot_stocks
            SET quantity_on_hand = GREATEST(0, quantity_on_hand - v_qty),
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = p_branch_id AND product_id = v_prod_id AND lot_number = v_lot;

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
                'supplier_return_out',
                v_ret_id,
                -v_qty,
                v_curr_stock,
                v_curr_stock - v_qty,
                format('Xuất trả hàng NCC phiếu #%s | Lô: %s', v_ret_number, v_lot),
                p_staff_id
            );
        ELSE
            -- Trả từ kho cách ly: Cập nhật trạng thái
            IF v_dmg_id IS NOT NULL THEN
                UPDATE damaged_inventory_items
                SET status = 'returned_to_supplier',
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_dmg_id;
            END IF;
        END IF;
    END LOOP;

    UPDATE supplier_returns 
    SET total_amount = v_total_return_value,
        total_debt_reduction = v_total_debt_reduction
    WHERE id = v_ret_id;

    -- 3. Ghi Sổ cái NCC: CHỈ ghi nợ (giảm nợ) nếu v_total_debt_reduction > 0
    IF v_total_debt_reduction > 0 THEN
        v_new_balance := v_supplier.debt_balance - v_total_debt_reduction;

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
            'supplier_return',
            'return',
            v_ret_id,
            v_total_debt_reduction,
            0,
            v_new_balance,
            format('Nghiệp vụ trả hàng đã mua phiếu #%s: Giảm nợ %sđ (Lý do: %s)', v_ret_number, v_total_debt_reduction, p_reason),
            p_staff_id
        );

        UPDATE suppliers
        SET debt_balance = v_new_balance,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_supplier_id;
    ELSE
        -- Hàng giữ hộ từ chối lúc nhận: Ghi nhận nhật ký đối soát 0đ, không làm thay đổi dư nợ NCC
        v_new_balance := v_supplier.debt_balance;

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
            'supplier_return_holding',
            'return',
            v_ret_id,
            0,
            0,
            v_new_balance,
            format('Xuất trả hàng lỗi giữ hộ (Không trừ công nợ do hàng từ chối chưa từng ghi nợ) phiếu #%s (Lý do: %s)', v_ret_number, p_reason),
            p_staff_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'return_id', v_ret_id,
        'return_number', v_ret_number,
        'total_amount', v_total_return_value,
        'total_debt_reduction', v_total_debt_reduction,
        'debt_balance_after', v_new_balance,
        'message', CASE 
            WHEN v_total_debt_reduction > 0 THEN format('Đã lập phiếu trả hàng và giảm trừ công nợ %sđ thành công.', v_total_debt_reduction)
            ELSE 'Đã lập phiếu xuất trả hàng lỗi giữ hộ thành công (Dư nợ NCC không đổi vì hàng từ chối chưa từng ghi nợ).'
        END
    );
END;
$$;
