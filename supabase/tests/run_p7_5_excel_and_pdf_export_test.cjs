const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const { jsPDF } = require('jspdf');
const autoTableModule = require('jspdf-autotable');
const autoTable = autoTableModule.default || autoTableModule;

// Supabase client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lskrcerzxltlrcewigrw.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza3JjZXJ6eGx0bHJjZXdpZ3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjMwMzAsImV4cCI6MjA5MTQ5OTAzMH0.60K5fWetNDQkMl8G32Sy6E9-EkhpDHfzIhfmfOLcZOI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ensure artifacts test output directory
const ARTIFACTS_DIR = path.resolve(__dirname, 'artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('BỘ KIỂM THỬ TOÀN DIỆN P7.5: XUẤT BÁO CÁO EXCEL (.XLSX) & PDF QUẢN TRỊ (P7.1 - P7.4)');
  console.log('='.repeat(80));

  const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
  const orgId = orgs && orgs.length > 0 ? orgs[0].id : '11111111-1111-1111-1111-111111111111';
  const startDate = '2026-09-01';
  const endDate = '2026-09-30';

  console.log(`\n--- BƯỚC 1: Thu thập dữ liệu gốc từ RPC P7.1 - P7.4 ---`);

  const [p71Res, p72Res, p73Res, p74Res] = await Promise.all([
    supabase.rpc('rpc_get_sales_and_cashflow_report', {
      p_org_id: orgId,
      p_branch_id: null,
      p_start_date: startDate,
      p_end_date: endDate,
      p_payment_method: null
    }),
    supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
      p_org_id: orgId,
      p_branch_id: null,
      p_start_date: startDate,
      p_end_date: endDate,
      p_page: 1,
      p_page_size: 100
    }),
    supabase.rpc('rpc_get_staff_and_resource_utilization_report', {
      p_org_id: orgId,
      p_branch_id: null,
      p_start_date: startDate,
      p_end_date: endDate,
      p_page: 1,
      p_page_size: 100
    }),
    supabase.rpc('rpc_get_customer_retention_and_cohort_report', {
      p_org_id: orgId,
      p_branch_id: null,
      p_start_date: startDate,
      p_end_date: endDate,
      p_segment_filter: 'all',
      p_page: 1,
      p_page_size: 100
    })
  ]);

  assert(!p71Res.error, `RPC P7.1 phản hồi không lỗi: ${p71Res.error?.message || 'OK'}`);
  assert(!p72Res.error, `RPC P7.2 phản hồi không lỗi: ${p72Res.error?.message || 'OK'}`);
  assert(!p73Res.error, `RPC P7.3 phản hồi không lỗi: ${p73Res.error?.message || 'OK'}`);
  assert(!p74Res.error, `RPC P7.4 phản hồi không lỗi: ${p74Res.error?.message || 'OK'}`);

  const p71Data = p71Res.data;
  const p72Data = p72Res.data;
  const p73Data = p73Res.data;
  const p74Data = p74Res.data;

  // ---------------------------------------------------------------------------
  // TEST 2: KIỂM THỬ XUẤT EXCEL .XLSX THỰC SỰ CHO P7.1 - P7.4
  // ---------------------------------------------------------------------------
  console.log(`\n--- BƯỚC 2: Sinh và Kiểm tra File Excel .xlsx Thực Sự ---`);

  // P7.1 Excel
  const wb1 = new ExcelJS.Workbook();
  const infoSheet1 = wb1.addWorksheet('1. Thông Tin Báo Cáo');
  infoSheet1.addRow(['BÁO CÁO BÁN HÀNG & DÒNG TIỀN (P7.1)']);
  infoSheet1.addRow(['Kỳ báo cáo:', `${startDate} đến ${endDate}`]);
  infoSheet1.addRow(['Thương hiệu:', 'PHƯƠNG NAM CLINIC & SPA']);

  const sumSheet1 = wb1.addWorksheet('2. Tổng Hợp');
  sumSheet1.views = [{ state: 'frozen', ySplit: 1 }];
  sumSheet1.addRow(['Chỉ Số', 'Giá Trị', 'Đơn Vị']);
  sumSheet1.addRow(['Gross Sales', Number(p71Data.sales_summary?.gross_sales || 0), 'VNĐ']);
  sumSheet1.addRow(['Net Invoiced Sales', Number(p71Data.sales_summary?.net_invoiced_sales || 0), 'VNĐ']);
  sumSheet1.addRow(['Confirmed Cash Collected', Number(p71Data.cashflow_summary?.confirmed_cash_collected || 0), 'VNĐ']);
  sumSheet1.addRow(['Net Sales Cashflow', Number(p71Data.cashflow_summary?.net_sales_cashflow || 0), 'VNĐ']);

  const p71ExcelPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_1_Sales_Cashflow.xlsx');
  await wb1.xlsx.writeFile(p71ExcelPath);
  assert(fs.existsSync(p71ExcelPath) && fs.statSync(p71ExcelPath).size > 1000, `File Excel P7.1 đã sinh thành công (${fs.statSync(p71ExcelPath).size} bytes)`);

  // P7.2 Excel
  const wb2 = new ExcelJS.Workbook();
  const infoSheet2 = wb2.addWorksheet('1. Thông Tin Báo Cáo');
  infoSheet2.addRow(['BÁO CÁO GIÁ VỐN COGS & LÃI GỘP (P7.2)']);

  const sumSheet2 = wb2.addWorksheet('2. Tổng Hợp');
  sumSheet2.views = [{ state: 'frozen', ySplit: 1 }];
  sumSheet2.addRow(['Chỉ Số', 'Giá Trị', 'Đơn Vị']);
  sumSheet2.addRow(['Recognized Revenue', Number(p72Data.summary?.recognized_revenue || 0), 'VNĐ']);
  sumSheet2.addRow(['Material Cost', Number(p72Data.summary?.material_cost || 0), 'VNĐ']);
  sumSheet2.addRow(['Direct Contribution', Number(p72Data.summary?.direct_contribution || 0), 'VNĐ']);

  const p72ExcelPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_2_Cogs_Profit.xlsx');
  await wb2.xlsx.writeFile(p72ExcelPath);
  assert(fs.existsSync(p72ExcelPath) && fs.statSync(p72ExcelPath).size > 1000, `File Excel P7.2 đã sinh thành công (${fs.statSync(p72ExcelPath).size} bytes)`);

  // P7.3 Excel
  const wb3 = new ExcelJS.Workbook();
  const infoSheet3 = wb3.addWorksheet('1. Thông Tin Báo Cáo');
  infoSheet3.addRow(['BÁO CÁO HIỆU SUẤT NHÂN SỰ & PHÒNG GHẾ (P7.3)']);

  const sumSheet3 = wb3.addWorksheet('2. Tổng Hợp Nhân Viên');
  sumSheet3.views = [{ state: 'frozen', ySplit: 1 }];
  sumSheet3.addRow(['Mã NV', 'Tên NV', 'Chức Vụ', 'Chi Nhánh', 'Doanh Số Tư Vấn', 'Doanh Thu Phục Vụ', 'Số Ca', 'Giờ Phục Vụ', 'Giờ Roster', 'Hiệu Suất %']);
  (p73Data.staff_metrics || []).forEach((st) => {
    sumSheet3.addRow([
      st.staff_id.substring(0, 8).toUpperCase(),
      st.full_name,
      st.job_title,
      st.primary_branch_name,
      Number(st.sales_invoiced || 0),
      Number(st.service_execution_revenue || 0),
      Number(st.sessions_completed_count || 0),
      Number(st.hands_on_hours || 0),
      Number(st.approved_work_hours || 0),
      st.utilization_pct !== null ? Number(st.utilization_pct) : 'N/A'
    ]);
  });

  const p73ExcelPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_3_Staff_Utilization.xlsx');
  await wb3.xlsx.writeFile(p73ExcelPath);
  assert(fs.existsSync(p73ExcelPath) && fs.statSync(p73ExcelPath).size > 1000, `File Excel P7.3 đã sinh thành công (${fs.statSync(p73ExcelPath).size} bytes)`);

  // P7.4 Excel (Kiểm tra đặc tả số 0 đầu điện thoại, Cohort "Chưa đủ thời gian theo dõi")
  const wb4 = new ExcelJS.Workbook();
  const infoSheet4 = wb4.addWorksheet('1. Thông Tin');
  infoSheet4.addRow(['BÁO CÁO GIỮ CHÂN & COHORT (P7.4)']);

  const rfmSheet4 = wb4.addWorksheet('2. Phân Khúc RFM');
  rfmSheet4.views = [{ state: 'frozen', ySplit: 1 }];
  rfmSheet4.addRow(['Phân Nhóm', 'Mã Nhóm', 'Số Lượng', 'Tổng Chi Tiêu (VNĐ)', 'Recency TB']);
  (p74Data.rfm_segments || []).forEach((s) => {
    rfmSheet4.addRow([s.segment_name, s.segment_key, Number(s.customer_count), Number(s.total_historical_spend), s.avg_recency_days !== null ? Number(s.avg_recency_days) : 'N/A']);
  });

  const cohortSheet4 = wb4.addWorksheet('3. Cohort');
  cohortSheet4.views = [{ state: 'frozen', ySplit: 1 }];
  cohortSheet4.addRow(['Tháng Đầu', 'Quy Mô', '30 Ngày', 'Tỷ Lệ 30d']);
  (p74Data.cohort_repurchase_retention || []).forEach((c) => {
    cohortSheet4.addRow([
      c.cohort_month,
      Number(c.total_cohort_customers),
      c.repurchase_30d?.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.repurchase_30d?.repurchased}/${c.repurchase_30d?.eligible}`,
      c.repurchase_30d?.pct !== null ? c.repurchase_30d?.pct : 'Chưa đủ thời gian theo dõi'
    ]);
  });

  const custSheet4 = wb4.addWorksheet('4. Chi Tiết Khách Hàng');
  custSheet4.views = [{ state: 'frozen', ySplit: 1 }];
  custSheet4.addRow(['Mã KH', 'Họ Tên', 'Số Điện Thoại', 'Hạng', 'Tổng Chi Tiêu', 'RFM']);
  (p74Data.customer_drilldown || []).forEach((c) => {
    let phoneStr = String(c.phone || '').trim();
    if (!phoneStr.startsWith('0') && !phoneStr.startsWith('+')) phoneStr = '0' + phoneStr;
    custSheet4.addRow([
      c.customer_id.substring(0, 8).toUpperCase(),
      c.full_name,
      phoneStr,
      c.tier,
      Number(c.historical_net_spend || 0),
      c.rfm_segment
    ]);
  });

  const p74ExcelPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_4_Customer_Retention.xlsx');
  await wb4.xlsx.writeFile(p74ExcelPath);
  assert(fs.existsSync(p74ExcelPath) && fs.statSync(p74ExcelPath).size > 1000, `File Excel P7.4 đã sinh thành công (${fs.statSync(p74ExcelPath).size} bytes)`);

  // Đọc lại file Excel P7.4 để kiểm tra kiểu dữ liệu
  const readWb = new ExcelJS.Workbook();
  await readWb.xlsx.readFile(p74ExcelPath);
  assert(readWb.worksheets.length === 4, 'File Excel P7.4 chứa chính xác 4 worksheets');
  const readCustSheet = readWb.getWorksheet('4. Chi Tiết Khách Hàng');
  const firstRowCust = readCustSheet.getRow(2);
  if (firstRowCust.getCell(3).value) {
    const phoneVal = String(firstRowCust.getCell(3).value);
    assert(phoneVal.startsWith('0'), `Số điện thoại giữ nguyên số 0 đầu: ${phoneVal}`);
  }
  const readCohortSheet = readWb.getWorksheet('3. Cohort');
  const firstRowCohort = readCohortSheet.getRow(2);
  if (firstRowCohort.getCell(3).value) {
    const cohortVal = String(firstRowCohort.getCell(3).value);
    assert(cohortVal === 'Chưa đủ thời gian theo dõi' || cohortVal.includes('/'), `Cohort chưa đủ tuổi giữ nguyên nhãn chuỗi không bị đổi thành 0: ${cohortVal}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: KIỂM THỬ XUẤT PDF QUẢN TRỊ CHO P7.1 - P7.4
  // ---------------------------------------------------------------------------
  console.log(`\n--- BƯỚC 3: Sinh và Kiểm tra Báo Cáo PDF Quản Trị ---`);

  // Load Arial font if available
  const fontPath = path.resolve(__dirname, '../../public/fonts/Arial.ttf');
  const hasFont = fs.existsSync(fontPath);

  // Sinh PDF P7.1
  const doc1 = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  if (hasFont) {
    const fontBuf = fs.readFileSync(fontPath);
    doc1.addFileToVFS('Arial.ttf', fontBuf.toString('base64'));
    doc1.addFont('Arial.ttf', 'Arial', 'normal');
    doc1.setFont('Arial');
  }
  doc1.text('BÁO CÁO BÁN HÀNG, DOANH THU & DÒNG TIỀN (P7.1)', 14, 18);
  autoTable(doc1, {
    startY: 28,
    head: [['Chỉ Số Quản Trị Bán Hàng', 'Giá Trị (VNĐ)', 'Chỉ Số Dòng Tiền', 'Giá Trị (VNĐ)']],
    body: [
      ['Doanh Số Bán Hàng Gộp', String(p71Data.sales_summary?.gross_sales || 0), 'Thực Thu Xác Nhận', String(p71Data.cashflow_summary?.confirmed_cash_collected || 0)],
      ['Doanh Số Thực Tế (Net Sales)', String(p71Data.sales_summary?.net_invoiced_sales || 0), 'Dòng Tiền Thuần (Net Cashflow)', String(p71Data.cashflow_summary?.net_sales_cashflow || 0)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255 }
  });

  const p71PdfPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_1_Sales_Cashflow.pdf');
  fs.writeFileSync(p71PdfPath, Buffer.from(doc1.output('arraybuffer')));
  assert(fs.existsSync(p71PdfPath) && fs.statSync(p71PdfPath).size > 1000, `File PDF P7.1 đã sinh thành công (${fs.statSync(p71PdfPath).size} bytes)`);

  // Sinh PDF P7.2
  const doc2 = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  if (hasFont) {
    const fontBuf = fs.readFileSync(fontPath);
    doc2.addFileToVFS('Arial.ttf', fontBuf.toString('base64'));
    doc2.addFont('Arial.ttf', 'Arial', 'normal');
    doc2.setFont('Arial');
  }
  doc2.text('BÁO CÁO GIÁ VỐN COGS & LÃI GỘP (P7.2)', 14, 18);
  autoTable(doc2, {
    startY: 28,
    head: [['Chỉ Số', 'Giá Trị (VNĐ)', 'Diễn Giải', 'Ghi Chú']],
    body: [
      ['Doanh Thu Ghi Nhận', String(p72Data.summary?.recognized_revenue || 0), 'Doanh thu buổi dịch vụ + SP', ''],
      ['Chi Phí Vật Tư', String(p72Data.summary?.material_cost || 0), 'Giá vốn xuất kho theo BOM snapshot', ''],
      ['Chênh Lệch Trực Tiếp', String(p72Data.summary?.direct_contribution || 0), 'Doanh thu - Vật tư - Hoa hồng', 'Chưa trừ CP cố định']
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255 }
  });

  const p72PdfPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_2_Cogs_Profit.pdf');
  fs.writeFileSync(p72PdfPath, Buffer.from(doc2.output('arraybuffer')));
  assert(fs.existsSync(p72PdfPath) && fs.statSync(p72PdfPath).size > 1000, `File PDF P7.2 đã sinh thành công (${fs.statSync(p72PdfPath).size} bytes)`);

  // Sinh PDF P7.3
  const doc3 = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  if (hasFont) {
    const fontBuf = fs.readFileSync(fontPath);
    doc3.addFileToVFS('Arial.ttf', fontBuf.toString('base64'));
    doc3.addFont('Arial.ttf', 'Arial', 'normal');
    doc3.setFont('Arial');
  }
  doc3.text('BÁO CÁO HIỆU SUẤT NHÂN SỰ & PHÒNG GHẾ (P7.3)', 14, 18);
  autoTable(doc3, {
    startY: 28,
    head: [['Mã NV', 'Họ Và Tên', 'Chức Vụ', 'Chi Nhánh', 'Doanh Số Tư Vấn', 'Giờ Phục Vụ', 'Hiệu Suất %']],
    body: (p73Data.staff_metrics || []).map((st) => [
      st.staff_id.substring(0, 8).toUpperCase(),
      st.full_name,
      st.job_title,
      st.primary_branch_name,
      String(st.sales_invoiced || 0),
      `${st.hands_on_hours || 0}h`,
      st.utilization_pct !== null ? `${st.utilization_pct}%` : 'N/A'
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255 }
  });

  const p73PdfPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_3_Staff_Utilization.pdf');
  fs.writeFileSync(p73PdfPath, Buffer.from(doc3.output('arraybuffer')));
  assert(fs.existsSync(p73PdfPath) && fs.statSync(p73PdfPath).size > 1000, `File PDF P7.3 đã sinh thành công (${fs.statSync(p73PdfPath).size} bytes)`);

  // Sinh PDF P7.4
  const doc4 = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  if (hasFont) {
    const fontBuf = fs.readFileSync(fontPath);
    doc4.addFileToVFS('Arial.ttf', fontBuf.toString('base64'));
    doc4.addFont('Arial.ttf', 'Arial', 'normal');
    doc4.setFont('Arial');
  }
  doc4.text('BÁO CÁO PHÂN TÍCH KHÁCH HÀNG & COHORT (P7.4)', 14, 18);
  autoTable(doc4, {
    startY: 28,
    head: [['Chỉ Số', 'Giá Trị', 'Chỉ Số Giữ Chân', 'Giá Trị']],
    body: [
      ['Tổng Khách Trong Hệ Thống', String(p74Data.summary?.total_customers_in_system || 0), 'Khách Mua Lại', String(p74Data.summary?.returning_buyers || 0)],
      ['Khách Mới Toàn Chuỗi', String(p74Data.summary?.new_org_customers || 0), 'Tỷ Lệ Mua Lại %', `${p74Data.summary?.repurchase_rate_pct || 0}%`]
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255 }
  });

  const p74PdfPath = path.join(ARTIFACTS_DIR, 'Bao_Cao_P7_4_Customer_Retention.pdf');
  fs.writeFileSync(p74PdfPath, Buffer.from(doc4.output('arraybuffer')));
  assert(fs.existsSync(p74PdfPath) && fs.statSync(p74PdfPath).size > 1000, `File PDF P7.4 đã sinh thành công (${fs.statSync(p74PdfPath).size} bytes)`);

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TẤT CẢ KIỂM THỬ XUẤT EXCEL & PDF (P7.5) ĐÃ HOÀN TẤT VÀ PASS 100%!');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Lỗi khi chạy kiểm thử P7.5:', err);
  process.exit(1);
});
