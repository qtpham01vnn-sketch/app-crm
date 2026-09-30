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
    console.log('BỘ KIỂM THỬ TỰ ĐỘNG P7.2: GIÁ VỐN COGS, ĐỊNH MỨC VẬT TƯ (BOM) & LỢI NHUẬN TRỰC TIẾP');
    console.log('================================================================================\n');

    // 1. Context setup
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
    const orgId = orgs[0].id;
    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    const branchA = branches[0];
    const branchB = branches[1] || branches[0];

    const { data: services } = await supabase.from('services').select('id, name, base_price').limit(1);
    const service1 = services[0];
    const { data: products } = await supabase.from('products').select('id, name, cost_price').limit(2);
    const product1 = products[0];

    console.log(`Context: Org=${orgId.slice(0, 8)}...`);
    console.log(`  - Chi nhánh A: ${branchA.name} (${branchA.id.slice(0, 8)}...)`);
    console.log(`  - Chi nhánh B: ${branchB.name} (${branchB.id.slice(0, 8)}...)`);
    console.log(`  - Dịch vụ test: ${service1.name} (${service1.id.slice(0, 8)}...)`);
    console.log(`  - Vật tư test: ${product1.name} (Giá vốn hiện tại: ${product1.cost_price || 100000}đ)\n`);

    // 2. Thiết lập định mức vật tư BOM (15ml / lần dịch vụ, tỷ lệ quy đổi 0.03 chai)
    console.log('--- TEST 1: Thiết Lập Định Mức Tiêu Hao Vật Tư Service BOM ---');
    const { data: bomRes, error: bomErr } = await supabase.from('service_boms').upsert({
        organization_id: orgId,
        service_id: service1.id,
        product_id: product1.id,
        standard_quantity: 15,
        unit_of_measure: 'ml',
        conversion_rate: 0.03, // 15ml = 0.03 chai 500ml
        version: 'v1.0-test',
        effective_from: '2026-01-01',
        is_active: true
    }, { onConflict: 'service_id,product_id,version' }).select();

    if (bomErr) {
        console.error('Lỗi tạo BOM:', bomErr);
        throw bomErr;
    }
    console.log('  ✅ Đã lưu định mức BOM thành công: 15ml/ca (hệ số quy đổi 0.03 chai)');

    // 3. Đảm bảo tồn kho tại chi nhánh B có giá vốn cố định 200,000đ/chai
    await supabase.from('inventory_stocks').upsert({
        organization_id: orgId,
        branch_id: branchB.id,
        product_id: product1.id,
        stock_on_hand: 50,
        cost_price: 200000
    }, { onConflict: 'branch_id,product_id' });

    // 4. Test xuất dùng vật tư cho ca làm dịch vụ
    console.log('\n--- TEST 2: Ghi Nhận Tiêu Hao Vật Tư Thực Tế (Session Material Usage) & Snapshot Giá Vốn ---');
    const idempotencyKey = 'MAT-TEST-' + Math.floor(Math.random() * 1000000);
    const { data: usageRes, error: usageErr } = await supabase.rpc('rpc_record_service_material_usage', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_service_id: service1.id,
        p_staff_id: null,
        p_items: [
            {
                product_id: product1.id,
                actual_quantity: 20, // Thực tế dùng 20ml (vượt định mức 5ml)
                unit_of_measure: 'ml',
                lot_number: 'LOT-2026-01'
            }
        ],
        p_idempotency_key: idempotencyKey,
        p_notes: 'Thực hiện dịch vụ ca test P7.2'
    });

    if (usageErr) {
        console.error('Lỗi xuất dùng vật tư:', usageErr);
        throw usageErr;
    }
    console.log('  Kết quả RPC xuất vật tư:', usageRes);
    assertExact(usageRes.success, true, 'Xuất vật tư ca dịch vụ thành công');

    // Test Idempotency: Gửi lại cùng key
    const { data: replayRes } = await supabase.rpc('rpc_record_service_material_usage', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_service_id: service1.id,
        p_staff_id: null,
        p_items: [{ product_id: product1.id, actual_quantity: 20, unit_of_measure: 'ml' }],
        p_idempotency_key: idempotencyKey
    });
    assertExact(replayRes.is_duplicate, true, 'Chống trừ kho lặp (Idempotent replay) hoạt động chính xác');

    // 5. Test tính bất biến của Snapshot Giá Vốn khi nhập hàng mới giá khác
    console.log('\n--- TEST 3: Bất Biến Snapshot Giá Vốn Khi Nhập Hàng Mới Thay Đổi Giá Vốn ---');
    // Cập nhật giá vốn kho hiện tại lên 350,000đ
    await supabase.from('inventory_stocks').update({
        cost_price: 350000
    }).eq('branch_id', branchB.id).eq('product_id', product1.id);

    // Kiểm tra bản ghi snapshot đã lưu trong session_material_usages
    const { data: usageRecord } = await supabase.from('session_material_usages')
        .select('cost_price_snapshot, base_quantity_deducted')
        .eq('idempotency_key', idempotencyKey)
        .single();

    assertExact(Number(usageRecord.cost_price_snapshot), 200000, 'Snapshot giá vốn được giữ nguyên bất biến 200,000đ (không bị đổi thành 350,000đ)');

    // 6. Test RPC Báo Cáo Lợi Nhuận Trực Tiếp & Xử Lý Doanh Thu Bằng 0
    console.log('\n--- TEST 4: Báo Cáo BI P7.2 & Kiểm Tra Xử Lý Doanh Thu Bằng 0 ---');
    const testDate = new Date().toISOString().split('T')[0];
    const { data: profitReport, error: repErr } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
        p_org_id: orgId,
        p_branch_id: branchB.id,
        p_start_date: testDate,
        p_end_date: testDate
    });

    if (repErr) {
        console.error('Lỗi báo cáo lợi nhuận:', repErr);
        throw repErr;
    }

    console.log('  - Báo cáo tổng hợp P7.2:', JSON.stringify(profitReport.summary, null, 2));
    console.log('  - Phân tích chênh lệch tồn kho:', JSON.stringify(profitReport.variance_breakdown, null, 2));
    console.log('  - Drilldown số bản ghi:', profitReport.drilldown.total_records);

    // Assertions
    assertExact(profitReport.period.timezone, 'Asia/Ho_Chi_Minh (UTC+7)', 'Múi giờ chuẩn Asia/Ho_Chi_Minh');
    assertExact(profitReport.drilldown.page, 1, 'Phân trang phía server: page = 1');
    assertExact(profitReport.drilldown.page_size, 50, 'Phân trang phía server: page_size = 50');
    assertExact(Array.isArray(profitReport.drilldown.items), true, 'Danh sách drill-down trả về mảng có cấu trúc');

    if (profitReport.summary.recognized_revenue === 0) {
        assertExact(profitReport.summary.margin_pct, null, 'Khi Doanh thu = 0, Margin % trả về null (Không áp dụng) để tránh chia cho 0');
    }

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ CÁC KIỂM THỬ PHASE P7.2 (BOM, COGS & LỢI NHUẬN TRỰC TIẾP) ĐÃ PASS 100%!');
    console.log('================================================================================\n');
}

runP72CogsTestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.2:', err);
    process.exit(1);
});
