const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ ASSERTION FAILED: ${message}`);
        throw new Error(message);
    } else {
        console.log(`  ✅ ${message}`);
    }
}

async function runRosterAndShiftTestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TỰ ĐỘNG P6.2: PHÂN CA, XUNG ĐỘT LIÊN CHI NHÁNH, NGHỈ PHÉP & AN TOÀN LỊCH HẸN');
    console.log('================================================================================\n');

    // 1. Get Context
    const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name').limit(1);
    if (orgErr || !orgs || orgs.length === 0) throw new Error('Không lấy được org: ' + (orgErr?.message || 'Empty'));
    const orgId = orgs[0].id;

    const { data: branches, error: bErr } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    if (bErr || !branches || branches.length < 2) throw new Error('Cần ít nhất 2 chi nhánh để test liên chi nhánh');
    const branch1 = branches[0];
    const branch2 = branches[1];

    console.log(`Context: Org=${orgId}`);
    console.log(`  - Chi nhánh 1: ${branch1.name} (${branch1.id})`);
    console.log(`  - Chi nhánh 2: ${branch2.name} (${branch2.id})`);

    // 2. Tạo 2 nhân viên test
    const staffACode = 'TEST_ROSTER_A_' + Math.floor(Math.random() * 1000);
    const staffBCode = 'TEST_ROSTER_B_' + Math.floor(Math.random() * 1000);

    const { data: staffARes, error: staffAErr } = await supabase.rpc('rpc_upsert_staff_profile', {
        p_org_id: orgId,
        p_full_name: 'KTV Roster Test A',
        p_code: staffACode,
        p_phone: '0901112233',
        p_primary_branch_id: branch1.id,
        p_branch_ids: [branch1.id, branch2.id],
        p_base_salary: 10000000
    });
    if (staffAErr || !staffARes?.success) throw new Error('Lỗi tạo KTV A: ' + (staffAErr?.message || JSON.stringify(staffARes)));
    const staffAId = staffARes.staff_id;

    const { data: staffBRes, error: staffBErr } = await supabase.rpc('rpc_upsert_staff_profile', {
        p_org_id: orgId,
        p_full_name: 'KTV Roster Test B',
        p_code: staffBCode,
        p_phone: '0901112244',
        p_primary_branch_id: branch2.id,
        p_branch_ids: [branch2.id],
        p_base_salary: 9000000
    });
    if (staffBErr || !staffBRes?.success) throw new Error('Lỗi tạo KTV B: ' + (staffBErr?.message || JSON.stringify(staffBRes)));
    const staffBId = staffBRes.staff_id;

    console.log(`  ✅ Đã tạo KTV A (${staffAId}) và KTV B (${staffBId})\n`);

    const testDate = '2026-10-15';

    // --- KỊCH BẢN 1: Tạo ca làm việc chuẩn tại Chi Nhánh 1 ---
    console.log('--- KỊCH BẢN 1: Tạo Ca Sáng Tại Chi Nhánh 1 (08:00 - 12:00) ---');
    const { data: shift1Res, error: shift1Err } = await supabase.rpc('rpc_upsert_roster_shift', {
        p_org_id: orgId,
        p_staff_id: staffAId,
        p_branch_id: branch1.id,
        p_shift_date: testDate,
        p_start_time: '08:00:00',
        p_end_time: '12:00:00',
        p_shift_type: 'morning',
        p_break_minutes: 0,
        p_is_off: false
    });
    if (shift1Err) throw new Error('Lỗi tạo ca 1: ' + shift1Err.message);
    assert(shift1Res.success === true, 'Tạo ca sáng thành công');
    const shift1Id = shift1Res.shift_id;

    // --- KỊCH BẢN 2: Chặn ca trùng giờ cùng chi nhánh ---
    console.log('\n--- KỊCH BẢN 2: Chống Trùng Ca Cùng KTV (10:00 - 14:00 trùng ca sáng) ---');
    const { data: overlapRes, error: overlapErr } = await supabase.rpc('rpc_upsert_roster_shift', {
        p_org_id: orgId,
        p_staff_id: staffAId,
        p_branch_id: branch1.id,
        p_shift_date: testDate,
        p_start_time: '10:00:00',
        p_end_time: '14:00:00',
        p_shift_type: 'custom',
        p_is_off: false
    });
    if (overlapErr) throw new Error('Lỗi RPC overlap: ' + overlapErr.message);
    assert(overlapRes.success === false && overlapRes.code === 'TIME_OVERLAP', 'Hệ thống đã chặn chính xác ca trùng khung giờ (TIME_OVERLAP)');

    // --- KỊCH BẢN 3: Chặn xung đột thời gian di chuyển liên chi nhánh (<30 phút) ---
    console.log('\n--- KỊCH BẢN 3: Chống Xung Đột Di Chuyển Liên Chi Nhánh (Ca ở CN2 bắt đầu lúc 12:15, cách 15p) ---');
    const { data: travelRes, error: travelErr } = await supabase.rpc('rpc_upsert_roster_shift', {
        p_org_id: orgId,
        p_staff_id: staffAId,
        p_branch_id: branch2.id,
        p_shift_date: testDate,
        p_start_time: '12:15:00',
        p_end_time: '16:00:00',
        p_shift_type: 'afternoon',
        p_is_off: false
    });
    if (travelErr) throw new Error('Lỗi RPC travel: ' + travelErr.message);
    assert(travelRes.success === false && travelRes.code === 'TRAVEL_TIME_INSUFFICIENT', 'Hệ thống đã chặn ca liên chi nhánh thiếu thời gian di chuyển (TRAVEL_TIME_INSUFFICIENT)');

    // --- KỊCH BẢN 4: Cho phép ca hợp lệ tại chi nhánh 2 (cách 60 phút di chuyển) ---
    console.log('\n--- KỊCH BẢN 4: Phân Ca Chi Nhánh 2 Hợp Lệ (13:00 - 17:00, đệm 60p) ---');
    const { data: shift2Res, error: shift2Err } = await supabase.rpc('rpc_upsert_roster_shift', {
        p_org_id: orgId,
        p_staff_id: staffAId,
        p_branch_id: branch2.id,
        p_shift_date: testDate,
        p_start_time: '13:00:00',
        p_end_time: '17:00:00',
        p_shift_type: 'afternoon',
        p_break_minutes: 0,
        p_is_off: false
    });
    if (shift2Err) throw new Error('Lỗi tạo ca 2: ' + shift2Err.message);
    assert(shift2Res.success === true, 'Phân ca liên chi nhánh có đủ thời gian di chuyển thành công');
    const shift2Id = shift2Res.shift_id;

    // --- KỊCH BẢN 5: An Toàn Lịch Hẹn Khách Hàng Khi Hủy/Nghỉ Ca ---
    console.log('\n--- KỊCH BẢN 5: Kiểm Tra An Toàn Lịch Hẹn Khách Hàng Khi Hủy Ca ---');
    // Lấy 1 dịch vụ test
    const { data: srvs } = await supabase.from('services').select('id').limit(1);
    const serviceId = srvs && srvs.length > 0 ? srvs[0].id : null;

    // Tạo 1 cuộc hẹn cho Staff A vào ngày testDate lúc 09:00 (nằm trong ca sáng)
    let testApptId = null;
    if (serviceId) {
        const { data: appt, error: apptErr } = await supabase.from('appointments').insert({
            organization_id: orgId,
            branch_id: branch1.id,
            staff_id: staffAId,
            service_id: serviceId,
            scheduled_at: `${testDate}T09:00:00+07:00`,
            duration_minutes: 60,
            status: 'confirmed',
            notes: 'Test appointment protection'
        }).select('id').single();

        if (appt) testApptId = appt.id;
    }

    if (testApptId) {
        // Thử cập nhật ca 1 thành nghỉ (is_off = true) mà KHÔNG dùng force -> Phải bị chặn
        const { data: blockCancelRes } = await supabase.rpc('rpc_upsert_roster_shift', {
            p_org_id: orgId,
            p_shift_id: shift1Id,
            p_staff_id: staffAId,
            p_shift_date: testDate,
            p_is_off: true,
            p_force: false
        });
        assert(blockCancelRes.success === false && blockCancelRes.code === 'HAS_ACTIVE_APPOINTMENTS', 'Bảo vệ an toàn lịch hẹn: Chặn hủy ca khi đang có khách đặt');

        // Thử cập nhật với p_force = true -> Phải thành công và unassign appointment
        const { data: forceCancelRes } = await supabase.rpc('rpc_upsert_roster_shift', {
            p_org_id: orgId,
            p_shift_id: shift1Id,
            p_staff_id: staffAId,
            p_shift_date: testDate,
            p_is_off: true,
            p_force: true
        });
        assert(forceCancelRes.success === true, 'Hủy ca có lực ép (force): Tự động giải phóng KTV của lịch hẹn để điều phối lại');

        const { data: apptCheck } = await supabase.from('appointments').select('staff_id').eq('id', testApptId).single();
        assert(apptCheck.staff_id === null, 'Lịch hẹn đã được chuyển về trạng thái chờ điều phối (staff_id = null)');
    }

    // --- KỊCH BẢN 6: Đổi Ca (Shift Swap) ---
    console.log('\n--- KỊCH BẢN 6: Hoán Đổi Ca Làm Việc Giữa 2 KTV ---');
    const testDate2 = '2026-10-16';
    const { data: shiftA2Res } = await supabase.rpc('rpc_upsert_roster_shift', {
        p_org_id: orgId,
        p_staff_id: staffAId,
        p_branch_id: branch1.id,
        p_shift_date: testDate2,
        p_start_time: '08:00:00',
        p_end_time: '12:00:00',
        p_shift_type: 'morning',
        p_is_off: false
    });
    const shiftA2Id = shiftA2Res.shift_id;

    const { data: shiftB2Res } = await supabase.rpc('rpc_upsert_roster_shift', {
        p_org_id: orgId,
        p_staff_id: staffBId,
        p_branch_id: branch2.id,
        p_shift_date: testDate2,
        p_start_time: '13:00:00',
        p_end_time: '17:00:00',
        p_shift_type: 'afternoon',
        p_is_off: false
    });
    const shiftB2Id = shiftB2Res.shift_id;

    // Tạo yêu cầu đổi ca: Staff A đổi với Staff B
    const { data: swapReq, error: swapReqErr } = await supabase.from('shift_swap_requests').insert({
        organization_id: orgId,
        requester_staff_id: staffAId,
        requester_shift_id: shiftA2Id,
        target_staff_id: staffBId,
        target_shift_id: shiftB2Id,
        reason: 'Có việc gia đình chiều'
    }).select('id').single();

    if (swapReqErr) throw new Error('Lỗi tạo swap request: ' + swapReqErr.message);

    // Duyệt yêu cầu đổi ca
    const { data: swapProcessRes, error: swapErr } = await supabase.rpc('rpc_process_shift_swap', {
        p_swap_id: swapReq.id,
        p_action: 'approve'
    });
    if (swapErr) {
        console.error('Lỗi RPC swap:', swapErr);
        throw swapErr;
    }
    assert(swapProcessRes && swapProcessRes.success === true, 'Quản lý phê duyệt hoán đổi ca thành công');

    // Kiểm tra chủ sở hữu ca làm sau khi hoán đổi
    const { data: checkShiftA2 } = await supabase.from('roster_shifts').select('staff_id').eq('id', shiftA2Id).single();
    const { data: checkShiftB2 } = await supabase.from('roster_shifts').select('staff_id').eq('id', shiftB2Id).single();
    assert(checkShiftA2.staff_id === staffBId && checkShiftB2.staff_id === staffAId, 'Hai ca làm đã được hoán đổi chủ sở hữu KTV chuẩn xác nguyên tử');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KỊCH BẢN KIỂM THỬ P6.2 (PHÂN CA, LIÊN CHI NHÁNH & AN TOÀN LỊCH HẸN) ĐẠT 100%');
    console.log('================================================================================\n');
}

runRosterAndShiftTestSuite().catch((err) => {
    console.error('LỖI KIỂM THỬ:', err);
    process.exit(1);
});
