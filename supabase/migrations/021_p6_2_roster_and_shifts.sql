-- =============================================================================
-- MIGRATION 021: HR PHASE P6.2 — ROSTER, SHIFTS, CROSS-BRANCH CONFLICTS, 
-- LEAVE & SHIFT SWAP MANAGEMENT WITH APPOINTMENT SAFETY
-- Target: PostgreSQL / Supabase
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 0. FIX P6.1 PIN HASH SEARCH PATH (COMPATIBILITY HARDENING)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_upsert_staff_profile(
    p_org_id UUID,
    p_staff_id UUID DEFAULT NULL,
    p_full_name VARCHAR(255) DEFAULT '',
    p_code VARCHAR(50) DEFAULT '',
    p_phone VARCHAR(20) DEFAULT '',
    p_email VARCHAR(100) DEFAULT NULL,
    p_title VARCHAR(100) DEFAULT NULL,
    p_role user_role_enum DEFAULT 'technician_doctor',
    p_primary_branch_id UUID DEFAULT NULL,
    p_branch_ids UUID[] DEFAULT '{}',
    p_base_salary BIGINT DEFAULT 0,
    p_commission_rate NUMERIC DEFAULT 0.00,
    p_employment_status VARCHAR DEFAULT 'active',
    p_pin_code VARCHAR DEFAULT NULL,
    p_skill_ids UUID[] DEFAULT '{}',
    p_effective_from DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_target_staff_id UUID;
    v_code VARCHAR(50);
    v_b_id UUID;
    v_s_id UUID;
    v_pin_hash VARCHAR(255);
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        v_code := 'NV' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    ELSE
        v_code := TRIM(p_code);
    END IF;

    IF p_pin_code IS NOT NULL AND TRIM(p_pin_code) <> '' THEN
        BEGIN
            v_pin_hash := extensions.crypt(TRIM(p_pin_code), extensions.gen_salt('bf'));
        EXCEPTION WHEN OTHERS THEN
            v_pin_hash := md5(TRIM(p_pin_code));
        END;
    ELSE
        v_pin_hash := NULL;
    END IF;

    IF p_staff_id IS NULL THEN
        INSERT INTO staff_profiles (
            organization_id,
            full_name,
            code,
            phone,
            email,
            title,
            base_salary,
            commission_rate,
            employment_status,
            pin_hash,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            p_org_id,
            p_full_name,
            v_code,
            p_phone,
            p_email,
            p_title,
            GREATEST(0, COALESCE(p_base_salary, 0)),
            GREATEST(0, COALESCE(p_commission_rate, 0)),
            COALESCE(p_employment_status, 'active'),
            v_pin_hash,
            CASE WHEN p_employment_status = 'active' THEN TRUE ELSE FALSE END,
            TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_target_staff_id;

        INSERT INTO organization_memberships (
            staff_id,
            organization_id,
            role,
            assigned_branch_ids,
            is_active
        ) VALUES (
            v_target_staff_id,
            p_org_id,
            p_role,
            p_branch_ids,
            TRUE
        );
    ELSE
        v_target_staff_id := p_staff_id;

        UPDATE staff_profiles
        SET full_name = p_full_name,
            phone = p_phone,
            email = p_email,
            title = p_title,
            base_salary = GREATEST(0, COALESCE(p_base_salary, base_salary)),
            commission_rate = GREATEST(0, COALESCE(p_commission_rate, commission_rate)),
            employment_status = COALESCE(p_employment_status, employment_status),
            pin_hash = COALESCE(v_pin_hash, pin_hash),
            is_active = CASE WHEN p_employment_status = 'active' THEN TRUE ELSE FALSE END,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_target_staff_id AND organization_id = p_org_id;

        UPDATE organization_memberships
        SET role = p_role,
            assigned_branch_ids = p_branch_ids,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_target_staff_id AND organization_id = p_org_id;
    END IF;

    IF p_branch_ids IS NOT NULL AND array_length(p_branch_ids, 1) > 0 THEN
        UPDATE staff_branch_assignments
        SET is_active = FALSE,
            effective_to = CURRENT_DATE,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_target_staff_id
          AND branch_id <> ALL(p_branch_ids)
          AND is_active = TRUE;

        FOREACH v_b_id IN ARRAY p_branch_ids
        LOOP
            INSERT INTO staff_branch_assignments (
                organization_id,
                staff_id,
                branch_id,
                is_primary,
                effective_from,
                is_active
            ) VALUES (
                p_org_id,
                v_target_staff_id,
                v_b_id,
                (v_b_id = p_primary_branch_id),
                COALESCE(p_effective_from, CURRENT_DATE),
                TRUE
            )
            ON CONFLICT (staff_id, branch_id, effective_from)
            DO UPDATE SET
                is_primary = (v_b_id = p_primary_branch_id),
                is_active = TRUE,
                effective_to = NULL,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW());
        END LOOP;
    END IF;

    IF p_skill_ids IS NOT NULL THEN
        DELETE FROM service_staff_skills WHERE staff_id = v_target_staff_id;

        FOREACH v_s_id IN ARRAY p_skill_ids
        LOOP
            INSERT INTO service_staff_skills (
                organization_id,
                service_id,
                staff_id,
                proficiency_level,
                is_primary
            ) VALUES (
                p_org_id,
                v_s_id,
                v_target_staff_id,
                'standard',
                TRUE
            )
            ON CONFLICT (service_id, staff_id) DO NOTHING;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'staff_id', v_target_staff_id,
        'code', v_code,
        'message', 'Đã lưu thông tin hồ sơ nhân viên và phân công chi nhánh thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. NÂNG CẤP BẢNG ROSTER_SHIFTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roster_shifts' AND column_name = 'break_minutes') THEN
        ALTER TABLE roster_shifts ADD COLUMN break_minutes INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roster_shifts' AND column_name = 'status') THEN
        ALTER TABLE roster_shifts ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'scheduled'; -- 'scheduled', 'completed', 'canceled', 'leave'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roster_shifts' AND column_name = 'is_locked') THEN
        ALTER TABLE roster_shifts ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- Nới lỏng unique constraint cũ nếu có để hỗ trợ nhiều ca trong 1 ngày (VD: ca sáng ở CN1, ca chiều ở CN2)
ALTER TABLE roster_shifts DROP CONSTRAINT IF EXISTS unique_staff_roster_date;
ALTER TABLE roster_shifts DROP CONSTRAINT IF EXISTS unique_staff_roster_slot;
ALTER TABLE roster_shifts ADD CONSTRAINT unique_staff_roster_slot UNIQUE (staff_id, shift_date, start_time);

-- -----------------------------------------------------------------------------
-- 2. BẢNG NGHỈ PHÉP (LEAVE_REQUESTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    leave_type VARCHAR(50) NOT NULL DEFAULT 'annual_leave', -- 'annual_leave', 'unpaid', 'sick', 'personal'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'canceled'
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_leave_requests_all ON leave_requests;
CREATE POLICY rls_leave_requests_all ON leave_requests
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. BẢNG ĐỔI CA (SHIFT_SWAP_REQUESTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requester_staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    requester_shift_id UUID NOT NULL REFERENCES roster_shifts(id) ON DELETE CASCADE,
    target_staff_id UUID REFERENCES staff_profiles(id) ON DELETE CASCADE,
    target_shift_id UUID REFERENCES roster_shifts(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_peer', -- 'pending_peer', 'pending_manager', 'approved', 'rejected', 'canceled'
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_shift_swap_requests_all ON shift_swap_requests;
CREATE POLICY rls_shift_swap_requests_all ON shift_swap_requests
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 4. RPC KIỂM TRA XUNG ĐỘT PHÂN CA & THỜI GIAN DI CHUYỂN & LỊCH HẸN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_shift_conflict(
    p_org_id UUID,
    p_staff_id UUID,
    p_shift_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_branch_id UUID,
    p_exclude_shift_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_overlapping_shift RECORD;
    v_leave_record RECORD;
    v_appointment_conflicts JSONB;
    v_travel_buffer_conflict RECORD;
BEGIN
    -- 1. Kiểm tra ca làm trùng giờ trên cùng nhân viên
    SELECT id, branch_id, start_time, end_time INTO v_overlapping_shift
    FROM roster_shifts
    WHERE staff_id = p_staff_id
      AND shift_date = p_shift_date
      AND is_off = FALSE
      AND status <> 'canceled'
      AND (p_exclude_shift_id IS NULL OR id <> p_exclude_shift_id)
      AND (
          (start_time, end_time) OVERLAPS (p_start_time, p_end_time)
      )
    LIMIT 1;

    IF v_overlapping_shift.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'has_conflict', TRUE,
            'conflict_type', 'TIME_OVERLAP',
            'message', 'Nhân viên đã có ca làm việc khác trùng khung giờ này (' || v_overlapping_shift.start_time || ' - ' || v_overlapping_shift.end_time || ').',
            'conflicting_shift_id', v_overlapping_shift.id
        );
    END IF;

    -- 2. Kiểm tra xung đột thời gian di chuyển liên chi nhánh (Tối thiểu 30 phút giữa 2 chi nhánh khác nhau)
    SELECT id, branch_id, start_time, end_time INTO v_travel_buffer_conflict
    FROM roster_shifts
    WHERE staff_id = p_staff_id
      AND shift_date = p_shift_date
      AND is_off = FALSE
      AND status <> 'canceled'
      AND branch_id <> p_branch_id
      AND (p_exclude_shift_id IS NULL OR id <> p_exclude_shift_id)
      AND (
          -- Ca mới bắt đầu ngay sau ca cũ ở CN khác mà nghỉ < 30 phút
          (p_start_time >= end_time AND p_start_time < (end_time + INTERVAL '30 minutes'))
          OR
          -- Ca mới kết thúc trước ca cũ ở CN khác mà cách < 30 phút
          (p_end_time <= start_time AND (p_end_time + INTERVAL '30 minutes') > start_time)
      )
    LIMIT 1;

    IF v_travel_buffer_conflict.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'has_conflict', TRUE,
            'conflict_type', 'TRAVEL_TIME_INSUFFICIENT',
            'message', 'Khoảng cách giữa 2 ca tại 2 chi nhánh khác nhau không đủ thời gian di chuyển (tối thiểu 30 phút).',
            'conflicting_shift_id', v_travel_buffer_conflict.id
        );
    END IF;

    -- 3. Kiểm tra ngày nghỉ phép đã được duyệt
    SELECT id, leave_type INTO v_leave_record
    FROM leave_requests
    WHERE staff_id = p_staff_id
      AND status = 'approved'
      AND p_shift_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_leave_record.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'has_conflict', TRUE,
            'conflict_type', 'APPROVED_LEAVE',
            'message', 'Nhân viên đã được duyệt nghỉ phép vào ngày này (' || v_leave_record.leave_type || ').',
            'leave_id', v_leave_record.id
        );
    END IF;

    -- 4. Kiểm tra các lịch hẹn khách hàng đang gán cho KTV trong khung giờ này
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'appointment_id', a.id,
                'customer_id', a.customer_id,
                'scheduled_at', a.scheduled_at,
                'duration_minutes', a.duration_minutes,
                'status', a.status
            )
        ), '[]'::jsonb
    ) INTO v_appointment_conflicts
    FROM appointments a
    WHERE a.staff_id = p_staff_id
      AND a.scheduled_at::DATE = p_shift_date
      AND a.status IN ('scheduled', 'confirmed', 'arrived', 'in_service')
      AND (
          (a.scheduled_at::TIME, (a.scheduled_at::TIME + (a.duration_minutes || ' minutes')::INTERVAL)) 
          OVERLAPS (p_start_time, p_end_time)
      );

    RETURN jsonb_build_object(
        'has_conflict', FALSE,
        'conflict_type', 'NONE',
        'appointment_conflicts', v_appointment_conflicts
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC TẠO / CẬP NHẬT CA LÀM VIỆC (UPSERT ROSTER SHIFT WITH SAFETY CHECK)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_upsert_roster_shift(
    p_org_id UUID,
    p_shift_id UUID DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_shift_date DATE DEFAULT CURRENT_DATE,
    p_start_time TIME DEFAULT '08:00:00',
    p_end_time TIME DEFAULT '17:00:00',
    p_shift_type VARCHAR DEFAULT 'day_shift',
    p_break_minutes INT DEFAULT 0,
    p_is_off BOOLEAN DEFAULT FALSE,
    p_notes TEXT DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE -- Nếu TRUE: Bỏ qua cảnh báo lịch hẹn và chuyển lịch về unassigned
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_conflict_check JSONB;
    v_target_shift_id UUID;
    v_affected_appointments INT := 0;
BEGIN
    -- 1. Nếu không phải là nghỉ (is_off = FALSE), kiểm tra xung đột
    IF NOT p_is_off THEN
        v_conflict_check := rpc_check_shift_conflict(
            p_org_id,
            p_staff_id,
            p_shift_date,
            p_start_time,
            p_end_time,
            p_branch_id,
            p_shift_id
        );

        IF (v_conflict_check->>'has_conflict')::BOOLEAN = TRUE THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', v_conflict_check->>'conflict_type',
                'message', v_conflict_check->>'message'
            );
        END IF;
    ELSE
        -- Nếu đặt là ca nghỉ hoặc hủy ca, kiểm tra xem có lịch hẹn khách hàng nào bị ảnh hưởng không
        SELECT COUNT(*) INTO v_affected_appointments
        FROM appointments
        WHERE staff_id = p_staff_id
          AND scheduled_at::DATE = p_shift_date
          AND status IN ('scheduled', 'confirmed', 'arrived');

        IF v_affected_appointments > 0 AND NOT p_force THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'HAS_ACTIVE_APPOINTMENTS',
                'message', 'Nhân viên đang có ' || v_affected_appointments || ' lịch hẹn khách hàng vào ngày này. Cần điều phối KTV khác trước khi hủy ca.',
                'affected_count', v_affected_appointments
            );
        END IF;

        IF v_affected_appointments > 0 AND p_force THEN
            -- Thu hồi gán KTV của các lịch hẹn bị ảnh hưởng để chờ điều phối lại
            UPDATE appointments
            SET staff_id = NULL,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE staff_id = p_staff_id
              AND scheduled_at::DATE = p_shift_date
              AND status IN ('scheduled', 'confirmed');
        END IF;
    END IF;

    -- 2. Thực hiện Lưu/Cập nhật ca làm
    IF p_shift_id IS NULL THEN
        INSERT INTO roster_shifts (
            organization_id,
            branch_id,
            staff_id,
            shift_date,
            start_time,
            end_time,
            shift_type,
            break_minutes,
            is_off,
            status,
            notes,
            created_at,
            updated_at
        ) VALUES (
            p_org_id,
            p_branch_id,
            p_staff_id,
            p_shift_date,
            p_start_time,
            p_end_time,
            p_shift_type,
            p_break_minutes,
            p_is_off,
            CASE WHEN p_is_off THEN 'leave' ELSE 'scheduled' END,
            p_notes,
            TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        )
        RETURNING id INTO v_target_shift_id;
    ELSE
        v_target_shift_id := p_shift_id;

        UPDATE roster_shifts
        SET branch_id = COALESCE(p_branch_id, branch_id),
            shift_date = COALESCE(p_shift_date, shift_date),
            start_time = COALESCE(p_start_time, start_time),
            end_time = COALESCE(p_end_time, end_time),
            shift_type = COALESCE(p_shift_type, shift_type),
            break_minutes = COALESCE(p_break_minutes, break_minutes),
            is_off = p_is_off,
            status = CASE WHEN p_is_off THEN 'leave' ELSE 'scheduled' END,
            notes = COALESCE(p_notes, notes),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_target_shift_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'shift_id', v_target_shift_id,
        'message', 'Đã lưu lịch phân ca thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC PHÊ DUYỆT NGHỈ PHÉP (APPROVE / REJECT LEAVE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_leave_request(
    p_request_id UUID,
    p_action VARCHAR, -- 'approved', 'rejected', 'canceled'
    p_manager_staff_id UUID DEFAULT NULL,
    p_rejection_reason TEXT DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_leave RECORD;
    v_appt_count INT;
BEGIN
    SELECT * INTO v_leave FROM leave_requests WHERE id = p_request_id;
    IF v_leave.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy đơn xin nghỉ phép.');
    END IF;

    IF p_action = 'approved' THEN
        -- Kiểm tra lịch hẹn khách hàng
        SELECT COUNT(*) INTO v_appt_count
        FROM appointments
        WHERE staff_id = v_leave.staff_id
          AND scheduled_at::DATE BETWEEN v_leave.start_date AND v_leave.end_date
          AND status IN ('scheduled', 'confirmed');

        IF v_appt_count > 0 AND NOT p_force THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code', 'APPOINTMENTS_REQUIRE_REASSIGNMENT',
                'message', 'KTV có ' || v_appt_count || ' lịch hẹn trong thời gian xin nghỉ. Hãy xác nhận điều phối lại trước khi duyệt.',
                'appointment_count', v_appt_count
            );
        END IF;

        IF v_appt_count > 0 AND p_force THEN
            UPDATE appointments
            SET staff_id = NULL,
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE staff_id = v_leave.staff_id
              AND scheduled_at::DATE BETWEEN v_leave.start_date AND v_leave.end_date
              AND status IN ('scheduled', 'confirmed');
        END IF;

        -- Đánh dấu các ca làm việc trong khoảng thời gian này thành ca nghỉ
        UPDATE roster_shifts
        SET is_off = TRUE,
            status = 'leave',
            notes = COALESCE(notes, '') || ' [Nghỉ phép đã duyệt: ' || v_leave.leave_type || ']',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE staff_id = v_leave.staff_id
          AND shift_date BETWEEN v_leave.start_date AND v_leave.end_date;

        UPDATE leave_requests
        SET status = 'approved',
            approved_by = p_manager_staff_id,
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã duyệt đơn nghỉ phép thành công.');
    ELSIF p_action = 'rejected' THEN
        UPDATE leave_requests
        SET status = 'rejected',
            approved_by = p_manager_staff_id,
            rejection_reason = p_rejection_reason,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã từ chối đơn xin nghỉ phép.');
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC PHÊ DUYỆT ĐỔI CA (PROCESS SHIFT SWAP)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_shift_swap(
    p_swap_id UUID,
    p_action VARCHAR, -- 'approve', 'reject'
    p_manager_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_swap RECORD;
    v_req_shift RECORD;
    v_tgt_shift RECORD;
BEGIN
    SELECT * INTO v_swap FROM shift_swap_requests WHERE id = p_swap_id;
    IF v_swap.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy yêu cầu đổi ca.');
    END IF;

    IF p_action = 'reject' THEN
        UPDATE shift_swap_requests
        SET status = 'rejected',
            approved_by = p_manager_staff_id,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_swap_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã từ chối yêu cầu đổi ca.');
    END IF;

    IF p_action = 'approve' THEN
        SELECT * INTO v_req_shift FROM roster_shifts WHERE id = v_swap.requester_shift_id;
        SELECT * INTO v_tgt_shift FROM roster_shifts WHERE id = v_swap.target_shift_id;

        -- Hoán đổi nhân viên giữa 2 ca làm
        UPDATE roster_shifts
        SET staff_id = v_swap.target_staff_id,
            notes = COALESCE(notes, '') || ' [Đổi ca từ NV ' || v_swap.requester_staff_id || ']',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_swap.requester_shift_id;

        UPDATE roster_shifts
        SET staff_id = v_swap.requester_staff_id,
            notes = COALESCE(notes, '') || ' [Đổi ca từ NV ' || v_swap.target_staff_id || ']',
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = v_swap.target_shift_id;

        UPDATE shift_swap_requests
        SET status = 'approved',
            approved_by = p_manager_staff_id,
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_swap_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã hoán đổi ca làm việc thành công giữa hai nhân viên.');
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC LẤY DỮ LIỆU BẢNG PHÂN CA & NGHỈ PHÉP & ĐỔI CA THEO TUẦN (GET ROSTER MATRIX)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_roster_matrix(
    p_branch_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shifts JSONB;
    v_leave_requests JSONB;
    v_swap_requests JSONB;
BEGIN
    -- 1. Lấy danh sách ca làm việc trong tuần
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', rs.id,
                'staff_id', rs.staff_id,
                'staff_name', sp.full_name,
                'staff_code', sp.code,
                'branch_id', rs.branch_id,
                'shift_date', rs.shift_date,
                'start_time', rs.start_time,
                'end_time', rs.end_time,
                'shift_type', rs.shift_type,
                'break_minutes', rs.break_minutes,
                'is_off', rs.is_off,
                'status', rs.status,
                'notes', rs.notes,
                'appointments_count', (
                    SELECT COUNT(*)
                    FROM appointments a
                    WHERE a.staff_id = rs.staff_id
                      AND a.scheduled_at::DATE = rs.shift_date
                      AND a.status IN ('scheduled', 'confirmed', 'arrived', 'in_service')
                )
            )
        ), '[]'::jsonb
    ) INTO v_shifts
    FROM roster_shifts rs
    JOIN staff_profiles sp ON sp.id = rs.staff_id
    WHERE (p_branch_id IS NULL OR rs.branch_id = p_branch_id)
      AND rs.shift_date BETWEEN p_start_date AND p_end_date;

    -- 2. Lấy danh sách đơn xin nghỉ phép
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', lr.id,
                'staff_id', lr.staff_id,
                'staff_name', sp.full_name,
                'leave_type', lr.leave_type,
                'start_date', lr.start_date,
                'end_date', lr.end_date,
                'reason', lr.reason,
                'status', lr.status,
                'created_at', lr.created_at
            )
        ), '[]'::jsonb
    ) INTO v_leave_requests
    FROM leave_requests lr
    JOIN staff_profiles sp ON sp.id = lr.staff_id
    WHERE (lr.start_date <= p_end_date AND lr.end_date >= p_start_date);

    -- 3. Lấy danh sách yêu cầu đổi ca
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ssr.id,
                'requester_staff_id', ssr.requester_staff_id,
                'requester_name', sp1.full_name,
                'target_staff_id', ssr.target_staff_id,
                'target_name', sp2.full_name,
                'reason', ssr.reason,
                'status', ssr.status,
                'created_at', ssr.created_at
            )
        ), '[]'::jsonb
    ) INTO v_swap_requests
    FROM shift_swap_requests ssr
    JOIN staff_profiles sp1 ON sp1.id = ssr.requester_staff_id
    LEFT JOIN staff_profiles sp2 ON sp2.id = ssr.target_staff_id
    WHERE ssr.status IN ('pending_peer', 'pending_manager');

    RETURN jsonb_build_object(
        'shifts', v_shifts,
        'leave_requests', v_leave_requests,
        'swap_requests', v_swap_requests
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_shift_conflict(UUID, UUID, DATE, TIME, TIME, UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_upsert_roster_shift(UUID, UUID, UUID, UUID, DATE, TIME, TIME, VARCHAR, INT, BOOLEAN, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_leave_request(UUID, VARCHAR, UUID, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_shift_swap(UUID, VARCHAR, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_roster_matrix(UUID, DATE, DATE) TO authenticated, anon;
