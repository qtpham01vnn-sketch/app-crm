-- =============================================================================
-- MIGRATION 035: LOYALTY SERVER-SIDE SECURITY, ACID LOCKING & APPROVAL GUARD
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. ADD APPROVAL FLAG TO LOYALTY POLICIES
ALTER TABLE loyalty_policies ADD COLUMN IF NOT EXISTS is_approved_by_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. HARDENED ACID RPC: EARN LOYALTY POINTS (SERVER-SIDE VALIDATION & CONCURRENCY GUARD)
CREATE OR REPLACE FUNCTION rpc_earn_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_sale_id UUID,
    p_eligible_amount BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_tier RECORD;
    v_balance RECORD;
    v_sale RECORD;
    v_actual_spend BIGINT;
    v_multiplier NUMERIC(3, 2) := 1.00;
    v_base_points INT := 0;
    v_final_points INT := 0;
    v_new_balance INT := 0;
    v_new_total_earned INT := 0;
    v_new_qualifying_spend BIGINT := 0;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Kiểm tra quyền và danh tính người gọi
    IF auth.uid() IS NOT NULL THEN
        IF p_org_id != get_current_user_org_id() THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Không có quyền thao tác trên tổ chức này.');
        END IF;
    END IF;

    -- 2. Kiểm tra cờ chính sách đã được phê duyệt bởi Chủ cơ sở hay chưa
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND OR v_policy.is_approved_by_owner = FALSE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'is_policy_blocked', TRUE,
            'error', 'Chính sách Loyalty chưa được Chủ cơ sở phê duyệt kích hoạt. Giao dịch không tự động tích điểm.'
        );
    END IF;

    -- 3. Bắt buộc có hóa đơn hợp lệ (Không cho phép tích điểm không gắn hóa đơn)
    IF p_sale_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Bắt buộc phải có mã hóa đơn hợp lệ để tích điểm.');
    END IF;

    -- Khóa dòng hóa đơn (FOR UPDATE) để chống race condition
    SELECT * INTO v_sale FROM sales
    WHERE id = p_sale_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn không tồn tại trên hệ thống.');
    END IF;

    -- Đối soát hóa đơn phải thuộc đúng khách hàng
    IF v_sale.customer_id != p_customer_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn không thuộc về khách hàng được chỉ định.');
    END IF;

    -- Đối soát hóa đơn phải ở trạng thái completed
    IF v_sale.status != 'completed' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Hóa đơn chưa hoàn tất thanh toán, không đủ điều kiện tích điểm.');
    END IF;

    -- 4. Chống tích trùng 1 hóa đơn bằng 2 khóa khác nhau hoặc 2 yêu cầu đồng thời
    IF EXISTS (
        SELECT 1 FROM loyalty_points_ledger
        WHERE organization_id = p_org_id
          AND source_reference_type = 'sale'
          AND source_reference_id = p_sale_id
          AND transaction_type = 'earn'
    ) THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Hóa đơn này đã được tích điểm trước đó (Chống tích trùng hóa đơn).');
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Yêu cầu tích điểm đã được xử lý (Idempotent).');
        END IF;
    END IF;

    -- 5. Xác định giá trị chi tiêu hợp lệ từ Server (Không tin p_eligible_amount từ Client)
    v_actual_spend := v_sale.paid_amount;
    IF v_actual_spend <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số tiền thực thu của hóa đơn bằng 0, không thể tích điểm.');
    END IF;

    -- 6. Khóa dòng số dư khách hàng (FOR UPDATE)
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    -- 7. Tính hệ số nhân hạng VIP
    SELECT * INTO v_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;
    IF FOUND THEN
        v_multiplier := COALESCE(v_tier.points_multiplier, 1.00);
    END IF;

    -- 8. Quy đổi điểm & tính số dư sau giao dịch (balance_after)
    v_base_points := FLOOR(v_actual_spend::NUMERIC / v_policy.earn_spend_ratio);
    v_final_points := FLOOR(v_base_points * v_multiplier);

    IF v_final_points <= 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'points_earned', 0, 'message', 'Chưa đủ ngưỡng tích điểm tối thiểu.');
    END IF;

    v_new_balance := v_balance.available_points + v_final_points;
    v_new_total_earned := v_balance.total_earned_points + v_final_points;
    v_new_qualifying_spend := v_balance.tier_qualifying_spend + v_actual_spend;
    v_expires_at := TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_policy.points_expiry_days || ' days')::INTERVAL;

    -- 9. Ghi sổ cái điểm (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, expires_at, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'earn', v_final_points,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tích điểm từ hóa đơn #' || v_sale.invoice_number, v_policy.policy_version,
        p_staff_id, v_expires_at, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 10. Cập nhật số dư tổng hợp
    UPDATE customer_loyalty_balances
    SET available_points = v_new_balance,
        total_earned_points = v_new_total_earned,
        tier_qualifying_spend = v_new_qualifying_spend,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_earned', v_final_points,
        'new_balance', v_new_balance,
        'multiplier_applied', v_multiplier,
        'message', 'Đã tích ' || v_final_points || ' điểm thành công.'
    );
END;
$$;

-- 3. HARDENED RPC: REDEEM LOYALTY POINTS (SERVER-SIDE APPROVAL & OVERDRAW GUARDS)
CREATE OR REPLACE FUNCTION rpc_redeem_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_points_to_redeem INT,
    p_sale_id UUID,
    p_bill_total BIGINT,
    p_idempotency_key VARCHAR,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_balance RECORD;
    v_discount_amount BIGINT;
    v_max_discount BIGINT;
    v_new_balance INT;
    v_new_total_redeemed INT;
BEGIN
    -- 1. Kiểm tra quyền và danh tính
    IF auth.uid() IS NOT NULL THEN
        IF p_org_id != get_current_user_org_id() THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Không có quyền thao tác trên tổ chức này.');
        END IF;
    END IF;

    -- 2. Kiểm tra cờ chính sách
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND OR v_policy.is_approved_by_owner = FALSE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'is_policy_blocked', TRUE,
            'error', 'Chính sách đổi điểm Loyalty chưa được Chủ cơ sở phê duyệt kích hoạt.'
        );
    END IF;

    IF p_points_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số điểm đổi phải lớn hơn 0.');
    END IF;

    -- 3. Khóa dòng số dư (FOR UPDATE)
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND OR v_balance.available_points < p_points_to_redeem THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số dư điểm không đủ để thực hiện đổi điểm.');
    END IF;

    -- 4. Tính toán giá trị giảm trừ & kiểm tra trần % hóa đơn
    v_discount_amount := p_points_to_redeem * v_policy.points_to_currency_ratio;
    v_max_discount := FLOOR(p_bill_total * (v_policy.max_redeem_percentage / 100.0));

    IF v_discount_amount > v_max_discount THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vượt quá giới hạn đổi điểm tối đa (' || v_policy.max_redeem_percentage || '% hóa đơn).');
    END IF;

    v_new_balance := v_balance.available_points - p_points_to_redeem;
    v_new_total_redeemed := v_balance.total_redeemed_points + p_points_to_redeem;

    -- 5. Ghi sổ cái (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'redeem', -p_points_to_redeem,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Đổi điểm thanh toán hóa đơn', v_policy.policy_version,
        p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 6. Cập nhật số dư
    UPDATE customer_loyalty_balances
    SET available_points = v_new_balance,
        total_redeemed_points = v_new_total_redeemed,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_redeemed', p_points_to_redeem,
        'discount_amount', v_discount_amount,
        'new_balance', v_new_balance,
        'message', 'Đổi ' || p_points_to_redeem || ' điểm thành công (Giảm ' || v_discount_amount || ' VNĐ).'
    );
END;
$$;
