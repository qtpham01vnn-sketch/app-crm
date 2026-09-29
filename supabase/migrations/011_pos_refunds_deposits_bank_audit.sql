-- =============================================================================
-- MIGRATION 011: ADVANCED FINANCIAL LEDGER, DEPOSITS, REFUNDS & BANK AUDIT
-- Phase: Master Plan Phase P5 (POS & Hoàn Thiện Sổ Cái Tài Chính)
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. BỔ SUNG TRƯỜNG XÁC THỰC NGÂN HÀNG TRONG BẢNG PAYMENTS
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) NOT NULL DEFAULT 'verified', -- 'pending_verification', 'verified', 'rejected'
ADD COLUMN IF NOT EXISTS verified_by_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bank_ref_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. RPC NẠP TIỀN ĐẶT CỌC / VÍ TRẢ TRƯỚC (CUSTOMER DEPOSITS)
CREATE OR REPLACE FUNCTION rpc_deposit_money(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_amount BIGINT,
    p_payment_method VARCHAR(50), -- 'cash', 'transfer_vietqr', 'card'
    p_staff_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deposit_number VARCHAR(100);
    v_deposit_id UUID;
    v_payment_id UUID;
    v_payment_number VARCHAR(100);
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số tiền nạp cọc phải lớn hơn 0.');
    END IF;

    v_deposit_number := 'PC' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    v_payment_number := 'PT' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Ghi nhận khoản nạp cọc
    INSERT INTO customer_deposits (
        organization_id,
        branch_id,
        customer_id,
        deposit_number,
        total_deposited,
        used_amount,
        status,
        notes,
        created_by_staff_id,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_customer_id,
        v_deposit_number,
        p_amount,
        0,
        'active',
        COALESCE(p_notes, 'Nạp tiền đặt cọc / ví trả trước'),
        p_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_deposit_id;

    -- Ghi phiếu thu tiền vào quỹ
    INSERT INTO payments (
        organization_id,
        branch_id,
        customer_id,
        payment_number,
        amount,
        payment_method,
        payment_type,
        received_by_staff_id,
        verification_status,
        note
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_customer_id,
        v_payment_number,
        p_amount,
        p_payment_method,
        'deposit',
        p_staff_id,
        'verified',
        format('Thu tiền cọc #%s', v_deposit_number)
    )
    RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deposit_id', v_deposit_id,
        'deposit_number', v_deposit_number,
        'amount', p_amount,
        'message', 'Nạp tiền đặt cọc vào tài khoản khách hàng thành công.'
    );
END;
$$;

-- 3. RPC HỦY ĐƠN HÀNG & HOÀN TIỀN CÓ KIỂM SOÁT (SALE REFUND & REVERSAL)
CREATE OR REPLACE FUNCTION rpc_refund_sale(
    p_org_id UUID,
    p_branch_id UUID,
    p_sale_id UUID,
    p_authorized_staff_id UUID,
    p_reason TEXT,
    p_return_stock BOOLEAN DEFAULT TRUE,
    p_refund_method VARCHAR(50) DEFAULT 'cash' -- 'cash', 'transfer', 'deposit_return'
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

    -- 3. Xử lý tồn kho nếu có yêu cầu nhập lại kho (p_return_stock = TRUE)
    IF p_return_stock THEN
        FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id AND item_type = 'product'
        LOOP
            UPDATE inventory_stocks
            SET stock_on_hand = stock_on_hand + v_item.quantity,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE branch_id = v_sale.branch_id AND product_id = v_item.item_ref_id
            RETURNING stock_on_hand INTO v_stock_after;

            -- Ghi sổ cái nhập kho hoàn trả
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

    -- 4. Thu hồi các thẻ liệu trình chưa dùng đã tạo từ đơn này
    DELETE FROM customer_courses WHERE sale_id = p_sale_id AND used_sessions = 0;

    -- 5. Tính toán số tiền hoàn thực tế & hoàn nợ
    IF (v_sale.total_amount - v_sale.paid_amount) > 0 THEN
        v_debt_to_reduce := v_sale.total_amount - v_sale.paid_amount;
    END IF;
    v_actual_cash_refund := v_sale.paid_amount;

    -- Giảm công nợ và chi tiêu khách hàng
    UPDATE customers
    SET total_spent = GREATEST(0, total_spent - v_sale.total_amount),
        debt_balance = GREATEST(0, debt_balance - v_debt_to_reduce),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = v_sale.customer_id;

    -- 6. Ghi chứng từ hoàn tiền
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
        v_sale.total_amount,
        p_refund_method,
        p_reason,
        p_return_stock,
        p_authorized_staff_id,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_refund_id;

    -- 7. Đổi trạng thái Sale sang 'refunded'
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
        'stock_returned', p_return_stock,
        'message', 'Đã hủy hóa đơn, hoàn tiền và cập nhật sổ cái tài chính thành công.'
    );
END;
$$;

-- 4. RPC XÁC NHẬN TIỀN CHUYỂN KHOẢN VIETQR (AUDITED BANK CONFIRMATION)
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

    UPDATE payments
    SET verification_status = 'verified',
        verified_by_staff_id = p_staff_id,
        bank_ref_code = COALESCE(p_bank_ref_code, bank_ref_code),
        verified_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        note = CASE WHEN p_notes IS NOT NULL THEN COALESCE(note, '') || ' | ' || p_notes ELSE note END
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', p_payment_id,
        'message', 'Đã xác nhận khớp tiền tài khoản ngân hàng thành công.'
    );
END;
$$;
