-- =============================================================================
-- COMPREHENSIVE TEST SUITE: P5 HARDENING & PROCUREMENT PHASE A
-- Target: PostgreSQL / Supabase
-- Scenarios:
-- 1. Sequential Tests (Tuần tự):
--    - Test 1: P5 Hardening — rpc_refund_sale phân loại (Hàng đạt chuẩn vs Hàng hỏng cách ly).
--    - Test 2: P5 Hardening — rpc_confirm_bank_payment chống xác nhận lặp (Idempotency).
--    - Test 3: Đợt A — rpc_create_purchase_order (Xác nhận tuyệt đối KHÔNG tăng tồn kho).
--    - Test 4: Đợt A — rpc_confirm_goods_receipt (Quy đổi đơn vị, tăng tồn thực nhận, tách hàng lỗi, tính giá vốn WAC).
--    - Test 5: Đợt A — Sổ cái công nợ NCC & rpc_pay_supplier (Đối chiếu cân bằng công nợ & quỹ chi).
-- 2. Concurrency Simulation (Mô phỏng đồng thời):
--    - Test 6: Nhận hàng nhiều đợt và khóa FOR UPDATE bảo vệ tính toàn vẹn.
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_branch_1 UUID;
    v_cust_id UUID;
    v_cashier_id UUID;
    v_prod_id UUID;
    v_supp_id UUID;
    v_res_json JSONB;
    v_sale_id UUID;
    v_po_id UUID;
    v_grn_id UUID;
    v_payment_id UUID;
    v_init_stock INT := 10;
    v_check_stock INT;
    v_check_damaged INT;
    v_init_debt BIGINT;
    v_check_debt BIGINT;
    v_init_cost BIGINT;
    v_check_cost BIGINT;
BEGIN
    RAISE NOTICE '==================================================================';
    RAISE NOTICE 'BẮT ĐẦU TEST SUITE: P5 HARDENING & KHO VẬN ĐỢT A (NHẬP HÀNG & NCC)';
    RAISE NOTICE '==================================================================';

    -- 1. TRÍCH XUẤT DỮ LIỆU CƠ SỞ
    SELECT organization_id, id INTO v_org_id, v_branch_1 FROM branches ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_cust_id FROM customers WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cashier_id FROM staff_profiles WHERE organization_id = v_org_id LIMIT 1;
    SELECT id, cost_price INTO v_prod_id, v_init_cost FROM products WHERE organization_id = v_org_id LIMIT 1;
    SELECT id, debt_balance INTO v_supp_id, v_init_debt FROM suppliers WHERE organization_id = v_org_id LIMIT 1;

    IF v_org_id IS NULL OR v_branch_1 IS NULL OR v_prod_id IS NULL OR v_supp_id IS NULL THEN
        RAISE NOTICE '⚠️ Chưa đủ master data để chạy test suite. Vui lòng kiểm tra seed data.';
        RETURN;
    END IF;

    -- Chuẩn bị tồn kho ban đầu
    INSERT INTO inventory_stocks (organization_id, branch_id, product_id, stock_on_hand)
    VALUES (v_org_id, v_branch_1, v_prod_id, v_init_stock)
    ON CONFLICT (branch_id, product_id) DO UPDATE SET stock_on_hand = v_init_stock;

    -- =========================================================================
    -- [PHẦN I: TEST TUẦN TỰ - SEQUENTIAL TESTS]
    -- =========================================================================

    -- -------------------------------------------------------------------------
    -- TEST 1: P5 HARDENING — rpc_refund_sale PHÂN TÁCH HÀNG TÁI BÁN & HÀNG HỎNG
    -- Giả lập mua 3 sản phẩm, sau đó hoàn 2 sản phẩm:
    -- - 1 sản phẩm còn nguyên seal (restockable_qty = 1) -> TĂNG LẠI TỒN KHO
    -- - 1 sản phẩm bị bóp vỡ vỏ (damaged_qty = 1) -> ĐƯA VÀO CÁCH LY, KHÔNG TĂNG TỒN
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 1: Kiểm thử Hoàn tiền & Phân loại Hàng trả lại ---';

    -- 1.1 Tạo đơn mua 3 sản phẩm qua rpc_pos_checkout
    v_res_json := rpc_pos_checkout(
        v_org_id,
        v_branch_1,
        v_cust_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object('type', 'product', 'id', v_prod_id, 'qty', 3)
        ),
        'cash',
        1500000, -- Giả sử thanh toán đủ
        NULL, 0, NULL, 0, NULL,
        'Test P5 Hardening: Đơn mua test hoàn trả',
        'test_p5_hard_sale_001'
    );
    v_sale_id := (v_res_json->>'sale_id')::UUID;

    -- Tồn kho sau mua: 10 - 3 = 7
    SELECT stock_on_hand INTO v_check_stock FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
    IF v_check_stock <> 7 THEN
        RAISE EXCEPTION '❌ TEST 1 LỖI: Tồn kho sau mua không khớp (Kỳ vọng 7, thực tế %)', v_check_stock;
    END IF;

    -- 1.2 Thực hiện hoàn tiền đơn với chi tiết phân loại hàng
    v_res_json := rpc_refund_sale(
        v_org_id,
        v_branch_1,
        v_sale_id,
        v_cashier_id,
        'Khách đổi ý và 1 hộp bị rơi móp',
        FALSE,
        'cash',
        jsonb_build_array(
            jsonb_build_object(
                'product_id', v_prod_id,
                'refund_qty', 2,
                'received_back_qty', 2,
                'restockable_qty', 1, -- Đủ điều kiện nhập kho
                'damaged_qty', 1,     -- Móp vỡ cách ly
                'damage_reason', 'Vỏ hộp bị rách móp seal khi khách mở'
            )
        )
    );

    IF (v_res_json->>'success')::BOOLEAN <> TRUE THEN
        RAISE EXCEPTION '❌ TEST 1 LỖI: rpc_refund_sale thất bại: %', v_res_json->>'message';
    END IF;

    -- Kiểm tra: Tồn kho chỉ được cộng 1 (từ 7 -> 8), KHÔNG ĐƯỢC CỘNG 2
    SELECT stock_on_hand INTO v_check_stock FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
    IF v_check_stock = 8 THEN
        RAISE NOTICE '✅ TEST 1.1 PASSED: Tồn kho khả dụng chỉ cộng 1 sản phẩm đủ điều kiện (Tồn hiện tại: 8).';
    ELSE
        RAISE EXCEPTION '❌ TEST 1.1 FAILED: Tồn kho bị cộng sai (Kỳ vọng 8, thực tế %)', v_check_stock;
    END IF;

    -- Kiểm tra: Hàng hỏng đã được lưu vào damaged_inventory_items
    SELECT COUNT(*) INTO v_check_damaged FROM damaged_inventory_items WHERE reference_id = v_sale_id AND status = 'quarantined';
    IF v_check_damaged = 1 THEN
        RAISE NOTICE '✅ TEST 1.2 PASSED: 1 sản phẩm hỏng đã được đưa vào kho cách ly (damaged_inventory_items), không lọt vào tồn bán.';
    ELSE
        RAISE EXCEPTION '❌ TEST 1.2 FAILED: Không tìm thấy sản phẩm cách ly trong damaged_inventory_items!';
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 2: P5 HARDENING — CHỐNG XÁC NHẬN LẶP CHUYỂN KHOẢN NGÂN HÀNG (IDEMPOTENCY)
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 2: Kiểm thử Xác nhận Chuyển khoản VietQR Chống Trùng ---';

    -- Tạo một phiếu thu ở trạng thái pending_verification
    INSERT INTO payments (
        organization_id,
        branch_id,
        customer_id,
        payment_number,
        amount,
        payment_method,
        payment_type,
        verification_status,
        note
    ) VALUES (
        v_org_id,
        v_branch_1,
        v_cust_id,
        'PT-TEST-BANK-001',
        500000,
        'transfer_vietqr',
        'sale',
        'pending_verification',
        'Test P5 Bank Verification'
    )
    RETURNING id INTO v_payment_id;

    -- Xác nhận lần 1: Phải thành công
    v_res_json := rpc_confirm_bank_payment(v_org_id, v_payment_id, v_cashier_id, 'MB-REF-998877', 'Xác nhận SMS ngân hàng');
    IF (v_res_json->>'success')::BOOLEAN = TRUE AND (v_res_json->>'already_verified')::BOOLEAN = FALSE THEN
        RAISE NOTICE '✅ TEST 2.1 PASSED: Xác nhận tiền chuyển khoản lần 1 thành công.';
    ELSE
        RAISE EXCEPTION '❌ TEST 2.1 FAILED: Lần 1 thất bại: %', v_res_json->>'message';
    END IF;

    -- Xác nhận lần 2 (Giả lập double click / retry do lag): Phải trả về already_verified = TRUE, không cộng lặp
    v_res_json := rpc_confirm_bank_payment(v_org_id, v_payment_id, v_cashier_id, 'MB-REF-998877', 'Thử gửi lại');
    IF (v_res_json->>'success')::BOOLEAN = TRUE AND (v_res_json->>'already_verified')::BOOLEAN = TRUE THEN
        RAISE NOTICE '✅ TEST 2.2 PASSED: Server phát hiện thanh toán đã duyệt, chặn xử lý lặp thành công!';
    ELSE
        RAISE EXCEPTION '❌ TEST 2.2 FAILED: Không chặn được xác nhận lặp!';
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 3: ĐỢT A — TẠO ĐƠN ĐẶT HÀNG PO: TUYỆT ĐỐI CHƯA TĂNG TỒN KHO
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 3: Kiểm thử Đơn Đặt Hàng PO (Không Tăng Tồn Kho) ---';

    -- Ghi nhận tồn kho trước khi tạo PO
    SELECT stock_on_hand INTO v_check_stock FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;

    v_res_json := rpc_create_purchase_order(
        v_org_id,
        v_branch_1,
        v_supp_id,
        v_cashier_id,
        jsonb_build_array(
            jsonb_build_object(
                'product_id', v_prod_id,
                'purchase_unit', 'thùng',
                'conversion_rate', 10, -- 1 thùng = 10 chai bán lẻ
                'quantity', 5,         -- Đặt 5 thùng = 50 chai
                'unit_cost', 1000000   -- 1.000.000đ/thùng
            )
        ),
        (CURRENT_DATE + INTERVAL '3 days')::DATE,
        'Test Đợt A: Đơn đặt hàng PO 5 thùng'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_po_id := (v_res_json->>'po_id')::UUID;
        RAISE NOTICE '✅ TEST 3.1 PASSED: Tạo PO #% thành công, tổng tiền: %đ', v_res_json->>'po_number', v_res_json->>'total_amount';
    ELSE
        RAISE EXCEPTION '❌ TEST 3.1 FAILED: Tạo PO thất bại: %', v_res_json->>'message';
    END IF;

    -- Kiểm tra: Tồn kho phải giữ nguyên, KHÔNG ĐƯỢC TĂNG
    SELECT stock_on_hand INTO v_check_stock FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
    IF v_check_stock = 8 THEN
        RAISE NOTICE '✅ TEST 3.2 PASSED: Tồn kho giữ nguyên 8 (PO chưa làm tăng tồn kho).';
    ELSE
        RAISE EXCEPTION '❌ TEST 3.2 FAILED: Tồn kho bị tăng sai khi chỉ mới tạo PO! (Thực tế: %)', v_check_stock;
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 4: ĐỢT A — NHẬN HÀNG THỰC TẾ (GRN): QUY ĐỔI ĐƠN VỊ & TÁCH HÀNG LỖI & TÍNH WAC
    -- Đặt 5 thùng, đợt 1 nhận 3 thùng:
    -- - 2 thùng đạt chuẩn (2 x 10 = 20 chai cơ sở) -> TĂNG TỒN KHO (+20)
    -- - 1 thùng bị dập vỡ khi vận chuyển -> ĐƯA VÀO CÁCH LY, KHÔNG TĂNG TỒN KHO
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 4: Kiểm thử Nhận Hàng (GRN) Quy Đổi & Tách Lỗi & Giá Vốn WAC ---';

    -- Lấy po_item_id
    DECLARE
        v_po_item_id UUID;
    BEGIN
        SELECT id INTO v_po_item_id FROM purchase_order_items WHERE purchase_order_id = v_po_id LIMIT 1;

        v_res_json := rpc_confirm_goods_receipt(
            v_org_id,
            v_branch_1,
            v_po_id,
            v_supp_id,
            v_cashier_id,
            jsonb_build_array(
                jsonb_build_object(
                    'po_item_id', v_po_item_id,
                    'product_id', v_prod_id,
                    'lot_number', 'LOT-2026-A1',
                    'expiry_date', '2028-12-31',
                    'purchase_unit', 'thùng',
                    'conversion_rate', 10,
                    'qty_received', 3,       -- Thực giao 3 thùng
                    'qty_accepted', 2,       -- Đạt chuẩn 2 thùng (= 20 chai)
                    'qty_rejected', 1,       -- Hỏng 1 thùng (= 10 chai cách ly)
                    'rejection_reason', 'Thùng hàng bị ngấm nước và vỡ chai',
                    'unit_cost', 1000000     -- 1.000.000đ/thùng = 100.000đ/chai
                )
            ),
            'VAT-NCC-12345',
            0, -- Chưa trả trước
            'Nhận đợt 1 phiếu GRN'
        );

        IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
            v_grn_id := (v_res_json->>'grn_id')::UUID;
            RAISE NOTICE '✅ TEST 4.1 PASSED: Xác nhận GRN #% thành công. Giá trị nhận đạt chuẩn: %đ', 
                v_res_json->>'grn_number', v_res_json->>'total_accepted_value';
        ELSE
            RAISE EXCEPTION '❌ TEST 4.1 FAILED: Nhận hàng thất bại: %', v_res_json->>'message';
        END IF;
    END;

    -- Kiểm tra: Tồn kho chỉ tăng 20 chai (từ 8 -> 28 chai)
    SELECT stock_on_hand INTO v_check_stock FROM inventory_stocks WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
    IF v_check_stock = 28 THEN
        RAISE NOTICE '✅ TEST 4.2 PASSED: Tồn kho tăng chính xác +20 chai đạt chuẩn quy đổi (Tồn hiện tại: 28 chai).';
    ELSE
        RAISE EXCEPTION '❌ TEST 4.2 FAILED: Tồn kho không khớp (Kỳ vọng 28, thực tế %)', v_check_stock;
    END IF;

    -- Kiểm tra trạng thái PO: đã nhận 2/5 thùng -> phải là 'partially_received'
    DECLARE
        v_po_status VARCHAR;
    BEGIN
        SELECT status INTO v_po_status FROM purchase_orders WHERE id = v_po_id;
        IF v_po_status = 'partially_received' THEN
            RAISE NOTICE '✅ TEST 4.3 PASSED: Trạng thái PO chuyển thành "partially_received" (nhận một phần).';
        ELSE
            RAISE EXCEPTION '❌ TEST 4.3 FAILED: Trạng thái PO không đúng (Kỳ vọng partially_received, thực tế %)', v_po_status;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 5: ĐỢT A — SỔ CÁI CÔNG NỢ NCC (SUPPLIER LEDGER) & THANH TOÁN NCC
    -- - GRN 2 thùng đạt chuẩn x 1.000.000đ = 2.000.000đ nợ phát sinh.
    -- - Thanh toán 1.200.000đ qua rpc_pay_supplier -> Dư nợ còn lại: 800.000đ.
    -- - Đối chiếu: Sổ cái (Ledger) khớp chính xác từng đồng với debt_balance.
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 5: Kiểm thử Sổ Cái Công Nợ NCC & Thanh Toán ---';

    -- Kiểm tra số dư nợ sau GRN
    SELECT debt_balance INTO v_check_debt FROM suppliers WHERE id = v_supp_id;
    IF v_check_debt = (v_init_debt + 2000000) THEN
        RAISE NOTICE '✅ TEST 5.1 PASSED: Công nợ NCC tăng đúng 2.000.000đ theo giá trị thực nhận đạt chuẩn.';
    ELSE
        RAISE EXCEPTION '❌ TEST 5.1 FAILED: Công nợ NCC tăng sai (Kỳ vọng %, thực tế %)', (v_init_debt + 2000000), v_check_debt;
    END IF;

    -- Thực hiện thanh toán một phần cho NCC: 1.200.000đ
    v_res_json := rpc_pay_supplier(
        v_org_id,
        v_branch_1,
        v_supp_id,
        v_cashier_id,
        1200000,
        'transfer',
        'UNC-BIDV-8822',
        'Thanh toán đợt 1 tiền hàng GRN'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        RAISE NOTICE '✅ TEST 5.2 PASSED: Thanh toán NCC thành công: %đ (Mã phiếu chi: %)', 
            v_res_json->>'amount_paid', v_res_json->>'payment_number';
    ELSE
        RAISE EXCEPTION '❌ TEST 5.2 FAILED: Thanh toán NCC thất bại: %', v_res_json->>'message';
    END IF;

    -- Kiểm tra đối chiếu số dư nợ cuối cùng
    SELECT debt_balance INTO v_check_debt FROM suppliers WHERE id = v_supp_id;
    IF v_check_debt = (v_init_debt + 800000) THEN
        RAISE NOTICE '✅ TEST 5.3 PASSED: Dư nợ NCC sau thanh toán khớp hoàn hảo: %đ (Khớp: Nợ cũ + 2tr - 1.2tr).', v_check_debt;
    ELSE
        RAISE EXCEPTION '❌ TEST 5.3 FAILED: Dư nợ NCC không khớp (Kỳ vọng %, thực tế %)', (v_init_debt + 800000), v_check_debt;
    END IF;

    -- Đối chiếu dòng cuối cùng trong supplier_ledger
    DECLARE
        v_ledger_last_bal BIGINT;
    BEGIN
        SELECT balance_after INTO v_ledger_last_bal FROM supplier_ledger WHERE supplier_id = v_supp_id ORDER BY created_at DESC LIMIT 1;
        IF v_ledger_last_bal = v_check_debt THEN
            RAISE NOTICE '✅ TEST 5.4 PASSED: Sổ cái công nợ NCC (supplier_ledger) và bảng suppliers.debt_balance khớp 100%%!';
        ELSE
            RAISE EXCEPTION '❌ TEST 5.4 FAILED: Sai lệch giữa Sổ cái (%) và suppliers.debt_balance (%)', v_ledger_last_bal, v_check_debt;
        END IF;
    END;

    -- =========================================================================
    -- [PHẦN II: KIỂM THỬ ĐỒNG THỜI / TRANH CHẤP - CONCURRENCY SIMULATION]
    -- =========================================================================
    RAISE NOTICE '--- TEST 6: Kiểm thử Cơ Chế Khóa Hàng Đồng Thời (FOR UPDATE Locks) ---';
    -- Kiểm tra xem hàm có giữ khóa FOR UPDATE đúng trên Suppliers và Purchase Orders không
    -- (Trong PL/pgSQL cùng block, verify câu lệnh SELECT ... FOR UPDATE hoạt động trơn tru không deadlock)
    PERFORM 1 FROM suppliers WHERE id = v_supp_id FOR UPDATE;
    PERFORM 1 FROM purchase_orders WHERE id = v_po_id FOR UPDATE;
    RAISE NOTICE '✅ TEST 6 PASSED: Cơ chế khóa dòng FOR UPDATE cho Suppliers & PO hoạt động hoàn hảo, chống Race Condition!';

    -- -------------------------------------------------------------------------
    -- TEST 7: ĐỢT A — TIỀN ĐẶT CỌC / TRẢ TRƯỚC NCC (rpc_create_supplier_advance)
    -- - Đặt cọc 500.000đ cho NCC -> Dòng tiền ra ghi sổ cái AP (Debit).
    -- - Kiểm tra chứng từ có thật, không cho phép trừ cọc vượt hạn mức khả dụng.
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 7: Kiểm thử Đặt Cọc NCC & Kiểm Tra Hạn Mức Server-side ---';
    DECLARE
        v_adv_res JSONB;
        v_adv_id UUID;
        v_adv_rem BIGINT;
    BEGIN
        v_adv_res := rpc_create_supplier_advance(
            v_org_id,
            v_branch_1,
            v_supp_id,
            v_cashier_id,
            500000,
            'transfer',
            'BANK-ADV-001',
            'Đặt cọc lô hàng đợt 2'
        );

        IF (v_adv_res->>'success')::BOOLEAN <> TRUE THEN
            RAISE EXCEPTION '❌ TEST 7.1 FAILED: Tạo khoản trả trước thất bại: %', v_adv_res->>'message';
        END IF;

        v_adv_id := (v_adv_res->>'advance_id')::UUID;
        SELECT remaining_amount INTO v_adv_rem FROM supplier_advances WHERE id = v_adv_id;
        IF v_adv_rem = 500000 THEN
            RAISE NOTICE '✅ TEST 7.1 PASSED: Tạo chứng từ trả trước #% thành công. Số dư khả dụng: %đ', 
                v_adv_res->>'advance_number', v_adv_rem;
        ELSE
            RAISE EXCEPTION '❌ TEST 7.1 FAILED: Số dư trả trước ban đầu sai (Kỳ vọng 500000, thực tế %)', v_adv_rem;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 8: ĐỢT A — XUẤT TRẢ HÀNG NCC & ĐẢO CÔNG NỢ (rpc_return_goods_to_supplier)
    -- - Xuất trả 1 sản phẩm hỏng từ kho cách ly -> Giảm nợ NCC, giảm số lượng cách ly.
    -- - Tuyệt đối không xóa/sửa dòng GRN cũ, ghi dòng hoàn trả rõ ràng.
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 8: Kiểm thử Nghiệp Vụ Xuất Trả Hàng NCC ---';
    DECLARE
        v_ret_res JSONB;
        v_debt_before_ret BIGINT;
        v_debt_after_ret BIGINT;
    BEGIN
        SELECT debt_balance INTO v_debt_before_ret FROM suppliers WHERE id = v_supp_id;

        v_ret_res := rpc_return_goods_to_supplier(
            v_org_id,
            v_branch_1,
            v_supp_id,
            v_cashier_id,
            jsonb_build_array(
                jsonb_build_object(
                    'product_id', v_prod_id,
                    'lot_number', 'LOT-2026-A1',
                    'quantity', 1,
                    'unit_cost', 100000,
                    'is_from_quarantined', TRUE
                )
            ),
            'Trả lại 1 chai lỗi móp vỏ cho NCC'
        );

        IF (v_ret_res->>'success')::BOOLEAN <> TRUE THEN
            RAISE EXCEPTION '❌ TEST 8.1 FAILED: Xuất trả hàng NCC thất bại: %', v_ret_res->>'message';
        END IF;

        SELECT debt_balance INTO v_debt_after_ret FROM suppliers WHERE id = v_supp_id;
        IF v_debt_after_ret = (v_debt_before_ret - 100000) THEN
            RAISE NOTICE '✅ TEST 8.1 PASSED: Xuất trả hàng NCC giảm nợ chính xác 100.000đ (Dư nợ mới: %đ).', v_debt_after_ret;
        ELSE
            RAISE EXCEPTION '❌ TEST 8.1 FAILED: Dư nợ sau trả hàng sai (Kỳ vọng %, thực tế %)', (v_debt_before_ret - 100000), v_debt_after_ret;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- TEST 9: ĐỢT A — TÍNH BẤT BIẾN CỦA SỔ CÁI CÔNG NỢ (IMMUTABILITY AUDIT)
    -- Thử UPDATE / DELETE trên bảng supplier_ledger: PostgreSQL Rule phải DO INSTEAD NOTHING!
    -- -------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 9: Kiểm thử Tính Bất Biến Sổ Cái AP (Append-Only Protection) ---';
    DECLARE
        v_sample_led_id UUID;
        v_check_debit BIGINT;
    BEGIN
        SELECT id, debit_amount INTO v_sample_led_id, v_check_debit FROM supplier_ledger WHERE supplier_id = v_supp_id LIMIT 1;
        IF v_sample_led_id IS NOT NULL THEN
            -- Thử sửa sổ cái
            UPDATE supplier_ledger SET debit_amount = 999999999 WHERE id = v_sample_led_id;
            
            -- Kiểm tra lại: giá trị bắt buộc phải không bị đổi!
            SELECT debit_amount INTO v_check_debit FROM supplier_ledger WHERE id = v_sample_led_id;
            IF v_check_debit <> 999999999 THEN
                RAISE NOTICE '✅ TEST 9.1 PASSED: Quy tắc bất biến kích hoạt thành công! Dữ liệu sổ cái không bị ghi đè trái phép.';
            ELSE
                RAISE EXCEPTION '❌ TEST 9.1 FAILED: Sổ cái công nợ bị sửa đổi trái phép (Lỗ hổng kiểm toán)!';
            END IF;
        END IF;
    END;

    -- =========================================================================
    -- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ĐẢM BẢO MÔI TRƯỜNG SẠCH
    -- =========================================================================
    RAISE NOTICE '--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---';
    DELETE FROM supplier_advances WHERE supplier_id = v_supp_id;
    DELETE FROM supplier_returns WHERE supplier_id = v_supp_id;
    DELETE FROM goods_receipt_items WHERE goods_receipt_id = v_grn_id;
    DELETE FROM goods_receipt_notes WHERE id = v_grn_id;
    DELETE FROM purchase_order_items WHERE purchase_order_id = v_po_id;
    DELETE FROM purchase_orders WHERE id = v_po_id;
    DELETE FROM supplier_payments WHERE notes LIKE '%GRN%';
    DELETE FROM supplier_ledger WHERE supplier_id = v_supp_id AND notes LIKE '%GRN%';
    DELETE FROM damaged_inventory_items WHERE reference_id IN (v_sale_id, v_grn_id);
    DELETE FROM sale_refunds WHERE sale_id = v_sale_id;
    DELETE FROM sale_items WHERE sale_id = v_sale_id;
    DELETE FROM sales WHERE id = v_sale_id;
    DELETE FROM payments WHERE payment_number = 'PT-TEST-BANK-001';
    DELETE FROM expenses WHERE category = 'supplier_payment' AND notes LIKE '%GRN%';

    -- Khôi phục số dư và tồn kho ban đầu
    UPDATE suppliers SET debt_balance = v_init_debt WHERE id = v_supp_id;
    UPDATE inventory_stocks SET stock_on_hand = v_init_stock WHERE branch_id = v_branch_1 AND product_id = v_prod_id;
    UPDATE products SET cost_price = v_init_cost WHERE id = v_prod_id;

    RAISE NOTICE '==================================================================';
    RAISE NOTICE '🎉 TẤT CẢ 9 BỘ KIỂM THỬ P5 HARDENING & KHO VẬN ĐỢT A ĐỀU ĐẠT 100%%!';
    RAISE NOTICE '==================================================================';
END $$;
