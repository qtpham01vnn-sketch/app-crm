-- =============================================================================
-- TEST SUITE: P4 MULTI-BRANCH APPOINTMENT CONCURRENCY & OVERLAP VERIFICATION
-- Target: PostgreSQL / Supabase
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_branch_q1 UUID;
    v_branch_q7 UUID;
    v_cust_1 UUID;
    v_cust_2 UUID;
    v_svc_1 UUID;
    v_staff_multibranch UUID;
    v_room_q1 UUID;
    v_room_q7 UUID;
    v_res_json JSONB;
    v_test_date DATE := '2026-10-01';
    v_slot_time TIMESTAMPTZ := '2026-10-01 09:30:00+07';
    v_test_appt_ids UUID[] := '{}';
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'BẮT ĐẦU TEST: KIỂM TRA CHỐNG TRÙNG LỊCH LIÊN CHI NHÁNH';
    RAISE NOTICE '==================================================';

    -- 1. LẤY DỮ LIỆU THỰC TẾ TỪ DATABASE ĐỂ CHẠY TEST
    SELECT organization_id, id INTO v_org_id, v_branch_q1 FROM branches ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_branch_q7 FROM branches WHERE organization_id = v_org_id AND id <> v_branch_q1 ORDER BY created_at ASC LIMIT 1;

    -- Nếu chỉ có 1 chi nhánh trong DB, lấy chính nó cho test
    IF v_branch_q7 IS NULL THEN
        v_branch_q7 := v_branch_q1;
    END IF;

    SELECT id INTO v_cust_1 FROM customers WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cust_2 FROM customers WHERE organization_id = v_org_id OFFSET 1 LIMIT 1;
    IF v_cust_2 IS NULL THEN v_cust_2 := v_cust_1; END IF;

    SELECT id INTO v_svc_1 FROM services WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_staff_multibranch FROM staff_profiles WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_room_q1 FROM resources WHERE branch_id = v_branch_q1 LIMIT 1;
    SELECT id INTO v_room_q7 FROM resources WHERE branch_id = v_branch_q7 LIMIT 1;

    IF v_org_id IS NULL OR v_branch_q1 IS NULL OR v_cust_1 IS NULL OR v_svc_1 IS NULL OR v_staff_multibranch IS NULL THEN
        RAISE NOTICE '⚠️ Chưa có đủ dữ liệu mẫu (branches/customers/services/staff) trong DB. Vui lòng kiểm tra seed data.';
        RETURN;
    END IF;

    -- DỌN DẸP TRƯỚC LỊCH TEST CŨ NẾU CÓ
    DELETE FROM appointments WHERE notes LIKE 'Test P4:%';

    -- BÀI TEST 1: ĐẶT LỊCH HẸN TẠI CHI NHÁNH 1 CHO KTV LÚC 09:30
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q1,
        v_cust_1,
        v_svc_1,
        v_staff_multibranch,
        v_room_q1,
        v_slot_time,
        60,
        'Test P4: Đặt lịch tại Chi nhánh 1'
    );
    
    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_test_appt_ids := array_append(v_test_appt_ids, (v_res_json->>'appointment_id')::UUID);
        RAISE NOTICE '✅ TEST 1 PASSED: Đã đặt lịch tại Chi nhánh 1 lúc 09:30';
    ELSE
        RAISE EXCEPTION '❌ TEST 1 FAILED: %', v_res_json->>'message';
    END IF;

    -- BÀI TEST 2: THỬ ĐẶT CÙNG KTV TẠI CHI NHÁNH 2 LÚC 09:30 (PHẢI BỊ SERVER TỪ CHỐI!)
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q7, -- Chi nhánh 2
        v_cust_2,
        v_svc_1,
        v_staff_multibranch, -- Cùng 1 KTV
        v_room_q7,
        v_slot_time, -- Cùng giờ 09:30
        60,
        'Test P4: Đặt trùng KTV tại Chi nhánh 2'
    );

    IF (v_res_json->>'success')::BOOLEAN = FALSE AND (v_res_json->>'conflict_type') = 'staff_overlap' THEN
        RAISE NOTICE '✅ TEST 2 PASSED (LỖ HỔNG ĐÃ ĐƯỢC VÁ): Server đã chặn KTV bị đặt trùng giờ liên chi nhánh! Chi tiết: %', v_res_json->>'message';
    ELSE
        RAISE EXCEPTION '❌ TEST 2 FAILED: Server không chặn được trùng giờ KTV liên chi nhánh! Kết quả: %', v_res_json;
    END IF;

    -- BÀI TEST 3: THỬ ĐẶT TẠI CHI NHÁNH 2 LÚC 10:35 (VẪN BỊ TỪ CHỐI DO THIẾU THỜI GIAN DI CHUYỂN 30 PHÚT NẾU KHÁC CHI NHÁNH)
    IF v_branch_q1 <> v_branch_q7 THEN
        v_res_json := rpc_book_appointment(
            v_org_id,
            v_branch_q7,
            v_cust_2,
            v_svc_1,
            v_staff_multibranch,
            v_room_q7,
            v_slot_time + INTERVAL '65 minutes', -- 10:35 (mới kết thúc ở CN1 lúc 10:30, chưa đủ 30p di chuyển sang CN2)
            60,
            'Test P4: Đệm di chuyển giữa các chi nhánh'
        );

        IF (v_res_json->>'success')::BOOLEAN = FALSE AND (v_res_json->>'conflict_type') = 'staff_overlap' THEN
            RAISE NOTICE '✅ TEST 3 PASSED: Server đã áp dụng đúng thời gian đệm di chuyển 30 phút giữa 2 chi nhánh!';
        ELSE
            RAISE EXCEPTION '❌ TEST 3 FAILED: Server không tính buffer di chuyển giữa các cơ sở!';
        END IF;
    ELSE
        RAISE NOTICE 'ℹ️ Chỉ có 1 chi nhánh, bỏ qua kiểm tra đệm di chuyển liên chi nhánh.';
    END IF;

    -- BÀI TEST 4: THỬ ĐẶT TẠI CHI NHÁNH 2 LÚC 11:30 (ĐỦ THỜI GIAN -> PHẢI THÀNH CÔNG)
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q7,
        v_cust_2,
        v_svc_1,
        v_staff_multibranch,
        v_room_q7,
        v_slot_time + INTERVAL '120 minutes', -- 11:30 (cách 1 tiếng sau ca ở CN1 -> ĐỦ GIỜ)
        60,
        'Test P4: Đặt ca kế tiếp sau khi đã di chuyển'
    );

    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_test_appt_ids := array_append(v_test_appt_ids, (v_res_json->>'appointment_id')::UUID);
        RAISE NOTICE '✅ TEST 4 PASSED: Đặt ca kế tiếp (đủ thời gian) thành công!';
    ELSE
        RAISE EXCEPTION '❌ TEST 4 FAILED: %', v_res_json->>'message';
    END IF;

    -- BÀI TEST 5: CHỐNG XỬ LÝ LẶP (IDEMPOTENCY KEY TEST)
    v_res_json := rpc_book_appointment(
        v_org_id,
        v_branch_q1,
        v_cust_1,
        v_svc_1,
        NULL,
        NULL,
        v_slot_time + INTERVAL '240 minutes',
        60,
        'Test P4: Idempotency Key',
        NULL,
        NULL,
        'test_idempotency_key_123'
    );
    IF (v_res_json->>'success')::BOOLEAN = TRUE THEN
        v_test_appt_ids := array_append(v_test_appt_ids, (v_res_json->>'appointment_id')::UUID);
        
        -- Gửi lại lần 2 với cùng idempotency_key
        v_res_json := rpc_book_appointment(
            v_org_id,
            v_branch_q1,
            v_cust_1,
            v_svc_1,
            NULL,
            NULL,
            v_slot_time + INTERVAL '240 minutes',
            60,
            'Test P4: Idempotency Key Replay',
            NULL,
            NULL,
            'test_idempotency_key_123'
        );
        
        IF (v_res_json->>'is_idempotent_replay')::BOOLEAN = TRUE THEN
            RAISE NOTICE '✅ TEST 5 PASSED: Cơ chế Idempotency chống lặp đơn do click đúp/mất mạng hoạt động hoàn hảo!';
        ELSE
            RAISE EXCEPTION '❌ TEST 5 FAILED: Không chặn được request gửi lại (idempotency key)!';
        END IF;
    END IF;

    -- DỌN DẸP DỮ LIỆU TEST SAU KHI TEST HOÀN TẤT
    DELETE FROM appointments WHERE notes LIKE 'Test P4:%';

    RAISE NOTICE '==================================================';
    RAISE NOTICE '🎉 TẤT CẢ CÁC BÀI TEST SERVER BACKEND ĐÃ VƯỢT QUA VÀ DỌN SẠCH DỮ LIỆU TEST!';
    RAISE NOTICE '==================================================';
END $$;
