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

async function runP74TestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TOÀN DIỆN P7.4: PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT (BI)');
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
    // TEST 1: KIỂM THỬ ĐỌC BÁO CÁO P7.4 VỚI CẤU TRÚC CHUẨN
    // =========================================================================
    console.log('--- TEST 1: Đọc Báo Cáo Phân Tích Khách Hàng P7.4 ---');
    const { data: rep, error: rErr } = await supabase.rpc('rpc_get_customer_retention_and_cohort_report', {
        p_org_id: orgId,
        p_branch_id: branchA.id,
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30',
        p_segment_filter: 'all',
        p_page: 1,
        p_page_size: 50
    });

    if (rErr) throw rErr;

    console.log('  Summary P7.4:', rep.summary);
    console.log('  RFM Segments count:', rep.rfm_segments.length);
    console.log('  Service Cohorts count:', rep.cohort_service_retention.length);
    console.log('  Repurchase Cohorts count:', rep.cohort_repurchase_retention.length);

    assertExact(rep.timezone, 'Asia/Ho_Chi_Minh (UTC+7)', 'Múi giờ báo cáo chuẩn Asia/Ho_Chi_Minh');
    assertExact(Array.isArray(rep.rfm_segments), true, 'Bảng phân nhóm RFM là mảng có cấu trúc');
    assertExact(Array.isArray(rep.cohort_service_retention), true, 'Bảng Cohort Phục Vụ là mảng có cấu trúc');
    assertExact(Array.isArray(rep.cohort_repurchase_retention), true, 'Bảng Cohort Mua Lại là mảng có cấu trúc');
    assertExact(Array.isArray(rep.customer_drilldown), true, 'Danh sách Drilldown Khách Hàng là mảng có cấu trúc');

    // =========================================================================
    // TEST 2: ĐỐI CHIẾU TỔNG SỐ KHÁCH TOÀN HỆ THỐNG VỚI TỔNG CÁC NHÓM RFM
    // =========================================================================
    console.log('\n--- TEST 2: Đối Chiếu Tổng Số Khách Với Tổng Các Nhóm RFM ---');
    let sumRfmCustomers = 0;
    for (const seg of rep.rfm_segments) {
        sumRfmCustomers += Number(seg.customer_count || 0);
    }

    assertExact(rep.summary.total_customers_in_system, sumRfmCustomers, 'Tổng khách trong hệ thống khớp tổng từng phân nhóm RFM');

    // =========================================================================
    // TEST 3: KIỂM TRA TÍNH TOÁN COHORT & TRẠNG THÁI 'CHƯA ĐỦ THỜI GIAN THEO DÕI'
    // =========================================================================
    console.log('\n--- TEST 3: Kiểm Tra Cohort Phục Vụ & Mua Lại ---');
    for (const ch of rep.cohort_service_retention) {
        if (ch.retention_30d.eligible === 0) {
            assertExact(ch.retention_30d.status, 'Chưa đủ thời gian theo dõi', `Cohort ${ch.cohort_month} chưa đủ 30 ngày -> hiển thị nhãn chưa đủ thời gian`);
            assertExact(ch.retention_30d.pct, null, `Cohort ${ch.cohort_month} chưa đủ 30 ngày -> pct = null`);
        }
    }

    for (const ch of rep.cohort_repurchase_retention) {
        if (ch.repurchase_30d.eligible === 0) {
            assertExact(ch.repurchase_30d.status, 'Chưa đủ thời gian theo dõi', `Cohort ${ch.cohort_month} mua lại chưa đủ 30 ngày -> hiển thị nhãn chưa đủ thời gian`);
            assertExact(ch.repurchase_30d.pct, null, `Cohort ${ch.cohort_month} mua lại chưa đủ 30 ngày -> pct = null`);
        }
    }

    // =========================================================================
    // TEST 4: DRILLDOWN PHÂN TRANG VÀ DUYỆT BẢN GHI
    // =========================================================================
    console.log('\n--- TEST 4: Kiểm Thử Drill-Down Phân Trang Server & Không Trùng Lặp ---');
    const pageSize = 5;
    let page = 1;
    let allCustomerIds = new Set();
    let totalPages = rep.pagination.total_pages || 1;

    while (page <= totalPages && page <= 5) {
        const { data: pageData } = await supabase.rpc('rpc_get_customer_retention_and_cohort_report', {
            p_org_id: orgId,
            p_branch_id: branchA.id,
            p_start_date: '2026-09-01',
            p_end_date: '2026-09-30',
            p_segment_filter: 'all',
            p_page: page,
            p_page_size: pageSize
        });

        totalPages = pageData.pagination.total_pages || 1;
        for (const item of pageData.customer_drilldown) {
            if (allCustomerIds.has(item.customer_id)) {
                throw new Error(`Trùng lặp Customer ID giữa các trang: ${item.customer_id}`);
            }
            allCustomerIds.add(item.customer_id);
        }
        page++;
    }

    assertExact(allCustomerIds.size, rep.pagination.total_records, 'Thu thập đầy đủ các khách hàng qua các trang drill-down');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KIỂM THỬ P7.4 ĐÃ HOÀN TẤT VÀ PASS 100%!');
    console.log('================================================================================\n');
}

runP74TestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.4:', err);
    process.exit(1);
});
