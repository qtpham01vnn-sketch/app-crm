-- =============================================================================
-- TEST SUITE: P5 POS ACID CHECKOUT, INVENTORY DEPLETION & IDEMPOTENCY
-- Target: PostgreSQL / Supabase
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_branch_id UUID;
    v_cust_id UUID;
    v_cashier_id UUID;
    v_svc_id UUID;
    v_prod_id UUID;
    v_pkg_id UUID;
    v_stock_before INT;
    v_stock_after INT;
    v_res_json JSONB;
    v_sale_id UUID;
    v_debt_before BIGINT;
    v_debt_after BIGINT;
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'BẮT ĐẦU TEST: KIỂM THỬ CHECKOUT POS TOÀN VẸN (PHASE P5)';
    RAISE NOTICE '==================================================';

    -- 1. LẤY ID DỮ LIỆU THỰC TẾ
    SELECT organization_id, id INTO v_org_id, v_branch_id FROM branches ORDER BY created_at ASC LIMIT 1;
    SELECT id, debt_balance INTO v_cust_id, v_debt_before FROM customers WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cashier_id FROM staff_profiles WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_svc_id FROM services WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_prod_id FROM products WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_pkg_id FROM packages WHERE organization_id = v_org_id LIMIT 1;

    IF v_org_id IS NULL OR v_branch_id IS NULL OR v_cust_id IS NULL OR v_prod_id IS NULL THEN
        RAISE NOTICE '⚠️ Chưa có đủ dữ liệu mẫu (branches/customers/products) trong DB để test.';
        RETURN;
    END IF;

    -- Đảm bảo có tồn kho cho sản phẩm test
    INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
    VALUES (v_org_id, v_branch_id, v_prod_id, 10)
    ON CONFLICT (branch_id, product_id) DO UPDATE SET stock_on_hand = 10;

    SELECT stock_on_hand INTO v_stock_before FROM inventory_stocks WHERE branch_id = v_branch_id AND product_id = v_prod_id;

    -- BÀI TEST 1: CHECKOUT HỢP LỆ VỚI DỊCH VỤ & SẢN PHẨM (XUẤT TRỪ KHO TỰ ĐỘNG)
    v_res_json := rpc_pos_checkout(
        v_org_id,
        v_branch_id,
        v_cust_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object('type', 'service', 'id', v_svc_id, 'qty', 1),
            jsonb_build_object('type', 'product', 'id', v_prod_id, 'qty', 2)
        ),
        'cash',
        10000000, -- Trả đủ
        NULL,
        0,
        NULL,
        0,
        NULL,
        'Test P5 Checkout Đơn hàng 1',
        'test_idempotency_p5_001'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_sale_id := (v_res_json->>'sale_id')::UUID;
        SELECT stock_on_hand INTO v_stock_after FROM inventory_stocks WHERE branch_id = v_branch_id AND product_id = v_prod_id;
        
        IF v_stock_after = (v_stock_before - 2) THEN
            RAISE NOTICE '✅ TEST 1 PASSED: Checkout thành công và kho đã tự động trừ 2 sản phẩm (Tồn từ % -> %)', v_stock_before, v_stock_after;
        ELSE
            RAISE EXCEPTION '❌ TEST 1 FAILED: Tồn kho không trừ đúng số lượng (Trước: %, Sau: %)', v_stock_before, v_stock_after;
        END IF;
    ELSE
        RAISE EXCEPTION '❌ TEST 1 FAILED: %', v_res_json->>'message';
    END IF;

    -- BÀI TEST 2: CHỐNG BÁN VƯỢT TỒN KHO (INSUFFICIENT STOCK)
    v_res_json := rpc_pos_checkout(
        v_org_id,
        v_branch_id,
        v_cust_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object('type', 'product', 'id', v_prod_id, 'qty', 999) -- Vượt tồn kho
        ),
        'cash',
        10000000
    );

    IF (v_res_json->>'success')::BOOLEAN = FALSE AND (v_res_json->>'conflict_type') = 'insufficient_stock' THEN
        RAISE NOTICE '✅ TEST 2 PASSED: Server đã phát hiện và chặn bán vượt tồn kho thành công! Chi tiết: %', v_res_json->>'message';
    ELSE
        RAISE EXCEPTION '❌ TEST 2 FAILED: Server không chặn được bán vượt tồn kho!';
    END IF;

    -- BÀI TEST 3: BÁN GÓI LIỆU TRÌNH (TỰ ĐỘNG SINH SỔ THẺ, KHÔNG TỰ TRỪ BUỔI)
    IF v_pkg_id IS NOT NULL THEN
        v_res_json := rpc_pos_checkout(
            v_org_id,
            v_branch_id,
            v_cust_id,
            v_cashier_id,
            jsonb_build_array(
                jsonb_build_object('type', 'package', 'id', v_pkg_id, 'qty', 1)
            ),
            'transfer_vietqr',
            10000000
        );

        IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
            DECLARE
                v_course_created RECORD;
            BEGIN
                SELECT * INTO v_course_created 
                FROM customer_courses 
                WHERE sale_id = (v_res_json->>'sale_id')::UUID;

                IF FOUND AND v_course_created.used_sessions = 0 THEN
                    RAISE NOTICE '✅ TEST 3 PASSED: Bán gói liệu trình đã kích hoạt sổ thẻ mới và giữ nguyên used_sessions = 0 (Chưa trừ buổi nào)';
                ELSE
                    RAISE EXCEPTION '❌ TEST 3 FAILED: Sổ thẻ liệu trình không được tạo đúng chuẩn!';
                END IF;
            END;
        END IF;
    END IF;

    -- BÀI TEST 4: CHỐNG XỬ LÝ LẶP BẰNG IDEMPOTENCY KEY
    v_res_json := rpc_pos_checkout(
        v_org_id,
        v_branch_id,
        v_cust_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object('type', 'service', 'id', v_svc_id, 'qty', 1)
        ),
        'cash',
        500000,
        NULL, 0, NULL, 0, NULL,
        'Test Idempotency Replay',
        'test_idempotency_p5_001' -- Gửi lại cùng key với Test 1
    );

    IF (v_res_json->>'is_idempotent_replay')::BOOLEAN = TRUE THEN
        RAISE NOTICE '✅ TEST 4 PASSED: Server tự động nhận diện replay key và không xuất hóa đơn trùng!';
    ELSE
        RAISE EXCEPTION '❌ TEST 4 FAILED: Cơ chế chống xử lý lặp không hoạt động!';
    END IF;

    -- DỌN DẸP DỮ LIỆU TEST
    DELETE FROM sales WHERE idempotency_key LIKE 'test_idempotency_p5_%';
    DELETE FROM inventory_transactions WHERE notes LIKE '%#HD%';
    -- Khôi phục lại tồn kho ban đầu
    UPDATE inventory_stocks SET stock_on_hand = v_stock_before WHERE branch_id = v_branch_id AND product_id = v_prod_id;

    RAISE NOTICE '==================================================';
    RAISE NOTICE '🎉 TẤT CẢ CÁC BÀI TEST P5 POS CHECKOUT & FINANCIAL LEDGER ĐÃ VƯỢT QUA!';
    RAISE NOTICE '==================================================';
END $$;
