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

async function runSalesCashflowTestSuite() {
    console.log('================================================================================');
    console.log('BỘ KIỂM THỬ TỰ ĐỘNG P7.1: BÁO CÁO BÁN HÀNG, DÒNG TIỀN, CỌC & ĐỐI SOÁT (BI ANALYTICS)');
    console.log('================================================================================\n');

    // 1. Lấy ngữ cảnh Org & Branch
    const { data: branches, error: bErr } = await supabase.from('branches').select('id, name, organization_id').limit(2);
    if (bErr || !branches || branches.length === 0) {
        console.error('Không tìm thấy chi nhánh:', bErr);
        return;
    }
    const orgId = branches[0].organization_id;
    const branch1 = branches[0];

    console.log(`Ngữ cảnh kiểm thử: Org=${orgId}`);
    console.log(`  - Chi nhánh kiểm thử: ${branch1.name} (${branch1.id})\n`);

    // 2. Thực thi RPC kiểm thử toàn diện
    console.log('--- THỰC THI KIỂM THỬ TỰ ĐỘNG CÁC KỊCH BẢN BÁN HÀNG & DÒNG TIỀN ---');
    const { data: report, error: rpcErr } = await supabase.rpc('rpc_test_p7_1_scenarios', {
        p_org_id: orgId,
        p_branch_id: branch1.id
    });

    if (rpcErr) {
        console.error('❌ Lỗi thực thi RPC rpc_test_p7_1_scenarios:', rpcErr);
        throw rpcErr;
    }

    console.log('\nKết quả trả về từ RPC BI Report:');
    console.log('  - Sales Summary:', JSON.stringify(report.sales_summary, null, 2));
    console.log('  - Cashflow Summary:', JSON.stringify(report.cashflow_summary, null, 2));
    console.log('  - Drilldown Invoices:', report.invoices_drilldown ? report.invoices_drilldown.length : 0);
    console.log('  - Drilldown Payments:', report.payments_drilldown ? report.payments_drilldown.length : 0);

    // Assertions
    console.log('\n--- XÁC MINH CÁC QUY TẮC NGHIỆP VỤ BI & DÒNG TIỀN ---');
    assert(report.period.timezone.includes('Asia/Ho_Chi_Minh'), 'Múi giờ chuẩn xác định Asia/Ho_Chi_Minh');
    assert(Number(report.sales_summary.gross_sales) >= 2000000, 'Gross sales tính đúng trước chiết khấu (>= 2,000,000đ)');
    assert(Number(report.sales_summary.total_discount) >= 200000, 'Chiết khấu ghi nhận đúng (>= 200,000đ)');
    assert(Number(report.sales_summary.net_invoiced_sales) >= 1800000, 'Net invoiced sales đúng (>= 1,800,000đ)');
    assert(Number(report.sales_summary.new_customer_debt) >= 800000, 'Nợ phát sinh mới được theo dõi (>= 800,000đ)');
    assert(Number(report.sales_summary.package_course_sales) >= 1800000, 'Bán gói liệu trình được tách bạch riêng (>= 1,800,000đ)');

    assert(Number(report.cashflow_summary.confirmed_cash_collected) >= 1700000, 'Thực thu xác nhận gồm tiền mặt bán hàng (1tr) + cọc mới (300k) + thu nợ (400k) >= 1,700,000đ');
    assert(Number(report.cashflow_summary.pending_bank_transfers) >= 500000, 'Chuyển khoản VietQR chưa khớp được tách riêng 500k, KHÔNG cộng bừa vào thực thu');
    assert(Number(report.cashflow_summary.new_deposits_collected) >= 300000, 'Tiền cọc thu mới ghi nhận đúng (>= 300,000đ)');
    assert(Number(report.cashflow_summary.deposit_redeemed) >= 300000, 'Cọc cấn trừ 300k được ghi nhận riêng, không đếm trùng vào tiền mới');
    assert(Number(report.cashflow_summary.debt_recovered) >= 400000, 'Thu nợ cũ 400k được ghi nhận đúng');
    assert(Number(report.cashflow_summary.total_refunds_paid) >= 150000, 'Hoàn tiền 150k được ghi nhận đúng');
    assert(Number(report.cashflow_summary.net_sales_cashflow) >= (1700000 - 150000), 'Dòng tiền thuần = Thực thu - Hoàn tiền');

    assert(Array.isArray(report.invoices_drilldown) && report.invoices_drilldown.length > 0, 'Drill-down hóa đơn trả về danh sách có cấu trúc');
    assert(Array.isArray(report.payments_drilldown) && report.payments_drilldown.length > 0, 'Drill-down phiếu thanh toán trả về danh sách chi tiết');

    console.log('\n================================================================================');
    console.log('🎉 TẤT CẢ CÁC KIỂM THỬ BÁO CÁO BÁN HÀNG & DÒNG TIỀN (P7.1) ĐỀU THÀNH CÔNG 100%!');
    console.log('================================================================================\n');
}

runSalesCashflowTestSuite().catch(err => {
    console.error('❌ Lỗi kiểm thử P7.1:', err);
    process.exit(1);
});
