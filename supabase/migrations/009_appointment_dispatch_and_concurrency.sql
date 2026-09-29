-- =============================================================================
-- MIGRATION 009: ADVANCED APPOINTMENT DISPATCH, MULTI-BRANCH CONCURRENCY & ROSTER
-- Target: PostgreSQL / Supabase
-- Reference: Master Plan Phase P4 / Đợt E2
-- =============================================================================

-- 1. TABLE: ROSTER_SHIFTS (Phân ca làm việc & Lịch trực theo Chi nhánh)
CREATE TABLE IF NOT EXISTS roster_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL DEFAULT '08:00:00',
    end_time TIME NOT NULL DEFAULT '20:00:00',
    shift_type VARCHAR(50) NOT NULL DEFAULT 'day_shift', -- 'morning', 'afternoon', 'day_shift', 'custom'
    is_off BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    CONSTRAINT unique_staff_roster_date UNIQUE (organization_id, staff_id, shift_date)
);

-- RLS cho roster_shifts
ALTER TABLE roster_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_roster_shifts_read ON roster_shifts;
CREATE POLICY rls_roster_shifts_read ON roster_shifts
    FOR SELECT TO authenticated
    USING (organization_id = (SELECT get_current_user_org_id()));

DROP POLICY IF EXISTS rls_roster_shifts_admin_modify ON roster_shifts;
CREATE POLICY rls_roster_shifts_admin_modify ON roster_shifts
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT get_current_user_org_id())
        AND (SELECT get_current_user_role()) IN ('owner_admin', 'branch_manager')
    );

-- 2. BỔ SUNG THUỘC TÍNH NÂNG CAO CHO BẢNG APPOINTMENTS
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS buffer_minutes_after INT NOT NULL DEFAULT 0 CHECK (buffer_minutes_after >= 0),
ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'at_counter',
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- 3. TABLE: APPOINTMENT_EVENTS (Nhật ký Tiến trình & Lịch sử Điều phối — Timeline)
CREATE TABLE IF NOT EXISTS appointment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'status_changed', 'rescheduled', 'staff_reassigned', 'cancelled'
    actor_staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_appointment_events_read ON appointment_events;
CREATE POLICY rls_appointment_events_read ON appointment_events
    FOR SELECT TO authenticated
    USING (
        appointment_id IN (
            SELECT id FROM appointments
            WHERE organization_id = (SELECT get_current_user_org_id())
        )
    );

-- 4. HARDENED ATOMIC CONCURRENCY RPC: ĐẶT LỊCH CHỐNG TRÙNG TOÀN CHUỖI
CREATE OR REPLACE FUNCTION rpc_book_appointment(
    p_org_id UUID,
    p_branch_id UUID,
    p_customer_id UUID,
    p_service_id UUID,
    p_staff_id UUID DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
    p_duration_minutes INT DEFAULT 60,
    p_notes TEXT DEFAULT NULL,
    p_existing_appt_id UUID DEFAULT NULL,
    p_actor_staff_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
    v_appt_date DATE;
    v_appt_time_only TIME;
    v_conflict_staff RECORD;
    v_conflict_resource RECORD;
    v_roster_shift RECORD;
    v_resource_capacity INT := 1;
    v_resource_name VARCHAR(255);
    v_staff_name VARCHAR(255);
    v_appt_id UUID;
    v_is_update BOOLEAN := (p_existing_appt_id IS NOT NULL);
    v_old_status VARCHAR(50);
    v_existing_idempotent RECORD;
    v_peak_overlap INT := 0;
BEGIN
    -- 0. KIỂM TRA CHỐNG XỬ LÝ LẶP (IDEMPOTENCY KEY)
    IF p_idempotency_key IS NOT NULL AND NOT v_is_update THEN
        SELECT id, scheduled_at, duration_minutes INTO v_existing_idempotent
        FROM appointments
        WHERE organization_id = p_org_id
          AND idempotency_key = p_idempotency_key
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'is_idempotent_replay', TRUE,
                'appointment_id', v_existing_idempotent.id,
                'message', 'Lịch hẹn đã được ghi nhận trước đó (Idempotent replay).'
            );
        END IF;
    END IF;

    IF p_scheduled_at IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Vui lòng chọn ngày và giờ hẹn hợp lệ.');
    END IF;

    IF p_duration_minutes <= 0 THEN
        p_duration_minutes := 60;
    END IF;

    v_start_time := p_scheduled_at;
    v_end_time := p_scheduled_at + (p_duration_minutes * INTERVAL '1 minute');
    v_appt_date := (p_scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
    v_appt_time_only := (p_scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::TIME;

    -- 1. THỨ TỰ KHÓA GIAO DỊCH NHẤT QUÁN ĐỂ TRÁNH DEADLOCK (STAFF -> RESOURCE)
    IF p_staff_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('lock_staff_' || p_staff_id::text));
    END IF;

    IF p_resource_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('lock_resource_' || p_resource_id::text));
    END IF;

    -- 2. KIỂM TRA CA LÀM CỦA KTV (NẾU CÓ BẢNG PHÂN CA ROSTER)
    IF p_staff_id IS NOT NULL THEN
        SELECT * INTO v_roster_shift
        FROM roster_shifts
        WHERE organization_id = p_org_id
          AND staff_id = p_staff_id
          AND shift_date = v_appt_date;

        IF FOUND THEN
            IF v_roster_shift.is_off THEN
                SELECT full_name INTO v_staff_name FROM staff_profiles WHERE id = p_staff_id;
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict_type', 'staff_day_off',
                    'message', format('Kỹ thuật viên "%s" có lịch nghỉ vào ngày %s.', COALESCE(v_staff_name, ''), v_appt_date)
                );
            END IF;

            IF v_roster_shift.branch_id <> p_branch_id THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'conflict_type', 'staff_different_branch_roster',
                    'message', format('Kỹ thuật viên này được xếp ca tại chi nhánh khác vào ngày %s.', v_appt_date)
                );
            END IF;
        END IF;
    END IF;

    -- 3. KIỂM TRA TRÙNG LỊCH KTV TRÊN TOÀN BỘ TỔ CHỨC (MULTI-BRANCH OVERLAP CHECK)
    IF p_staff_id IS NOT NULL THEN
        SELECT a.id, a.branch_id, b.name AS branch_name, a.scheduled_at, a.duration_minutes, s.full_name INTO v_conflict_staff
        FROM appointments a
        LEFT JOIN staff_profiles s ON s.id = a.staff_id
        LEFT JOIN branches b ON b.id = a.branch_id
        WHERE a.organization_id = p_org_id
          AND a.staff_id = p_staff_id
          AND a.status NOT IN ('cancelled')
          AND (v_is_update = FALSE OR a.id <> p_existing_appt_id)
          AND (
              -- Nếu khác chi nhánh: thêm 30 phút đệm di chuyển giữa các cơ sở
              CASE WHEN a.branch_id <> p_branch_id THEN
                  (a.scheduled_at - INTERVAL '30 minutes' < v_end_time 
                   AND (a.scheduled_at + (a.duration_minutes + a.buffer_minutes_after + 30) * INTERVAL '1 minute') > v_start_time)
              ELSE
                  (a.scheduled_at < v_end_time 
                   AND (a.scheduled_at + (a.duration_minutes + a.buffer_minutes_after) * INTERVAL '1 minute') > v_start_time)
              END
          )
        LIMIT 1;

        IF FOUND THEN
            SELECT full_name INTO v_staff_name FROM staff_profiles WHERE id = p_staff_id;
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'staff_overlap',
                'conflict_branch_id', v_conflict_staff.branch_id,
                'message', format('Kỹ thuật viên "%s" đã có lịch hẹn tại %s trong khung giờ %s - %s.',
                    COALESCE(v_staff_name, 'được chọn'),
                    COALESCE(v_conflict_staff.branch_name, 'chi nhánh khác'),
                    to_char(v_conflict_staff.scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
                    to_char((v_conflict_staff.scheduled_at + (v_conflict_staff.duration_minutes * INTERVAL '1 minute')) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI')
                )
            );
        END IF;
    END IF;

    -- 4. KIỂM TRA SỨC CHỨA TÀI NGUYÊN (PHÒNG/GIƯỜNG/MÁY MÓC) THEO PEAK OVERLAP
    IF p_resource_id IS NOT NULL THEN
        SELECT name, capacity INTO v_resource_name, v_resource_capacity
        FROM resources
        WHERE id = p_resource_id AND branch_id = p_branch_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'resource_not_found',
                'message', 'Tài nguyên phòng/giường không tồn tại hoặc đã ngừng hoạt động tại chi nhánh này.'
            );
        END IF;

        -- Đếm số ca đồng thời tối đa trong khoảng thời gian
        SELECT COUNT(*) INTO v_peak_overlap
        FROM appointments a
        WHERE a.organization_id = p_org_id
          AND a.branch_id = p_branch_id
          AND a.resource_id = p_resource_id
          AND a.status NOT IN ('cancelled')
          AND (v_is_update = FALSE OR a.id <> p_existing_appt_id)
          AND (a.scheduled_at < v_end_time AND (a.scheduled_at + (a.duration_minutes * INTERVAL '1 minute')) > v_start_time);

        IF v_peak_overlap >= v_resource_capacity THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'conflict_type', 'resource_capacity_exceeded',
                'message', format('Phòng/Giường "%s" đã hết công suất phục vụ trong khung giờ này (Sức chứa tối đa: %s khách).',
                    COALESCE(v_resource_name, 'được chọn'),
                    v_resource_capacity
                )
            );
        END IF;
    END IF;

    -- 5. THỰC HIỆN GHI / CẬP NHẬT DATABASE
    IF v_is_update THEN
        SELECT status INTO v_old_status FROM appointments WHERE id = p_existing_appt_id;

        UPDATE appointments
        SET customer_id = p_customer_id,
            service_id = p_service_id,
            staff_id = p_staff_id,
            resource_id = p_resource_id,
            scheduled_at = v_start_time,
            duration_minutes = p_duration_minutes,
            notes = p_notes,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_existing_appt_id
        RETURNING id INTO v_appt_id;

        -- Ghi timeline event trong cùng transaction
        INSERT INTO appointment_events (
            appointment_id,
            event_type,
            actor_staff_id,
            from_status,
            to_status,
            notes
        ) VALUES (
            v_appt_id,
            'rescheduled',
            p_actor_staff_id,
            v_old_status,
            v_old_status,
            'Cập nhật điều phối thời gian và nhân sự phục vụ'
        );
    ELSE
        INSERT INTO appointments (
            organization_id,
            branch_id,
            customer_id,
            service_id,
            staff_id,
            resource_id,
            scheduled_at,
            duration_minutes,
            status,
            notes,
            idempotency_key
        ) VALUES (
            p_org_id,
            p_branch_id,
            p_customer_id,
            p_service_id,
            p_staff_id,
            p_resource_id,
            v_start_time,
            p_duration_minutes,
            'confirmed',
            p_notes,
            p_idempotency_key
        )
        RETURNING id INTO v_appt_id;

        -- Ghi timeline event trong cùng transaction
        INSERT INTO appointment_events (
            appointment_id,
            event_type,
            actor_staff_id,
            to_status,
            notes
        ) VALUES (
            v_appt_id,
            'created',
            p_actor_staff_id,
            'confirmed',
            'Đặt lịch hẹn mới qua hệ thống điều phối'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'appointment_id', v_appt_id,
        'scheduled_at', v_start_time,
        'duration_minutes', p_duration_minutes,
        'message', 'Đã lưu lịch hẹn và khóa tài nguyên an toàn trên hệ thống.'
    );
END;
$$;

-- 5. BẬT REALTIME REPLICATION CHO BẢNG APPOINTMENTS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'appointments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
