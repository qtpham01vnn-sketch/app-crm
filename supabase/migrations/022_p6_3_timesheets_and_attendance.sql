-- =============================================================================
-- MIGRATION 022: HR PHASE P6.3 — TIMESHEETS, REAL-TIME ATTENDANCE, 
-- OVERNIGHT SHIFTS, ADJUSTMENTS & APPROVAL PIPELINE
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. HARDENING ROSTER SHIFTS PARTIAL UNIQUE INDEX & RLS (P6.2 CONTINUITY)
-- -----------------------------------------------------------------------------
ALTER TABLE roster_shifts DROP CONSTRAINT IF EXISTS unique_staff_roster_slot;
DROP INDEX IF EXISTS unique_active_staff_roster_slot;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_staff_roster_slot 
ON roster_shifts (staff_id, shift_date, start_time) 
WHERE is_off = FALSE AND status <> 'canceled';

DROP POLICY IF EXISTS rls_roster_shifts_read ON roster_shifts;
DROP POLICY IF EXISTS rls_roster_shifts_admin_modify ON roster_shifts;
DROP POLICY IF EXISTS rls_roster_shifts_all ON roster_shifts;
CREATE POLICY rls_roster_shifts_all ON roster_shifts
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 1. BẢNG CHẤM CÔNG & GIỜ LÀM THỰC TẾ (ATTENDANCE_RECORDS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES roster_shifts(id) ON DELETE SET NULL,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    check_out_at TIMESTAMPTZ,
    is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
    actual_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    approved_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'working', -- 'working', 'completed', 'pending_approval', 'approved', 'rejected'
    check_in_method VARCHAR(50) NOT NULL DEFAULT 'manual_app', -- 'gps', 'wifi', 'pin', 'manual_app', 'manager_override'
    check_in_meta JSONB DEFAULT '{}'::jsonb, -- { "lat": 10.77, "lng": 106.70, "accuracy": 15, "ip": "...", "device": "..." }
    check_out_meta JSONB DEFAULT '{}'::jsonb,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

-- Index tra cứu nhanh theo chi nhánh và ngày
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance_records (branch_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance_records (staff_id, work_date);

-- Bật RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_attendance_records_all ON attendance_records;
CREATE POLICY rls_attendance_records_all ON attendance_records
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 2. BẢNG YÊU CẦU ĐIỀU CHỈNH CHẤM CÔNG & QUÊN CHẤM CÔNG (ATTENDANCE_ADJUSTMENTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES attendance_records(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    original_check_in TIMESTAMPTZ,
    original_check_out TIMESTAMPTZ,
    requested_check_in TIMESTAMPTZ NOT NULL,
    requested_check_out TIMESTAMPTZ NOT NULL,
    requested_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approved_by UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('Asia/Ho_Chi_Minh', NOW())
);

ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_attendance_adjustments_all ON attendance_adjustments;
CREATE POLICY rls_attendance_adjustments_all ON attendance_adjustments
    FOR ALL TO authenticated, anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- -----------------------------------------------------------------------------
-- 3. RPC CHECK-IN CHẤM CÔNG (CÓ CHỐNG GỬI LẶP & COOLDOWN)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_in_attendance(
    p_org_id UUID,
    p_branch_id UUID,
    p_staff_id UUID,
    p_shift_id UUID DEFAULT NULL,
    p_method VARCHAR DEFAULT 'manual_app',
    p_meta JSONB DEFAULT '{}'::jsonb,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_active RECORD;
    v_target_id UUID;
    v_shift RECORD;
    v_is_overnight BOOLEAN := FALSE;
BEGIN
    -- 1. Kiểm tra xem nhân viên có lượt check-in nào đang mở ('working') không
    SELECT * INTO v_existing_active
    FROM attendance_records
    WHERE staff_id = p_staff_id
      AND status = 'working'
    ORDER BY check_in_at DESC
    LIMIT 1;

    IF v_existing_active.id IS NOT NULL THEN
        -- Chống gửi lặp: Nếu mới check-in trong vòng 2 phút thì trả về bản ghi hiện tại
        IF v_existing_active.check_in_at > (TIMEZONE('Asia/Ho_Chi_Minh', NOW()) - INTERVAL '2 minutes') THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'attendance_id', v_existing_active.id,
                'message', 'Bạn vừa check-in thành công trước đó.',
                'is_duplicate', TRUE
            );
        END IF;

        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'ALREADY_CHECKED_IN',
            'message', 'Nhân viên đã check-in lúc ' || TO_CHAR(v_existing_active.check_in_at, 'HH24:MI:SS DD/MM/YYYY') || ' và chưa check-out.',
            'attendance_id', v_existing_active.id
        );
    END IF;

    -- 2. Kiểm tra thông tin ca làm nếu có
    IF p_shift_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM roster_shifts WHERE id = p_shift_id;
        IF v_shift.id IS NOT NULL AND v_shift.end_time < v_shift.start_time THEN
            v_is_overnight := TRUE;
        END IF;
    END IF;

    -- 3. Ghi nhận lượt Check-in
    INSERT INTO attendance_records (
        organization_id,
        branch_id,
        staff_id,
        shift_id,
        work_date,
        check_in_at,
        is_overnight,
        status,
        check_in_method,
        check_in_meta,
        notes,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        p_staff_id,
        p_shift_id,
        CURRENT_DATE,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        v_is_overnight,
        'working',
        p_method,
        p_meta,
        p_notes,
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_target_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'attendance_id', v_target_id,
        'check_in_at', TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        'message', 'Check-in thành công vào lúc ' || TO_CHAR(TIMEZONE('Asia/Ho_Chi_Minh', NOW()), 'HH24:MI:SS') || '.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC CHECK-OUT CHẤM CÔNG (TÍNH GIỜ & CA QUA ĐÊM)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_check_out_attendance(
    p_attendance_id UUID,
    p_method VARCHAR DEFAULT 'manual_app',
    p_meta JSONB DEFAULT '{}'::jsonb,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_checkout_time TIMESTAMPTZ;
    v_actual_hours NUMERIC(6,2);
    v_is_overnight BOOLEAN;
BEGIN
    SELECT * INTO v_rec FROM attendance_records WHERE id = p_attendance_id;
    IF v_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy bản ghi chấm công.');
    END IF;

    IF v_rec.status <> 'working' AND v_rec.check_out_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Ca làm này đã được check-out trước đó.');
    END IF;

    v_checkout_time := TIMEZONE('Asia/Ho_Chi_Minh', NOW());
    
    -- Tính số giờ làm việc thực tế (làm tròn 2 chữ số thập phân)
    v_actual_hours := ROUND((EXTRACT(EPOCH FROM (v_checkout_time - v_rec.check_in_at)) / 3600.0)::NUMERIC, 2);
    
    -- Xác định ca qua đêm nếu ngày check-out khác ngày check-in
    v_is_overnight := (v_checkout_time::DATE > v_rec.check_in_at::DATE) OR v_rec.is_overnight;

    UPDATE attendance_records
    SET check_out_at = v_checkout_time,
        actual_hours = GREATEST(0, v_actual_hours),
        approved_hours = GREATEST(0, v_actual_hours), -- Mặc định giờ duyệt = giờ thực tế
        is_overnight = v_is_overnight,
        status = 'completed',
        check_out_meta = p_meta,
        notes = COALESCE(p_notes, notes),
        updated_at = v_checkout_time
    WHERE id = p_attendance_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'attendance_id', p_attendance_id,
        'check_out_at', v_checkout_time,
        'actual_hours', v_actual_hours,
        'is_overnight', v_is_overnight,
        'message', 'Check-out thành công. Tổng giờ làm: ' || v_actual_hours || ' giờ.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC YÊU CẦU ĐIỀU CHỈNH CHẤM CÔNG (QUÊN CHẤM CÔNG / ĐIỀU CHỈNH GIỜ)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_request_attendance_adjustment(
    p_org_id UUID,
    p_staff_id UUID,
    p_branch_id UUID,
    p_work_date DATE,
    p_requested_check_in TIMESTAMPTZ,
    p_requested_check_out TIMESTAMPTZ,
    p_reason TEXT,
    p_attendance_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orig_in TIMESTAMPTZ := NULL;
    v_orig_out TIMESTAMPTZ := NULL;
    v_hours NUMERIC(6,2);
    v_adj_id UUID;
BEGIN
    IF p_attendance_id IS NOT NULL THEN
        SELECT check_in_at, check_out_at INTO v_orig_in, v_orig_out
        FROM attendance_records
        WHERE id = p_attendance_id;
    END IF;

    IF p_requested_check_out <= p_requested_check_in THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Thời gian check-out phải sau thời gian check-in.');
    END IF;

    v_hours := ROUND((EXTRACT(EPOCH FROM (p_requested_check_out - p_requested_check_in)) / 3600.0)::NUMERIC, 2);

    INSERT INTO attendance_adjustments (
        organization_id,
        attendance_id,
        staff_id,
        branch_id,
        work_date,
        original_check_in,
        original_check_out,
        requested_check_in,
        requested_check_out,
        requested_hours,
        reason,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_attendance_id,
        p_staff_id,
        p_branch_id,
        p_work_date,
        v_orig_in,
        v_orig_out,
        p_requested_check_in,
        p_requested_check_out,
        v_hours,
        p_reason,
        'pending',
        TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    )
    RETURNING id INTO v_adj_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'adjustment_id', v_adj_id,
        'requested_hours', v_hours,
        'message', 'Đã gửi yêu cầu điều chỉnh chấm công thành công. Chờ quản lý phê duyệt.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC PHÊ DUYỆT ĐIỀU CHỈNH CHẤM CÔNG (APPROVE / REJECT ADJUSTMENT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_process_attendance_adjustment(
    p_adjustment_id UUID,
    p_action VARCHAR, -- 'approved', 'rejected'
    p_manager_staff_id UUID DEFAULT NULL,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_adj RECORD;
    v_target_att_id UUID;
BEGIN
    SELECT * INTO v_adj FROM attendance_adjustments WHERE id = p_adjustment_id;
    IF v_adj.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Không tìm thấy yêu cầu điều chỉnh chấm công.');
    END IF;

    IF p_action = 'rejected' THEN
        UPDATE attendance_adjustments
        SET status = 'rejected',
            approved_by = p_manager_staff_id,
            rejection_reason = p_rejection_reason,
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_adjustment_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'Đã từ chối yêu cầu điều chỉnh chấm công.');
    END IF;

    IF p_action = 'approved' THEN
        IF v_adj.attendance_id IS NOT NULL THEN
            -- Cập nhật bản ghi chấm công hiện có
            UPDATE attendance_records
            SET check_in_at = v_adj.requested_check_in,
                check_out_at = v_adj.requested_check_out,
                actual_hours = v_adj.requested_hours,
                approved_hours = v_adj.requested_hours,
                status = 'approved',
                approved_by = p_manager_staff_id,
                approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                notes = COALESCE(notes, '') || ' [Điều chỉnh duyệt: ' || v_adj.reason || ']',
                updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            WHERE id = v_adj.attendance_id;
            v_target_att_id := v_adj.attendance_id;
        ELSE
            -- Bổ sung lượt chấm công mới do quên chấm công
            INSERT INTO attendance_records (
                organization_id,
                branch_id,
                staff_id,
                work_date,
                check_in_at,
                check_out_at,
                actual_hours,
                approved_hours,
                status,
                check_in_method,
                approved_by,
                approved_at,
                notes,
                created_at,
                updated_at
            ) VALUES (
                v_adj.organization_id,
                v_adj.branch_id,
                v_adj.staff_id,
                v_adj.work_date,
                v_adj.requested_check_in,
                v_adj.requested_check_out,
                v_adj.requested_hours,
                v_adj.requested_hours,
                'approved',
                'manager_override',
                p_manager_staff_id,
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                'Bổ sung chấm công đã duyệt: ' || v_adj.reason,
                TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
                TIMEZONE('Asia/Ho_Chi_Minh', NOW())
            )
            RETURNING id INTO v_target_att_id;
        END IF;

        UPDATE attendance_adjustments
        SET status = 'approved',
            attendance_id = v_target_att_id,
            approved_by = p_manager_staff_id,
            approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
            updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
        WHERE id = p_adjustment_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'attendance_id', v_target_att_id,
            'approved_hours', v_adj.requested_hours,
            'message', 'Đã phê duyệt điều chỉnh công thành công.'
        );
    END IF;

    RETURN jsonb_build_object('success', FALSE, 'message', 'Hành động không hợp lệ.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC DUYỆT GIỜ CÔNG TRỰC TIẾP (APPROVE TIMESHEET RECORD)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_approve_timesheet_record(
    p_attendance_id UUID,
    p_approved_hours NUMERIC,
    p_manager_staff_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE attendance_records
    SET approved_hours = GREATEST(0, COALESCE(p_approved_hours, actual_hours)),
        status = 'approved',
        approved_by = p_manager_staff_id,
        approved_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW()),
        notes = COALESCE(p_notes, notes),
        updated_at = TIMEZONE('Asia/Ho_Chi_Minh', NOW())
    WHERE id = p_attendance_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'attendance_id', p_attendance_id,
        'approved_hours', p_approved_hours,
        'message', 'Đã phê duyệt giờ công thành công.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC LẤY DANH SÁCH BẢNG CÔNG & ĐIỀU CHỈNH (GET TIMESHEETS DIRECTORY)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_timesheets_directory(
    p_branch_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_records JSONB;
    v_adjustments JSONB;
    v_summary JSONB;
BEGIN
    -- 1. Danh sách bản ghi chấm công
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ar.id,
                'staff_id', ar.staff_id,
                'staff_name', sp.full_name,
                'staff_code', sp.code,
                'branch_id', ar.branch_id,
                'branch_name', b.name,
                'work_date', ar.work_date,
                'check_in_at', ar.check_in_at,
                'check_out_at', ar.check_out_at,
                'is_overnight', ar.is_overnight,
                'actual_hours', ar.actual_hours,
                'approved_hours', ar.approved_hours,
                'status', ar.status,
                'check_in_method', ar.check_in_method,
                'is_verified', ar.is_verified,
                'notes', ar.notes,
                'approved_by', ar.approved_by,
                'created_at', ar.created_at
            )
            ORDER BY ar.check_in_at DESC
        ),
        '[]'::jsonb
    ) INTO v_records
    FROM attendance_records ar
    JOIN staff_profiles sp ON sp.id = ar.staff_id
    JOIN branches b ON b.id = ar.branch_id
    WHERE (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
      AND (p_staff_id IS NULL OR ar.staff_id = p_staff_id)
      AND ar.work_date BETWEEN p_start_date AND p_end_date;

    -- 2. Danh sách yêu cầu điều chỉnh chờ duyệt
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', aa.id,
                'attendance_id', aa.attendance_id,
                'staff_id', aa.staff_id,
                'staff_name', sp.full_name,
                'branch_id', aa.branch_id,
                'branch_name', b.name,
                'work_date', aa.work_date,
                'original_check_in', aa.original_check_in,
                'original_check_out', aa.original_check_out,
                'requested_check_in', aa.requested_check_in,
                'requested_check_out', aa.requested_check_out,
                'requested_hours', aa.requested_hours,
                'reason', aa.reason,
                'status', aa.status,
                'created_at', aa.created_at
            )
            ORDER BY aa.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_adjustments
    FROM attendance_adjustments aa
    JOIN staff_profiles sp ON sp.id = aa.staff_id
    JOIN branches b ON b.id = aa.branch_id
    WHERE (p_branch_id IS NULL OR aa.branch_id = p_branch_id)
      AND (p_staff_id IS NULL OR aa.staff_id = p_staff_id)
      AND aa.status = 'pending';

    -- 3. Tổng hợp KPI
    SELECT jsonb_build_object(
        'total_working', COUNT(*) FILTER (WHERE status = 'working'),
        'total_completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'total_approved', COUNT(*) FILTER (WHERE status = 'approved'),
        'total_hours', COALESCE(SUM(approved_hours), 0)
    ) INTO v_summary
    FROM attendance_records
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_staff_id IS NULL OR staff_id = p_staff_id)
      AND work_date BETWEEN p_start_date AND p_end_date;

    RETURN jsonb_build_object(
        'records', v_records,
        'adjustments', v_adjustments,
        'summary', v_summary
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_in_attendance(UUID, UUID, UUID, UUID, VARCHAR, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_check_out_attendance(UUID, VARCHAR, JSONB, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_request_attendance_adjustment(UUID, UUID, UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_process_attendance_adjustment(UUID, VARCHAR, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_approve_timesheet_record(UUID, NUMERIC, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION rpc_get_timesheets_directory(UUID, DATE, DATE, UUID) TO authenticated, anon;
