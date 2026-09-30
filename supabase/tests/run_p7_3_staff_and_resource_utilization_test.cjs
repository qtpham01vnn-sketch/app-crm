const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assertExact(actual, expected, message) {
    if (actual !== expected) {
        console.error(`❌ ASSERTION FAILED: ${message}`);
        console.error(`   Expected: ${expected} (${typeof expected})`);
        console.error(`   Actual:   ${actual} (${typeof actual})`);
        throw new Error(message);
    } else {
        console.log(`  ✅ ${message} -> Khớp tuyệt đối: ${actual}`);
    }
}

async function runP73TestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TOÀN DIỆN P7.3: HIỆU SUẤT NHÂN SỰ, BÁC SĨ & CÔNG SUẤT PHÒNG/GHẾ');
    console.log('================================================================================\n');

    // 1. Context setup
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
    const orgId = orgs[0].id;
    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    const branchA = branches[0];
    const branchB = branches[1] || branches[0];

    console.log(`Context: Org=${orgId.slice(0, 8)}...`);
    console.log(`  - Chi nhánh A: ${branchA.name}`);
    console.log(`  - Chi nhánh B: ${branchB.name}\n`);

    // =========================================================================
    // TEST 1: KIỂM THỬ RPC P7.3 TRẢ VỀ CẤU TRÚC CHUẨN & MẪU SỐ 0
    // =========================================================================
    console.log('--- TEST 1: Đọc Báo Cáo Hiệu Suất P7.3 & Xử Lý Mẫu Số 0 ---');
    const { data: rep, error: rErr } = await supabase.rpc('rpc_get_staff_and_resource_utilization_report', {
        p_org_id: orgId,
        p_branch_id: branchA.id,
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30'
    });

    if (rErr) throw rErr;

    console.log('  Summary P7.3:', rep.summary);
    console.log('  Staff metrics count:', rep.staff_metrics.length);
    console.log('  Resource metrics count:', rep.resource_metrics.length);

    assertExact(rep.timezone, 'Asia/Ho_Chi_Minh (UTC+7)', 'Múi giờ báo cáo chuẩn Asia/Ho_Chi_Minh');
    assertExact(Array.isArray(rep.staff_metrics), true, 'Bảng nhân viên là mảng có cấu trúc');
    assertExact(Array.isArray(rep.resource_metrics), true, 'Bảng tài nguyên là mảng có cấu trúc');

    // Kiểm tra nhân sự có approved_work_hours = 0 -> utilization_pct phải là null
    const zeroStaff = rep.staff_metrics.find(s => s.approved_work_hours === 0);
    if (zeroStaff) {
        assertExact(zeroStaff.utilization_pct, null, `Nhân viên ${zeroStaff.full_name} chưa duyệt công -> utilization_pct = null (N/A)`);
        assertExact(zeroStaff.rating_status, 'Chưa triển khai nguồn dữ liệu đánh giá', 'Thông báo rõ chưa có nguồn đánh giá');
    }

    // =========================================================================
    // TEST 2: ĐỐI CHIẾU DRILL-DOWN PHÂN TRANG VÀ TỔNG SỐ BẢN GHI
    // =========================================================================
    console.log('\n--- TEST 2: Kiểm Thử Drill-Down Phân Trang Server & Không Trùng Lặp ---');
    const pageSize = 5;
    let page = 1;
    let allSessionIds = new Set();
    let totalPages = rep.pagination.total_pages || 1;

    while (page <= totalPages && page <= 5) {
        const { data: pageData } = await supabase.rpc('rpc_get_staff_and_resource_utilization_report', {
            p_org_id: orgId,
            p_branch_id: branchA.id,
            p_start_date: '2026-09-01',
            p_end_date: '2026-09-30',
            p_page: page,
            p_page_size: pageSize
        });

        totalPages = pageData.pagination.total_pages || 1;
        for (const item of pageData.drilldown_sessions) {
            if (allSessionIds.has(item.session_id)) {
                throw new Error(`Trùng lặp Session ID giữa các trang: ${item.session_id}`);
            }
            allSessionIds.add(item.session_id);
        }
        page++;
    }

    assertExact(allSessionIds.size, rep.pagination.total_records, 'Thu thập đầy đủ các ca phục vụ qua các trang drill-down');

    // =========================================================================
    // TEST 3: ĐỐI CHIẾU TỔNG SUMMARY KHỚP TỔNG TỪNG NHÂN VIÊN
    // =========================================================================
    console.log('\n--- TEST 3: Đối Chiếu Tổng KPI Summary Khớp Chi Tiết Từng Nhân Viên ---');
    let sumSalesRep = 0;
    let sumServiceExec = 0;
    let sumSessions = 0;
    let sumHandsOn = 0;
    let sumApproved = 0;

    for (const st of rep.staff_metrics) {
        sumSalesRep += Number(st.sales_invoiced || 0);
        sumServiceExec += Number(st.service_execution_revenue || 0);
        sumSessions += Number(st.sessions_completed_count || 0);
        sumHandsOn += Number(st.hands_on_hours || 0);
        sumApproved += Number(st.approved_work_hours || 0);
    }

    assertExact(Number(rep.summary.total_sales_rep_revenue), sumSalesRep, 'Tổng Doanh Số Tư Vấn Bán Hàng khớp 100%');
    assertExact(Number(rep.summary.total_service_exec_revenue), sumServiceExec, 'Tổng Doanh Thu Thực Hiện Dịch Vụ khớp 100%');
    assertExact(Number(rep.summary.total_sessions_count), sumSessions, 'Tổng Số Ca Hoàn Thành khớp 100%');
    assertExact(Number(rep.summary.total_hands_on_hours), Math.round(sumHandsOn * 100) / 100, 'Tổng Giờ Phục Vụ Trực Tiếp khớp 100%');
    assertExact(Number(rep.summary.total_approved_work_hours), Math.round(sumApproved * 100) / 100, 'Tổng Giờ Công Đã Duyệt khớp 100%');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KIỂM THỬ P7.3 ĐÃ HOÀN TẤT VÀ PASS 100%!');
    console.log('================================================================================\n');
}

runP73TestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.3:', err);
    process.exit(1);
});

