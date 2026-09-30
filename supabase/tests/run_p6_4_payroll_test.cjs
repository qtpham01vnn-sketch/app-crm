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

async function runPayrollTestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TỰ ĐỘNG P6.4: HOA HỒNG, BẢNG LƯƠNG, ĐIỀU CHỈNH & KHÓA SỔ KỲ LƯƠNG');
    console.log('================================================================================\n');

    // 1. Get Context
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
    const orgId = orgs[0].id;

    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(1);
    const branch1 = branches[0];

    // Tạo 1 KTV test có lương cơ bản 10,000,000đ
    const staffCode = 'TEST_PAY_' + Math.floor(Math.random() * 1000);
    const { data: staffRes } = await supabase.rpc('rpc_upsert_staff_profile', {
        p_org_id: orgId,
        p_full_name: 'KTV Payroll Test',
        p_code: staffCode,
        p_phone: '0908887766',
        p_primary_branch_id: branch1.id,
        p_branch_ids: [branch1.id],
        p_base_salary: 10000000,
        p_commission_rate: 5.0
    });
    const staffId = staffRes.staff_id;

    console.log(`Context: Org=${orgId}`);
    console.log(`  - Chi nhánh: ${branch1.name} (${branch1.id})`);
    console.log(`  - Nhân viên: KTV Payroll Test (${staffId}) - Lương cứng: 10,000,000đ\n`);

    const startDate = '2026-10-01';
    const endDate = '2026-10-31';

    // --- KỊCH BẢN 1: Ghi nhận hoa hồng dịch vụ hoàn tất (Status = eligible) ---
    console.log('--- KỊCH BẢN 1: Ghi Nhận Hoa Hồng Dịch Vụ Đủ Điều Kiện (Eligible) ---');
    const { data: commRecord, error: commErr } = await supabase.from('commission_records').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        staff_id: staffId,
        service_or_product_name: 'Massage Trị Liệu 90 Phút',
        item_type: 'service',
        item_revenue: 800000,
        applied_rate: 10.0,
        calculated_amount: 80000,
        split_ratio: 1.0,
        final_commission: 80000,
        status: 'eligible',
        occurred_at: '2026-10-05T14:00:00+07:00'
    }).select().single();

    if (commErr) throw new Error('Lỗi tạo hoa hồng: ' + commErr.message);
    assert(commRecord.final_commission === 80000, 'Ghi nhận hoa hồng 80,000đ thành công (status = eligible)');

    // --- KỊCH BẢN 2: Tính toán & Khởi tạo Bảng Lương Tháng ---
    console.log('\n--- KỊCH BẢN 2: Tính Toán Tự Động Kỳ Lương Tháng 10/2026 ---');
    const periodName = 'Kỳ Lương Tháng 10/2026 - Test ' + Math.floor(Math.random() * 1000);
    const { data: genRes, error: genErr } = await supabase.rpc('rpc_generate_payroll_period', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_period_name: periodName,
        p_start_date: startDate,
        p_end_date: endDate
    });
    if (genErr) throw new Error('Lỗi RPC generate payroll: ' + genErr.message);
    assert(genRes.success === true, 'Khởi tạo kỳ lương thành công: ' + genRes.message);
    const periodId = genRes.payroll_period_id;

    // Kiểm tra dòng lương của nhân viên
    const { data: staffPayRow } = await supabase.from('payroll_records').select('*').eq('payroll_period_id', periodId).eq('staff_id', staffId).single();
    assert(staffPayRow !== null, 'Dòng lương nhân viên đã được khởi tạo chuẩn xác');
    assert(Number(staffPayRow.base_salary) === 10000000, 'Lương cơ bản snapshot chính xác: 10,000,000đ');
    assert(Number(staffPayRow.commission_total) >= 80000, 'Tổng hoa hồng tích hợp chính xác: >= 80,000đ');
    console.log(`  - Lương thực lĩnh ban đầu: ${Number(staffPayRow.net_salary).toLocaleString('vi-VN')}đ`);

    // --- KỊCH BẢN 3: Điều Chỉnh Phụ Cấp & Giảm Trừ ---
    console.log('\n--- KỊCH BẢN 3: Điều Chỉnh Phụ Cấp (+500k) & Giảm Trừ (-200k) ---');
    const { data: adjRes, error: adjErr } = await supabase.rpc('rpc_update_payroll_record_adjustments', {
        p_record_id: staffPayRow.id,
        p_allowance: 500000,
        p_deduction: 200000,
        p_notes: 'Thưởng hiệu suất + phụ cấp cơm trưa'
    });
    if (adjErr) throw new Error('Lỗi RPC adjust payroll: ' + adjErr.message);
    assert(adjRes.success === true, 'Cập nhật phụ cấp và giảm trừ thành công');

    const { data: updatedPayRow } = await supabase.from('payroll_records').select('*').eq('id', staffPayRow.id).single();
    const expectedNet = Number(updatedPayRow.salary_by_hours) + Number(updatedPayRow.commission_total) + 500000 - 200000;
    assert(Number(updatedPayRow.net_salary) === expectedNet, `Lương thực lĩnh sau điều chỉnh khớp chuẩn xác: ${expectedNet.toLocaleString('vi-VN')}đ`);

    // --- KỊCH BẢN 4: Khóa Sổ Kỳ Lương (Lock Audit) ---
    console.log('\n--- KỊCH BẢN 4: Khóa Sổ Kỳ Lương & Chống Sửa Quá Khứ ---');
    const { data: lockRes } = await supabase.rpc('rpc_process_payroll_period_status', {
        p_period_id: periodId,
        p_action: 'lock',
        p_manager_staff_id: staffId
    });
    assert(lockRes.success === true, 'Khóa sổ kỳ lương thành công (status = locked)');

    // Thử chỉnh sửa sau khi khóa sổ -> Phải bị chặn
    const { data: blockEditRes } = await supabase.rpc('rpc_update_payroll_record_adjustments', {
        p_record_id: staffPayRow.id,
        p_allowance: 1000000,
        p_deduction: 0
    });
    assert(blockEditRes.success === false, 'Hệ thống bảo vệ toàn vẹn lịch sử: Chặn sửa kỳ lương đã khóa sổ');

    // --- KỊCH BẢN 5: Phê Duyệt & Quyết Toán Chi Trả Lương (Pay) ---
    console.log('\n--- KỊCH BẢN 5: Quyết Toán Chi Trả Lương & Đánh Dấu Paid ---');
    const { data: payRes } = await supabase.rpc('rpc_process_payroll_period_status', {
        p_period_id: periodId,
        p_action: 'pay',
        p_manager_staff_id: staffId
    });
    assert(payRes.success === true, 'Quyết toán chi trả lương thành công');

    // Xác minh hoa hồng liên kết đã chuyển sang 'paid'
    const { data: checkCommPaid } = await supabase.from('commission_records').select('status').eq('id', commRecord.id).single();
    assert(checkCommPaid.status === 'paid', 'Hoa hồng liên kết được chuyển sang trạng thái "paid"');

    // --- KỊCH BẢN 6: Truy Vấn Tổng Hợp Bảng Lương Overview ---
    console.log('\n--- KỊCH BẢN 6: Truy Vấn Báo Cáo Quyết Toán Thu Nhập Toàn Diện ---');
    const { data: overviewRes } = await supabase.rpc('rpc_get_payroll_overview', {
        p_branch_id: branch1.id,
        p_period_id: periodId
    });
    assert(overviewRes && Array.isArray(overviewRes.periods) && Array.isArray(overviewRes.records), 'Truy vấn bảng lương overview thành công');
    console.log(`  - Tổng thực chi kỳ lương: ${Number(overviewRes.periods[0]?.total_net_salary || 0).toLocaleString('vi-VN')}đ`);

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KỊCH BẢN KIỂM THỬ P6.4 (HOA HỒNG, BẢNG LƯƠNG & KHÓA SỔ) ĐẠT 100%');
    console.log('================================================================================\n');
}

runPayrollTestSuite().catch((err) => {
    console.error('LỖI KIỂM THỬ P6.4:', err);
    process.exit(1);
});
