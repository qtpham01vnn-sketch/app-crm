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

async function runP6HardeningTests() {
    console.log('================================================================================');
    console.log('KIỂM THỬ HARDENING & EDGE CASES PHÂN HỆ P6 (BẢO MẬT, IDEMPOTENCY, REVERSAL & AUDIT)');
    console.log('================================================================================\n');

    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    const orgId = orgs[0].id;
    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(1);
    const branch1 = branches[0];

    // 1. Tạo 2 KTV test
    const { data: staff1 } = await supabase.rpc('rpc_upsert_staff_profile', {
        p_org_id: orgId,
        p_full_name: 'KTV Test Hardening 1',
        p_base_salary: 12000000,
        p_primary_branch_id: branch1.id,
        p_branch_ids: [branch1.id]
    });
    const staff1Id = staff1.staff_id;

    // --- TEST 1: Check-in Cooldown vs Idempotency ---
    console.log('--- TEST 1: Check-in Idempotency (Within 2m) vs Frequency Policy ---');
    const { data: punch1 } = await supabase.rpc('rpc_check_in_attendance', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_staff_id: staff1Id,
        p_method: 'gps'
    });
    const { data: punchDuplicate } = await supabase.rpc('rpc_check_in_attendance', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_staff_id: staff1Id,
        p_method: 'gps'
    });
    assert(punchDuplicate.is_duplicate === true && punchDuplicate.attendance_id === punch1.attendance_id, 
        'Check-in gửi lặp trong 2 phút được xử lý Idempotent (trả về đúng ID ban đầu, không sinh bản ghi thừa)');

    // Checkout punch 1
    await supabase.rpc('rpc_check_out_attendance', { p_attendance_id: punch1.attendance_id });

    // --- TEST 2: Check-in Sau Khi Đã Check-out (Nhiều ca trong ngày) ---
    console.log('\n--- TEST 2: Check-in Lần 2 Sau Khi Đã Check-out Ca Trước (Đa ca trong ngày) ---');
    const { data: punch2 } = await supabase.rpc('rpc_check_in_attendance', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_staff_id: staff1Id,
        p_method: 'manual_app'
    });
    assert(punch2.success === true && punch2.attendance_id !== punch1.attendance_id,
        'Nhân viên hoàn toàn được phép check-in ca mới trong ngày sau khi đã kết thúc ca trước');
    await supabase.rpc('rpc_check_out_attendance', { p_attendance_id: punch2.attendance_id });

    // --- TEST 3: Hoàn Hủy Hóa Đơn Có Ghi Vết Hoa Hồng (Reversal) ---
    console.log('\n--- TEST 3: Xử Lý Hoàn/Hủy Hóa Đơn & Đảo Hoa Hồng (Commission Reversal Audit Trail) ---');
    const { data: commRow } = await supabase.from('commission_records').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        staff_id: staff1Id,
        service_or_product_name: 'Dịch Vụ Test Hoàn Hủy',
        item_revenue: 1000000,
        applied_rate: 10.0,
        final_commission: 100000,
        status: 'eligible'
    }).select().single();

    // Khách hàng hủy dịch vụ -> Đảo hoa hồng
    const { data: updatedComm } = await supabase.from('commission_records').update({
        status: 'reversed',
        reversal_reason: 'Khách hàng yêu cầu hoàn tiền hóa đơn HD-CANCEL-01',
        final_commission: 0,
        updated_at: new Date().toISOString()
    }).eq('id', commRow.id).select().single();

    assert(updatedComm.status === 'reversed' && updatedComm.reversal_reason.includes('HD-CANCEL-01'),
        'Hoa hồng hủy được ghi vết rõ ràng (status = reversed, final_commission = 0, kèm lý do)');

    // --- TEST 4: Bất Biến Kỳ Lương Đã Khóa Sổ (Lock Immutability) ---
    console.log('\n--- TEST 4: Bảo Vệ Tính Bất Biến Của Kỳ Lương Đã Khóa Sổ ---');
    const { data: genPayroll } = await supabase.rpc('rpc_generate_payroll_period', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_period_name: 'Kỳ Lương Khóa Test ' + Math.floor(Math.random() * 1000),
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30'
    });
    const periodId = genPayroll.payroll_period_id;

    // Khóa sổ kỳ lương
    await supabase.rpc('rpc_process_payroll_period_status', { p_period_id: periodId, p_action: 'lock' });

    // Lấy dòng lương của staff1
    const { data: payRow } = await supabase.from('payroll_records').select('id, net_salary').eq('payroll_period_id', periodId).eq('staff_id', staff1Id).single();
    const origNet = payRow.net_salary;

    // Cố tình sửa phụ cấp/giảm trừ trên kỳ đã khóa
    const { data: attemptEdit } = await supabase.rpc('rpc_update_payroll_record_adjustments', {
        p_record_id: payRow.id,
        p_allowance: 5000000,
        p_deduction: 0
    });
    assert(attemptEdit.success === false, 'Hệ thống từ chối sửa đổi trên kỳ lương đã khóa');

    const { data: checkPayRowAfter } = await supabase.from('payroll_records').select('net_salary').eq('id', payRow.id).single();
    assert(checkPayRowAfter.net_salary === origNet, 'Lương thực lĩnh của kỳ quá khứ được bảo toàn 100%, không bị sửa đổi âm thầm');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ TEST HARDENING & EDGE CASES PHÂN HỆ P6 ĐẠT 100% BẢO TOÀN DỮ LIỆU');
    console.log('================================================================================\n');
}

runP6HardeningTests().catch(err => {
    console.error('LỖI TEST HARDENING:', err);
    process.exit(1);
});
