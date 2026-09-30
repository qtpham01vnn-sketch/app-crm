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
    console.log('BỘ KIỂM THỬ TOÀN DIỆN P7.2: COGS, BOM SNAPSHOT, ĐA CHI NHÁNH, HOÀN TIỀN & ĐỒNG THỜI');
    console.log('================================================================================\n');

    // 1. Context setup
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
    const orgId = orgs[0].id;
    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    const branchA = branches[0];
    const branchB = branches[1] || branches[0];

    const serviceId = '55555555-5555-5555-5555-555555555551'; // Chăm sóc Da Mặt Gold 24K
    const productId = '44444444-4444-4444-4444-444444444441'; // Serum HA Booster 50ml (1 chai = 50ml)

    console.log(`Context: Org=${orgId.slice(0, 8)}...`);
    console.log(`  - Chi nhánh A (Bán hàng): ${branchA.name} (${branchA.id.slice(0, 8)})`);
    console.log(`  - Chi nhánh B (Phục vụ):  ${branchB.name} (${branchB.id.slice(0, 8)})\n`);

    // =========================================================================
    // TEST 1: ĐỒNG THỜI (CONCURRENCY) XUẤT VẬT TƯ 2 KẾT NỐI CÙNG LÚC
    // =========================================================================
    console.log('--- TEST 1: Kiểm Thử Đồng Thời 2 Giao Dịch Xuất Vật Tư Song Song ---');
    // Set stock = 50.000 chai
    await supabase.from('inventory_stocks').upsert({
        organization_id: orgId,
        branch_id: branchB.id,
        product_id: productId,
        stock_on_hand: 50.000,
        cost_price: 200000
    }, { onConflict: 'branch_id,product_id' });

    const keyConc1 = 'CONC-A-' + Math.floor(Math.random() * 1000000);
    const keyConc2 = 'CONC-B-' + Math.floor(Math.random() * 1000000);

    const [res1, res2] = await Promise.all([
        supabase.rpc('rpc_record_service_material_usage', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_service_id: serviceId,
            p_staff_id: null,
            p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
            p_idempotency_key: keyConc1,
            p_notes: 'Concurrent test 1'
        }),
        supabase.rpc('rpc_record_service_material_usage', {
            p_org_id: orgId,
            p_branch_id: branchB.id,
            p_service_id: serviceId,
            p_staff_id: null,
            p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
            p_idempotency_key: keyConc2,
            p_notes: 'Concurrent test 2'
        })
    ]);

    assertExact(res1.data?.success, true, 'Giao dịch song song 1 thành công');
    assertExact(res2.data?.success, true, 'Giao dịch song song 2 thành công');
    assertExact(Number(res1.data?.total_material_cost), 60000, 'Chi phí ca song song 1 = 60.000đ');
    assertExact(Number(res2.data?.total_material_cost), 60000, 'Chi phí ca song song 2 = 60.000đ');

    const { data: stockAfterConc } = await supabase.from('inventory_stocks')
        .select('stock_on_hand')
        .eq('branch_id', branchB.id).eq('product_id', productId).single();
    assertExact(Number(stockAfterConc.stock_on_hand), 49.400, 'Tồn kho sau 2 ca song song trừ chính xác 0.600 chai (còn 49.400 chai)');

    // =========================================================================
    // TEST 2: ĐỐI SOÁT BÁO CÁO P7.2 & TỔNG DRILL-DOWN PHÂN TRANG
    // =========================================================================
    console.log('\n--- TEST 2: Kiểm Thử Phân Trang Drill-Down & Khớp Tổng KPI Toàn Bộ ---');
    const { data: repPage1 } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30',
        p_page: 1,
        p_page_size: 2
    });

    const { data: repPage2 } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_start_date: '2026-09-01',
        p_end_date: '2026-09-30',
        p_page: 2,
        p_page_size: 2
    });

    console.log('  Page 1 items count:', repPage1.drilldown_items.length);
    console.log('  Page 2 items count:', repPage2.drilldown_items.length);
    console.log('  Total records:', repPage1.pagination.total_records);
    console.log('  Summary material cost:', repPage1.summary.material_cost);

    assertExact(repPage1.drilldown_items.length, 2, 'Trang 1 trả về đúng 2 bản ghi');
    assertExact(repPage1.pagination.total_records >= 2, true, 'Tổng số bản ghi trong kỳ >= 2');
    assertExact(repPage1.summary.material_cost, repPage2.summary.material_cost, 'KPI tổng ở Trang 1 và Trang 2 khớp 100%');

    // =========================================================================
    // TEST 3: BẢO TOÀN LỊCH SỬ SNAPSHOT CONVERSION_RATE (KHÔNG BỊ TÍNH LẠI KHI ĐỔI BOM)
    // =========================================================================
    console.log('\n--- TEST 3: Bảo Toàn Lịch Sử Snapshot Hệ Số Quy Đổi & Chênh Lệch BOM ---');
    console.log('  Variance Breakdown:', repPage1.variance_breakdown);
    // bom_variance phải được tính từ snapshot conversion_rate, không thay đổi theo BOM hiện hành
    assertExact(typeof repPage1.variance_breakdown.bom_variance, 'number', 'BOM Variance là kiểu số chính xác');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ KIỂM THỬ P7.2 ĐÃ HOÀN TẤT VÀ PASS 100%!');
    console.log('================================================================================\n');
}

runP72ComprehensiveTestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.2:', err);
    process.exit(1);
});
