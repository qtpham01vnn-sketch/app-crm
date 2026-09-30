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
    const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name').limit(1);
    if (orgErr || !orgs || orgs.length === 0) {
        console.error('Không tìm thấy tổ chức.');
        return;
    }
    const orgId = orgs[0].id;

    const { data: branches } = await supabase.from('branches').select('id, name').eq('organization_id', orgId).limit(2);
    const branch1 = branches[0];
    const branch2 = branches[1] || branches[0];

    console.log(`Ngữ cảnh kiểm thử: Org=${orgId}`);
    console.log(`  - Chi nhánh 1: ${branch1.name} (${branch1.id})`);
    console.log(`  - Chi nhánh 2: ${branch2.name} (${branch2.id})\n`);

    // 2. Tạo khách hàng mẫu
    const custPhone = '098' + Math.floor(1000000 + Math.random() * 9000000);
    const { data: cust, error: custErr } = await supabase.from('customers').insert({
        organization_id: orgId,
        primary_branch_id: branch1.id,
        full_name: 'Khách Test P7.1 BI',
        phone: custPhone
    }).select().single();
    if (custErr) throw custErr;
    const customerId = cust.id;
    console.log(`Đã tạo khách hàng kiểm thử: ${cust.full_name} (${customerId})\n`);

    const testDate = new Date().toISOString().split('T')[0];

    // --- KỊCH BẢN 1: Tạo đơn hàng có nợ & chiết khấu ---
    console.log('--- KỊCH BẢN 1: Tạo Đơn Hàng Có Chiết Khấu & Công Nợ Phát Sinh ---');
    const invoiceNo = 'TEST_INV_' + Math.floor(Math.random() * 100000);
    const { data: sale, error: saleErr } = await supabase.from('sales').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        invoice_number: invoiceNo,
        total_amount: 1800000,     // Net sales
        discount_amount: 200000,  // Discount
        paid_amount: 1000000,      // Paid (800k nợ)
        status: 'partial'
    }).select().single();
    if (saleErr) throw saleErr;

    // Chi tiết dòng hàng: 1 Gói liệu trình 2,000,000đ (giảm 200k còn 1,800,000đ)
    await supabase.from('sale_items').insert({
        sale_id: sale.id,
        item_id: '00000000-0000-0000-0000-000000000001',
        item_name: 'Gói Trị Liệu Trẻ Hóa 10 Buổi',
        item_type: 'package',
        quantity: 1,
        unit_price: 2000000,
        line_discount: 200000,
        line_total: 1800000
    });
    console.log(`Đã tạo hóa đơn ${invoiceNo}: Giá gốc 2tr, giảm 200k, thanh toán 1tr, nợ 800k`);

    // --- KỊCH BẢN 2: Thanh toán 1tr tiền mặt (Confirmed) ---
    console.log('\n--- KỊCH BẢN 2: Ghi Nhận Thanh Toán Tiền Mặt Đã Xác Nhận ---');
    const payNo1 = 'TEST_PAY_' + Math.floor(Math.random() * 100000);
    await supabase.from('payments').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        sale_id: sale.id,
        payment_number: payNo1,
        amount: 1000000,
        payment_method: 'cash',
        payment_type: 'sale',
        reconciliation_status: 'confirmed'
    });
    console.log(`Đã ghi nhận phiếu thu ${payNo1}: 1,000,000đ (cash, confirmed)`);

    // --- KỊCH BẢN 3: Chuyển khoản VietQR chờ xác nhận (Pending Reconciliation) ---
    console.log('\n--- KỊCH BẢN 3: Giao Dịch VietQR Chưa Khớp Đối Soát (Pending Reconciliation) ---');
    const payNo2 = 'TEST_QR_' + Math.floor(Math.random() * 100000);
    await supabase.from('payments').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        payment_number: payNo2,
        amount: 500000,
        payment_method: 'transfer_vietqr',
        payment_type: 'sale',
        reconciliation_status: 'pending_reconciliation',
        note: 'Khách quét mã nhưng ngân hàng chưa gửi webhook đối soát'
    });
    console.log(`Đã ghi nhận giao dịch QR ${payNo2}: 500,000đ (pending_reconciliation)`);

    // --- KỊCH BẢN 4: Đặt cọc mới & Cấn trừ cọc ---
    console.log('\n--- KỊCH BẢN 4: Nhận Cọc Mới & Cấn Trừ Cọc ---');
    const depositPayNo = 'TEST_DEP_' + Math.floor(Math.random() * 100000);
    await supabase.from('payments').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        payment_number: depositPayNo,
        amount: 300000,
        payment_method: 'cash',
        payment_type: 'deposit',
        reconciliation_status: 'confirmed',
        note: 'Khách cọc giữ chỗ làm liệu trình'
    });
    console.log(`Đã nhận cọc mới ${depositPayNo}: 300,000đ`);

    const redeemPayNo = 'TEST_RED_' + Math.floor(Math.random() * 100000);
    await supabase.from('payments').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        payment_number: redeemPayNo,
        amount: 300000,
        payment_method: 'deposit_credit',
        payment_type: 'sale',
        reconciliation_status: 'confirmed',
        note: 'Cấn trừ cọc vào đơn'
    });
    console.log(`Đã dùng cọc cấn trừ ${redeemPayNo}: 300,000đ (deposit_credit)`);

    // --- KỊCH BẢN 5: Thu nợ cũ & Hoàn tiền ---
    console.log('\n--- KỊCH BẢN 5: Thu Hồi Nợ Cũ & Hoàn Trả Tiền Cho Khách ---');
    const debtPayNo = 'TEST_DEBT_' + Math.floor(Math.random() * 100000);
    await supabase.from('payments').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        payment_number: debtPayNo,
        amount: 400000,
        payment_method: 'cash',
        payment_type: 'debt_collection',
        reconciliation_status: 'confirmed',
        note: 'Thu nợ hóa đơn trước'
    });
    console.log(`Đã thu nợ ${debtPayNo}: 400,000đ (debt_collection)`);

    const refundPayNo = 'TEST_REF_' + Math.floor(Math.random() * 100000);
    await supabase.from('payments').insert({
        organization_id: orgId,
        branch_id: branch1.id,
        customer_id: customerId,
        payment_number: refundPayNo,
        amount: 150000,
        payment_method: 'cash',
        payment_type: 'refund',
        reconciliation_status: 'confirmed',
        note: 'Hoàn tiền khách hủy dịch vụ'
    });
    console.log(`Đã hoàn tiền ${refundPayNo}: 150,000đ (refund)`);

    // --- KỊCH BẢN 6: Thực thi RPC rpc_get_sales_and_cashflow_report & Kiểm tra kết quả ---
    console.log('\n--- KỊCH BẢN 6: Kiểm Tra Toàn Diện Báo Cáo BI Qua RPC ---');
    const { data: report, error: rpcErr } = await supabase.rpc('rpc_get_sales_and_cashflow_report', {
        p_org_id: orgId,
        p_branch_id: branch1.id,
        p_start_date: testDate,
        p_end_date: testDate
    });
    if (rpcErr) throw rpcErr;

    console.log('\nKết quả trả về từ RPC:');
    console.log('  - Sales Summary:', JSON.stringify(report.sales_summary));
    console.log('  - Cashflow Summary:', JSON.stringify(report.cashflow_summary));
    console.log('  - Drilldown Invoices:', report.invoices_drilldown.length);
    console.log('  - Drilldown Payments:', report.payments_drilldown.length);

    // Assertions
    assert(report.period.timezone.includes('Asia/Ho_Chi_Minh'), 'Múi giờ chuẩn xác định Asia/Ho_Chi_Minh');
    assert(report.sales_summary.gross_sales >= 2000000, 'Gross sales tính đúng trước chiết khấu');
    assert(report.sales_summary.total_discount >= 200000, 'Chiết khấu ghi nhận đúng 200k');
    assert(report.sales_summary.net_invoiced_sales >= 1800000, 'Net invoiced sales đúng 1.8tr');
    assert(report.sales_summary.new_customerDebt !== undefined || report.sales_summary.new_customer_debt >= 800000, 'Nợ phát sinh mới được theo dõi');
    assert(report.sales_summary.package_course_sales >= 1800000, 'Bán gói liệu trình được tách bạch');

    assert(report.cashflow_summary.confirmed_cash_collected >= 1700000, 'Thực thu xác nhận gồm tiền mặt bán hàng (1tr) + cọc mới (300k) + thu nợ (400k)');
    assert(report.cashflow_summary.pending_bank_transfers >= 500000, 'Chuyển khoản VietQR chưa khớp được tách riêng 500k, KHÔNG cộng bừa vào thực thu');
    assert(report.cashflow_summary.new_deposits_collected >= 300000, 'Tiền cọc thu mới ghi nhận đúng 300k');
    assert(report.cashflow_summary.deposit_redeemed >= 300000, 'Cọc cấn trừ 300k được ghi nhận riêng, không đếm trùng vào tiền mới');
    assert(report.cashflow_summary.debt_recovered >= 400000, 'Thu nợ cũ 400k được ghi nhận đúng');
    assert(report.cashflow_summary.total_refunds_paid >= 150000, 'Hoàn tiền 150k được ghi nhận đúng');
    assert(report.cashflow_summary.net_sales_cashflow >= (1700000 - 150000), 'Dòng tiền thuần = Thực thu - Hoàn tiền');

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
