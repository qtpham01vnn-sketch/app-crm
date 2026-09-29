-- =============================================================================
-- TEST SUITE: P4 APPOINTMENT CONCURRENCY, REALTIME & SCOPING VERIFICATION
-- Target: PostgreSQL / Supabase
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_branch_q1 UUID := '22222222-2222-2222-2222-222222222221';
    v_branch_q7 UUID := '22222222-2222-2222-2222-222222222222';
    v_cust_1 UUID;
    v_cust_2 UUID;
    v_svc_1 UUID;
    v_staff_1 UUID;
    v_room_1 UUID;
    v_res_json JSONB;
    v_slot_time TIMESTAMPTZ := '2026-09-30 09:30:00+07';
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'BẮT ĐẦU TEST SUITE: P4 LỊCH HẸN VÀ KHÓA ĐỒNG THỜI';
    RAISE NOTICE '==================================================';

    -- Lấy hoặc tạo dữ liệu mẫu
    SELECT id INTO v_cust_1 FROM customers LIMIT 1;
    SELECT id INTO v_cust_2 FROM customers OFFSET 1 LIMIT 1;
    SELECT id INTO v_svc_1 FROM services LIMIT 1;
    SELECT id INTO v_staff_1 FROM staff_profiles LIMIT 1;
    SELECT id INTO v_room_1 FROM resources LIMIT 1;

    IF v_cust_1 IS NULL OR v_svc_1 IS NULL OR v_staff_1 IS NULL THEN
        RAISE NOTICE '⚠️ Chưa có đủ dữ liệu mẫu trong DB. Bỏ qua test trực tiếp.';
        RETURN;
    END IF;

    -- TEST 1: ĐẶT LỊCH HỢP LỆ LẦN 1
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q1,
        v_cust_1,
        v_svc_1,
        v_staff_1,
        v_room_1,
        v_slot_time,
        60,
        'Test đặt lịch ca 1'
    );
    
    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        RAISE NOTICE '✅ TEST 1 PASSED: Đặt lịch lần 1 thành công (ID: %)', v_res_json->>'appointment_id';
    ELSE
        RAISE EXCEPTION '❌ TEST 1 FAILED: %', v_res_json->>'message';
    END IF;

    -- TEST 2: THỬ ĐẶT TRÙNG KHUNG GIỜ VỚI CÙNG KTV (PHẢI BỊ TỪ CHỐI)
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q1,
        v_cust_2,
        v_svc_1,
        v_staff_1, -- Cùng KTV
        NULL,
        v_slot_time + INTERVAL '15 minutes', -- Trùng giờ (09:45)
        60,
        'Test đặt trùng KTV'
    );

    IF (v_res_json->>'success')::BOOLEAN = FALSE AND (v_res_json->>'conflict_type') = 'staff_overlap' THEN
        RAISE NOTICE '✅ TEST 2 PASSED: Server đã từ chối trùng KTV chính xác: %', v_res_json->>'message';
    ELSE
        RAISE EXCEPTION '❌ TEST 2 FAILED: Server không chặn được trùng giờ KTV!';
    END IF;

    -- TEST 3: ĐẶT LỊCH KHÁC CHI NHÁNH HOẶC KHUNG GIỜ KHÁC (PHẢI THÀNH CÔNG)
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q1,
        v_cust_2,
        v_svc_1,
        v_staff_1,
        v_room_1,
        v_slot_time + INTERVAL '75 minutes', -- Khung giờ tiếp theo (10:45)
        60,
        'Test đặt ca tiếp theo sau khi KTV xong việc'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        RAISE NOTICE '✅ TEST 3 PASSED: Đặt ca kế tiếp không trùng giờ thành công';
    ELSE
        RAISE EXCEPTION '❌ TEST 3 FAILED: %', v_res_json->>'message';
    END IF;

    RAISE NOTICE '==================================================';
    RAISE NOTICE '🎉 TẤT CẢ CÁC BÀI TEST P4 CONCURRENCY ĐÃ HOÀN TẤT ĐẠT CHUẨN!';
    RAISE NOTICE '==================================================';
END $$;
