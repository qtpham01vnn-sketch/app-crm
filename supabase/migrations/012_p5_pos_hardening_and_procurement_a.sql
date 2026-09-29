-- =============================================================================
-- MIGRATION 012: P5 HARDENING (REFUND/DAMAGED/BANK) & INVENTORY PROCUREMENT PHASE A
-- Phase: Kho vận sau P5 — Đợt A: Nhập hàng & Nhà cung cấp
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHẦN 1: QUẢN LÝ HÀNG LỖI / HỎNG / CÁCH LY (DAMAGED INVENTORY)
-- Tuyệt đối không cộng vào tồn khả dụng để bán
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS damaged_inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    quantity INT NOT NULL CHECK (quantity > 0),
    source_type VARCHAR(50) NOT NULL, -- 'sale_refund_damaged', 'grn_rejection', 'stocktake_damaged', 'expired'
    reference_id UUID, -- sale_id, grn_id, hoặc stocktake_id
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'quarantined', -- 'quarantined' (cách ly), 'returned_to_supplier' (trả NCC), 'disposed' (tiêu hủy)
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE damaged_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_damaged_inventory_read ON damaged_inventory_items;
CREATE POLICY rls_damaged_inventory_read ON damaged_inventory_items
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

DROP POLICY IF EXISTS rls_damaged_inventory_write ON damaged_inventory_items;
CREATE POLICY rls_damaged_inventory_write ON damaged_inventory_items
    FOR ALL TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()))
    WITH CHECK (organization_id = (SELECT get_current_user_org_id()));

-- -----------------------------------------------------------------------------
-- PHẦN 2: CHỐT CHẶN P5 — NÂNG CẤP RPC HOÀN TIỀN & NHẬP LẠI KHO CÓ ĐIỀU KIỆN
-- Tách bạch: Số tiền hoàn, số lượng nhận lại, số lượng nhập kho, số lượng hàng hỏng
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_refund_sale(
    p_org_id UUID,
    p_branch_id UUID,
    p_sale_id UUID,
    p_authorized_staff_id UUID,
    p_reason TEXT,
    p_return_stock BOOLEAN DEFAULT TRUE,
    p_refund_method VARCHAR(50) DEFAULT 'cash', -- 'cash', 'transfer', 'deposit_return'
    p_returned_items JSONB DEFAULT NULL -- Chi tiết: [{"product_id": UUID, "refund_qty": INT, "received_back_qty": INT, "restockable_qty": INT, "damaged_qty": INT, "damage_reason": TEXT}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_course RECORD;
    v_refund_number VARCHAR(100);
    v_refund_id UUID;
    v_stock_after INT;
    v_debt_to_reduce BIGINT := 0;
    v_actual_cash_refund BIGINT := 0;
    v_already_refunded BIGINT := 0;
    v_max_refundable BIGINT := 0;
    v_json_item JSONB;
    v_prod_id UUID;
    v_restock_qty INT;
    v_damaged_qty INT;
    v_damage_reason TEXT;
    v_deposit_number VARCHAR(100);
BEGIN
    -- 1. Khóa bản ghi sale bằng FOR UPDATE
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy hóa đơn cần hủy/hoàn tiền.');
    END IF;

    IF v_sale.status = 'refunded' OR v_sale.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Hóa đơn này đã được hủy/hoàn tiền trước đó.');
    END IF;

    -- 2. Kiểm tra các gói liệu trình trong đơn: Nếu đã sử dụng (used_sessions > 0) thì CHẶN HOÀN TIỀN TỰ ĐỘNG!
    FOR v_course IN 
        SELECT c.id, COALESCE(p.name, s.name, 'Gói liệu trình') AS course_name, c.total_sessions, c.used_sessions 
        FROM customer_courses c
        LEFT JOIN packages p ON p.id = c.package_id
        LEFT JOIN services s ON s.id = c.service_id
        WHERE c.sale_id = p_sale_id
    LOOP
        IF v_course.used_sessions > 0 THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'course_already_used',
                'message', format('Không thể hoàn hóa đơn vì gói liệu trình "%s" đã được thực hiện %s/%s buổi. Vui lòng xử lý đổi trả thủ công.',
                    v_course.course_name, v_course.used_sessions, v_course.total_sessions)
            );
        END IF;
    END LOOP;

    -- 3. Tính toán số tiền hoàn tối đa: Không được vượt quá số tiền khách đã thực trả
    SELECT COALESCE(SUM(refund_amount), 0) INTO v_already_refunded
    FROM sale_refunds
    WHERE sale_id = p_sale_id;

    v_max_refundable := GREATEST(0, v_sale.paid_amount - v_already_refunded);

    -- Nếu đơn có phần nợ (chưa thanh toán đủ): Xóa phần nợ trước
    IF (v_sale.total_amount - v_sale.paid_amount) > 0 THEN
        v_debt_to_reduce := v_sale.total_amount - v_sale.paid_amount;
    END IF;

    -- Tiền hoàn thực tế trả lại khách (tiền mặt / chuyển khoản / trả về ví cọc)
    v_actual_cash_refund := v_max_refundable;

    -- 4. Xử lý tồn kho theo cấu trúc chi tiết hoặc fallback tương thích
    IF p_returned_items IS NOT NULL AND jsonb_array_length(p_returned_items) > 0 THEN
        -- Duyệt từng sản phẩm có cấu trúc phân loại rõ ràng
        FOR v_json_item IN SELECT * FROM jsonb_array_elements(p_returned_items)
        LOOP
            v_prod_id := (v_json_item->>'product_id')::UUID;
            v_restock_qty := COALESCE((v_json_item->>'restockable_qty')::INT, 0);
            v_damaged_qty := COALESCE((v_json_item->>'damaged_qty')::INT, 0);
            v_damage_reason := COALESCE(v_json_item->>'damage_reason', 'Hàng hoàn bị lỗi/hỏng/hết hạn');

            -- 4.1 Hàng đủ điều kiện tái bán: Tăng kho khả dụng
            IF v_restock_qty > 0 THEN
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_restock_qty,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = v_sale.branch_id AND product_id = v_prod_id
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
                    v_sale.branch_id,
                    v_prod_id,
                    'return_in',
                    p_sale_id,
                    v_restock_qty,
                    v_stock_after - v_restock_qty,
                    v_stock_after,
                    format('Nhập lại kho đủ chuẩn từ hoàn đơn #%s', v_sale.invoice_number),
                    p_authorized_staff_id
                );
            END IF;

            -- 4.2 Hàng hỏng / lỗi: Ghi nhận cách ly, TUYỆT ĐỐI KHÔNG CỘNG VÀO TỒN BÁN
            IF v_damaged_qty > 0 THEN
                INSERT INTO damaged_inventory_items (
                    organization_id,
                    branch_id,
                    product_id,
                    quantity,
                    source_type,
                    reference_id,
                    reason,
                    status,
                    created_by_staff_id
                ) VALUES (
                    p_org_id,
                    v_sale.branch_id,
                    v_prod_id,
                    v_damaged_qty,
                    'sale_refund_damaged',
                    p_sale_id,
                    v_damage_reason,
                    'quarantined',
                    p_authorized_staff_id
                );
            END IF;
        END LOOP;
    ELSIF p_return_stock THEN
        -- Fallback tương thích: Nếu không chỉ định chi tiết mà yêu cầu hoàn kho, hoàn toàn bộ sản phẩm
        FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id AND item_type = 'product'
        LOOP
            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand + v_item.quantity,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = v_sale.branch_id AND product_id = v_item.item_ref_id
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
                v_sale.branch_id,
                v_item.item_ref_id,
                'return_in',
                p_sale_id,
                v_item.quantity,
                v_stock_after - v_item.quantity,
                v_stock_after,
                format('Nhập lại kho do hủy hóa đơn #%s', v_sale.invoice_number),
                p_authorized_staff_id
            );
        END LOOP;
    END IF;

    -- 5. Thu hồi thẻ liệu trình chưa dùng sinh ra từ đơn này
    DELETE FROM customer_courses WHERE sale_id = p_sale_id AND used_sessions = 0;

    -- 6. Điều chỉnh công nợ và chi tiêu khách hàng
    UPDATE customers
    SET total_spent = GREATEST(0, total_spent - v_sale.total_amount),
        debt_balance = GREATEST(0, debt_balance - v_debt_to_reduce),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = v_sale.customer_id;

    -- 7. Nếu chọn phương thức hoàn về ví cọc (deposit_return), nạp lại vào ví cọc khách
    IF p_refund_method = 'deposit_return' AND v_actual_cash_refund > 0 THEN
        v_deposit_number := 'HC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
        INSERT INTO customer_deposits (
            organization_id,
            branch_id,
            customer_id,
            deposit_number,
            total_deposited,
            used_amount,
            status,
            notes,
            created_by_staff_id
        ) VALUES (
            p_org_id,
            v_sale.branch_id,
            v_sale.customer_id,
            v_deposit_number,
            v_actual_cash_refund,
            0,
            'active',
            format('Hoàn tiền hóa đơn #%s vào ví cọc', v_sale.invoice_number),
            p_authorized_staff_id
        );
    END IF;

    -- 8. Ghi chứng từ hoàn tiền
    v_refund_number := 'HOAN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO sale_refunds (
        organization_id,
        branch_id,
        sale_id,
        refund_number,
        refund_amount,
        refund_method,
        reason,
        return_stock,
        authorized_by_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_sale_id,
        v_refund_number,
        v_actual_cash_refund,
        p_refund_method,
        p_reason,
        p_return_stock,
        p_authorized_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_refund_id;

    -- 9. Đổi trạng thái Sale sang 'refunded'
    UPDATE sales
    SET status = 'refunded',
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'refund_id', v_refund_id,
        'refund_number', v_refund_number,
        'refund_amount', v_actual_cash_refund,
        'debt_reduced', v_debt_to_reduce,
        'refund_method', p_refund_method,
        'message', 'Đã xử lý hủy đơn, đối soát tiền hoàn và cập nhật kho phân loại thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- PHẦN 3: CHỐT CHẶN P5 — XÁC NHẬN CHUYỂN KHOẢN NGÂN HÀNG CHỐNG XỬ LÝ LẶP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_confirm_bank_payment(
    p_org_id UUID,
    p_payment_id UUID,
    p_staff_id UUID,
    p_bank_ref_code VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay RECORD;
BEGIN
    SELECT * INTO v_pay
    FROM payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy phiếu thu thanh toán.');
    END IF;

    -- Chống xác nhận lặp (Idempotent)
    IF v_pay.verification_status = 'verified' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'already_verified', TRUE,
            'payment_id', p_payment_id,
            'message', 'Khoản thanh toán ngân hàng này đã được xác nhận trước đó, không ghi nhận trùng lặp.'
        );
    END IF;

    UPDATE payments
    SET verification_status = 'verified',
        verified_by_staff_id = p_staff_id,
        bank_ref_code = COALESCE(p_bank_ref_code, bank_ref_code),
        verified_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        note = CASE WHEN p_notes IS NOT NULL THEN COALESCE(note, '') || ' | ' || p_notes ELSE note END
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'already_verified', FALSE,
        'payment_id', p_payment_id,
        'message', 'Đã xác nhận khớp tiền chuyển khoản ngân hàng thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- PHẦN 4: ĐỢT A — KHO VẬN: SCHEMA CHI TIẾT NHẬP HÀNG & NHÀ CUNG CẤP
-- -----------------------------------------------------------------------------

-- 4.1 Chi tiết Đơn Đặt Hàng (Purchase Order Items)
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    purchase_unit VARCHAR(50) NOT NULL DEFAULT 'đơn vị',
    conversion_rate INT NOT NULL DEFAULT 1 CHECK (conversion_rate >= 1), -- Hệ số quy đổi ra đơn vị bán lẻ (ví dụ 1 thùng = 24 chai)
    quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0), -- Đơn giá mua theo purchase_unit
    line_total BIGINT NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_po_items_read ON purchase_order_items;
CREATE POLICY rls_po_items_read ON purchase_order_items FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_po_items_write ON purchase_order_items;
CREATE POLICY rls_po_items_write ON purchase_order_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Bổ sung trường cho purchase_orders nếu chưa có
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Bổ sung trường cho goods_receipt_notes nếu chưa có
ALTER TABLE goods_receipt_notes
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100), -- Số hóa đơn NCC
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- 'draft', 'confirmed', 'cancelled'
ADD COLUMN IF NOT EXISTS confirmed_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 4.2 Chi tiết Phiếu Nhập Hàng Thực Tế (Goods Receipt Items)
CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goods_receipt_id UUID NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100),
    expiry_date DATE,
    purchase_unit VARCHAR(50) NOT NULL DEFAULT 'đơn vị',
    conversion_rate INT NOT NULL DEFAULT 1 CHECK (conversion_rate >= 1),
    quantity_received INT NOT NULL CHECK (quantity_received >= 0), -- Số lượng giao thực tế (theo đơn vị mua)
    quantity_accepted INT NOT NULL CHECK (quantity_accepted >= 0 AND quantity_accepted <= quantity_received), -- Đạt chuẩn
    quantity_rejected INT NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0), -- Hỏng/lỗi/từ chối
    rejection_reason TEXT,
    accepted_base_units INT NOT NULL CHECK (accepted_base_units >= 0), -- Số lượng quy đổi ra đơn vị bán lẻ để cộng kho
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0), -- Đơn giá mua
    line_total BIGINT NOT NULL CHECK (line_total >= 0), -- Tổng tiền tính theo số lượng được chấp nhận
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_grn_items_read ON goods_receipt_items;
CREATE POLICY rls_grn_items_read ON goods_receipt_items FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS rls_grn_items_write ON goods_receipt_items;
CREATE POLICY rls_grn_items_write ON goods_receipt_items FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- 4.3 Sổ Cái Bất Biến Biến Động Công Nợ Nhà Cung Cấp (Supplier AP Ledger)
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    entry_type VARCHAR(50) NOT NULL, -- 'purchase_invoice' (tăng nợ), 'supplier_payment' (giảm nợ), 'supplier_return' (giảm nợ), 'adjustment'
    reference_type VARCHAR(50) NOT NULL, -- 'grn', 'po', 'payment', 'return'
    reference_id UUID,
    debit_amount BIGINT NOT NULL DEFAULT 0 CHECK (debit_amount >= 0), -- Ghi nợ: Giảm nợ NCC
    credit_amount BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount >= 0), -- Ghi có: Tăng nợ NCC
    balance_after BIGINT NOT NULL, -- Dư nợ sau phát sinh
    notes TEXT,
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_ledger_read ON supplier_ledger;
CREATE POLICY rls_supplier_ledger_read ON supplier_ledger
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- Tính bất biến: Không cho UPDATE / DELETE dòng sổ cái công nợ
CREATE OR REPLACE RULE prevent_supplier_ledger_update AS ON UPDATE TO supplier_ledger DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_supplier_ledger_delete AS ON DELETE TO supplier_ledger DO INSTEAD NOTHING;

-- 4.4 Bảng Phiếu Chi Thanh Toán Nhà Cung Cấp (Supplier Payments)
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    payment_number VARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'transfer', -- 'transfer', 'cash'
    bank_ref_code VARCHAR(100),
    paid_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_supplier_payment_number_per_org UNIQUE (organization_id, payment_number)
);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_supplier_payments_read ON supplier_payments;
CREATE POLICY rls_supplier_payments_read ON supplier_payments
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- -----------------------------------------------------------------------------
-- PHẦN 5: CÁC RPC NGHIỆP VỤ NHẬP HÀNG & CÔNG NỢ NHÀ CUNG CẤP (ĐỢT A)
-- -----------------------------------------------------------------------------

-- 5.1 Tạo Đơn Đặt Hàng (Purchase Order) — TUYỆT ĐỐI CHƯA LÀM TĂNG TỒN KHO
CREATE OR REPLACE FUNCTION rpc_create_purchase_order(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"product_id": UUID, "purchase_unit": TEXT, "conversion_rate": INT, "quantity": INT, "unit_cost": BIGINT}]
    p_expected_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_po_number VARCHAR(100);
    v_po_id UUID;
    v_total_amount BIGINT := 0;
    v_item JSONB;
    v_prod_id UUID;
    v_unit VARCHAR(50);
    v_conv_rate INT;
    v_qty INT;
    v_cost BIGINT;
    v_line_total BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Đơn đặt hàng phải có ít nhất một mặt hàng.');
    END IF;

    -- Tính tổng tiền đơn PO
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INT;
        v_cost := (v_item->>'unit_cost')::BIGINT;
        IF v_qty <= 0 OR v_cost < 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng và giá mua phải hợp lệ.');
        END IF;
        v_total_amount := v_total_amount + (v_qty * v_cost);
    END LOOP;

    v_po_number := 'PO' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    INSERT INTO purchase_orders (
        organization_id,
        branch_id,
        supplier_id,
        po_number,
        total_amount,
        status,
        expected_delivery_date,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_po_number,
        v_total_amount,
        'ordered',
        p_expected_date,
        p_notes,
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_po_id;

    -- Ghi chi tiết từng item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty := (v_item->>'quantity')::INT;
        v_cost := (v_item->>'unit_cost')::BIGINT;
        v_line_total := v_qty * v_cost;

        INSERT INTO purchase_order_items (
            purchase_order_id,
            product_id,
            purchase_unit,
            conversion_rate,
            quantity_ordered,
            quantity_received,
            unit_cost,
            line_total
        ) VALUES (
            v_po_id,
            v_prod_id,
            v_unit,
            v_conv_rate,
            v_qty,
            0,
            v_cost,
            v_line_total
        );
    END LOOP;

    -- Chú ý: TUYỆT ĐỐI KHÔNG TĂNG TỒN KHO KHI TẠO ĐƠN PO
    RETURN jsonb_build_object(
        'success', TRUE,
        'po_id', v_po_id,
        'po_number', v_po_number,
        'total_amount', v_total_amount,
        'message', 'Đã tạo đơn đặt hàng PO thành công (chưa tăng tồn kho).'
    );
END;
$$;

-- 5.2 Nhận Hàng Thực Tế (GRN) — TĂNG TỒN THEO SỐ ĐẠT CHUẨN, GHI NỢ SỔ CÁI NCC, TÍNH GIÁ VỐN WAC
CREATE OR REPLACE FUNCTION rpc_confirm_goods_receipt(
    p_org_id UUID,
    p_branch_id UUID,
    p_po_id UUID, -- Có thể NULL nếu nhập trực tiếp không qua PO
    p_supplier_id UUID,
    p_staff_id UUID,
    p_items JSONB, -- Mảng: [{"po_item_id": UUID, "product_id": UUID, "lot_number": TEXT, "expiry_date": DATE, "purchase_unit": TEXT, "conversion_rate": INT, "qty_received": INT, "qty_accepted": INT, "qty_rejected": INT, "rejection_reason": TEXT, "unit_cost": BIGINT}]
    p_invoice_number VARCHAR(100) DEFAULT NULL,
    p_advance_paid BIGINT DEFAULT 0, -- Số tiền đã trả trước (nếu có)
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
    v_line_total BIGINT;
    v_curr_stock INT;
    v_curr_cost BIGINT;
    v_new_cost BIGINT;
    v_stock_after INT;
    v_all_po_completed BOOLEAN := TRUE;
    v_po RECORD;
    v_supplier RECORD;
    v_new_debt_balance BIGINT;
    v_net_credit BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Phiếu nhập kho phải có ít nhất một mặt hàng.');
    END IF;

    -- Khóa Supplier FOR UPDATE để đảm bảo số dư sổ cái và công nợ tuyệt đối chính xác
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    -- Nếu có PO, khóa PO FOR UPDATE
    IF p_po_id IS NOT NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND organization_id = p_org_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn đặt hàng PO tương ứng.');
        END IF;
    END IF;

    v_grn_number := 'GRN' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Tạo phiếu nhận hàng GRN
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
        0, -- Sẽ update sau
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_grn_id;

    -- 2. Duyệt từng mặt hàng nhận
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := CASE WHEN v_item->>'po_item_id' IS NOT NULL THEN (v_item->>'po_item_id')::UUID ELSE NULL END;
        v_prod_id := (v_item->>'product_id')::UUID;
        v_lot := v_item->>'lot_number';
        v_expiry := CASE WHEN v_item->>'expiry_date' IS NOT NULL THEN (v_item->>'expiry_date')::DATE ELSE NULL END;
        v_unit := COALESCE(v_item->>'purchase_unit', 'đơn vị');
        v_conv_rate := GREATEST(1, COALESCE((v_item->>'conversion_rate')::INT, 1));
        v_qty_rec := (v_item->>'qty_received')::INT;
        v_qty_acc := (v_item->>'qty_accepted')::INT;
        v_qty_rej := COALESCE((v_item->>'qty_rejected')::INT, 0);
        v_rej_reason := v_item->>'rejection_reason';
        v_cost := (v_item->>'unit_cost')::BIGINT;

        IF v_qty_acc < 0 OR v_qty_rec < v_qty_acc THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng chấp nhận không hợp lệ.');
        END IF;

        -- Quy đổi số lượng đạt chuẩn ra đơn vị cơ sở bán lẻ
        v_base_units := v_qty_acc * v_conv_rate;
        v_line_total := v_qty_acc * v_cost;
        v_total_accepted_value := v_total_accepted_value + v_line_total;

        -- Lưu chi tiết dòng GRN
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

        -- Cập nhật số lượng đã nhận trên PO item nếu có
        IF v_po_item_id IS NOT NULL THEN
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + v_qty_acc
            WHERE id = v_po_item_id;
        END IF;

        -- 2.1 Hàng đạt chuẩn: TĂNG TỒN KHO THỰC TẾ & TÍNH GIÁ VỐN BÌNH QUÂN (WAC)
        IF v_base_units > 0 THEN
            -- Lấy tồn kho và giá vốn hiện tại của sản phẩm
            SELECT cost_price INTO v_curr_cost FROM products WHERE id = v_prod_id;
            
            -- Khóa dòng tồn kho chi nhánh
            SELECT COALESCE(stock_on_hand, 0) INTO v_curr_stock
            FROM inventory_stocks
            WHERE branch_id = p_branch_id AND product_id = v_prod_id
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
                VALUES (p_org_id, p_branch_id, v_prod_id, v_base_units)
                RETURNING stock_on_hand INTO v_stock_after;
                v_curr_stock := 0;
            ELSE
                UPDATE inventory_stocks
                SET stock_on_hand = stock_on_hand + v_base_units,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE branch_id = p_branch_id AND product_id = v_prod_id
                RETURNING stock_on_hand INTO v_stock_after;
            END IF;

            -- Tính giá vốn bình quân gia quyền mới (Weighted Average Cost per Base Unit)
            -- new_cost = ((v_curr_stock * v_curr_cost) + (v_base_units * (v_cost / v_conv_rate))) / (v_curr_stock + v_base_units)
            IF (v_curr_stock + v_base_units) > 0 THEN
                v_new_cost := ((v_curr_stock * COALESCE(v_curr_cost, 0)) + (v_base_units * (v_cost / v_conv_rate))) / (v_curr_stock + v_base_units);
                UPDATE products
                SET cost_price = v_new_cost,
                    updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                WHERE id = v_prod_id;
            END IF;

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
                v_curr_stock,
                v_stock_after,
                format('Nhập kho thực tế từ phiếu #%s (Lô: %s)', v_grn_number, COALESCE(v_lot, 'N/A')),
                p_staff_id
            );
        END IF;

        -- 2.2 Hàng lỗi / hỏng: Đưa vào kho cách ly, TUYỆT ĐỐI KHÔNG CỘNG VÀO TỒN BÁN
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
                COALESCE(v_rej_reason, 'Hàng không đạt chuẩn khi nghiệm thu nhập kho'),
                'quarantined',
                p_staff_id
            );
        END IF;
    END LOOP;

    -- Cập nhật tổng giá trị thực nhận trên GRN
    UPDATE goods_receipt_notes SET total_value = v_total_accepted_value WHERE id = v_grn_id;

    -- 3. Cập nhật trạng thái PO (nếu có PO liên kết)
    IF p_po_id IS NOT NULL THEN
        -- Kiểm tra còn item nào chưa nhận đủ không
        IF EXISTS (SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_po_id AND quantity_received < quantity_ordered) THEN
            UPDATE purchase_orders SET status = 'partially_received', updated_at = NOW() WHERE id = p_po_id;
        ELSE
            UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
        END IF;
    END IF;

    -- 4. GHI NHẬN CÔNG NỢ VÀO SỔ CÁI NHÀ CUNG CẤP (SUPPLIER AP LEDGER)
    -- Quy tắc: Thời điểm ghi nợ là khi phiếu nhận hàng đã được chấp nhận.
    -- Nếu đã trả trước (p_advance_paid > 0), tính cấn trừ để không mặc định tăng nợ toàn bộ.
    v_net_credit := GREATEST(0, v_total_accepted_value - COALESCE(p_advance_paid, 0));
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
        COALESCE(p_advance_paid, 0), -- Giảm trừ phần đã trả trước
        v_total_accepted_value, -- Phát sinh giá trị hàng nhận
        v_new_debt_balance,
        format('Nhập hàng theo phiếu #%s (Hóa đơn NCC: %s)', v_grn_number, COALESCE(p_invoice_number, 'N/A')),
        p_staff_id
    );

    -- Cập nhật số dư công nợ trên bảng suppliers
    UPDATE suppliers
    SET debt_balance = v_new_debt_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'total_accepted_value', v_total_accepted_value,
        'advance_paid', p_advance_paid,
        'net_debt_added', v_net_credit,
        'supplier_debt_balance', v_new_debt_balance,
        'message', 'Đã xác nhận nhập kho thành công: tồn kho đã tăng, sổ cái công nợ đã ghi nhận.'
    );
END;
$$;

-- 5.3 Thanh Toán Tiền Cho Nhà Cung Cấp (Supplier AP Payment)
CREATE OR REPLACE FUNCTION rpc_pay_supplier(
    p_org_id UUID,
    p_branch_id UUID,
    p_supplier_id UUID,
    p_staff_id UUID,
    p_amount BIGINT,
    p_payment_method VARCHAR(50) DEFAULT 'transfer', -- 'transfer', 'cash'
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
    v_payment_number VARCHAR(100);
    v_payment_id UUID;
    v_new_balance BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số tiền thanh toán phải lớn hơn 0.');
    END IF;

    -- Khóa Supplier FOR UPDATE
    SELECT * INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy nhà cung cấp.');
    END IF;

    v_payment_number := 'PCNCC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Ghi phiếu chi thanh toán
    INSERT INTO supplier_payments (
        organization_id,
        branch_id,
        supplier_id,
        payment_number,
        amount,
        payment_method,
        bank_ref_code,
        paid_by_staff_id,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_supplier_id,
        v_payment_number,
        p_amount,
        p_payment_method,
        p_bank_ref_code,
        p_staff_id,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_payment_id;

    -- 2. Ghi sổ cái công nợ NCC (Supplier Ledger Debit)
    v_new_balance := v_supplier.debt_balance - p_amount; -- Có thể âm nếu trả trước (trả thừa)

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
        'supplier_payment',
        'payment',
        v_payment_id,
        p_amount, -- Ghi nợ (giảm nợ)
        0,
        v_new_balance,
        format('Thanh toán tiền hàng phiếu chi #%s (PT: %s, Ref: %s)', v_payment_number, p_payment_method, COALESCE(p_bank_ref_code, 'N/A')),
        p_staff_id
    );

    -- 3. Cập nhật số dư công nợ trên bảng suppliers
    UPDATE suppliers
    SET debt_balance = v_new_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_supplier_id;

    -- 4. Lưu ý kế toán: Chi trả công nợ NCC là dòng tiền ra (Cash Outflow) giảm nợ phải trả (Nợ 331/Có 111,112),
    -- đã được ghi nhận trong supplier_payments và supplier_ledger.
    -- TUYỆT ĐỐI KHÔNG ghi vào bảng expenses (chi phí hoạt động P&L) để tránh tính trùng với giá vốn (COGS) khi xuất bán.

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_number', v_payment_number,
        'amount_paid', p_amount,
        'debt_balance_after', v_new_balance,
        'message', 'Đã thanh toán công nợ NCC, cập nhật sổ cái và quỹ chi phí thành công.'
    );
END;
$$;
