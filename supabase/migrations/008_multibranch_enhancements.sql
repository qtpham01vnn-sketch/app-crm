-- =============================================================================
-- MIGRATION 008: MULTI-BRANCH DATA SCOPING & SERVER-SIDE VALIDATION ENHANCEMENTS
-- Reference: Multi-branch Master Plan & Security Verification
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- 1. BỔ SUNG TRƯỜNG CHI NHÁNH & LIÊN CHI NHÁNH CHO SỔ LIỆU TRÌNH (CUSTOMER_COURSES)
ALTER TABLE customer_courses
ADD COLUMN IF NOT EXISTS sold_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS allow_inter_branch BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN customer_courses.sold_branch_id IS 'Chi nhánh phát sinh bán gói liệu trình';
COMMENT ON COLUMN customer_courses.allow_inter_branch IS 'Cờ cho phép thực hiện dịch vụ trừ buổi tại các chi nhánh khác trong chuỗi';

-- 2. BỔ SUNG PHẠM VI CHI NHÁNH ÁP DỤNG CHO VOUCHER / KHUYẾN MÃI (PROMOTIONS)
ALTER TABLE promotions
ADD COLUMN IF NOT EXISTS applicable_branch_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN promotions.applicable_branch_ids IS 'Danh sách UUID chi nhánh áp dụng ({}=Toàn chuỗi)';

-- 3. FUNCTION & RPC: KIỂM TRA TÍNH HỢP LỆ CỦA VOUCHER PHÍA SERVER (SERVER-SIDE VALIDATION)
CREATE OR REPLACE FUNCTION rpc_validate_promo(
    p_org_id UUID,
    p_branch_id UUID,
    p_code TEXT,
    p_subtotal BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_promo RECORD;
    v_discount BIGINT := 0;
BEGIN
    -- Tìm mã khuyến mãi theo mã code và org
    SELECT * INTO v_promo
    FROM promotions
    WHERE organization_id = p_org_id
      AND UPPER(code) = UPPER(TRIM(p_code))
      AND is_active = TRUE
      AND CURRENT_DATE BETWEEN start_date AND end_date;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', 'Mã voucher không tồn tại, đã hết hạn hoặc chưa kích hoạt.'
        );
    END IF;

    -- Kiểm tra giới hạn lượt dùng
    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', 'Mã voucher đã hết lượt sử dụng.'
        );
    END IF;

    -- Kiểm tra phạm vi chi nhánh (Nếu có khai báo applicable_branch_ids và không rỗng)
    IF v_promo.applicable_branch_ids IS NOT NULL AND array_length(v_promo.applicable_branch_ids, 1) > 0 THEN
        IF NOT (p_branch_id = ANY(v_promo.applicable_branch_ids)) THEN
            RETURN jsonb_build_object(
                'is_valid', FALSE,
                'message', 'Mã voucher không áp dụng tại chi nhánh này.'
            );
        END IF;
    END IF;

    -- Kiểm tra đơn hàng tối thiểu
    IF p_subtotal < v_promo.min_order_value THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', format('Đơn hàng tối thiểu để áp dụng là %s VNĐ.', v_promo.min_order_value)
        );
    END IF;

    -- Tính mức giảm
    IF v_promo.discount_type = 'percentage' THEN
        v_discount := ROUND((p_subtotal * v_promo.discount_value) / 100.0);
        IF v_promo.max_discount_amount IS NOT NULL AND v_discount > v_promo.max_discount_amount THEN
            v_discount := v_promo.max_discount_amount;
        END IF;
    ELSE
        v_discount := v_promo.discount_value;
    END IF;

    IF v_discount > p_subtotal THEN
        v_discount := p_subtotal;
    END IF;

    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'promo_id', v_promo.id,
        'code', v_promo.code,
        'discount_type', v_promo.discount_type,
        'discount_value', v_promo.discount_value,
        'calculated_discount', v_discount,
        'message', 'Áp dụng voucher thành công.'
    );
END;
$$;

-- 4. FUNCTION & RPC: TRỪ BUỔI LIỆU TRÌNH AN TOÀN VÀ BẤT BIẾN (ACID RPC)
CREATE OR REPLACE FUNCTION rpc_deduct_course_session(
    p_course_id UUID,
    p_branch_id UUID,
    p_staff_id UUID,
    p_sessions INT DEFAULT 1,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_course RECORD;
    v_deduction_id UUID;
BEGIN
    IF p_sessions <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số buổi trừ phải lớn hơn 0.');
    END IF;

    -- Khóa bản ghi customer_course bằng FOR UPDATE để chống Race Condition trừ trùng
    SELECT * INTO v_course
    FROM customer_courses
    WHERE id = p_course_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy hồ sơ thẻ liệu trình.');
    END IF;

    IF v_course.status <> 'active' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Thẻ liệu trình này không ở trạng thái hoạt động.');
    END IF;

    -- Kiểm tra quyền liên chi nhánh
    IF NOT v_course.allow_inter_branch AND v_course.sold_branch_id IS NOT NULL AND v_course.sold_branch_id <> p_branch_id THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Gói liệu trình này chỉ được phép sử dụng tại chi nhánh đã mua.');
    END IF;

    -- Kiểm tra số buổi còn lại
    IF (v_course.total_sessions - v_course.used_sessions) < p_sessions THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Số buổi còn lại trong thẻ không đủ để trừ.');
    END IF;

    -- Ghi sổ cái bất biến session_deductions
    INSERT INTO session_deductions (
        course_id,
        branch_id,
        staff_id,
        sessions_deducted,
        notes,
        performed_at
    ) VALUES (
        p_course_id,
        p_branch_id,
        p_staff_id,
        p_sessions,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_deduction_id;

    -- Cập nhật số buổi đã dùng trong customer_courses
    UPDATE customer_courses
    SET used_sessions = used_sessions + p_sessions,
        status = CASE WHEN (used_sessions + p_sessions) >= total_sessions THEN 'completed' ELSE 'active' END,
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_course_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deduction_id', v_deduction_id,
        'used_sessions', v_course.used_sessions + p_sessions,
        'remaining_sessions', v_course.total_sessions - (v_course.used_sessions + p_sessions),
        'message', 'Trừ buổi liệu trình thành công và đã ghi sổ cái bất biến.'
    );
END;
$$;
