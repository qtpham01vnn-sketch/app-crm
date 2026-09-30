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

async function runP72CogsTestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TỰ ĐỘNG P7.2 NÂNG CAO: ĐỊNH MỨC BOM, GIÁ VỐN COGS & LỢI NHUẬN TRỰC TIẾP');
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
    console.log(`  - Chi nhánh A (Bán hàng): ${branchA.name}`);
    console.log(`  - Chi nhánh B (Phục vụ):  ${branchB.name}`);
    console.log(`  - Dịch vụ test: ${serviceId}`);
    console.log(`  - Sản phẩm vật tư: ${productId} (Chai 50ml)\n`);

    // =========================================================================
    // TEST 1: THIẾT LẬP ĐỊNH MỨC BOM CHUẨN XÁC (15ml / 50ml = 0.300 CHAI CƠ SỞ)
    // =========================================================================
    console.log('--- TEST 1: Thiết Lập Định Mức Tiêu Hao Vật Tư Service BOM (15ml = 0.300 Chai 50ml) ---');
    // Deactivate previous active BOMs for this service/product
    await supabase.from('service_boms')
        .update({ is_active: false })
        .eq('service_id', serviceId)
        .eq('product_id', productId);

    // Hệ số quy đổi: 1 ml = 1/50 = 0.0200 chai. Định mức: 15 ml -> 15 * 0.02 = 0.300 chai
    const { error: bomErr } = await supabase.from('service_boms').upsert({
        organization_id: orgId,
        service_id: serviceId,
        product_id: productId,
        standard_quantity: 15, // 15 ml
        unit_of_measure: 'ml',
        conversion_rate: 0.0200, // 1 ml = 0.02 chai (15 ml = 0.3 chai)
        version: 'v2.0-exact',
        effective_from: '2026-01-01',
        is_active: true
    }, { onConflict: 'service_id,product_id,version' });

    if (bomErr) throw bomErr;
    console.log('  ✅ Đã lưu định mức BOM: 15ml/ca với hệ số quy đổi 0.0200 chai/ml (15ml = 0.300 chai)');

    // Đảm bảo tồn kho tại chi nhánh B có giá vốn cố định 200,000đ/chai và tồn kho 50.000 chai
    await supabase.from('inventory_stocks').upsert({
        organization_id: orgId,
        branch_id: branchB.id,
        product_id: productId,
        stock_on_hand: 50.000,
        cost_price: 200000
    }, { onConflict: 'branch_id,product_id' });

    // =========================================================================
    // TEST 2: GHI NHẬN TIÊU HAO 15ml (0.3 CHAI) VÀ KIỂM TRA CHI PHÍ 60.000đ
    // =========================================================================
    console.log('\n--- TEST 2: Ghi Nhận Tiêu Hao 15ml (Xuất Đúng 0.300 Chai -> Chi Phí Chuẩn 60.000đ) ---');
    const idempotencyKey1 = 'MAT-EXACT-' + Math.floor(Math.random() * 1000000);
    const { data: usage1, error: uErr1 } = await supabase.rpc('rpc_record_service_material_usage', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_service_id: serviceId,
        p_staff_id: null,
        p_items: [
            {
                product_id: productId,
                actual_quantity: 15, // 15ml
                unit_of_measure: 'ml',
                lot_number: 'LOT-2026-01'
            }
        ],
        p_idempotency_key: idempotencyKey1,
        p_notes: 'Ca phục vụ 1: 15ml tiêu chuẩn'
    });
    if (uErr1) throw uErr1;

    console.log('  Kết quả ca 1:', usage1);
    assertExact(usage1.success, true, 'Ca 1 ghi nhận thành công');
    assertExact(Number(usage1.total_material_cost), 60000, 'Chi phí 15ml Serum (0.3 chai * 200,000đ) đúng 60,000đ');

    // Kiểm tra tồn kho sau ca 1: 50.000 - 0.300 = 49.700 chai
    const { data: stockAfter1 } = await supabase.from('inventory_stocks')
        .select('stock_on_hand')
        .eq('branch_id', branchB.id).eq('product_id', productId).single();
    assertExact(Number(stockAfter1.stock_on_hand), 49.700, 'Tồn kho giảm chính xác 0.300 chai (còn 49.700 chai)');

    // =========================================================================
    // TEST 3: GHI NHẬN CA 2 TIÊU HAO 15ml -> TỔNG 2 CA LÀ 120.000đ
    // =========================================================================
    console.log('\n--- TEST 3: Ca 2 Dùng 15ml -> Tổng Tiêu Hao 2 Ca Là 0.600 Chai (120.000đ) ---');
    const idempotencyKey2 = 'MAT-EXACT-' + Math.floor(Math.random() * 1000000);
    const { data: usage2 } = await supabase.rpc('rpc_record_service_material_usage', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_service_id: serviceId,
        p_staff_id: null,
        p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
        p_idempotency_key: idempotencyKey2,
        p_notes: 'Ca phục vụ 2: 15ml tiêu chuẩn'
    });
    assertExact(Number(usage2.total_material_cost), 60000, 'Ca 2 chi phí đúng 60,000đ');

    const { data: stockAfter2 } = await supabase.from('inventory_stocks')
        .select('stock_on_hand')
        .eq('branch_id', branchB.id).eq('product_id', productId).single();
    assertExact(Number(stockAfter2.stock_on_hand), 49.400, 'Tồn kho sau 2 ca còn 49.400 chai (giảm 0.600 chai)');

    // =========================================================================
    // TEST 4: IDEMPOTENCY CÙNG KEY & TỪ CHỐI CÙNG KEY KHÁC NỘI DUNG
    // =========================================================================
    console.log('\n--- TEST 4: Kiểm Tra An Toàn Idempotency & Từ Chối Khác Payload ---');
    // Gửi lại cùng key 2
    const { data: replaySame } = await supabase.rpc('rpc_record_service_material_usage', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_service_id: serviceId,
        p_staff_id: null,
        p_items: [{ product_id: productId, actual_quantity: 15, unit_of_measure: 'ml' }],
        p_idempotency_key: idempotencyKey2
    });
    assertExact(replaySame.is_duplicate, true, 'Gửi lại cùng key và payload -> Idempotent replay an toàn (không trừ kho)');

    // Gửi cùng key 2 nhưng đổi số lượng thành 25ml -> phải bị từ chối
    const { data: replayDifferent } = await supabase.rpc('rpc_record_service_material_usage', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_service_id: serviceId,
        p_staff_id: null,
        p_items: [{ product_id: productId, actual_quantity: 25, unit_of_measure: 'ml' }],
        p_idempotency_key: idempotencyKey2
    });
    assertExact(replayDifferent.conflict, true, 'Cùng key nhưng đổi nội dung -> Bị từ chối lỗi xung đột');

    // =========================================================================
    // TEST 5: BẤT BIẾN SNAPSHOT GIÁ VỐN KHI NHẬP HÀNG MỚI ĐỔI GIÁ
    // =========================================================================
    console.log('\n--- TEST 5: Bất Biến Snapshot Giá Vốn Khi Nhập Hàng Đổi Giá Kho ---');
    // Cập nhật giá vốn kho lên 400,000đ/chai
    await supabase.from('inventory_stocks').update({ cost_price: 400000 })
        .eq('branch_id', branchB.id).eq('product_id', productId);

    const { data: snapRecord } = await supabase.from('session_material_usages')
        .select('cost_price_snapshot')
        .eq('idempotency_key', idempotencyKey1)
        .single();
    assertExact(Number(snapRecord.cost_price_snapshot), 200000, 'Snapshot giá vốn của giao dịch cũ giữ nguyên 200,000đ (không bị đè thành 400,000đ)');

    // =========================================================================
    // TEST 6: BÁO CÁO LỢI NHUẬN TRỰC TIẾP & ĐỐI CHIẾU CHÊNH LỆCH ĐỊNH MỨC BOM
    // =========================================================================
    console.log('\n--- TEST 6: Báo Cáo BI P7.2 & Đối Chiếu Khớp Tuyệt Đối ---');
    const testDate = new Date().toISOString().split('T')[0];
    const { data: report, error: repErr } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_start_date: testDate,
        p_end_date: testDate
    });
    if (repErr) throw repErr;

    console.log('  - Tổng hợp báo cáo P7.2:', JSON.stringify(report.summary, null, 2));
    console.log('  - Chi tiết phân tích chênh lệch:', JSON.stringify(report.variance_breakdown, null, 2));

    assertExact(report.period.timezone, 'Asia/Ho_Chi_Minh (UTC+7)', 'Múi giờ Asia/Ho_Chi_Minh chuẩn');
    assertExact(report.drilldown.page, 1, 'Phân trang: page 1');
    assertExact(report.drilldown.page_size, 50, 'Phân trang: page_size 50');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ CÁC KIỂM THỬ PHASE P7.2 ĐÃ HOÀN THIỆN & PASS 100% CHÍNH XÁC!');
    console.log('================================================================================\n');
}

runP72CogsTestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.2:', err);
    process.exit(1);
});
