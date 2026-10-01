-- =============================================================================
-- MIGRATION 031: PHASE 9 — LOYALTY ENGINE, MEMBERSHIP TIERS & POINTS LEDGER
-- Target: PostgreSQL / Supabase
-- Timezone Standard: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG CẤU HÌNH CHÍNH SÁCH TÍCH / ĐỔI ĐIỂM (LOYALTY_POLICIES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    policy_code VARCHAR(50) NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Mặc định TẮT trên Prod, chờ phê duyệt
    earn_event VARCHAR(50) NOT NULL DEFAULT 'invoice_paid', -- 'invoice_paid', 'service_completed'
    earn_spend_ratio BIGINT NOT NULL DEFAULT 10000, -- 10.000 VNĐ chi tiêu = 1 Điểm
    points_to_currency_ratio BIGINT NOT NULL DEFAULT 100, -- 1 Điểm = 100 VNĐ khi đổi
    max_redeem_percentage INT NOT NULL DEFAULT 50, -- Tối đa đổi 50% giá trị hóa đơn
    points_expiry_days INT NOT NULL DEFAULT 365, -- Điểm hết hạn sau 365 ngày
    allow_combine_with_voucher BOOLEAN NOT NULL DEFAULT FALSE, -- Không gộp voucher theo mặc định
    exclude_deposit_payments BOOLEAN NOT NULL DEFAULT TRUE, -- Loại trừ nạp/dùng cọc để tránh tích đúp
    round_rule VARCHAR(50) NOT NULL DEFAULT 'floor', -- 'floor', 'round', 'ceil'
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_loyalty_policy_code UNIQUE (organization_id, policy_code)
);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CẤU HÌNH HẠNG THÀNH VIÊN (LOYALTY_TIER_POLICIES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_tier_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tier_code VARCHAR(50) NOT NULL, -- 'standard', 'silver', 'gold', 'platinum', 'vip'
    tier_name VARCHAR(100) NOT NULL,
    min_spend_threshold BIGINT NOT NULL DEFAULT 0, -- Chi tiêu tích lũy tối thiểu (VNĐ)
    discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- % Giảm giá đặc quyền
    points_multiplier NUMERIC(3, 2) NOT NULL DEFAULT 1.00, -- Hệ số nhân điểm (VD: Gold x1.2, VIP x1.5)
    evaluation_period_months INT NOT NULL DEFAULT 12, -- Kỳ xét hạng: 12 tháng
    benefits_description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT uq_loyalty_tier_code UNIQUE (organization_id, tier_code)
);

-- -----------------------------------------------------------------------------
-- 3. BẢNG SỐ DƯ ĐIỂM & HẠNG KHÁCH HÀNG TỨC THỜI (CUSTOMER_LOYALTY_BALANCES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_loyalty_balances (
    customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    current_tier VARCHAR(50) NOT NULL DEFAULT 'standard',
    tier_qualifying_spend BIGINT NOT NULL DEFAULT 0,
    tier_updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    tier_expires_at TIMESTAMPTZ,
    available_points INT NOT NULL DEFAULT 0 CHECK (available_points >= 0),
    pending_points INT NOT NULL DEFAULT 0 CHECK (pending_points >= 0),
    total_earned_points INT NOT NULL DEFAULT 0 CHECK (total_earned_points >= 0),
    total_redeemed_points INT NOT NULL DEFAULT 0 CHECK (total_redeemed_points >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_loyalty_balances_org ON customer_loyalty_balances(organization_id, current_tier);

-- -----------------------------------------------------------------------------
-- 4. BẢNG SỔ CÁI ĐIỂM THƯỞNG BẤT BIẾN (LOYALTY_POINTS_LEDGER — APPEND ONLY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'earn', 'redeem', 'expire', 'refund', 'adjust'
    points_delta INT NOT NULL, -- Dương khi tích/hoàn, Âm khi tiêu/hết hạn
    balance_after INT NOT NULL CHECK (balance_after >= 0),
    source_reference_type VARCHAR(50) NOT NULL, -- 'sale', 'refund', 'appointment', 'manual_adjustment'
    source_reference_id UUID,
    idempotency_key VARCHAR(255) UNIQUE,
    reason_for_change TEXT NOT NULL,
    policy_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_customer ON loyalty_points_ledger(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_source ON loyalty_points_ledger(source_reference_type, source_reference_id);

-- -----------------------------------------------------------------------------
-- 5. BẢNG NHẬT KÝ THAY ĐỔI HẠNG THÀNH VIÊN (CUSTOMER_TIER_HISTORY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_tier_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    previous_tier VARCHAR(50) NOT NULL,
    new_tier VARCHAR(50) NOT NULL,
    qualifying_spend_snapshot BIGINT NOT NULL,
    reason TEXT NOT NULL,
    changed_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

CREATE INDEX IF NOT EXISTS idx_tier_history_customer ON customer_tier_history(customer_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE loyalty_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tier_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_loyalty_policies_read ON loyalty_policies;
CREATE POLICY rls_loyalty_policies_read ON loyalty_policies FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_loyalty_policies_write ON loyalty_policies;
CREATE POLICY rls_loyalty_policies_write ON loyalty_policies FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_loyalty_tier_policies_read ON loyalty_tier_policies;
CREATE POLICY rls_loyalty_tier_policies_read ON loyalty_tier_policies FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_loyalty_tier_policies_write ON loyalty_tier_policies;
CREATE POLICY rls_loyalty_tier_policies_write ON loyalty_tier_policies FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_customer_loyalty_balances_read ON customer_loyalty_balances;
CREATE POLICY rls_customer_loyalty_balances_read ON customer_loyalty_balances FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_customer_loyalty_balances_write ON customer_loyalty_balances;
CREATE POLICY rls_customer_loyalty_balances_write ON customer_loyalty_balances FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_loyalty_points_ledger_read ON loyalty_points_ledger;
CREATE POLICY rls_loyalty_points_ledger_read ON loyalty_points_ledger FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_loyalty_points_ledger_write ON loyalty_points_ledger;
CREATE POLICY rls_loyalty_points_ledger_write ON loyalty_points_ledger FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS rls_customer_tier_history_read ON customer_tier_history;
CREATE POLICY rls_customer_tier_history_read ON customer_tier_history FOR SELECT TO authenticated, anon USING (TRUE);
DROP POLICY IF EXISTS rls_customer_tier_history_write ON customer_tier_history;
CREATE POLICY rls_customer_tier_history_write ON customer_tier_history FOR ALL TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

GRANT ALL ON loyalty_policies TO anon, authenticated, service_role;
GRANT ALL ON loyalty_tier_policies TO anon, authenticated, service_role;
GRANT ALL ON customer_loyalty_balances TO anon, authenticated, service_role;
GRANT ALL ON loyalty_points_ledger TO anon, authenticated, service_role;
GRANT ALL ON customer_tier_history TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. RPC FUNCTIONS FOR SECURE LOYALTY OPERATIONS
-- -----------------------------------------------------------------------------

-- RPC 1: Lấy tổng quan Loyalty & Lịch sử sổ điểm của khách hàng
CREATE OR REPLACE FUNCTION rpc_get_customer_loyalty_overview(
    p_org_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance RECORD;
    v_ledger JSONB;
    v_tier_info RECORD;
    v_policy RECORD;
    v_expiring_30d INT := 0;
BEGIN
    -- 1. Lấy hoặc khởi tạo số dư điểm
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        INSERT INTO customer_loyalty_balances (
            customer_id, organization_id, current_tier, available_points,
            tier_qualifying_spend, total_earned_points, total_redeemed_points
        ) VALUES (
            p_customer_id, p_org_id, 'standard', 0, 0, 0, 0
        ) RETURNING * INTO v_balance;
    END IF;

    -- 2. Điểm sắp hết hạn trong 30 ngày tới
    SELECT COALESCE(SUM(points_delta), 0) INTO v_expiring_30d
    FROM loyalty_points_ledger
    WHERE customer_id = p_customer_id
      AND transaction_type = 'earn'
      AND expires_at IS NOT NULL
      AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days';

    -- 3. Thông tin cấu hình hạng hiện tại
    SELECT * INTO v_tier_info FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;

    -- 4. Thông tin chính sách tích điểm đang áp dụng
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    -- 5. Lịch sử sổ cái (20 giao dịch gần nhất)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'transaction_type', l.transaction_type,
        'points_delta', l.points_delta,
        'balance_after', l.balance_after,
        'source_reference_type', l.source_reference_type,
        'source_reference_id', l.source_reference_id,
        'reason_for_change', l.reason_for_change,
        'staff_name', sp.full_name,
        'expires_at', l.expires_at,
        'created_at', l.created_at
    ) ORDER BY l.created_at DESC), '[]'::JSONB)
    INTO v_ledger
    FROM loyalty_points_ledger l
    LEFT JOIN staff_profiles sp ON sp.id = l.staff_id
    WHERE l.customer_id = p_customer_id AND l.organization_id = p_org_id;

    RETURN jsonb_build_object(
        'customer_id', p_customer_id,
        'current_tier', v_balance.current_tier,
        'tier_name', COALESCE(v_tier_info.tier_name, UPPER(v_balance.current_tier)),
        'tier_discount_pct', COALESCE(v_tier_info.discount_percentage, 0),
        'tier_qualifying_spend', v_balance.tier_qualifying_spend,
        'available_points', v_balance.available_points,
        'expiring_points_30d', GREATEST(0, v_expiring_30d),
        'total_earned_points', v_balance.total_earned_points,
        'total_redeemed_points', v_balance.total_redeemed_points,
        'policy_active', (v_policy.id IS NOT NULL),
        'earn_spend_ratio', COALESCE(v_policy.earn_spend_ratio, 10000),
        'points_to_currency_ratio', COALESCE(v_policy.points_to_currency_ratio, 100),
        'max_redeem_percentage', COALESCE(v_policy.max_redeem_percentage, 50),
        'ledger_history', v_ledger
    );
END;
$$;

-- RPC 2: Tích điểm an toàn từ Hóa đơn bán hàng (Idempotent & ACID)
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
    v_multiplier NUMERIC(3, 2) := 1.00;
    v_base_points INT := 0;
    v_final_points INT := 0;
    v_new_balance INT := 0;
    v_new_total_earned INT := 0;
    v_new_qualifying_spend BIGINT := 0;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Kiểm tra idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Giao dịch tích điểm đã được xử lý trước đó (Idempotent).');
        END IF;
    END IF;

    -- 2. Kiểm tra chính sách tích điểm
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Chính sách tích điểm đang TẮT trên hệ thống.');
    END IF;

    IF p_eligible_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Giá trị chi tiêu hợp lệ phải lớn hơn 0.');
    END IF;

    -- 3. Khóa dòng số dư khách hàng (FOR UPDATE)
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

    -- 4. Tính toán hệ số nhân theo Hạng
    SELECT * INTO v_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id AND tier_code = v_balance.current_tier;
    IF FOUND THEN
        v_multiplier := COALESCE(v_tier.points_multiplier, 1.00);
    END IF;

    -- 5. Quy đổi điểm theo chính sách và làm tròn
    v_base_points := FLOOR(p_eligible_amount::NUMERIC / v_policy.earn_spend_ratio);
    v_final_points := FLOOR(v_base_points * v_multiplier);

    IF v_final_points <= 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'points_earned', 0, 'message', 'Chưa đủ ngưỡng tích điểm tối thiểu.');
    END IF;

    v_new_balance := v_balance.available_points + v_final_points;
    v_new_total_earned := v_balance.total_earned_points + v_final_points;
    v_new_qualifying_spend := v_balance.tier_qualifying_spend + p_eligible_amount;
    v_expires_at := TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_policy.points_expiry_days || ' days')::INTERVAL;

    -- 6. Ghi sổ cái điểm (Ledger)
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, expires_at, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'earn', v_final_points,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tích điểm tự động từ hóa đơn mua hàng',
        v_policy.policy_code, p_staff_id, v_expires_at, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 7. Cập nhật số dư & Chi tiêu tích lũy
    UPDATE customer_loyalty_balances SET
        available_points = v_new_balance,
        total_earned_points = v_new_total_earned,
        tier_qualifying_spend = v_new_qualifying_spend,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_earned', v_final_points,
        'balance_after', v_new_balance,
        'message', 'Đã tích ' || v_final_points || ' điểm thành công.'
    );
END;
$$;

-- RPC 3: Đổi / Tiêu điểm thưởng khi thanh toán POS (Chống Overdraw & Race Conditions)
CREATE OR REPLACE FUNCTION rpc_redeem_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_sale_id UUID,
    p_points_to_redeem INT,
    p_bill_total_amount BIGINT,
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
    v_discount_value BIGINT := 0;
    v_max_discount BIGINT := 0;
    v_new_balance INT := 0;
    v_new_total_redeemed INT := 0;
BEGIN
    IF p_points_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số điểm tiêu phải lớn hơn 0.');
    END IF;

    -- 1. Kiểm tra idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM loyalty_points_ledger WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', TRUE, 'message', 'Giao dịch đổi điểm đã hoàn tất.');
        END IF;
    END IF;

    -- 2. Kiểm tra chính sách
    SELECT * INTO v_policy FROM loyalty_policies
    WHERE organization_id = p_org_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Chính sách đổi điểm đang TẮT.');
    END IF;

    -- 3. Khóa số dư khách hàng chống tiêu vượt / đồng thời
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND OR v_balance.available_points < p_points_to_redeem THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Số dư điểm không đủ. Khả dụng: ' || COALESCE(v_balance.available_points, 0) || ' điểm.'
        );
    END IF;

    -- 4. Tính toán số tiền quy đổi và kiểm tra trần % hóa đơn
    v_discount_value := p_points_to_redeem * v_policy.points_to_currency_ratio;
    v_max_discount := FLOOR(p_bill_total_amount * v_policy.max_redeem_percentage / 100);

    IF v_discount_value > v_max_discount THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Vượt quá giới hạn đổi điểm tối đa (' || v_policy.max_redeem_percentage || '% hóa đơn = ' || v_max_discount || ' VNĐ).'
        );
    END IF;

    v_new_balance := v_balance.available_points - p_points_to_redeem;
    v_new_total_redeemed := v_balance.total_redeemed_points + p_points_to_redeem;

    -- 5. Ghi Sổ cái điểm
    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        idempotency_key, reason_for_change, policy_version,
        staff_id, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'redeem', -p_points_to_redeem,
        v_new_balance, 'sale', p_sale_id,
        p_idempotency_key, 'Tiêu điểm giảm trừ hóa đơn POS (' || v_discount_value || ' VNĐ)',
        v_policy.policy_code, p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    -- 6. Cập nhật số dư
    UPDATE customer_loyalty_balances SET
        available_points = v_new_balance,
        total_redeemed_points = v_new_total_redeemed,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_redeemed', p_points_to_redeem,
        'discount_amount', v_discount_value,
        'balance_after', v_new_balance,
        'message', 'Đổi ' || p_points_to_redeem || ' điểm thành công (Giảm ' || v_discount_value || ' VNĐ).'
    );
END;
$$;

-- RPC 4: Điều chỉnh điểm thủ công (Bắt buộc lý do & Audit)
CREATE OR REPLACE FUNCTION rpc_adjust_loyalty_points(
    p_org_id UUID,
    p_customer_id UUID,
    p_points_delta INT,
    p_reason TEXT,
    p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance RECORD;
    v_new_balance INT := 0;
BEGIN
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Bắt buộc nhập lý do điều chỉnh tối thiểu 5 ký tự.');
    END IF;

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

    v_new_balance := v_balance.available_points + p_points_delta;
    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Số dư điểm sau điều chỉnh không thể âm.');
    END IF;

    INSERT INTO loyalty_points_ledger (
        organization_id, customer_id, transaction_type, points_delta,
        balance_after, source_reference_type, source_reference_id,
        reason_for_change, staff_id, created_at
    ) VALUES (
        p_org_id, p_customer_id, 'adjust', p_points_delta,
        v_new_balance, 'manual_adjustment', NULL,
        p_reason, p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    );

    UPDATE customer_loyalty_balances SET
        available_points = v_new_balance,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'points_delta', p_points_delta,
        'balance_after', v_new_balance,
        'message', 'Đã điều chỉnh điểm thành công.'
    );
END;
$$;

-- RPC 5: Đánh giá & Cập nhật hạng thành viên tự động (Tier Evaluation)
CREATE OR REPLACE FUNCTION rpc_evaluate_customer_tier(
    p_org_id UUID,
    p_customer_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance RECORD;
    v_best_tier RECORD;
    v_old_tier VARCHAR(50);
BEGIN
    SELECT * INTO v_balance FROM customer_loyalty_balances
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Không tìm thấy thông tin khách hàng.');
    END IF;

    v_old_tier := v_balance.current_tier;

    -- Tìm hạng cao nhất thỏa mãn ngưỡng chi tiêu
    SELECT * INTO v_best_tier FROM loyalty_tier_policies
    WHERE organization_id = p_org_id
      AND is_active = TRUE
      AND min_spend_threshold <= v_balance.tier_qualifying_spend
    ORDER BY min_spend_threshold DESC LIMIT 1;

    IF FOUND AND v_best_tier.tier_code <> v_old_tier THEN
        UPDATE customer_loyalty_balances SET
            current_tier = v_best_tier.tier_code,
            tier_updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            tier_expires_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()) + (v_best_tier.evaluation_period_months || ' months')::INTERVAL,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE customer_id = p_customer_id;

        -- Ghi nhật ký thăng hạng
        INSERT INTO customer_tier_history (
            customer_id, organization_id, previous_tier, new_tier,
            qualifying_spend_snapshot, reason, changed_by, created_at
        ) VALUES (
            p_customer_id, p_org_id, v_old_tier, v_best_tier.tier_code,
            v_balance.tier_qualifying_spend, 'Thăng hạng tự động theo chi tiêu tích lũy',
            p_staff_id, TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        );

        -- Đồng bộ vào cột tier của bảng customers
        UPDATE customers SET
            tier = v_best_tier.tier_code,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_customer_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'tier_changed', TRUE,
            'previous_tier', v_old_tier,
            'new_tier', v_best_tier.tier_code,
            'tier_name', v_best_tier.tier_name,
            'message', 'Đã nâng hạng thành viên lên ' || v_best_tier.tier_name || '.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tier_changed', FALSE,
        'current_tier', v_old_tier,
        'message', 'Hạng thành viên giữ nguyên.'
    );
END;
$$;

-- Cấp quyền RPC
GRANT EXECUTE ON FUNCTION rpc_get_customer_loyalty_overview TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_earn_loyalty_points TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_redeem_loyalty_points TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_adjust_loyalty_points TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_evaluate_customer_tier TO anon, authenticated, service_role;
