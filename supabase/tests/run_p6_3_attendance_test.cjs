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

async function runAttendanceTestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TỰ ĐỘNG P6.3: CHẤM CÔNG, CHECK-IN/OUT, CA QUA ĐÊM & ĐIỀU CHỈNH CÔNG');
    console.log('================================================================================\n');

    // 1. Get Context
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
    const orgId = orgs[0].id;

    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    const branch1 = branches[0];

    // Tạo 1 KTV test
    const staffCode = 'TEST_ATT_' + Math.floor(Math.random() * 1000);
    const { data: staffRes } = await supabase.rpc('rpc_upsert_staff_profile', {
        p_org_id: orgId,
        p_full_name: 'KTV Attendance Test',
        p_code: staffCode,
        p_phone: '0909998877',
        p_primary_branch_id: branch1.id,
        p_branch_ids: [branch1.id],
        p_base_salary: 8000000
    });
    const staffId = staffRes.staff_id;

    console.log(`Context: Org=${orgId}`);
    console.log(`  - Chi nhánh: ${branch1.name} (${branch1.id})`);
    console.log(`  - Nhân viên: KTV Attendance Test (${staffId})\n`);

    // --- KỊCH BẢN 1: Check-in ca làm việc ---
    console.log('--- KỊCH BẢN 1: Check-in Chấm Công Tại Chi Nhánh (Kèm GPS & Metadata) ---');
    const { data: checkInRes, error: checkInErr } = await supabase.rpc('rpc_check_in_attendance', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_staff_id: staffId,
        p_method: 'gps',
        p_meta: { lat: 10.7769, lng: 106.7009, accuracy: 12, ip: '118.69.182.10' },
        p_notes: 'Check-in đúng giờ'
    });
    if (checkInErr) throw new Error('Lỗi check-in: ' + checkInErr.message);
    assert(checkInRes.success === true, 'Check-in thành công: ' + checkInRes.message);
    const attendanceId = checkInRes.attendance_id;

    // --- KỊCH BẢN 2: Chống gửi lặp / Check-in trùng ---
    console.log('\n--- KỊCH BẢN 2: Cơ Chế Chống Gửi Lặp (Gửi Check-in Liên Tiếp) ---');
    const { data: dupCheckInRes } = await supabase.rpc('rpc_check_in_attendance', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_staff_id: staffId,
        p_method: 'gps'
    });
    assert(dupCheckInRes.attendance_id === attendanceId, 'Hệ thống bảo vệ chống check-in lặp thành công (nhận diện đúng bản ghi đang mở)');

    // --- KỊCH BẢN 3: Check-out và Tính Giờ Làm Thực Tế ---
    console.log('\n--- KỊCH BẢN 3: Check-out Chấm Công & Tính Giờ Thực Tế ---');
    const { data: checkOutRes, error: checkOutErr } = await supabase.rpc('rpc_check_out_attendance', {
        p_attendance_id: attendanceId,
        p_method: 'gps',
        p_meta: { lat: 10.7769, lng: 106.7009, accuracy: 15 }
    });
    if (checkOutErr) throw new Error('Lỗi check-out: ' + checkOutErr.message);
    assert(checkOutRes.success === true, 'Check-out thành công: ' + checkOutRes.message);

    // Xác minh trạng thái sau check-out
    const { data: attRecord } = await supabase.from('attendance_records').select('*').eq('id', attendanceId).single();
    assert(attRecord.status === 'completed' && attRecord.check_out_at !== null, 'Trạng thái bản ghi chuyển sang "completed" và có giờ ra đầy đủ');

    // --- KỊCH BẢN 4: Quên Chấm Công & Gửi Yêu Cầu Điều Chỉnh ---
    console.log('\n--- KỊCH BẢN 4: Quên Chấm Công & Yêu Cầu Điều Chỉnh Có Lý Do ---');
    const testWorkDate = '2026-10-10';
    const reqIn = `${testWorkDate}T08:00:00+07:00`;
    const reqOut = `${testWorkDate}T17:00:00+07:00`; // 9 tiếng

    const { data: adjRes, error: adjErr } = await supabase.rpc('rpc_request_attendance_adjustment', {
        p_org_id: orgId,
        p_staff_id: staffId,
        p_branch_id: branch1.id,
        p_work_date: testWorkDate,
        p_requested_check_in: reqIn,
        p_requested_check_out: reqOut,
        p_reason: 'Quên chấm công do mất kết nối mạng sáng sớm'
    });
    if (adjErr) throw new Error('Lỗi tạo yêu cầu điều chỉnh: ' + adjErr.message);
    assert(adjRes.success === true, 'Gửi yêu cầu điều chỉnh thành công: Yêu cầu ' + adjRes.requested_hours + ' giờ công');
    const adjId = adjRes.adjustment_id;

    // --- KỊCH BẢN 5: Quản Lý Phê Duyệt Điều Chỉnh Công ---
    console.log('\n--- KỊCH BẢN 5: Quản Lý Phê Duyệt Điều Chỉnh Công (Sinh Bản Ghi Đã Duyệt) ---');
    const { data: approveAdjRes, error: approveAdjErr } = await supabase.rpc('rpc_process_attendance_adjustment', {
        p_adjustment_id: adjId,
        p_action: 'approved'
    });
    if (approveAdjErr) throw new Error('Lỗi duyệt điều chỉnh: ' + approveAdjErr.message);
    assert(approveAdjRes.success === true, 'Phê duyệt điều chỉnh thành công: ' + approveAdjRes.approved_hours + ' giờ');

    // Xác minh bản ghi chấm công được tạo và trạng thái là 'approved'
    const newAttId = approveAdjRes.attendance_id;
    const { data: newAttRecord } = await supabase.from('attendance_records').select('*').eq('id', newAttId).single();
    assert(newAttRecord.status === 'approved' && Number(newAttRecord.approved_hours) === 9, 'Bản ghi chấm công bổ sung được duyệt chính xác 9 giờ công');

    // --- KỊCH BẢN 6: Duyệt Trực Tiếp Bảng Công ---
    console.log('\n--- KỊCH BẢN 6: Quản Lý Phê Duyệt Trực Tiếp Giờ Công (Timesheet Direct Approval) ---');
    const { data: directApproveRes } = await supabase.rpc('rpc_approve_timesheet_record', {
        p_attendance_id: attendanceId,
        p_approved_hours: 8.0,
        p_notes: 'Duyệt tròn 8 tiếng ca tiêu chuẩn'
    });
    assert(directApproveRes.success === true, 'Duyệt trực tiếp giờ công thành công');

    // --- KỊCH BẢN 7: Truy Vấn Tổng Hợp Bảng Công & KPI Toàn Diện ---
    console.log('\n--- KỊCH BẢN 7: Truy Vấn Ma Trận Chấm Công & KPI ---');
    const { data: dirRes } = await supabase.rpc('rpc_get_timesheets_directory', {
        p_branch_id: branch1.id,
        p_start_date: '2026-10-01',
        p_end_date: '2026-10-31'
    });
    assert(dirRes && Array.isArray(dirRes.records) && dirRes.summary !== undefined, 'Truy vấn ma trận chấm công và KPI thành công 100%');
    console.log(`  - Tổng giờ công được duyệt trong tháng: ${dirRes.summary.total_hours} giờ`);

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KỊCH BẢN KIỂM THỬ P6.3 (CHẤM CÔNG, QUÊN CHẤM CÔNG & DUYỆT GIỜ LÀM) ĐẠT 100%');
    console.log('================================================================================\n');
}

runAttendanceTestSuite().catch((err) => {
    console.error('LỖI KIỂM THỬ P6.3:', err);
    process.exit(1);
});
