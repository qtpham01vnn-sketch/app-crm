-- =============================================================================
-- MIGRATION 010: POS ATOMIC CHECKOUT, FINANCIAL LEDGER, DEPOSITS & REFUNDS
-- Phase: Master Plan Phase P5 (POS & Thu Ngân Chuẩn Spa/Nha Khoa)
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. BẢNG TIỀN ĐẶT CỌC & SỔ DƯ TÀI KHOẢN KHÁCH HÀNG (CUSTOMER_DEPOSITS)
CREATE TABLE IF NOT EXISTS customer_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    deposit_number VARCHAR(100) NOT NULL, -- PC-YYYYMMDD-XXXX
    total_deposited BIGINT NOT NULL CHECK (total_deposited > 0),
    used_amount BIGINT NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
    remaining_balance BIGINT GENERATED ALWAYS AS (total_deposited - used_amount) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'depleted', 'refunded'
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE customer_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_customer_deposits_read ON customer_deposits;
CREATE POLICY rls_customer_deposits_read ON customer_deposits
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- 2. SỔ CÁI BIẾN ĐỘNG XUẤT NHẬP TỒN KHO (INVENTORY_TRANSACTIONS)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(50) NOT NULL, -- 'sale_out', 'return_in', 'grn_in', 'adjustment'
    reference_id UUID, -- ID của Sale hoặc Goods Receipt
    quantity_change INT NOT NULL, -- Dương khi nhập, âm khi xuất
    stock_before INT NOT NULL,
    stock_after INT NOT NULL,
    notes TEXT,
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_inventory_transactions_read ON inventory_transactions;
CREATE POLICY rls_inventory_transactions_read ON inventory_transactions
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

-- Bất biến sổ cái kho: Không được UPDATE/DELETE
CREATE OR REPLACE RULE prevent_inventory_trans_update AS ON UPDATE TO inventory_transactions DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_inventory_trans_delete AS ON DELETE TO inventory_transactions DO INSTEAD NOTHING;

-- 3. CẤU HÌNH THỜI GIAN DI CHUYỂN GIỮA CÁC CẶP CHI NHÁNH (BRANCH_TRAVEL_MATRIX)
CREATE TABLE IF NOT EXISTS branch_travel_matrix (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    to_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    travel_buffer_minutes INT NOT NULL DEFAULT 30 CHECK (travel_buffer_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_branch_travel_pair UNIQUE (organization_id, from_branch_id, to_branch_id)
);

-- 4. BẢNG CHỨNG TỪ HỦY ĐƠN & HOÀN TIỀN (SALE_REFUNDS)
CREATE TABLE IF NOT EXISTS sale_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    refund_number VARCHAR(100) NOT NULL, -- PT-HOAN-YYYYMMDD-XXXX
    refund_amount BIGINT NOT NULL CHECK (refund_amount > 0),
    refund_method VARCHAR(50) NOT NULL DEFAULT 'cash', -- 'cash', 'transfer', 'deposit_return'
    reason TEXT NOT NULL,
    return_stock BOOLEAN NOT NULL DEFAULT FALSE,
    authorized_by_staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- 5. RPC CHECKOUT GIAO DỊCH BÁN HÀNG TOÀN VẸN (ATOMIC POS CHECKOUT)
CREATE OR REPLACE FUNCTION rpc_pos_checkout(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_cashier_staff_id UUID,
    p_items JSONB,              -- Mảng JSON các món: [{type: 'service'|'product'|'package', id: '...', qty: 1, performer_id: '...'}]
    p_payment_method VARCHAR(50), -- 'cash', 'transfer_vietqr', 'card', 'split', 'debt'
    p_paid_amount BIGINT,       -- Số tiền thực trả
    p_promo_code TEXT DEFAULT NULL,
    p_manual_discount_amount BIGINT DEFAULT 0,
    p_manual_discount_reason TEXT DEFAULT NULL,
    p_use_deposit_amount BIGINT DEFAULT 0,
    p_appointment_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_sale RECORD;
    v_sale_id UUID;
    v_invoice_number VARCHAR(100);
    v_item RECORD;
    v_item_type VARCHAR(20);
    v_item_id UUID;
    v_item_qty INT;
    v_performer_id UUID;
    v_item_name VARCHAR(255);
    v_item_price BIGINT;
    v_item_commission_pct NUMERIC(5, 2) := 0;
    v_line_total BIGINT;
    v_subtotal BIGINT := 0;
    v_promo_discount BIGINT := 0;
    v_total_discount BIGINT := 0;
    v_final_total BIGINT := 0;
    v_debt_amount BIGINT := 0;
    v_payment_id UUID;
    v_payment_number VARCHAR(100);
    v_stock_curr RECORD;
    v_deposit_rec RECORD;
    v_rem_deposit_to_use BIGINT := COALESCE(p_use_deposit_amount, 0);
    v_course_pkg RECORD;
    v_course_id UUID;
BEGIN
    -- 0. KIỂM TRA IDEMPOTENCY KEY (Chống bấm đúp / gửi lại do mạng)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, invoice_number, total_amount, paid_amount INTO v_existing_sale
        FROM sales
        WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'is_idempotent_replay', TRUE,
                'sale_id', v_existing_sale.id,
                'invoice_no', v_existing_sale.invoice_number,
                'total_amount', v_existing_sale.total_amount,
                'message', 'Đơn hàng đã được thanh toán trước đó (Idempotent replay).'
            );
        END IF;
    END IF;

    -- Kiểm tra giỏ hàng
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Giỏ hàng trống, không thể thanh toán.');
    END IF;

    -- 1. DUYỆT QUA GIỎ HÀNG VÀ TÍNH TIỀN PHÍA SERVER TỪ SNAPSHOT CHÍNH XÁC
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        type TEXT,
        id UUID,
        qty INT,
        performer_id UUID
    )
    LOOP
        v_item_type := v_item.type;
        v_item_id := v_item.id;
        v_item_qty := COALESCE(v_item.qty, 1);
        v_performer_id := v_item.performer_id;

        IF v_item_qty <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số lượng món hàng phải lớn hơn 0.');
        END IF;

        IF v_item_type = 'service' THEN
            -- Lấy giá dịch vụ theo chi nhánh (ưu tiên branch_service_prices rồi tới services)
            SELECT COALESCE(bsp.custom_price, s.base_price), s.name, s.default_commission_pct 
            INTO v_item_price, v_item_name, v_item_commission_pct
            FROM services s
            LEFT JOIN branch_service_prices bsp ON bsp.service_id = s.id AND bsp.branch_id = p_branch_id AND bsp.is_active = TRUE
            WHERE s.id = v_item_id AND s.organization_id = p_org_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', FALSE, 'message', 'Dịch vụ không tồn tại hoặc đã ngừng hoạt động.');
            END IF;

        ELSIF v_item_type = 'product' THEN
            -- Khóa bản ghi tồn kho chi nhánh bằng FOR UPDATE để chống bán vượt tồn đồng thời
            SELECT s.stock_on_hand, p.name, p.retail_price
            INTO v_stock_curr
            FROM inventory_stocks s
            JOIN products p ON p.id = s.product_id
            WHERE s.branch_id = p_branch_id AND s.product_id = v_item_id AND p.organization_id = p_org_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', FALSE, 'message', 'Sản phẩm chưa được khởi tạo kho tại chi nhánh này.');
            END IF;

            IF v_stock_curr.stock_on_hand < v_item_qty THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict_type', 'insufficient_stock',
                    'message', format('Sản phẩm "%s" chỉ còn %s trong kho chi nhánh, không đủ số lượng bán (%s).', 
                        v_stock_curr.name, v_stock_curr.stock_on_hand, v_item_qty)
                );
            END IF;

            v_item_name := v_stock_curr.name;
            v_item_price := v_stock_curr.retail_price;

        ELSIF v_item_type = 'package' THEN
            -- Lấy gói liệu trình
            SELECT p.name, p.package_price, p.total_sessions, p.service_id
            INTO v_course_pkg
            FROM packages p
            WHERE p.id = v_item_id AND p.organization_id = p_org_id AND p.is_active = TRUE;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', FALSE, 'message', 'Gói liệu trình không tồn tại hoặc đã ngừng kinh doanh.');
            END IF;

            v_item_name := v_course_pkg.name;
            v_item_price := v_course_pkg.package_price;
        ELSE
            RETURN jsonb_build_object('success', FALSE, 'message', format('Loại mặt hàng "%s" không hợp lệ.', v_item_type));
        END IF;

        v_line_total := v_item_price * v_item_qty;
        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    -- 2. TÍNH KHUYẾN MÃI VOUCHER (NẾU CÓ) PHÍA SERVER
    IF p_promo_code IS NOT NULL AND TRIM(p_promo_code) <> '' THEN
        DECLARE
            v_promo_res JSONB;
        BEGIN
            v_promo_res := rpc_validate_promo(p_org_id, p_branch_id, p_promo_code, v_subtotal);
            IF (v_promo_res->>'is_valid')::BOOLEAN = TRUE THEN
                v_promo_discount := (v_promo_res->>'calculated_discount')::BIGINT;
                -- Tăng lượt dùng voucher
                UPDATE promotions
                SET used_count = used_count + 1
                WHERE organization_id = p_org_id AND UPPER(code) = UPPER(TRIM(p_promo_code));
            ELSE
                RETURN jsonb_build_object('success', FALSE, 'message', v_promo_res->>'message');
            END IF;
        END;
    END IF;

    -- Tổng giảm giá
    v_total_discount := v_promo_discount + COALESCE(p_manual_discount_amount, 0);
    IF v_total_discount > v_subtotal THEN
        v_total_discount := v_subtotal;
    END IF;

    v_final_total := v_subtotal - v_total_discount;

    -- 3. XỬ LÝ KHẤU TRỪ TIỀN CỌC (NẾU CÓ)
    IF v_rem_deposit_to_use > 0 THEN
        FOR v_deposit_rec IN 
            SELECT id, remaining_balance
            FROM customer_deposits
            WHERE customer_id = p_customer_id AND organization_id = p_org_id AND status = 'active'
            ORDER BY created_at ASC
            FOR UPDATE
        LOOP
            IF v_rem_deposit_to_use <= 0 THEN EXIT; END IF;

            IF v_deposit_rec.remaining_balance > 0 THEN
                DECLARE
                    v_deduct BIGINT := LEAST(v_rem_deposit_to_use, v_deposit_rec.remaining_balance);
                BEGIN
                    UPDATE customer_deposits
                    SET used_amount = used_amount + v_deduct,
                        status = CASE WHEN (used_amount + v_deduct) >= total_deposited THEN 'depleted' ELSE 'active' END,
                        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
                    WHERE id = v_deposit_rec.id;

                    v_rem_deposit_to_use := v_rem_deposit_to_use - v_deduct;
                END;
            END IF;
        END LOOP;

        IF v_rem_deposit_to_use > 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'message', 'Số dư tiền cọc khả dụng không đủ để thanh toán.');
        END IF;
    END IF;

    -- Tính số tiền nợ lại (nếu thanh toán thiếu)
    IF (p_paid_amount + COALESCE(p_use_deposit_amount, 0)) < v_final_total THEN
        v_debt_amount := v_final_total - (p_paid_amount + COALESCE(p_use_deposit_amount, 0));
    ELSE
        v_debt_amount := 0;
    END IF;

    -- Sinh số hóa đơn: HDYYMMDD-XXXX
    v_invoice_number := 'HD' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    v_payment_number := 'PT' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 4. TẠO HÓA ĐƠN BÁN HÀNG (SALES)
    INSERT INTO sales (
        organization_id,
        branch_id,
        customer_id,
        invoice_number,
        idempotency_key,
        subtotal,
        discount_amount,
        promo_code,
        tax_amount,
        tip_amount,
        total_amount,
        paid_amount,
        status,
        cashier_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_customer_id,
        v_invoice_number,
        p_idempotency_key,
        v_subtotal,
        v_total_discount,
        p_promo_code,
        0,
        0,
        v_final_total,
        p_paid_amount + COALESCE(p_use_deposit_amount, 0),
        'completed',
        p_cashier_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_sale_id;

    -- 5. TẠO CHI TIẾT DÒNG HÀNG & TRỪ KHO / TẠO THẺ LIỆU TRÌNH
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        type TEXT,
        id UUID,
        qty INT,
        performer_id UUID
    )
    LOOP
        v_item_type := v_item.type;
        v_item_id := v_item.id;
        v_item_qty := COALESCE(v_item.qty, 1);
        v_performer_id := v_item.performer_id;

        IF v_item_type = 'service' THEN
            SELECT COALESCE(bsp.custom_price, s.base_price), s.name, s.default_commission_pct 
            INTO v_item_price, v_item_name, v_item_commission_pct
            FROM services s
            LEFT JOIN branch_service_prices bsp ON bsp.service_id = s.id AND bsp.branch_id = p_branch_id
            WHERE s.id = v_item_id;

        ELSIF v_item_type = 'product' THEN
            SELECT retail_price, name INTO v_item_price, v_item_name FROM products WHERE id = v_item_id;

            -- Trừ tồn kho thực tế
            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand - v_item_qty,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = p_branch_id AND product_id = v_item_id
            RETURNING stock_on_hand INTO v_stock_curr.stock_on_hand;

            -- Ghi sổ cái xuất nhập tồn kho
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
                v_item_id,
                'sale_out',
                v_sale_id,
                -v_item_qty,
                v_stock_curr.stock_on_hand + v_item_qty,
                v_stock_curr.stock_on_hand,
                format('Xuất bán đơn hàng #%s', v_invoice_number),
                p_cashier_staff_id
            );

        ELSIF v_item_type = 'package' THEN
            SELECT name, package_price, total_sessions, service_id
            INTO v_course_pkg
            FROM packages
            WHERE id = v_item_id;

            v_item_name := v_course_pkg.name;
            v_item_price := v_course_pkg.package_price;

            -- TỰ ĐỘNG KHỞI TẠO THẺ LIỆU TRÌNH MỚI CHO KHÁCH (CHƯA TRỪ BUỔI ĐẦU TIÊN!)
            INSERT INTO customer_courses (
                organization_id,
                customer_id,
                package_id,
                service_id,
                sale_id,
                sold_branch_id,
                allow_inter_branch,
                total_sessions,
                used_sessions,
                expiry_date,
                status
            ) VALUES (
                p_org_id,
                p_customer_id,
                v_item_id,
                v_course_pkg.service_id,
                v_sale_id,
                p_branch_id,
                TRUE,
                v_course_pkg.total_sessions * v_item_qty,
                0, -- Bắt đầu bằng 0 buổi đã dùng
                CURRENT_DATE + INTERVAL '365 days',
                'active'
            )
            RETURNING id INTO v_course_id;
        END IF;

        -- Ghi bản ghi chi tiết sale_items (Snapshot giá và hoa hồng KTV)
        INSERT INTO sale_items (
            sale_id,
            item_type,
            item_ref_id,
            item_name,
            unit_price,
            quantity,
            line_discount,
            line_total,
            performer_staff_id,
            commission_pct,
            commission_amount
        ) VALUES (
            v_sale_id,
            v_item_type,
            v_item_id,
            v_item_name,
            v_item_price,
            v_item_qty,
            0,
            v_item_price * v_item_qty,
            v_performer_id,
            v_item_commission_pct,
            ROUND((v_item_price * v_item_qty * v_item_commission_pct) / 100.0)
        );
    END LOOP;

    -- 6. GHI PHIẾU THU TIỀN (NẾU CÓ TIỀN THỰC THU HOẶC TIỀN CỌC)
    IF (p_paid_amount + COALESCE(p_use_deposit_amount, 0)) > 0 THEN
        INSERT INTO payments (
            organization_id,
            branch_id,
            customer_id,
            payment_number,
            amount,
            payment_method,
            payment_type,
            received_by_staff_id,
            note
        ) VALUES (
            p_org_id,
            p_branch_id,
            p_customer_id,
            v_payment_number,
            p_paid_amount + COALESCE(p_use_deposit_amount, 0),
            p_payment_method,
            'sale',
            p_cashier_staff_id,
            format('Thu tiền đơn hàng #%s', v_invoice_number)
        )
        RETURNING id INTO v_payment_id;

        INSERT INTO payment_allocations (payment_id, sale_id, amount_allocated)
        VALUES (v_payment_id, v_sale_id, p_paid_amount + COALESCE(p_use_deposit_amount, 0));
    END IF;

    -- 7. CẬP NHẬT CÔNG NỢ & TỔNG CHI TIÊU KHÁCH HÀNG
    UPDATE customers
    SET total_spent = total_spent + v_final_total,
        debt_balance = debt_balance + v_debt_amount,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_customer_id;

    -- 8. NẾU CHECKOUT TỪ LỊCH HẸN: ĐỔI TRẠNG THÁI LỊCH SANG 'completed'
    IF p_appointment_id IS NOT NULL THEN
        UPDATE appointments
        SET status = 'completed',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_appointment_id AND organization_id = p_org_id;

        INSERT INTO appointment_events (
            appointment_id,
            event_type,
            actor_staff_id,
            from_status,
            to_status,
            notes
        ) VALUES (
            p_appointment_id,
            'status_changed',
            p_cashier_staff_id,
            'confirmed',
            'completed',
            format('Hoàn tất và xuất hóa đơn #%s tại quầy thu ngân', v_invoice_number)
        );
    END IF;

    -- TRẢ KẾT QUẢ THÀNH CÔNG VỚI ĐẦY ĐỦ THÔNG TIN BÁN HÀNG
    RETURN jsonb_build_object(
        'success', TRUE,
        'sale_id', v_sale_id,
        'invoice_no', v_invoice_number,
        'subtotal', v_subtotal,
        'discount_amount', v_total_discount,
        'total_amount', v_final_total,
        'paid_amount', p_paid_amount + COALESCE(p_use_deposit_amount, 0),
        'debt_amount', v_debt_amount,
        'message', 'Thanh toán đơn hàng và hạch toán toàn vẹn thành công.'
    );
END;
$$;
