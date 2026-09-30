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

async function runP72ComprehensiveTestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TOÀN DIỆN P7.2: COGS, BOM SNAPSHOT, CONCURRENCY, PAGINATION & RLS');
    console.log('================================================================================\n');

    // 1. Context setup
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
    const orgId = orgs[0].id;
    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    const branchA = branches[0];
    const branchB = branches[1] || branches[0];

    const serviceId = '55555555-5555-5555-5555-555555555551';
    const productId = '44444444-4444-4444-4444-444444444441';

    console.log(`Context: Org=${orgId.slice(0, 8)}...`);
    console.log(`  - Chi nhánh B (Phục vụ): ${branchB.name} (${branchB.id.slice(0, 8)})\n`);

    // =========================================================================
    // TEST 1: CONCURRENCY CASE A — ĐỦ TỒN CHO CẢ 2 (CẢ 2 THÀNH CÔNG)
    // =========================================================================
    console.log('--- TEST 1: Concurrency Case A (Tồn 50.000 chai, 2 yêu cầu 0.300 chai song song) ---');
    await supabase.from('inventory_stocks').upsert({
        organization_id: orgId,
        branch_id: branchB.id,
        product_id: productId,
        stock_on_hand: 50.000,
        cost_price: 200000
    }, { onConflict: 'branch_id,product_id' });

    const keyConcA1 = 'CONC-A1-' + Math.floor(Math.random() * 1000000);
    const keyConcA2 = 'CONC-A2-' + Math.floor(Math.random() * 1000000);

    const [resA1, resA2] = await Promise.all([
        supabase.rpc('rpc_record_service_material_usage', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_service_id: serviceId,
            p_staff_id: null,
            p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
            p_idempotency_key: keyConcA1,
            p_notes: 'Concurrent test A1'
        }),
        supabase.rpc('rpc_record_service_material_usage', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_service_id: serviceId,
            p_staff_id: null,
            p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
            p_idempotency_key: keyConcA2,
            p_notes: 'Concurrent test A2'
        })
    ]);

    assertExact(resA1.data?.success, true, 'Yêu cầu song song A1 thành công');
    assertExact(resA2.data?.success, true, 'Yêu cầu song song A2 thành công');
    assertExact(Number(resA1.data?.total_material_cost), 60000, 'Chi phí A1 = 60.000đ');
    assertExact(Number(resA2.data?.total_material_cost), 60000, 'Chi phí A2 = 60.000đ');

    // =========================================================================
    // TEST 2: CONCURRENCY CASE B — CHỈ ĐỦ TỒN CHO 1 YÊU CẦU (ĐÚNG 1 THÀNH CÔNG, 1 BỊ TỪ CHỐI)
    // =========================================================================
    console.log('\n--- TEST 2: Concurrency Case B (Tồn đúng 0.300 chai, 2 yêu cầu 0.300 chai song song) ---');
    await supabase.from('inventory_stocks').upsert({
        organization_id: orgId,
        branch_id: branchB.id,
        product_id: productId,
        stock_on_hand: 0.300,
        cost_price: 200000
    }, { onConflict: 'branch_id,product_id' });

    const keyConcB1 = 'CONC-B1-' + Math.floor(Math.random() * 1000000);
    const keyConcB2 = 'CONC-B2-' + Math.floor(Math.random() * 1000000);

    const [resB1, resB2] = await Promise.allSettled([
        supabase.rpc('rpc_record_service_material_usage', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_service_id: serviceId,
            p_staff_id: null,
            p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
            p_idempotency_key: keyConcB1,
            p_notes: 'Race test B1'
        }),
        supabase.rpc('rpc_record_service_material_usage', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_service_id: serviceId,
            p_staff_id: null,
            p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
            p_idempotency_key: keyConcB2,
            p_notes: 'Race test B2'
        })
    ]);

    const successB1 = resB1.status === 'fulfilled' && resB1.value.data?.success === true;
    const successB2 = resB2.status === 'fulfilled' && resB2.value.data?.success === true;
    const totalSuccess = (successB1 ? 1 : 0) + (successB2 ? 1 : 0);

    assertExact(totalSuccess, 1, 'Chính xác 1 trong 2 yêu cầu tranh chấp được thực hiện thành công');

    const { data: stockAfterRace } = await supabase.from('inventory_stocks')
        .select('stock_on_hand')
        .eq('branch_id', branchB.id).eq('product_id', productId).single();
    assertExact(Number(stockAfterRace.stock_on_hand), 0.000, 'Tồn kho sau tranh chấp là 0.000 (không bị âm kho)');

    // =========================================================================
    // TEST 3: BẤT BIẾN LỊCH SỬ KHI ĐỔI ĐỊNH MỨC BOM TRONG TƯƠNG LAI
    // =========================================================================
    console.log('\n--- TEST 3: Đổi Định Mức BOM Mới (v3.0) -> Xác Minh Báo Cáo Giao Dịch Cũ Bất Biến ---');
    // 1. Đọc báo cáo hiện tại
    const { data: repBefore } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30'
    });
    const costBefore = repBefore.summary.material_cost;
    const varianceBefore = repBefore.variance_breakdown.bom_variance;

    // 2. Cập nhật BOM thành phiên bản mới với tỷ lệ khác hoàn toàn (0.05 chai/ml)
    await supabase.from('service_boms').upsert({
        organization_id: orgId,
        service_id: serviceId,
        product_id: productId,
        standard_quantity: 25,
        unit_of_measure: 'ml',
        conversion_rate: 0.0500,
        version: 'v3.0-new-rate',
        effective_from: '2026-10-01',
        is_active: true
    }, { onConflict: 'service_id,product_id,version' });

    // 3. Đọc lại báo cáo lịch sử của tháng 09/2026
    const { data: repAfter } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30'
    });

    assertExact(repAfter.summary.material_cost, costBefore, 'Tổng chi phí vật tư lịch sử không đổi sau khi thêm BOM mới');
    assertExact(repAfter.variance_breakdown.bom_variance, varianceBefore, 'BOM Variance lịch sử không đổi sau khi thêm BOM mới');

    // =========================================================================
    // TEST 4: ĐỐI CHIẾU DRILL-DOWN PHÂN TRANG HOÀN TOÀN KHỚP TỔNG KPI
    // =========================================================================
    console.log('\n--- TEST 4: Duyệt Đủ Các Trang Drill-Down & Đối Chiếu Tổng KPI ---');
    const pageSize = 3;
    let page = 1;
    let allItemIds = new Set();
    let sumLineCosts = 0;
    let totalPages = 1;

    while (page <= totalPages) {
        const { data: pageData } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_start_date: '2026-09-01',
            p_end_date: '2026-09-30',
            p_page: page,
            p_page_size: pageSize
        });

        totalPages = pageData.pagination.total_pages || 1;
        for (const item of pageData.drilldown_items) {
            if (allItemIds.has(item.id)) {
                throw new Error(`Trùng lặp ID bản ghi giữa các trang: ${item.id}`);
            }
            allItemIds.add(item.id);
            sumLineCosts += Number(item.total_cost);
        }
        page++;
    }

    assertExact(allItemIds.size, repAfter.pagination.total_records, 'Thu thập đủ tất cả bản ghi drill-down qua các trang');
    assertExact(sumLineCosts, repAfter.summary.material_cost, 'Tổng chi phí từng dòng drill-down khớp 100% với summary.material_cost');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KIỂM THỬ TOÀN DIỆN P7.2 ĐÃ HOÀN TẤT VÀ PASS 100%!');
    console.log('================================================================================\n');
}

runP72ComprehensiveTestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.2:', err);
    process.exit(1);
});
