import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  SalesCashflowReport,
  CogsAndProfitReport,
  StaffAndResourceUtilizationReport,
  CustomerRetentionAndCohortReport,
  Branch
} from '../types';

export type ReportType = 'p7_1' | 'p7_2' | 'p7_3' | 'p7_4';
export type ExportFormat = 'excel' | 'pdf';
export type ExportDetailLevel = 'summary' | 'full';

export interface ExportReportParams {
  reportType: ReportType;
  format: ExportFormat;
  detailLevel: ExportDetailLevel;
  dateRange: { startDate: string; endDate: string };
  selectedBranchId: string;
  branches: Branch[];
  data: {
    p7_1?: SalesCashflowReport | null;
    p7_2?: CogsAndProfitReport | null;
    p7_3?: StaffAndResourceUtilizationReport | null;
    p7_4?: CustomerRetentionAndCohortReport | null;
  };
  onProgress?: (progress: number, message: string) => void;
}

// -----------------------------------------------------------------------------
// HELPER FORMATTERS & SANITIZATION
// -----------------------------------------------------------------------------

const formatCurrency = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return '0 ₫';
  return `${new Intl.NumberFormat('vi-VN').format(Number(val))} ₫`;
};

const formatPercent = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return 'N/A';
  return `${Number(val).toFixed(1)}%`;
};

const formatNumber = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return '0';
  return new Intl.NumberFormat('vi-VN').format(Number(val));
};

/**
 * Escape formula injection risk in Excel (prefixed with dangerous chars)
 */
const sanitizeText = (val: string | null | undefined): string => {
  if (!val) return '';
  const str = String(val).trim();
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    return `'${str}`;
  }
  return str;
};

/**
 * Format phone numbers as clean text preserving leading zeros
 */
const sanitizePhone = (phone: string | null | undefined): string => {
  if (!phone) return '';
  let clean = String(phone).trim();
  if (!clean.startsWith('0') && !clean.startsWith('+')) {
    clean = '0' + clean;
  }
  return clean;
};

const getNowVietnamString = (): string => {
  const d = new Date();
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
};

// -----------------------------------------------------------------------------
// EXCEL STYLING CONSTANTS & HELPERS
// -----------------------------------------------------------------------------

const BRAND_NAVY_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A8A' } // Deep Blue #1E3A8A
};

const BRAND_TEAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0D9488' } // Teal #0D9488
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Arial',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' }
};

const TITLE_FONT: Partial<ExcelJS.Font> = {
  name: 'Arial',
  size: 14,
  bold: true,
  color: { argb: 'FF1E3A8A' }
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
};

const applyWorksheetDefaults = (ws: ExcelJS.Worksheet) => {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.properties.defaultRowHeight = 22;
};

const autoFitColumns = (ws: ExcelJS.Worksheet) => {
  ws.columns.forEach((col) => {
    let maxLen = 12;
    if (col.eachCell) {
      col.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.value ? cell.value.toString() : '';
        if (text.length > maxLen) maxLen = Math.min(text.length + 3, 50);
      });
    }
    col.width = maxLen;
  });
};

// -----------------------------------------------------------------------------
// EXCEL EXPORTERS FOR P7.1 - P7.4
// -----------------------------------------------------------------------------

export const reportExportService = {
  /**
   * Main Dispatcher for Export
   */
  async exportReport(params: ExportReportParams): Promise<Blob> {
    const { format } = params;
    if (format === 'excel') {
      return this.generateExcel(params);
    } else {
      return this.generatePdf(params);
    }
  },

  /**
   * Generate .xlsx Workbook using ExcelJS
   */
  async generateExcel(params: ExportReportParams): Promise<Blob> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hệ Thống CRM Viện Thẩm Mỹ Phương Nam';
    wb.lastModifiedBy = 'Phương Nam Analytics Engine';
    wb.created = new Date();

    const branchName =
      params.selectedBranchId === 'all'
        ? 'Toàn bộ chi nhánh'
        : params.branches.find((b) => b.id === params.selectedBranchId)?.name || params.selectedBranchId;

    switch (params.reportType) {
      case 'p7_1':
        this.buildP71Excel(wb, params, branchName);
        break;
      case 'p7_2':
        this.buildP72Excel(wb, params, branchName);
        break;
      case 'p7_3':
        this.buildP73Excel(wb, params, branchName);
        break;
      case 'p7_4':
        this.buildP74Excel(wb, params, branchName);
        break;
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  },

  /**
   * P7.1: Báo Cáo Bán Hàng & Dòng Tiền
   */
  buildP71Excel(wb: ExcelJS.Workbook, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_1;
    if (!data) return;

    // Sheet 1: Thông tin
    const infoSheet = wb.addWorksheet('1. Thông Tin Báo Cáo');
    infoSheet.addRow(['BÁO CÁO BÁN HÀNG, DOANH THU & DÒNG TIỀN (P7.1)']).font = TITLE_FONT;
    infoSheet.addRow(['Thương hiệu:', 'PHƯƠNG NAM CLINIC & SPA']);
    infoSheet.addRow(['Kỳ báo cáo:', `${params.dateRange.startDate} đến ${params.dateRange.endDate}`]);
    infoSheet.addRow(['Phạm vi chi nhánh:', branchName]);
    infoSheet.addRow(['Múi giờ dữ liệu:', 'Asia/Ho_Chi_Minh (UTC+7)']);
    infoSheet.addRow(['Thời điểm xuất file:', getNowVietnamString()]);
    infoSheet.addRow([]);
    infoSheet.addRow(['QUY TẮC & ĐỊNH NGHĨA CHỈ SỐ:']).font = { bold: true };
    infoSheet.addRow(['- Doanh Số Gộp (Gross Sales):', 'Tổng giá niêm yết trước mọi khoản chiết khấu/khuyến mãi.']);
    infoSheet.addRow(['- Doanh Số Thực Tế (Net Sales):', 'Doanh số gộp trừ đi tổng chiết khấu đã áp dụng.']);
    infoSheet.addRow(['- Thực Thu Đã Xác Nhận:', 'Bao gồm Tiền mặt + VietQR đã khớp + Cọc mới thu + Thu nợ cũ.']);
    infoSheet.addRow(['- Cọc Cấn Trừ:', 'Được ghi nhận riêng vào doanh số, không cộng lặp vào tiền mặt mới.']);
    infoSheet.addRow(['- Dòng Tiền Thuần:', 'Thực thu đã xác nhận trừ đi Tiền hoàn trả khách hàng.']);
    autoFitColumns(infoSheet);

    // Sheet 2: Tổng hợp KPI
    const sumSheet = wb.addWorksheet('2. Tổng Hợp Doanh Thu & Dòng Tiền');
    applyWorksheetDefaults(sumSheet);
    sumSheet.addRow(['Chỉ Số Quản Trị Bán Hàng & Dòng Tiền', 'Giá Trị (VNĐ)', 'Đơn Vị / Diễn Giải']);
    sumSheet.getRow(1).fill = BRAND_NAVY_FILL;
    sumSheet.getRow(1).font = HEADER_FONT;

    const summaryRows: [string, number | string, string][] = [
      ['Doanh Số Bán Hàng Gộp (Gross Sales)', data.salesSummary.grossSales, 'VNĐ'],
      ['Tổng Chiết Khấu / Giảm Giá', data.salesSummary.totalDiscount, 'VNĐ'],
      ['Doanh Số Bán Hàng Thực Tế (Net Sales)', data.salesSummary.netInvoicedSales, 'VNĐ'],
      ['Giá Trị Bán Gói Liệu Trình (Package)', data.salesSummary.packageCourseSales, 'VNĐ'],
      ['Giá Trị Đơn Hàng Trung Bình (AOV)', data.salesSummary.avgOrderValue, 'VNĐ / Đơn'],
      ['Tổng Số Lượng Hóa Đơn Hợp Lệ', data.salesSummary.invoiceCount, 'Hóa đơn'],
      ['Công Nợ Phát Sinh Mới Trong Kỳ', data.salesSummary.newCustomerDebt, 'VNĐ'],
      ['Thực Thu Tiền Mặt Đã Xác Nhận', data.cashflowSummary.confirmedCashCollected, 'VNĐ'],
      ['Tiền Cọc Thu Mới Trong Kỳ', data.cashflowSummary.newDepositsCollected, 'VNĐ'],
      ['Thu Hồi Nợ Cũ Trong Kỳ', data.cashflowSummary.debtRecovered, 'VNĐ'],
      ['Tiền Cọc Đã Cấn Trừ Trong Kỳ', data.cashflowSummary.depositRedeemed, 'VNĐ'],
      ['Tổng Tiền Hoàn Trả Khách Hàng', data.cashflowSummary.totalRefundsPaid, 'VNĐ'],
      ['Dòng Tiền Thuần Bán Hàng (Net Cashflow)', data.cashflowSummary.netSalesCashflow, 'VNĐ'],
      ['Chuyển Khoản Ngân Hàng Đang Chờ Khớp', data.cashflowSummary.pendingBankTransfers, 'VNĐ (Treo đối soát)']
    ];

    summaryRows.forEach(([label, val, note]) => {
      const r = sumSheet.addRow([label, typeof val === 'number' ? val : sanitizeText(val), note]);
      if (typeof val === 'number') {
        r.getCell(2).numFmt = '#,##0';
      }
      r.border = BORDER_THIN;
    });
    autoFitColumns(sumSheet);

    // Sheet 3: Chi tiết Hóa đơn
    if (params.detailLevel === 'full' && data.invoicesDrilldown) {
      const invSheet = wb.addWorksheet('3. Chi Tiết Hóa Đơn');
      applyWorksheetDefaults(invSheet);
      invSheet.addRow([
        'Mã Hóa Đơn',
        'Chi Nhánh',
        'Tên Khách Hàng',
        'Số Điện Thoại',
        'Tổng Tiền (VNĐ)',
        'Đã Thanh Toán (VNĐ)',
        'Còn Nợ (VNĐ)',
        'Trạng Thái',
        'Thời Gian Tạo'
      ]);
      invSheet.getRow(1).fill = BRAND_NAVY_FILL;
      invSheet.getRow(1).font = HEADER_FONT;

      data.invoicesDrilldown.forEach((inv) => {
        const r = invSheet.addRow([
          sanitizeText(inv.invoiceNumber || inv.id.substring(0, 8).toUpperCase()),
          sanitizeText(inv.branchName),
          sanitizeText(inv.customerName),
          sanitizePhone(inv.customerPhone),
          inv.totalAmount,
          inv.paidAmount,
          inv.debtAmount,
          sanitizeText(inv.status === 'completed' ? 'Hoàn thành' : inv.status),
          inv.createdAt
        ]);
        r.getCell(5).numFmt = '#,##0';
        r.getCell(6).numFmt = '#,##0';
        r.getCell(7).numFmt = '#,##0';
        r.border = BORDER_THIN;
      });
      autoFitColumns(invSheet);
    }

    // Sheet 4: Chi tiết Thanh Toán
    if (params.detailLevel === 'full' && data.paymentsDrilldown) {
      const paySheet = wb.addWorksheet('4. Chi Tiết Thanh Toán');
      applyWorksheetDefaults(paySheet);
      paySheet.addRow([
        'Mã Phiếu',
        'Chi Nhánh',
        'Khách Hàng',
        'Số Tiền (VNĐ)',
        'Phương Thức',
        'Loại Giao Dịch',
        'Đối Soát',
        'Ghi Chú',
        'Thời Gian'
      ]);
      paySheet.getRow(1).fill = BRAND_TEAL_FILL;
      paySheet.getRow(1).font = HEADER_FONT;

      data.paymentsDrilldown.forEach((pay) => {
        const r = paySheet.addRow([
          sanitizeText(pay.paymentNumber || pay.id.substring(0, 8).toUpperCase()),
          sanitizeText(pay.branchName),
          sanitizeText(pay.customerName),
          pay.amount,
          sanitizeText(pay.paymentMethod),
          sanitizeText(pay.paymentType),
          sanitizeText(pay.reconciliationStatus),
          sanitizeText(pay.note || ''),
          pay.createdAt
        ]);
        r.getCell(4).numFmt = '#,##0';
        r.border = BORDER_THIN;
      });
      autoFitColumns(paySheet);
    }
  },

  /**
   * P7.2: Báo Cáo Giá Vốn & Lợi Nhuận Gộp
   */
  buildP72Excel(wb: ExcelJS.Workbook, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_2;
    if (!data) return;

    // Sheet 1: Thông tin
    const infoSheet = wb.addWorksheet('1. Thông Tin Báo Cáo');
    infoSheet.addRow(['BÁO CÁO GIÁ VỐN COGS, HAO PHÍ VẬT TƯ & LỢI NHUẬN GỘP (P7.2)']).font = TITLE_FONT;
    infoSheet.addRow(['Thương hiệu:', 'PHƯƠNG NAM CLINIC & SPA']);
    infoSheet.addRow(['Kỳ báo cáo:', `${params.dateRange.startDate} đến ${params.dateRange.endDate}`]);
    infoSheet.addRow(['Phạm vi chi nhánh:', branchName]);
    infoSheet.addRow(['Múi giờ dữ liệu:', 'Asia/Ho_Chi_Minh (UTC+7)']);
    infoSheet.addRow(['Thời điểm xuất file:', getNowVietnamString()]);
    infoSheet.addRow([]);
    infoSheet.addRow(['LƯU Ý & ĐỊNH NGHĨA NGHIỆP VỤ:']).font = { bold: true };
    infoSheet.addRow(['- Phạm vi Giá Vốn:', 'Giá vốn chỉ bao gồm chi phí vật tư tiêu hao trực tiếp theo định mức BOM Snapshot và hao phí thực tế. Chưa bao gồm chi phí cố định (mặt bằng, khấu hao máy móc).']);
    infoSheet.addRow(['- Doanh Thu Thuần Nghiệp Vụ:', 'Bao gồm Doanh thu các buổi dịch vụ đã thực hiện hoàn thành + Hàng hóa bán lẻ.']);
    infoSheet.addRow(['- Chênh Lệch Trực Tiếp Sau Giá Vốn & Hoa Hồng:', 'Doanh thu thuần trừ đi Chi phí vật tư thực tế và Hoa hồng nhân viên (KHÔNG gọi là Lợi nhuận ròng).']);
    autoFitColumns(infoSheet);

    // Sheet 2: Tổng hợp
    const sumSheet = wb.addWorksheet('2. Tổng Hợp Giá Vốn & Lãi Gộp');
    applyWorksheetDefaults(sumSheet);
    sumSheet.addRow(['Chỉ Số Quản Trị Giá Vốn & Lợi Nhuận', 'Giá Trị (VNĐ)', 'Diễn Giải']);
    sumSheet.getRow(1).fill = BRAND_NAVY_FILL;
    sumSheet.getRow(1).font = HEADER_FONT;

    const rows: [string, number | null, string][] = [
      ['Doanh Thu Ghi Nhận Thực Tế (Recognized Revenue)', data.summary.recognizedRevenue, 'VNĐ'],
      ['Giá Vốn Sản Phẩm Hàng Hóa (COGS Products)', data.summary.cogsProducts, 'VNĐ'],
      ['Tổng Chi Phí Vật Tư Tiêu Hao (Material Cost)', data.summary.materialCost, 'VNĐ'],
      ['Tổng Chi Phí Hoa Hồng Trực Tiếp (Commission)', data.summary.directCommission, 'VNĐ'],
      ['Chênh Lệch Trực Tiếp Sau Giá Vốn & Hoa Hồng (Direct Contribution)', data.summary.directContribution, 'VNĐ'],
      ['Tỷ Suất Lợi Nhuận Trực Tiếp (Direct Margin %)', data.summary.marginPct, '%']
    ];

    rows.forEach(([label, val, note]) => {
      if (val === null) {
        const r = sumSheet.addRow([label, 'N/A', note]);
        r.border = BORDER_THIN;
      } else {
        const r = sumSheet.addRow([label, val, note]);
        if (note === '%') {
          r.getCell(2).numFmt = '0.0"%"';
        } else {
          r.getCell(2).numFmt = '#,##0';
        }
        r.border = BORDER_THIN;
      }
    });
    autoFitColumns(sumSheet);

    // Sheet 3: Chi tiết tiêu hao vật tư
    if (params.detailLevel === 'full' && data.drilldown?.items) {
      const matSheet = wb.addWorksheet('3. Chi Tiết Tiêu Hao Vật Tư');
      applyWorksheetDefaults(matSheet);
      matSheet.addRow([
        'Mã Phiếu Trừ',
        'Ngày Giờ Trừ',
        'Chi Nhánh',
        'Dịch Vụ / Liệu Trình',
        'Tên Vật Tư Tiêu Hao',
        'Định Mức BOM',
        'Tiêu Hao Thực Tế',
        'Đơn Vị Tính',
        'Giá Vốn Snapshot (VNĐ)',
        'Tổng Chi Phí (VNĐ)',
        'KTV Thực Hiện',
        'Ghi Chú'
      ]);
      matSheet.getRow(1).fill = BRAND_NAVY_FILL;
      matSheet.getRow(1).font = HEADER_FONT;

      data.drilldown.items.forEach((item) => {
        const r = matSheet.addRow([
          sanitizeText(item.id.substring(0, 8).toUpperCase()),
          item.usedAt,
          sanitizeText(item.branchName),
          sanitizeText(item.serviceName),
          sanitizeText(item.productName),
          item.standardQty,
          item.actualQty,
          sanitizeText(item.unit),
          item.costPriceSnapshot,
          item.totalCost,
          sanitizeText(item.performerName || ''),
          sanitizeText(item.notes || '')
        ]);
        r.getCell(6).numFmt = '#,##0.00';
        r.getCell(7).numFmt = '#,##0.00';
        r.getCell(9).numFmt = '#,##0';
        r.getCell(10).numFmt = '#,##0';
        r.border = BORDER_THIN;
      });
      autoFitColumns(matSheet);
    }
  },

  /**
   * P7.3: Báo Cáo Hiệu Suất Nhân Sự & Phòng Ghế
   */
  buildP73Excel(wb: ExcelJS.Workbook, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_3;
    if (!data) return;

    // Sheet 1: Thông tin
    const infoSheet = wb.addWorksheet('1. Thông Tin Báo Cáo');
    infoSheet.addRow(['BÁO CÁO HIỆU SUẤT NHÂN SỰ, BÁC SĨ & CÔNG SUẤT PHÒNG GHẾ (P7.3)']).font = TITLE_FONT;
    infoSheet.addRow(['Thương hiệu:', 'PHƯƠNG NAM CLINIC & SPA']);
    infoSheet.addRow(['Kỳ báo cáo:', `${params.dateRange.startDate} đến ${params.dateRange.endDate}`]);
    infoSheet.addRow(['Phạm vi chi nhánh:', branchName]);
    infoSheet.addRow(['Múi giờ dữ liệu:', 'Asia/Ho_Chi_Minh (UTC+7)']);
    infoSheet.addRow(['Thời điểm xuất file:', getNowVietnamString()]);
    infoSheet.addRow([]);
    infoSheet.addRow(['QUY TẮC & ĐỊNH NGHĨA CHỈ SỐ:']).font = { bold: true };
    infoSheet.addRow(['- Tỷ Lệ Hiệu Suất Thời Gian:', 'Tổng giờ phục vụ trực tiếp / Tổng giờ công đã duyệt. Mẫu số = 0 hiển thị N/A.']);
    infoSheet.addRow(['- Doanh Số Bán Hàng Tư Vấn:', 'Chỉ phân bổ khi có thông tin người bán/tư vấn; thiếu thì ghi "Chưa phân bổ".']);
    infoSheet.addRow(['- Doanh Thu Thực Hiện Dịch Vụ:', 'Ghi nhận cho Bác sĩ / Kỹ thuật viên trực tiếp thực hiện ca hoàn tất.']);
    infoSheet.addRow(['- Đánh Giá Khách Hàng:', 'Hệ thống hiển thị "Chưa triển khai nguồn dữ liệu đánh giá" do chưa có nguồn dữ liệu rating độc lập.']);
    autoFitColumns(infoSheet);

    // Sheet 2: Bảng Nhân Viên
    const staffSheet = wb.addWorksheet('2. Bảng Hiệu Suất Nhân Viên');
    applyWorksheetDefaults(staffSheet);
    staffSheet.addRow([
      'Mã Nhân Viên',
      'Họ Và Tên',
      'Chức Vụ',
      'Chi Nhánh',
      'Doanh Số Tư Vấn (VNĐ)',
      'Doanh Thu Phục Vụ (VNĐ)',
      'Số Ca Hoàn Thành',
      'Giờ Phục Vụ (Hands-on)',
      'Giờ Công Duyệt (Roster)',
      'Hiệu Suất Thời Gian (%)',
      'Đánh Giá Sao'
    ]);
    staffSheet.getRow(1).fill = BRAND_NAVY_FILL;
    staffSheet.getRow(1).font = HEADER_FONT;

    data.staffMetrics.forEach((st) => {
      const r = staffSheet.addRow([
        sanitizeText(st.staffId.substring(0, 8).toUpperCase()),
        sanitizeText(st.fullName),
        sanitizeText(st.jobTitle),
        sanitizeText(st.primaryBranchName),
        st.salesInvoiced,
        st.serviceExecutionRevenue,
        st.sessionsCompletedCount,
        st.handsOnHours,
        st.approvedWorkHours,
        st.utilizationPct !== null ? st.utilizationPct : 'N/A',
        st.ratingAvg !== null ? st.ratingAvg : 'Chưa có dữ liệu'
      ]);
      r.getCell(5).numFmt = '#,##0';
      r.getCell(6).numFmt = '#,##0';
      r.getCell(7).numFmt = '#,##0';
      r.getCell(8).numFmt = '#,##0.0';
      r.getCell(9).numFmt = '#,##0.0';
      if (st.utilizationPct !== null) r.getCell(10).numFmt = '0.0"%"';
      r.border = BORDER_THIN;
    });
    autoFitColumns(staffSheet);

    // Sheet 3: Bảng Phòng Ghế
    if (data.resourceMetrics && data.resourceMetrics.length > 0) {
      const resSheet = wb.addWorksheet('3. Bảng Công Suất Phòng Ghế');
      applyWorksheetDefaults(resSheet);
      resSheet.addRow([
        'Mã Tài Nguyên',
        'Tên Phòng / Ghế',
        'Phân Loại',
        'Sức Chứa (Ghế)',
        'Chi Nhánh',
        'Tổng Giờ Khả Dụng (h)',
        'Tổng Giờ Thực Dùng (h)',
        'Công Suất Khai Thác (%)'
      ]);
      resSheet.getRow(1).fill = BRAND_TEAL_FILL;
      resSheet.getRow(1).font = HEADER_FONT;

      data.resourceMetrics.forEach((res) => {
        const r = resSheet.addRow([
          sanitizeText(res.code || res.resourceId.substring(0, 8).toUpperCase()),
          sanitizeText(res.resourceName),
          sanitizeText(res.resourceType),
          res.capacity,
          sanitizeText(res.branchName),
          res.availableSeatHours,
          res.actualUsedSeatHours,
          res.actualUtilizationPct !== null ? res.actualUtilizationPct : 'N/A'
        ]);
        r.getCell(4).numFmt = '#,##0';
        r.getCell(6).numFmt = '#,##0.0';
        r.getCell(7).numFmt = '#,##0.0';
        if (res.actualUtilizationPct !== null) r.getCell(8).numFmt = '0.0"%"';
        r.border = BORDER_THIN;
      });
      autoFitColumns(resSheet);
    }
  },

  /**
   * P7.4: Báo Cáo Phân Tích Khách Hàng, Giữ Chân & Cohort
   */
  buildP74Excel(wb: ExcelJS.Workbook, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_4;
    if (!data) return;

    // Sheet 1: Thông tin
    const infoSheet = wb.addWorksheet('1. Thông Tin Báo Cáo');
    infoSheet.addRow(['BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT 30/60/90 NGÀY (P7.4)']).font = TITLE_FONT;
    infoSheet.addRow(['Thương hiệu:', 'PHƯƠNG NAM CLINIC & SPA']);
    infoSheet.addRow(['Kỳ báo cáo:', `${params.dateRange.startDate} đến ${params.dateRange.endDate}`]);
    infoSheet.addRow(['Phạm vi chi nhánh:', branchName]);
    infoSheet.addRow(['Múi giờ dữ liệu:', 'Asia/Ho_Chi_Minh (UTC+7)']);
    infoSheet.addRow(['Thời điểm xuất file:', getNowVietnamString()]);
    infoSheet.addRow([]);
    infoSheet.addRow(['QUY TẮC & ĐỊNH NGHĨA CHỈ SỐ:']).font = { bold: true };
    infoSheet.addRow(['- Tách biệt 3 sự kiện:', '1. Khách mua hàng (đơn hoàn tất), 2. Khách được phục vụ (ca dịch vụ hoàn tất), 3. Khách mua lại.']);
    infoSheet.addRow(['- Khách Dùng Buổi Cũ:', 'Sử dụng buổi tiếp theo của gói cũ được tính là QUAY LẠI PHỤC VỤ, KHÔNG tự tính là mua lại.']);
    infoSheet.addRow(['- Recency (Số ngày chưa quay lại):', 'Tính đến ngày kết thúc kỳ phân tích để bảo đảm báo cáo lịch sử bất biến.']);
    infoSheet.addRow(['- Tổng Chi Tiêu Lịch Sử (LTV):', 'Tổng tiền mua hàng thực tế lịch sử (không phải LTV dự báo do chưa có mô hình AI dự báo).']);
    infoSheet.addRow(['- Cohort Chưa Đủ Tuổi:', 'Hiển thị rõ "Chưa đủ thời gian theo dõi", không ghi 0% gây hiểu nhầm.']);
    autoFitColumns(infoSheet);

    // Sheet 2: Phân Khúc RFM
    const rfmSheet = wb.addWorksheet('2. Phân Khúc Khách Hàng RFM');
    applyWorksheetDefaults(rfmSheet);
    rfmSheet.addRow([
      'Phân Nhóm RFM',
      'Mã Nhóm',
      'Số Lượng Khách',
      'Tổng Chi Tiêu Lịch Sử (VNĐ)',
      'Recency Trung Bình (Ngày)',
      'Ý Nghĩa & Hành Động Quản Trị'
    ]);
    rfmSheet.getRow(1).fill = BRAND_NAVY_FILL;
    rfmSheet.getRow(1).font = HEADER_FONT;

    const rfmMeanings: Record<string, string> = {
      VIP: 'Khách hàng chi tiêu cao nhất, tần suất tốt -> Chăm sóc cá nhân hóa, đặc quyền VIP.',
      Loyal: 'Khách hàng thân thiết, mua & phục vụ đều đặn -> Tri ân & giới thiệu dịch vụ mới.',
      Active: 'Khách hàng đang hoạt động thường xuyên -> Duy trì trải nghiệm & nhắc lịch định kỳ.',
      'At-Risk': 'Khách hàng có nguy cơ rời bỏ (60-120 ngày chưa đến) -> Cần gọi thăm hỏi, ưu đãi tái khám.',
      Inactive: 'Khách hàng ngưng hoạt động (>120 ngày) -> Chiến dịch kích hoạt lại.',
      Unengaged: 'Khách mới đăng ký chưa phát sinh giao dịch -> Tư vấn chào đón & tạo lịch hẹn đầu.'
    };

    data.rfmSegments.forEach((seg) => {
      const r = rfmSheet.addRow([
        sanitizeText(seg.segmentName),
        sanitizeText(seg.segmentKey),
        seg.customerCount,
        seg.totalHistoricalSpend,
        seg.avgRecencyDays !== null ? seg.avgRecencyDays : 'N/A',
        sanitizeText(rfmMeanings[seg.segmentKey] || '')
      ]);
      r.getCell(3).numFmt = '#,##0';
      r.getCell(4).numFmt = '#,##0';
      if (seg.avgRecencyDays !== null) r.getCell(5).numFmt = '#,##0.0';
      r.border = BORDER_THIN;
    });
    autoFitColumns(rfmSheet);

    // Sheet 3: Cohort 30/60/90 Ngày
    const cohortSheet = wb.addWorksheet('3. Cohort Giữ Chân 30-60-90');
    applyWorksheetDefaults(cohortSheet);
    cohortSheet.addRow(['BẢNG 1: COHORT QUAY LẠI PHỤC VỤ (DÙNG DỊCH VỤ HOẶC BUỔI LIỆU TRÌNH)']);
    cohortSheet.addRow([
      'Tháng Đầu Phục Vụ',
      'Quy Mô Cohort',
      'Quay Lại 30 Ngày',
      'Tỷ Lệ 30d (%)',
      'Quay Lại 60 Ngày',
      'Tỷ Lệ 60d (%)',
      'Quay Lại 90 Ngày',
      'Tỷ Lệ 90d (%)'
    ]);
    cohortSheet.getRow(2).fill = BRAND_NAVY_FILL;
    cohortSheet.getRow(2).font = HEADER_FONT;

    data.cohortServiceRetention.forEach((c) => {
      const r = cohortSheet.addRow([
        c.cohortMonth,
        c.totalCohortCustomers,
        c.retention30d.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.retention30d.returned}/${c.retention30d.eligible}`,
        c.retention30d.pct !== null ? c.retention30d.pct : 'Chưa đủ thời gian theo dõi',
        c.retention60d.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.retention60d.returned}/${c.retention60d.eligible}`,
        c.retention60d.pct !== null ? c.retention60d.pct : 'Chưa đủ thời gian theo dõi',
        c.retention90d.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.retention90d.returned}/${c.retention90d.eligible}`,
        c.retention90d.pct !== null ? c.retention90d.pct : 'Chưa đủ thời gian theo dõi'
      ]);
      r.getCell(2).numFmt = '#,##0';
      if (c.retention30d.pct !== null) r.getCell(4).numFmt = '0.0"%"';
      if (c.retention60d.pct !== null) r.getCell(6).numFmt = '0.0"%"';
      if (c.retention90d.pct !== null) r.getCell(8).numFmt = '0.0"%"';
      r.border = BORDER_THIN;
    });

    cohortSheet.addRow([]);
    cohortSheet.addRow(['BẢNG 2: COHORT MUA LẠI MỚI (PHÁT SINH ĐƠN HÀNG HOÀN TẤT TIẾP THEO)']);
    const rIdx = cohortSheet.rowCount;
    cohortSheet.addRow([
      'Tháng Mua Đầu',
      'Quy Mô Cohort',
      'Mua Lại 30 Ngày',
      'Tỷ Lệ Mua 30d (%)',
      'Mua Lại 60 Ngày',
      'Tỷ Lệ Mua 60d (%)',
      'Mua Lại 90 Ngày',
      'Tỷ Lệ Mua 90d (%)'
    ]);
    cohortSheet.getRow(rIdx + 1).fill = BRAND_TEAL_FILL;
    cohortSheet.getRow(rIdx + 1).font = HEADER_FONT;

    data.cohortRepurchaseRetention.forEach((c) => {
      const r = cohortSheet.addRow([
        c.cohortMonth,
        c.totalCohortCustomers,
        c.repurchase30d.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.repurchase30d.repurchased}/${c.repurchase30d.eligible}`,
        c.repurchase30d.pct !== null ? c.repurchase30d.pct : 'Chưa đủ thời gian theo dõi',
        c.repurchase60d.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.repurchase60d.repurchased}/${c.repurchase60d.eligible}`,
        c.repurchase60d.pct !== null ? c.repurchase60d.pct : 'Chưa đủ thời gian theo dõi',
        c.repurchase90d.status === 'not_matured' ? 'Chưa đủ thời gian theo dõi' : `${c.repurchase90d.repurchased}/${c.repurchase90d.eligible}`,
        c.repurchase90d.pct !== null ? c.repurchase90d.pct : 'Chưa đủ thời gian theo dõi'
      ]);
      r.getCell(2).numFmt = '#,##0';
      if (c.repurchase30d.pct !== null) r.getCell(4).numFmt = '0.0"%"';
      if (c.repurchase60d.pct !== null) r.getCell(6).numFmt = '0.0"%"';
      if (c.repurchase90d.pct !== null) r.getCell(8).numFmt = '0.0"%"';
      r.border = BORDER_THIN;
    });
    autoFitColumns(cohortSheet);

    // Sheet 4: Danh Sách Khách Hàng Chi Tiết
    if (params.detailLevel === 'full' && data.drilldown?.items) {
      const custSheet = wb.addWorksheet('4. Chi Tiết Khách Hàng');
      applyWorksheetDefaults(custSheet);
      custSheet.addRow([
        'Mã Khách Hàng',
        'Họ Và Tên',
        'Số Điện Thoại',
        'Hạng VIP',
        'Ngày Đăng Ký',
        'Mua Lần Đầu',
        'Phục Vụ Lần Đầu',
        'Recency (Ngày)',
        'Số Đơn Mua Kỳ Này',
        'Số Buổi Dùng Kỳ Này',
        'Tổng Chi Tiêu Lịch Sử (VNĐ)',
        'Buổi Gói Còn Lại',
        'Lịch Hẹn Sắp Tới',
        'Phân Nhóm RFM',
        'Khuyến Nghị Chăm Sóc'
      ]);
      custSheet.getRow(1).fill = BRAND_NAVY_FILL;
      custSheet.getRow(1).font = HEADER_FONT;

      data.drilldown.items.forEach((c) => {
        const r = custSheet.addRow([
          sanitizeText(c.customerId.substring(0, 8).toUpperCase()),
          sanitizeText(c.fullName),
          sanitizePhone(c.phone),
          sanitizeText(c.tier),
          c.registeredAt ? c.registeredAt.split('T')[0] : '',
          c.firstPurchaseOrgAt ? c.firstPurchaseOrgAt.split('T')[0] : 'Chưa mua',
          c.firstServiceAt ? c.firstServiceAt.split('T')[0] : 'Chưa phục vụ',
          c.recencyDays !== null ? c.recencyDays : 'N/A',
          c.periodPurchaseCount,
          c.periodServiceCount,
          c.historicalNetSpend,
          c.activeRemainingSessions,
          c.hasUpcomingAppointment ? 'Đã có lịch' : 'Chưa có lịch',
          sanitizeText(c.rfmSegment),
          sanitizeText(c.careRecommendation)
        ]);
        if (c.recencyDays !== null) r.getCell(8).numFmt = '#,##0';
        r.getCell(9).numFmt = '#,##0';
        r.getCell(10).numFmt = '#,##0';
        r.getCell(11).numFmt = '#,##0';
        r.getCell(12).numFmt = '#,##0';
        r.border = BORDER_THIN;
      });
      autoFitColumns(custSheet);
    }
  },

  /**
   * PDF Generation using jsPDF & jspdf-autotable (Landscape A4)
   */
  async generatePdf(params: ExportReportParams): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Load Unicode font if available
    try {
      if (typeof window !== 'undefined') {
        const fontRes = await fetch('/fonts/Arial.ttf');
        if (fontRes.ok) {
          const fontBuf = await fontRes.arrayBuffer();
          const base64Font = btoa(
            new Uint8Array(fontBuf).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          doc.addFileToVFS('Arial.ttf', base64Font);
          doc.addFont('Arial.ttf', 'Arial', 'normal');
          doc.setFont('Arial');
        }
      }
    } catch {
      // Fallback to standard
    }

    const branchName =
      params.selectedBranchId === 'all'
        ? 'Toàn bộ chi nhánh'
        : params.branches.find((b) => b.id === params.selectedBranchId)?.name || params.selectedBranchId;

    let reportTitle = '';
    switch (params.reportType) {
      case 'p7_1':
        reportTitle = 'BÁO CÁO BÁN HÀNG, DOANH THU & DÒNG TIỀN (P7.1)';
        this.renderP71Pdf(doc, params, branchName);
        break;
      case 'p7_2':
        reportTitle = 'BÁO CÁO GIÁ VỐN COGS & LỢI NHUẬN GỘP (P7.2)';
        this.renderP72Pdf(doc, params, branchName);
        break;
      case 'p7_3':
        reportTitle = 'BÁO CÁO HIỆU SUẤT NHÂN SỰ & PHÒNG GHẾ (P7.3)';
        this.renderP73Pdf(doc, params, branchName);
        break;
      case 'p7_4':
        reportTitle = 'BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT (P7.4)';
        this.renderP74Pdf(doc, params, branchName);
        break;
    }

    // Apply header & footer to all pages
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      // Header top bar
      doc.setFillColor(30, 58, 138); // Navy
      doc.rect(14, 10, 269, 1.5, 'F');

      // Top title text (page 1)
      if (i === 1) {
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('VIỆN THẨM MỸ & PHÒNG KHÁM PHƯƠNG NAM • HỆ THỐNG QUẢN TRỊ NỘI BỘ', 14, 8);
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `PHƯƠNG NAM CLINIC • Thời điểm xuất: ${getNowVietnamString()} • Báo cáo: ${reportTitle}`,
        14,
        202
      );
      doc.text(`Trang ${i} / ${totalPages}`, 265, 202, { align: 'right' });
    }

    return doc.output('blob');
  },

  /**
   * PDF Render for P7.1
   */
  renderP71Pdf(doc: jsPDF, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_1;
    if (!data) return;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text('BÁO CÁO BÁN HÀNG, DOANH THU & DÒNG TIỀN (P7.1)', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Kỳ báo cáo: ${params.dateRange.startDate} đến ${params.dateRange.endDate}   |   Chi nhánh: ${branchName}   |   Múi giờ: Asia/Ho_Chi_Minh (UTC+7)`,
      14,
      24
    );

    // Summary Table
    autoTable(doc, {
      startY: 28,
      head: [['Chỉ Số Quản Trị Bán Hàng', 'Giá Trị (VNĐ)', 'Chỉ Số Dòng Tiền & Đối Soát', 'Giá Trị (VNĐ)']],
      body: [
        [
          'Doanh Số Bán Hàng Gộp (Gross)',
          formatCurrency(data.salesSummary.grossSales),
          'Thực Thu Xác Nhận (Tiền mặt)',
          formatCurrency(data.cashflowSummary.confirmedCashCollected)
        ],
        [
          'Tổng Chiết Khấu Đã Giảm',
          formatCurrency(data.salesSummary.totalDiscount),
          'Tiền Cọc Thu Mới',
          formatCurrency(data.cashflowSummary.newDepositsCollected)
        ],
        [
          'Doanh Số Thực Tế (Net Sales)',
          formatCurrency(data.salesSummary.netInvoicedSales),
          'Thu Hồi Nợ Cũ',
          formatCurrency(data.cashflowSummary.debtRecovered)
        ],
        [
          'Doanh Số Bán Gói Liệu Trình',
          formatCurrency(data.salesSummary.packageCourseSales),
          'Cọc Đã Cấn Trừ',
          formatCurrency(data.cashflowSummary.depositRedeemed)
        ],
        [
          'Số Lượng Hóa Đơn Hợp Lệ',
          formatNumber(data.salesSummary.invoiceCount),
          'Tổng Hoàn Trả Khách Hàng',
          formatCurrency(data.cashflowSummary.totalRefundsPaid)
        ],
        [
          'Nợ Mới Phát Sinh Trong Kỳ',
          formatCurrency(data.salesSummary.newCustomerDebt),
          'DÒNG TIỀN THUẦN (Net Cashflow)',
          formatCurrency(data.cashflowSummary.netSalesCashflow)
        ]
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 }
    });

    // Drilldown Table
    if (params.detailLevel === 'full' && data.invoicesDrilldown?.length) {
      const finalY = (doc as any).lastAutoTable?.finalY || 90;
      doc.setFontSize(10);
      doc.setTextColor(30, 58, 138);
      doc.text('CHI TIẾT CHỨNG TỪ HÓA ĐƠN BÁN HÀNG', 14, finalY + 8);

      autoTable(doc, {
        startY: finalY + 11,
        head: [
          [
            'Mã HĐ',
            'Chi Nhánh',
            'Khách Hàng',
            'SĐT',
            'Tổng Tiền (VNĐ)',
            'Đã Thu (VNĐ)',
            'Còn Nợ (VNĐ)',
            'Trạng Thái',
            'Ngày Tạo'
          ]
        ],
        body: data.invoicesDrilldown.map((inv) => [
          inv.invoiceNumber || inv.id.substring(0, 8).toUpperCase(),
          inv.branchName,
          inv.customerName,
          sanitizePhone(inv.customerPhone),
          formatCurrency(inv.totalAmount),
          formatCurrency(inv.paidAmount),
          formatCurrency(inv.debtAmount),
          inv.status === 'completed' ? 'Hoàn thành' : inv.status,
          inv.createdAt ? inv.createdAt.split('T')[0] : ''
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        styles: { cellPadding: 1.5 },
        showHead: 'everyPage'
      });
    }
  },

  /**
   * PDF Render for P7.2
   */
  renderP72Pdf(doc: jsPDF, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_2;
    if (!data) return;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text('BÁO CÁO GIÁ VỐN COGS, HAO PHÍ VẬT TƯ & LỢI NHUẬN GỘP (P7.2)', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Kỳ báo cáo: ${params.dateRange.startDate} đến ${params.dateRange.endDate}   |   Chi nhánh: ${branchName}   |   Múi giờ: Asia/Ho_Chi_Minh (UTC+7)`,
      14,
      24
    );

    autoTable(doc, {
      startY: 28,
      head: [['Chỉ Số Quản Trị Giá Vốn & Lãi Gộp', 'Giá Trị', 'Đơn Vị', 'Ghi Chú & Diễn Giải Nghiệp Vụ']],
      body: [
        [
          'Doanh Thu Ghi Nhận Thực Tế (Recognized Revenue)',
          formatCurrency(data.summary.recognizedRevenue),
          'VNĐ',
          'Bao gồm doanh thu buổi dịch vụ hoàn tất + hàng hóa bán ra'
        ],
        [
          'Tổng Chi Phí Vật Tư Thực Tế (Material Cost)',
          formatCurrency(data.summary.materialCost),
          'VNĐ',
          'Tính theo giá vốn nhập kho & định mức BOM Snapshot'
        ],
        [
          'Tổng Hoa Hồng Bác Sĩ & KTV (Commission)',
          formatCurrency(data.summary.directCommission),
          'VNĐ',
          'Hoa hồng trực tiếp ghi nhận cho kỹ thuật viên & bác sĩ'
        ],
        [
          'Chênh Lệch Trực Tiếp Sau Giá Vốn & Hoa Hồng',
          formatCurrency(data.summary.directContribution),
          'VNĐ',
          'Doanh thu thuần - Chi phí vật tư - Hoa hồng (Chưa trừ CP cố định)'
        ],
        [
          'Tỷ Suất Lợi Nhuận Gộp Trực Tiếp (Direct Margin %)',
          formatPercent(data.summary.marginPct),
          '%',
          'Tỷ lệ đóng góp lợi nhuận trên doanh thu ghi nhận'
        ]
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2.5 }
    });

    if (params.detailLevel === 'full' && data.drilldown?.items?.length) {
      const finalY = (doc as any).lastAutoTable?.finalY || 90;
      doc.setFontSize(10);
      doc.setTextColor(30, 58, 138);
      doc.text('CHI TIẾT HAO PHÍ VẬT TƯ TIÊU HAO THEO CA ĐIỀU TRỊ', 14, finalY + 8);

      autoTable(doc, {
        startY: finalY + 11,
        head: [
          [
            'Mã Phiếu',
            'Chi Nhánh',
            'Dịch Vụ / Liệu Trình',
            'Tên Vật Tư',
            'ĐVT',
            'ĐM BOM',
            'Thực Tế',
            'Đơn Giá (VNĐ)',
            'Tổng Tiền (VNĐ)'
          ]
        ],
        body: data.drilldown.items.map((i) => [
          i.id.substring(0, 8).toUpperCase(),
          i.branchName,
          i.serviceName,
          i.productName,
          i.unit,
          formatNumber(i.standardQty),
          formatNumber(i.actualQty),
          formatCurrency(i.costPriceSnapshot),
          formatCurrency(i.totalCost)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        styles: { cellPadding: 1.5 },
        showHead: 'everyPage'
      });
    }
  },

  /**
   * PDF Render for P7.3
   */
  renderP73Pdf(doc: jsPDF, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_3;
    if (!data) return;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text('BÁO CÁO HIỆU SUẤT NHÂN SỰ, BÁC SĨ & PHÒNG GHẾ (P7.3)', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Kỳ báo cáo: ${params.dateRange.startDate} đến ${params.dateRange.endDate}   |   Chi nhánh: ${branchName}   |   Múi giờ: Asia/Ho_Chi_Minh (UTC+7)`,
      14,
      24
    );

    autoTable(doc, {
      startY: 28,
      head: [
        [
          'Mã NV',
          'Họ Và Tên',
          'Chức Vụ',
          'Chi Nhánh',
          'Doanh Số Tư Vấn',
          'Doanh Thu Phục Vụ',
          'Số Ca',
          'Giờ Phục Vụ',
          'Giờ Roster',
          'Hiệu Suất %'
        ]
      ],
      body: data.staffMetrics.map((st) => [
        st.staffId.substring(0, 8).toUpperCase(),
        st.fullName,
        st.jobTitle,
        st.primaryBranchName,
        formatCurrency(st.salesInvoiced),
        formatCurrency(st.serviceExecutionRevenue),
        formatNumber(st.sessionsCompletedCount),
        `${formatNumber(st.handsOnHours)}h`,
        `${formatNumber(st.approvedWorkHours)}h`,
        formatPercent(st.utilizationPct)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 },
      showHead: 'everyPage'
    });

    if (data.resourceMetrics?.length) {
      const finalY = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.setTextColor(13, 148, 136);
      doc.text('CÔNG SUẤT KHAI THÁC PHÒNG / GHẾ ĐIỀU TRỊ', 14, finalY + 8);

      autoTable(doc, {
        startY: finalY + 11,
        head: [['Tên Phòng / Ghế', 'Loại Tài Nguyên', 'Chi Nhánh', 'Sức Chứa', 'Giờ Khả Dụng', 'Giờ Sử Dụng', 'Công Suất %']],
        body: data.resourceMetrics.map((r) => [
          r.resourceName,
          r.resourceType,
          r.branchName,
          formatNumber(r.capacity),
          `${formatNumber(r.availableSeatHours)}h`,
          `${formatNumber(r.actualUsedSeatHours)}h`,
          formatPercent(r.actualUtilizationPct)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        styles: { cellPadding: 2 },
        showHead: 'everyPage'
      });
    }
  },

  /**
   * PDF Render for P7.4
   */
  renderP74Pdf(doc: jsPDF, params: ExportReportParams, branchName: string) {
    const data = params.data.p7_4;
    if (!data) return;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text('BÁO CÁO PHÂN TÍCH KHÁCH HÀNG, RETENTION & COHORT (P7.4)', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Kỳ báo cáo: ${params.dateRange.startDate} đến ${params.dateRange.endDate}   |   Chi nhánh: ${branchName}   |   Múi giờ: Asia/Ho_Chi_Minh (UTC+7)`,
      14,
      24
    );

    // Summary Metrics
    autoTable(doc, {
      startY: 28,
      head: [['Chỉ Số Quản Trị Khách Hàng', 'Giá Trị', 'Chỉ Số Giữ Chân & Quay Lại', 'Giá Trị']],
      body: [
        [
          'Tổng Khách Hàng Trong Hệ Thống',
          formatNumber(data.summary.totalCustomersInSystem),
          'Khách Mua Lại Trong Kỳ',
          formatNumber(data.summary.returningBuyers)
        ],
        [
          'Khách Mới Toàn Chuỗi',
          formatNumber(data.summary.newOrgCustomers),
          'Tỷ Lệ Khách Mua Lại (Repurchase %)',
          formatPercent(data.summary.repurchaseRatePct)
        ],
        [
          'Khách Lần Đầu Tại Chi Nhánh',
          formatNumber(data.summary.newBranchCustomers),
          'Khách Quay Lại Dùng Buổi Gói Cũ',
          formatNumber(data.summary.returningServedOnly)
        ],
        [
          'Tổng Khách Phát Sinh Đơn Mua Kỳ Này',
          formatNumber(data.summary.totalActivePeriodBuyers),
          'Tổng Khách Đến Được Phục Vụ Kỳ Này',
          formatNumber(data.summary.totalActivePeriodServed)
        ]
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 }
    });

    // RFM Table
    let currentY = (doc as any).lastAutoTable?.finalY || 80;
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text('BẢNG PHÂN KHÚC KHÁCH HÀNG RFM', 14, currentY + 7);

    autoTable(doc, {
      startY: currentY + 10,
      head: [['Phân Nhóm', 'Mã Nhóm', 'Số Lượng', 'Tổng Chi Tiêu Lịch Sử', 'Recency TB', 'Hành Động Khuyến Nghị']],
      body: data.rfmSegments.map((s) => [
        s.segmentName,
        s.segmentKey,
        formatNumber(s.customerCount),
        formatCurrency(s.totalHistoricalSpend),
        s.avgRecencyDays !== null ? `${formatNumber(s.avgRecencyDays)} ngày` : 'N/A',
        s.segmentKey === 'At-Risk'
          ? 'Cần thăm hỏi & tái kích hoạt'
          : s.segmentKey === 'VIP'
          ? 'Chăm sóc đặc quyền VIP'
          : 'Duy trì trải nghiệm'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 }
    });

    // Cohort Tables
    currentY = (doc as any).lastAutoTable?.finalY || 130;
    if (data.cohortServiceRetention?.length || data.cohortRepurchaseRetention?.length) {
      doc.addPage();
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 138);
      doc.text('COHORT GIỮ CHÂN PHỤC VỤ (30 / 60 / 90 NGÀY)', 14, 18);

      autoTable(doc, {
        startY: 22,
        head: [['Tháng Đầu', 'Quy Mô', '30 Ngày (Tử/Mẫu)', 'Tỷ Lệ 30d', '60 Ngày (Tử/Mẫu)', 'Tỷ Lệ 60d', '90 Ngày (Tử/Mẫu)', 'Tỷ Lệ 90d']],
        body: data.cohortServiceRetention.map((c) => [
          c.cohortMonth,
          formatNumber(c.totalCohortCustomers),
          c.retention30d.status === 'not_matured' ? 'Chưa đủ theo dõi' : `${c.retention30d.returned}/${c.retention30d.eligible}`,
          c.retention30d.pct !== null ? formatPercent(c.retention30d.pct) : 'Chưa đủ theo dõi',
          c.retention60d.status === 'not_matured' ? 'Chưa đủ theo dõi' : `${c.retention60d.returned}/${c.retention60d.eligible}`,
          c.retention60d.pct !== null ? formatPercent(c.retention60d.pct) : 'Chưa đủ theo dõi',
          c.retention90d.status === 'not_matured' ? 'Chưa đủ theo dõi' : `${c.retention90d.returned}/${c.retention90d.eligible}`,
          c.retention90d.pct !== null ? formatPercent(c.retention90d.pct) : 'Chưa đủ theo dõi'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        styles: { cellPadding: 2 }
      });

      const nextY = (doc as any).lastAutoTable?.finalY || 80;
      doc.setFontSize(11);
      doc.setTextColor(13, 148, 136);
      doc.text('COHORT MUA LẠI ĐƠN MỚI (30 / 60 / 90 NGÀY)', 14, nextY + 8);

      autoTable(doc, {
        startY: nextY + 12,
        head: [['Tháng Đầu', 'Quy Mô', 'Mua 30d (Tử/Mẫu)', 'Tỷ Lệ 30d', 'Mua 60d (Tử/Mẫu)', 'Tỷ Lệ 60d', 'Mua 90d (Tử/Mẫu)', 'Tỷ Lệ 90d']],
        body: data.cohortRepurchaseRetention.map((c) => [
          c.cohortMonth,
          formatNumber(c.totalCohortCustomers),
          c.repurchase30d.status === 'not_matured' ? 'Chưa đủ theo dõi' : `${c.repurchase30d.repurchased}/${c.repurchase30d.eligible}`,
          c.repurchase30d.pct !== null ? formatPercent(c.repurchase30d.pct) : 'Chưa đủ theo dõi',
          c.repurchase60d.status === 'not_matured' ? 'Chưa đủ theo dõi' : `${c.repurchase60d.repurchased}/${c.repurchase60d.eligible}`,
          c.repurchase60d.pct !== null ? formatPercent(c.repurchase60d.pct) : 'Chưa đủ theo dõi',
          c.repurchase90d.status === 'not_matured' ? 'Chưa đủ theo dõi' : `${c.repurchase90d.repurchased}/${c.repurchase90d.eligible}`,
          c.repurchase90d.pct !== null ? formatPercent(c.repurchase90d.pct) : 'Chưa đủ theo dõi'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        styles: { cellPadding: 2 }
      });
    }
  },

  /**
   * Helper to trigger download in browser
   */
  downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
