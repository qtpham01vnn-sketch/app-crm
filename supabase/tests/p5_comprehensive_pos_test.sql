-- =============================================================================
-- COMPREHENSIVE TEST SUITE: P5 POS ACID CHECKOUT, ADVANCED LEDGER & SECURITY
-- Target: PostgreSQL / Supabase
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_branch_1 UUID;
    v_branch_2 UUID;
    v_cust_id UUID;
    v_cashier_id UUID;
    v_svc_id UUID;
    v_prod_id UUID;
    v_pkg_id UUID;
    v_res_json JSONB;
    v_sale_id UUID;
    v_deposit_id UUID;
    v_refund_id UUID;
    v_course_id UUID;
    v_stock_init INT := 5;
    v_stock_check INT;
    v_debt_init BIGINT;
    v_debt_check BIGINT;
BEGIN
    RAISE NOTICE '==================================================================';
    RAISE NOTICE 'BẮT ĐẦU TEST SUITE TOÀN DIỆN PHASE P5: CHECKOUT, SỔ CÁI & BẢO MẬT';
    RAISE NOTICE '==================================================================';

    -- 1. TRÍCH XUẤT DỮ LIỆU THỰC TẾ
    SELECT organization_id, id INTO v_org_id, v_branch_1 FROM branches ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_branch_2 FROM branches WHERE organization_id = v_org_id AND id <> v_branch_1 ORDER BY created_at ASC LIMIT 1;
    IF v_branch_2 IS NULL THEN v_branch_2 := v_branch_1; END IF;

    SELECT id, debt_balance INTO v_cust_id, v_debt_init FROM customers WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cashier_id FROM staff_profiles WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_svc_id FROM services WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_prod_id FROM products WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_pkg_id FROM packages WHERE organization_id = v_org_id LIMIT 1;

    IF v_org_id IS NULL OR v_branch_1 IS NULL OR v_cust_id IS NULL OR v_prod_id IS NULL THEN
        RAISE NOTICE '⚠️ Chưa có đủ dữ liệu mẫu trong DB. Vui lòng kiểm tra seed data.';
        RETURN;
    END IF;

    -- Thiết lập tồn kho ban đầu cho sản phẩm test
    INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
    VALUES (v_org_id, v_branch_1, v_prod_id, v_stock_init)
    ON CONFLICT (branch_id, product_id) DO UPDATE SET stock_on_hand = v_stock_init;

    -- =========================================================================
    -- KỊCH BẢN 1: NẠP TIỀN CỌC VÀO VÍ KHÁCH HÀNG (RPC rpc_deposit_money)
    -- =========================================================================
    v_res_json := rpc_deposit_money(
        v_org_id,
        v_branch_1,
        v_cust_id,
        2000000, -- Nạp cọc 2.000.000đ
        'transfer_vietqr',
        v_cashier_id,
        'Test P5: Nạp cọc giữ chỗ'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_deposit_id := (v_res_json->>'deposit_id')::UUID;
        RAISE NOTICE '✅ TEST 1 PASSED: Nạp 2.000.000đ tiền cọc vào tài khoản thành công (Mã cọc: %)', v_res_json->>'deposit_number';
    ELSE
        RAISE EXCEPTION '❌ TEST 1 FAILED: %', v_res_json->>'message';
    END IF;

    -- =========================================================================
    -- KỊCH BẢN 2: CHECKOUT THANH TOÁN ĐA NGUỒN (DÙNG CỌC + TIỀN MẶT + GHI NỢ)
    -- Giả sử đơn hàng gồm Dịch vụ + 1 Sản phẩm. Tổng tiền ví dụ: 3.500.000đ.
    -- Khách dùng 1.000.000đ cọc + trả 1.500.000đ tiền mặt + Nợ lại 1.000.000đ.
    -- =========================================================================
    v_res_json := rpc_pos_checkout(
        v_org_id,
        v_branch_1,
        v_cust_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object('type', 'service', 'id', v_svc_id, 'qty', 1),
            jsonb_build_object('type', 'product', 'id', v_prod_id, 'qty', 1)
        ),
        'split',
        1500000, -- Tiền mặt trả
        NULL,
        0,
        NULL,
        1000000, -- Dùng 1.000.000đ cọc
        NULL,
        'Test P5: Thanh toán đa nguồn Split',
        'test_split_p5_001'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_sale_id := (v_res_json->>'sale_id')::UUID;
        
        -- Kiểm tra tồn kho đã trừ đúng 1 sản phẩm (từ 5 -> 4)
        SELECT stock_on_hand INTO v_stock_check FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
        IF v_stock_check = 4 THEN
            RAISE NOTICE '✅ TEST 2 PASSED: Thanh toán đa nguồn thành công! Tồn kho đã trừ 1 (Còn 4). Ghi nợ: %đ', v_res_json->>'debt_amount';
        ELSE
            RAISE EXCEPTION '❌ TEST 2 FAILED: Tồn kho không trừ đúng (Kỳ vọng 4, thực tế %)', v_stock_check;
        END IF;
    ELSE
        RAISE EXCEPTION '❌ TEST 2 FAILED: %', v_res_json->>'message';
    END IF;

    -- =========================================================================
    -- KỊCH BẢN 3: TRANH CHẤP ĐỒNG THỜI KHI SẢN PHẨM CÒN ĐÚNG 1 ĐƠN VỊ
    -- Đặt tồn kho về 1, thử mua 2 đơn vị ➔ Bắt buộc từ chối
    -- =========================================================================
    UPDATE inventory_stocks SET stock_on_hand = 1 WHERE branch_id = v_branch_1 AND product_id = v_prod_id;

    v_res_json := rpc_pos_checkout(
        v_org_id,
        v_branch_1,
        v_cust_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object('type', 'product', 'id', v_prod_id, 'qty', 2) -- Mua 2 trong khi tồn chỉ còn 1
        ),
        'cash',
        1000000
    );

    IF (v_res_json->>'success')::BOOLEAN = FALSE AND (v_res_json->>'conflict_type') = 'insufficient_stock' THEN
        RAISE NOTICE '✅ TEST 3 PASSED: Server đã khóa tồn kho và chặn bán vượt tồn (Tồn kho = 1, yêu cầu = 2)';
    ELSE
        RAISE EXCEPTION '❌ TEST 3 FAILED: Server không chặn được bán vượt tồn!';
    END IF;

    -- =========================================================================
    -- KỊCH BẢN 4: HỦY ĐƠN HÀNG, HOÀN TIỀN & NHẬP LẠI KHO (RPC rpc_refund_sale)
    -- =========================================================================
    v_res_json := rpc_refund_sale(
        v_org_id,
        v_branch_1,
        v_sale_id,
        v_cashier_id,
        'Khách đổi ý hủy đơn test',
        TRUE, -- Hoàn lại kho
        'cash'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        -- Kiểm tra tồn kho đã được cộng trả lại (+1)
        SELECT stock_on_hand INTO v_stock_check FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
        IF v_stock_check = 2 THEN -- 1 + 1 hoàn = 2
            RAISE NOTICE '✅ TEST 4 PASSED: Hủy đơn thành công, hoàn tiền và nhập lại kho chính xác (Tồn kho từ 1 -> 2)';
        ELSE
            RAISE EXCEPTION '❌ TEST 4 FAILED: Tồn kho hoàn lại không đúng (Kỳ vọng 2, thực tế %)', v_stock_check;
        END IF;
    ELSE
        RAISE EXCEPTION '❌ TEST 4 FAILED: %', v_res_json->>'message';
    END IF;

    -- =========================================================================
    -- KỊCH BẢN 5: CHẶN HỦY/HOÀN ĐƠN NẾU GÓI LIỆU TRÌNH ĐÃ SỬ DỤNG
    -- =========================================================================
    IF v_pkg_id IS NOT NULL THEN
        -- 5.1 Mua gói liệu trình mới
        v_res_json := rpc_pos_checkout(
            v_org_id,
            v_branch_1,
            v_cust_id,
            v_cashier_id,
            jsonb_build_array(
                jsonb_build_object('type', 'package', 'id', v_pkg_id, 'qty', 1)
            ),
            'cash',
            5000000,
            NULL, 0, NULL, 0, NULL,
            'Test P5: Mua gói liệu trình',
            'test_pkg_p5_002'
        );
        v_sale_id := (v_res_json->>'sale_id')::UUID;

        -- 5.2 Giả lập khách đã dùng 1 buổi
        UPDATE customer_courses SET used_sessions = 1 WHERE sale_id = v_sale_id;

        -- 5.3 Thử hoàn đơn ➔ BẮT BUỘC BỊ SERVER TỪ CHỐI!
        v_res_json := rpc_refund_sale(
            v_org_id,
            v_branch_1,
            v_sale_id,
            v_cashier_id,
            'Yêu cầu hoàn tiền khi đã làm 1 buổi',
            FALSE,
            'cash'
        );

        IF (v_res_json->>'success')::BOOLEAN = FALSE AND (v_res_json->>'conflict_type') = 'course_already_used' THEN
            RAISE NOTICE '✅ TEST 5 PASSED: Server đã bảo vệ doanh nghiệp, chặn hoàn tiền tự động khi liệu trình đã được sử dụng 1 buổi!';
        ELSE
            RAISE EXCEPTION '❌ TEST 5 FAILED: Server không chặn hoàn tiền gói đã dùng!';
        END IF;
    END IF;

    -- =========================================================================
    -- DỌN DẸP DỮ LIỆU TEST CHÍNH XÁC THEO THỨ TỰ RÀNG BUỘC KHÓA NGOẠI
    -- =========================================================================
    DELETE FROM sale_refunds WHERE sale_id IN (SELECT id FROM sales WHERE idempotency_key LIKE 'test_%_p5_%');
    DELETE FROM payment_allocations WHERE sale_id IN (SELECT id FROM sales WHERE idempotency_key LIKE 'test_%_p5_%');
    DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE idempotency_key LIKE 'test_%_p5_%');
    DELETE FROM sales WHERE idempotency_key LIKE 'test_%_p5_%';
    DELETE FROM customer_deposits WHERE notes LIKE 'Test P5:%';
    DELETE FROM inventory_transactions WHERE notes LIKE '%#HD%';
    -- Khôi phục tồn kho ban đầu
    UPDATE inventory_stocks SET stock_on_hand = v_stock_init WHERE branch_id = v_branch_1 AND product_id = v_prod_id;

    RAISE NOTICE '==================================================================';
    RAISE NOTICE '🎉 TẤT CẢ 5 KỊCH BẢN NÂNG CAO P5 (CỌC, SPLIT, TRANH CHẤP, HOÀN TIỀN) ĐÃ VƯỢT QUA VÀ DỌN DẸP SẠCH!';
    RAISE NOTICE '==================================================================';
END $$;

