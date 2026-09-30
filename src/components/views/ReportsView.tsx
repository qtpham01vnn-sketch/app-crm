import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  Building2,
  Filter,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  X,
  Layers,
  Sparkles,
  RefreshCw,
  PieChart,
  Package,
  Activity,
  UserCheck,
  Users,
  FileSpreadsheet,
  FileText,
  Check,
  Loader2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import { reportExportService, type ReportType, type ExportFormat, type ExportDetailLevel } from '../../services/reportExportService';
import type { SalesCashflowReport, CogsAndProfitReport, StaffAndResourceUtilizationReport, CustomerRetentionAndCohortReport } from '../../types';


export const ReportsView: React.FC = () => {
  const { org, branches, sales, payments, customers, suppliers } = useApp();

  // Navigation Subtabs
  const [reportTab, setReportTab] = useState<'sales' | 'cashflow' | 'cogs' | 'utilization' | 'retention' | 'earned' | 'debt'>('sales');

  // Filter States
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all'); // 'all' or specific branchId
  const [datePreset, setDatePreset] = useState<'today' | '7days' | 'this_month' | 'last_month' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [customerSegmentFilter, setCustomerSegmentFilter] = useState<string>('all');

  // Report Data & Loading State
  const [reportData, setReportData] = useState<SalesCashflowReport | null>(null);
  const [cogsReportData, setCogsReportData] = useState<CogsAndProfitReport | null>(null);
  const [staffReportData, setStaffReportData] = useState<StaffAndResourceUtilizationReport | null>(null);
  const [customerReportData, setCustomerReportData] = useState<CustomerRetentionAndCohortReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState<{
    isOpen: boolean;
    type: 'invoices' | 'payments' | 'cogs_materials' | 'staff_sessions' | 'retention_customers';
    title: string;
    subtitle: string;
  }>({
    isOpen: false,
    type: 'invoices',
    title: '',
    subtitle: ''
  });

  // Export Modal State (P7.5 Excel & PDF)
  const [exportModal, setExportModal] = useState<{
    isOpen: boolean;
    selectedReport: ReportType;
    format: ExportFormat;
    detailLevel: ExportDetailLevel;
    isExporting: boolean;
    statusText: string;
    error: string | null;
  }>({
    isOpen: false,
    selectedReport: 'p7_1',
    format: 'excel',
    detailLevel: 'full',
    isExporting: false,
    statusText: '',
    error: null
  });

  const handleOpenExportModal = () => {
    let mappedReport: ReportType = 'p7_1';
    if (reportTab === 'cogs') mappedReport = 'p7_2';
    else if (reportTab === 'utilization') mappedReport = 'p7_3';
    else if (reportTab === 'retention') mappedReport = 'p7_4';

    setExportModal((prev) => ({
      ...prev,
      isOpen: true,
      selectedReport: mappedReport,
      error: null,
      statusText: ''
    }));
  };

  const handleExecuteExport = async () => {
    setExportModal((prev) => ({
      ...prev,
      isExporting: true,
      error: null,
      statusText: 'Đang chuẩn bị dữ liệu báo cáo...'
    }));

    try {
      const branchName =
        selectedBranchId === 'all'
          ? 'Toan_Chuoi'
          : (branches.find((b) => b.id === selectedBranchId)?.name || 'Chi_Nhanh').replace(/\s+/g, '_');

      const ext = exportModal.format === 'excel' ? 'xlsx' : 'pdf';
      const reportCodeMap: Record<ReportType, string> = {
        p7_1: 'Bao_Cao_Ban_Hang_Dong_Tien_P7_1',
        p7_2: 'Bao_Cao_Gia_Von_Lai_Gop_P7_2',
        p7_3: 'Bao_Cao_Hieu_Suat_Nhan_Su_P7_3',
        p7_4: 'Bao_Cao_Giu_Chan_Cohort_P7_4'
      };
      const fileName = `${reportCodeMap[exportModal.selectedReport]}_${branchName}_${startDate}_${endDate}.${ext}`;

      const blob = await reportExportService.exportReport({
        reportType: exportModal.selectedReport,
        format: exportModal.format,
        detailLevel: exportModal.detailLevel,
        dateRange: { startDate, endDate },
        selectedBranchId,
        branches,
        data: {
          p7_1: reportData,
          p7_2: cogsReportData,
          p7_3: staffReportData,
          p7_4: customerReportData
        },
        onProgress: (_prog, msg) => {
          setExportModal((prev) => ({ ...prev, statusText: msg }));
        }
      });

      reportExportService.downloadFile(blob, fileName);
      setExportModal((prev) => ({ ...prev, isOpen: false, isExporting: false, statusText: '' }));
    } catch (err: any) {
      console.error('Lỗi xuất báo cáo:', err);
      setExportModal((prev) => ({
        ...prev,
        isExporting: false,
        error: err.message || 'Xuất file thất bại. Vui lòng thử lại!'
      }));
    }
  };

  // Handle Preset Date Selection
  const handleDatePresetChange = (preset: 'today' | '7days' | 'this_month' | 'last_month' | 'custom') => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date(Date.now() - 7 * 86400000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    }
  };

  // Fetch Report Data from RPC
  const fetchReport = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const branchIdParam = selectedBranchId === 'all' ? null : selectedBranchId;
      const methodParam = paymentMethodFilter === 'all' ? null : paymentMethodFilter;
      
      const [salesRes, cogsRes, staffRes, customerRes] = await Promise.all([
        masterDataService.getSalesAndCashflowReport({
          orgId: org.id,
          branchId: branchIdParam,
          startDate,
          endDate,
          paymentMethod: methodParam
        }),
        masterDataService.getCogsAndGrossProfitReport({
          orgId: org.id,
          branchId: branchIdParam,
          startDate,
          endDate
        }),
        masterDataService.getStaffAndResourceUtilizationReport({
          orgId: org.id,
          branchId: branchIdParam || undefined,
          startDate,
          endDate
        }),
        masterDataService.getCustomerRetentionAndCohortReport(
          org.id,
          branchIdParam || undefined,
          startDate,
          endDate,
          customerSegmentFilter
        )
      ]);

      setReportData(salesRes);
      setCogsReportData(cogsRes);
      setStaffReportData(staffRes);
      setCustomerReportData(customerRes);
    } catch (err: any) {
      console.error('Lỗi tải báo cáo BI:', err);
      setErrorMsg(err.message || 'Không thể tải báo cáo từ máy chủ.');
    } finally {
      setLoading(false);
    }
  }, [org?.id, selectedBranchId, startDate, endDate, paymentMethodFilter, customerSegmentFilter]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Fallback calculations for offline or initial state
  const offlineFilteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchBranch = selectedBranchId === 'all' || s.branchId === selectedBranchId;
      const matchDate = s.createdAt ? s.createdAt.slice(0, 10) >= startDate && s.createdAt.slice(0, 10) <= endDate : true;
      return matchBranch && matchDate;
    });
  }, [sales, selectedBranchId, startDate, endDate]);

  const offlineFilteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchBranch = selectedBranchId === 'all' || p.branchId === selectedBranchId;
      const matchDate = p.createdAt ? p.createdAt.slice(0, 10) >= startDate && p.createdAt.slice(0, 10) <= endDate : true;
      const matchMethod = paymentMethodFilter === 'all' || p.paymentMethod === paymentMethodFilter;
      return matchBranch && matchDate && matchMethod;
    });
  }, [payments, selectedBranchId, startDate, endDate, paymentMethodFilter]);

  // Unified KPI Values
  const salesKpi = reportData?.salesSummary || {
    grossSales: offlineFilteredSales.reduce((sum, s) => sum + (s.total || 0), 0),
    totalDiscount: 0,
    netInvoicedSales: offlineFilteredSales.reduce((sum, s) => sum + (s.total || 0), 0),
    invoiceCount: offlineFilteredSales.length,
    avgOrderValue: offlineFilteredSales.length > 0 ? Math.round(offlineFilteredSales.reduce((sum, s) => sum + (s.total || 0), 0) / offlineFilteredSales.length) : 0,
    newCustomerDebt: 0,
    packageCourseSales: 0
  };

  const cashflowKpi = reportData?.cashflowSummary || {
    confirmedCashCollected: offlineFilteredPayments.filter(p => (p.paymentMethod as string) !== 'deposit_credit' && (p.paymentMethod as string) !== 'deposit').reduce((sum, p) => sum + (p.amount || 0), 0),
    pendingBankTransfers: 0,
    newDepositsCollected: 0,
    depositRedeemed: offlineFilteredPayments.filter(p => (p.paymentMethod as string) === 'deposit_credit' || (p.paymentMethod as string) === 'deposit').reduce((sum, p) => sum + (p.amount || 0), 0),
    debtRecovered: 0,
    totalRefundsPaid: 0,
    netSalesCashflow: offlineFilteredPayments.filter(p => (p.paymentMethod as string) !== 'deposit_credit' && (p.paymentMethod as string) !== 'deposit').reduce((sum, p) => sum + (p.amount || 0), 0)
  };

  const cogsSummary = cogsReportData?.summary || {
    recognizedRevenue: 0,
    cogsProducts: 0,
    materialCost: 0,
    directCommission: 0,
    directContribution: 0,
    marginPct: null,
    missingCostWarningCount: 0,
    disclaimer: 'Chênh lệch trực tiếp sau giá vốn, vật tư và hoa hồng.'
  };

  const earnedKpi = reportData?.earnedSummary || {
    totalSessionsPerformed: 0,
    earnedSessionRevenue: 0
  };

  // Debt KPIs
  const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);
  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + (s.debt || 0), 0);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* Header with Title and Global Actions */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold shadow-xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-slate-800">Trung Tâm Phân Tích & Báo Cáo BI (P7.1 - P7.5)</h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700">
                Asia/Ho_Chi_Minh
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Bán hàng • Dòng tiền • Giá vốn COGS • Hiệu suất Nhân sự • Giữ chân Retention • Xuất Excel & PDF
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl flex items-center space-x-1 transition-all disabled:opacity-50"
            title="Làm mới dữ liệu từ máy chủ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={handleOpenExportModal}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
            title="Xuất báo cáo định dạng Excel (.xlsx) hoặc PDF Quản trị"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Báo Cáo (Excel / PDF)</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        {/* Branch Filter */}
        <div className="flex items-center space-x-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-700">Chi nhánh:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
          >
            <option value="all">Toàn chuỗi ({branches.length} chi nhánh)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Preset & Custom Picker */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
            {(['today', '7days', 'this_month', 'last_month', 'custom'] as const).map((preset) => {
              const labels: Record<string, string> = {
                today: 'Hôm nay',
                '7days': '7 ngày qua',
                this_month: 'Tháng này',
                last_month: 'Tháng trước',
                custom: 'Tùy chọn'
              };
              return (
                <button
                  key={preset}
                  onClick={() => handleDatePresetChange(preset)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    datePreset === preset ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {labels[preset]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs shadow-2xs"
            />
            <span>đến</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs shadow-2xs"
            />
          </div>
        </div>

        {/* Payment Method Filter */}
        {reportTab !== 'retention' ? (
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">PTTT:</span>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
            >
              <option value="all">Tất cả phương thức</option>
              <option value="cash">Tiền mặt</option>
              <option value="transfer_vietqr">Chuyển khoản VietQR</option>
              <option value="card">Thẻ POS</option>
              <option value="deposit_credit">Cấn trừ cọc / Điểm</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-slate-700">Phân nhóm RFM:</span>
            <select
              value={customerSegmentFilter}
              onChange={(e) => setCustomerSegmentFilter(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              <option value="all">Tất cả phân nhóm ({customerReportData?.summary?.totalCustomersInSystem || 0})</option>
              <option value="vip_champion">VIP / Champion</option>
              <option value="loyal">Khách hàng trung thành</option>
              <option value="promising_active">Khách mới & Đang hoạt động</option>
              <option value="at_risk_care_needed">Cần xem xét chăm sóc (60-120 ngày)</option>
              <option value="inactive_dormant">Chưa quay lại (&gt;120 ngày)</option>
              <option value="unengaged_no_history">Chưa phát sinh giao dịch</option>
            </select>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-800 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <div>
            <p className="font-bold">Lưu ý khi tải báo cáo</p>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Navigation Subtabs Bar */}
      <div className="flex items-center space-x-2 border-b border-slate-100 pb-2 overflow-x-auto">
        <button
          onClick={() => setReportTab('sales')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'sales'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>1. Bán Hàng & Hóa Đơn</span>
        </button>

        <button
          onClick={() => setReportTab('cashflow')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'cashflow'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>2. Dòng Tiền Thu Khách</span>
        </button>

        <button
          onClick={() => setReportTab('cogs')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'cogs'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>3. Giá Vốn & Lợi Nhuận Trực Tiếp (P7.2)</span>
        </button>

        <button
          onClick={() => setReportTab('utilization')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'utilization'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>4. Hiệu Suất Nhân Sự (P7.3)</span>
        </button>

        <button
          onClick={() => setReportTab('retention')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'retention'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>5. Giữ Chân & Cohort Khách Hàng (P7.4)</span>
        </button>

        <button
          onClick={() => setReportTab('earned')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'earned'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>6. Liệu Trình Trừ Buổi</span>
        </button>

        <button
          onClick={() => setReportTab('debt')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            reportTab === 'debt'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>7. Sổ Công Nợ (AR / AP)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 4: HIỆU SUẤT NHÂN SỰ & CÔNG SUẤT TÀI NGUYÊN (P7.3) */}
      {/* ========================================================================= */}
      {reportTab === 'utilization' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-gradient-to-br from-cyan-50 to-cyan-100/60 rounded-2xl border border-cyan-200">
              <span className="text-xs font-bold text-cyan-800 uppercase tracking-wider">Doanh Số Tư Vấn Bán</span>
              <p className="text-2xl font-black text-cyan-700 mt-2">
                {(staffReportData?.summary?.totalSalesRepRevenue || 0).toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-cyan-600 font-semibold mt-1">Doanh số ký hợp đồng / hóa đơn</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Doanh Thu Phục Vụ (KTV/Bác Sĩ)</span>
              <p className="text-2xl font-black text-blue-700 mt-2">
                {(staffReportData?.summary?.totalServiceExecRevenue || 0).toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-blue-600 font-semibold mt-1">Giá trị hoàn tất trên khách thực tế</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-teal-50 to-teal-100/60 rounded-2xl border border-teal-200">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">Tổng Ca Phục Vụ Hoàn Tất</span>
              <p className="text-2xl font-black text-teal-700 mt-2">
                {(staffReportData?.summary?.totalSessionsCount || 0).toLocaleString('vi-VN')} <span className="text-sm font-bold text-slate-500">ca</span>
              </p>
              <p className="text-[11px] text-teal-600 font-semibold mt-1">Không đếm trùng lịch hẹn & trừ buổi</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Hiệu Suất Sử Dụng Thời Gian</span>
              <p className="text-2xl font-black text-emerald-700 mt-2">
                {staffReportData?.summary?.overallUtilizationPct !== null && staffReportData?.summary?.overallUtilizationPct !== undefined
                  ? `${staffReportData.summary.overallUtilizationPct}%`
                  : 'N/A'}
              </p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                {(staffReportData?.summary?.totalHandsOnHours || 0)}h làm / {(staffReportData?.summary?.totalApprovedWorkHours || 0)}h duyệt
              </p>
            </div>
          </div>

          {/* Staff Performance Table */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyan-600" />
                <span>Hiệu Suất & Năng Suất Từng Nhân Sự / Bác Sĩ / KTV</span>
              </h4>
              <button
                onClick={() =>
                  setDrilldownModal({
                    isOpen: true,
                    type: 'staff_sessions',
                    title: 'Nhật Ký Chi Tiết Ca Phục Vụ Dịch Vụ',
                    subtitle: `Danh sách các ca phục vụ thực tế (${startDate} đến ${endDate})`
                  })
                }
                className="text-xs text-cyan-700 font-bold hover:underline flex items-center space-x-1"
              >
                <span>Xem chi tiết từng ca</span>
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="pb-3 px-2">Họ & Tên</th>
                    <th className="pb-3 px-2">Chức Danh</th>
                    <th className="pb-3 px-2">Chi Nhánh</th>
                    <th className="pb-3 px-2 text-right">Doanh Số Tư Vấn</th>
                    <th className="pb-3 px-2 text-right">Doanh Thu Phục Vụ</th>
                    <th className="pb-3 px-2 text-center">Số Ca</th>
                    <th className="pb-3 px-2 text-center">Số Khách</th>
                    <th className="pb-3 px-2 text-center">Giờ Làm Khách</th>
                    <th className="pb-3 px-2 text-center">Giờ Công Duyệt</th>
                    <th className="pb-3 px-2 text-center">Hiệu Suất (%)</th>
                    <th className="pb-3 px-2 text-center">Đánh Giá KH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(staffReportData?.staffMetrics || []).length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-6 text-center text-slate-400">
                        Chưa có dữ liệu nhân sự trong kỳ lọc này.
                      </td>
                    </tr>
                  ) : (
                    (staffReportData?.staffMetrics || []).map((s) => (
                      <tr key={s.staffId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-2 font-bold text-slate-800">{s.fullName}</td>
                        <td className="py-3 px-2 text-slate-500">{s.jobTitle}</td>
                        <td className="py-3 px-2 text-slate-600">{s.primaryBranchName}</td>
                        <td className="py-3 px-2 text-right font-bold text-cyan-800">{s.salesInvoiced.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-right font-bold text-blue-800">{s.serviceExecutionRevenue.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-center font-semibold text-slate-700">{s.sessionsCompletedCount} ca</td>
                        <td className="py-3 px-2 text-center text-slate-600">{s.uniqueClientsServed} khách</td>
                        <td className="py-3 px-2 text-center font-mono text-slate-700">{s.handsOnHours}h</td>
                        <td className="py-3 px-2 text-center font-mono text-slate-700">{s.approvedWorkHours}h</td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.utilizationPct !== null && s.utilizationPct >= 60
                                ? 'bg-emerald-100 text-emerald-700'
                                : s.utilizationPct !== null
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {s.utilizationPct !== null ? `${s.utilizationPct}%` : 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="text-[10px] text-slate-400 italic">
                            {s.ratingStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resource Utilization Table */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <Package className="w-4 h-4 text-cyan-600" />
              <span>Công Suất Khai Thác Tài Nguyên (Phòng / Giường / Ghế Điều Trị)</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="pb-3 px-2">Mã Tài Nguyên</th>
                    <th className="pb-3 px-2">Tên Phòng / Ghế</th>
                    <th className="pb-3 px-2">Loại</th>
                    <th className="pb-3 px-2">Chi Nhánh</th>
                    <th className="pb-3 px-2 text-center">Sức Chứa (Chỗ)</th>
                    <th className="pb-3 px-2 text-center">Chỗ × Giờ Mở Cửa</th>
                    <th className="pb-3 px-2 text-center">Chỗ × Giờ Đặt Trước</th>
                    <th className="pb-3 px-2 text-center">Chỗ × Giờ Thực Dùng</th>
                    <th className="pb-3 px-2 text-center">Công Suất Đặt (%)</th>
                    <th className="pb-3 px-2 text-center">Công Suất Thực (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(staffReportData?.resourceMetrics || []).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-slate-400">
                        Chưa có tài nguyên phòng/ghế nào được cấu hình trong chi nhánh này.
                      </td>
                    </tr>
                  ) : (
                    (staffReportData?.resourceMetrics || []).map((r) => (
                      <tr key={r.resourceId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-2 font-mono font-bold text-slate-700">{r.code}</td>
                        <td className="py-3 px-2 font-bold text-slate-800">{r.resourceName}</td>
                        <td className="py-3 px-2 text-slate-500 uppercase text-[10px] font-semibold">{r.resourceType}</td>
                        <td className="py-3 px-2 text-slate-600">{r.branchName}</td>
                        <td className="py-3 px-2 text-center font-bold text-slate-700">{r.capacity} chỗ</td>
                        <td className="py-3 px-2 text-center font-mono text-slate-600">{r.availableSeatHours}h</td>
                        <td className="py-3 px-2 text-center font-mono text-amber-700 font-semibold">{r.bookedSeatHours}h</td>
                        <td className="py-3 px-2 text-center font-mono text-emerald-700 font-bold">{r.actualUsedSeatHours}h</td>
                        <td className="py-3 px-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {r.bookedUtilizationPct !== null ? `${r.bookedUtilizationPct}%` : 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {r.actualUtilizationPct !== null ? `${r.actualUtilizationPct}%` : 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: GIỮ CHÂN & COHORT KHÁCH HÀNG (PHASE P7.4) */}
      {/* ========================================================================= */}
      {reportTab === 'retention' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-2xl border border-blue-200">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Tổng Khách Trong Hệ Thống</span>
              <p className="text-2xl font-black text-blue-700 mt-2">
                {(customerReportData?.summary?.totalCustomersInSystem || 0).toLocaleString('vi-VN')} <span className="text-sm font-bold text-slate-500">khách</span>
              </p>
              <p className="text-[11px] text-blue-600 font-semibold mt-1">Đã đăng ký hồ sơ trên toàn tổ chức</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-indigo-50 to-indigo-100/60 rounded-2xl border border-indigo-200">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Khách Phát Sinh Hoạt Động</span>
              <div className="flex items-center justify-between mt-2">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Mua Hàng</span>
                  <p className="text-xl font-black text-indigo-700">
                    {(customerReportData?.summary?.totalActivePeriodBuyers || 0).toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="border-l border-indigo-200 pl-4">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Được Phục Vụ</span>
                  <p className="text-xl font-black text-indigo-700">
                    {(customerReportData?.summary?.totalActivePeriodServed || 0).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-indigo-600 font-semibold mt-1">Tách bạch mua mới vs thực hiện liệu trình</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-teal-50 to-teal-100/60 rounded-2xl border border-teal-200">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">Khách Mới vs Khách Quay Lại</span>
              <div className="flex items-center justify-between mt-2">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Mới Chuỗi / CN</span>
                  <p className="text-xl font-black text-teal-700">
                    {customerReportData?.summary?.newOrgCustomers || 0} / {customerReportData?.summary?.newBranchCustomers || 0}
                  </p>
                </div>
                <div className="border-l border-teal-200 pl-4">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Quay Lại Mua</span>
                  <p className="text-xl font-black text-teal-700">
                    {customerReportData?.summary?.returningBuyers || 0}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-teal-600 font-semibold mt-1">Lần đầu mua lịch sử vs Mua lần 2 trở đi</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl border border-emerald-200">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Tỷ Lệ Khách Mua Lại (Repurchase)</span>
              <p className="text-2xl font-black text-emerald-700 mt-2">
                {customerReportData?.summary?.repurchaseRatePct !== null && customerReportData?.summary?.repurchaseRatePct !== undefined
                  ? `${customerReportData.summary.repurchaseRatePct}%`
                  : 'N/A'}
              </p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                {customerReportData?.summary?.returningBuyers || 0} khách mua lại / {((customerReportData?.summary?.newOrgCustomers || 0) + (customerReportData?.summary?.returningBuyers || 0))} khách mua trong kỳ
              </p>
            </div>
          </div>

          {/* RFM Segments Breakdown */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Phân Nhóm Giá Trị & Tần Suất Khách Hàng (RFM Segmentation)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(customerReportData?.rfmSegments || []).map((seg) => (
                <div key={seg.segmentKey} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800">{seg.segmentName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                      {seg.customerCount} khách
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500">Tổng chi tiêu:</span>
                      <p className="font-bold text-indigo-700">{seg.totalHistoricalSpend.toLocaleString('vi-VN')}đ</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500">Recency TB:</span>
                      <p className="font-bold text-slate-700">{seg.avgRecencyDays !== null ? `${seg.avgRecencyDays} ngày` : 'Chưa có'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cohort Tables: Service Retention & Repurchase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cohort Quay Lại Phục Vụ */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Cohort Quay Lại Phục Vụ (Service Retention)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Tỷ lệ khách quay lại làm dịch vụ/liệu trình sau lần đầu</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold">
                      <th className="pb-3 px-2">Tháng Cohort</th>
                      <th className="pb-3 px-2 text-center">Tổng Khách</th>
                      <th className="pb-3 px-2 text-center">30 Ngày</th>
                      <th className="pb-3 px-2 text-center">60 Ngày</th>
                      <th className="pb-3 px-2 text-center">90 Ngày</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(customerReportData?.cohortServiceRetention || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">Chưa có dữ liệu cohort phục vụ</td>
                      </tr>
                    ) : (
                      (customerReportData?.cohortServiceRetention || []).map((c) => (
                        <tr key={c.cohortMonth} className="hover:bg-slate-50">
                          <td className="py-3 px-2 font-bold text-slate-800">{c.cohortMonth}</td>
                          <td className="py-3 px-2 text-center font-bold text-slate-700">{c.totalCohortCustomers}</td>
                          <td className="py-3 px-2 text-center">
                            {c.retention30d.status === 'ready' ? (
                              <span className="font-bold text-emerald-700">
                                {c.retention30d.returned}/{c.retention30d.eligible} ({c.retention30d.pct}%)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa đủ thời gian</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {c.retention60d.status === 'ready' ? (
                              <span className="font-bold text-emerald-700">
                                {c.retention60d.returned}/{c.retention60d.eligible} ({c.retention60d.pct}%)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa đủ thời gian</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {c.retention90d.status === 'ready' ? (
                              <span className="font-bold text-emerald-700">
                                {c.retention90d.returned}/{c.retention90d.eligible} ({c.retention90d.pct}%)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa đủ thời gian</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cohort Mua Lại */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>Cohort Mua Lại (Repurchase Retention)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Tỷ lệ khách phát sinh đơn mua hàng mới sau đơn đầu tiên</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold">
                      <th className="pb-3 px-2">Tháng Cohort</th>
                      <th className="pb-3 px-2 text-center">Tổng Khách</th>
                      <th className="pb-3 px-2 text-center">30 Ngày</th>
                      <th className="pb-3 px-2 text-center">60 Ngày</th>
                      <th className="pb-3 px-2 text-center">90 Ngày</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(customerReportData?.cohortRepurchaseRetention || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">Chưa có dữ liệu cohort mua lại</td>
                      </tr>
                    ) : (
                      (customerReportData?.cohortRepurchaseRetention || []).map((c) => (
                        <tr key={c.cohortMonth} className="hover:bg-slate-50">
                          <td className="py-3 px-2 font-bold text-slate-800">{c.cohortMonth}</td>
                          <td className="py-3 px-2 text-center font-bold text-slate-700">{c.totalCohortCustomers}</td>
                          <td className="py-3 px-2 text-center">
                            {c.repurchase30d.status === 'ready' ? (
                              <span className="font-bold text-blue-700">
                                {c.repurchase30d.repurchased}/{c.repurchase30d.eligible} ({c.repurchase30d.pct}%)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa đủ thời gian</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {c.repurchase60d.status === 'ready' ? (
                              <span className="font-bold text-blue-700">
                                {c.repurchase60d.repurchased}/{c.repurchase60d.eligible} ({c.repurchase60d.pct}%)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa đủ thời gian</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {c.repurchase90d.status === 'ready' ? (
                              <span className="font-bold text-blue-700">
                                {c.repurchase90d.repurchased}/{c.repurchase90d.eligible} ({c.repurchase90d.pct}%)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa đủ thời gian</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detailed Customer Drilldown & Care Recommendations */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Danh Sách Khách Hàng & Khuyến Nghị Chăm Sóc (Re-engagement)</span>
              </h4>
              <span className="text-xs text-slate-500">
                Tổng cộng: {customerReportData?.drilldown?.totalRecords || 0} khách hàng
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="pb-3 px-2">Khách Hàng</th>
                    <th className="pb-3 px-2">SĐT</th>
                    <th className="pb-3 px-2">Hạng</th>
                    <th className="pb-3 px-2 text-center">Recency (Ngày)</th>
                    <th className="pb-3 px-2 text-center">Đơn Mua Kỳ</th>
                    <th className="pb-3 px-2 text-center">Ca Phục Vụ Kỳ</th>
                    <th className="pb-3 px-2 text-right">Chi Tiêu Lịch Sử</th>
                    <th className="pb-3 px-2 text-center">Buổi Liệu Trình Còn</th>
                    <th className="pb-3 px-2">Khuyến Nghị Chăm Sóc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(customerReportData?.drilldown?.items || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400">Không có khách hàng nào</td>
                    </tr>
                  ) : (
                    (customerReportData?.drilldown?.items || []).map((c) => (
                      <tr key={c.customerId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-2 font-bold text-slate-800">{c.fullName}</td>
                        <td className="py-3 px-2 font-mono text-slate-600">{c.phone}</td>
                        <td className="py-3 px-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                            {c.tier}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-bold text-slate-700">
                          {c.recencyDays !== null ? `${c.recencyDays} ngày` : 'Chưa có'}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-indigo-700">{c.periodPurchaseCount}</td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-emerald-700">{c.periodServiceCount}</td>
                        <td className="py-3 px-2 text-right font-bold text-blue-700">
                          {c.historicalNetSpend.toLocaleString('vi-VN')}đ
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-purple-700">
                          {c.activeRemainingSessions} buổi
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.careRecommendation === 'Đã có lịch hẹn sắp tới'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : c.careRecommendation.includes('Còn liệu trình')
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : c.careRecommendation.includes('Cần xem xét')
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {c.careRecommendation}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {reportTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() =>
                setDrilldownModal({
                  isOpen: true,
                  type: 'invoices',
                  title: 'Danh Sách Hóa Đơn Bán Hàng',
                  subtitle: `Toàn bộ đơn hàng tạo trong kỳ (${startDate} đến ${endDate})`
                })
              }
              className="p-5 bg-gradient-to-br from-slate-50 to-slate-100/60 rounded-2xl border border-slate-200/80 hover:border-sky-300 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Giá Niêm Yết</span>
                <Eye className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition-colors" />
              </div>
              <p className="text-2xl font-black text-slate-800 mt-2">
                {salesKpi.grossSales.toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                <span>Trước chiết khấu</span>
                <span className="font-semibold text-slate-600">{salesKpi.invoiceCount} đơn</span>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-br from-rose-50/50 to-rose-100/30 rounded-2xl border border-rose-200/60">
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Chiết Khấu / Giảm Giá</span>
              <p className="text-2xl font-black text-rose-700 mt-2">
                -{salesKpi.totalDiscount.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-rose-600/80 mt-2">Voucher & khuyến mãi trực tiếp trên hóa đơn</p>
            </div>

            <div
              onClick={() =>
                setDrilldownModal({
                  isOpen: true,
                  type: 'invoices',
                  title: 'Doanh Số Bán Hàng Thực Tế',
                  subtitle: `Tổng giá trị hóa đơn sau chiết khấu (${startDate} đến ${endDate})`
                })
              }
              className="p-5 bg-gradient-to-br from-sky-50 to-sky-100/50 rounded-2xl border border-sky-200 hover:border-sky-400 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">Doanh Số Hóa Đơn (Net)</span>
                <Eye className="w-4 h-4 text-sky-400 group-hover:text-sky-700 transition-colors" />
              </div>
              <p className="text-2xl font-black text-sky-700 mt-2">
                {salesKpi.netInvoicedSales.toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center justify-between text-[11px] text-sky-700 mt-2">
                <span>AOV (Trung bình/đơn):</span>
                <span className="font-bold">{salesKpi.avgOrderValue.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl border border-amber-200">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Nợ Khách Mới Phát Sinh</span>
              <p className="text-2xl font-black text-amber-700 mt-2">
                {salesKpi.newCustomerDebt.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-amber-700 mt-2">Đã trừ tiền mặt & cọc cấn trừ</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DÒNG TIỀN & THỰC THU */}
      {/* ========================================================================= */}
      {reportTab === 'cashflow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() =>
                setDrilldownModal({
                  isOpen: true,
                  type: 'payments',
                  title: 'Danh Sách Tiền Thực Thu Đã Xác Nhận',
                  subtitle: `Các giao dịch Tiền mặt, VietQR & Thẻ POS đã xác nhận (${startDate} đến ${endDate})`
                })
              }
              className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl border border-emerald-200 hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Thực Thu Đã Xác Nhận</span>
                <Eye className="w-4 h-4 text-emerald-500 group-hover:text-emerald-800 transition-colors" />
              </div>
              <p className="text-3xl font-black text-emerald-700 mt-2">
                {cashflowKpi.confirmedCashCollected.toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center space-x-1 text-[11px] text-emerald-700 font-semibold mt-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tiền mặt + Chuyển khoản đã khớp + Thẻ POS</span>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl border border-amber-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Chuyển Khoản Chờ Xác Nhận</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-3xl font-black text-amber-700 mt-2">
                {cashflowKpi.pendingBankTransfers.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-amber-700 font-semibold mt-2">
                ⚠️ Chưa đối soát xong, tách riêng không cộng vào két
              </p>
            </div>

            <div className="p-5 bg-gradient-to-br from-sky-50 to-sky-100/50 rounded-2xl border border-sky-200">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">Dòng Tiền Thu Thuần Từ Khách</span>
              <p className={`text-3xl font-black mt-2 ${cashflowKpi.netSalesCashflow >= 0 ? 'text-sky-700' : 'text-rose-700'}`}>
                {cashflowKpi.netSalesCashflow.toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center justify-between text-[11px] text-sky-700 font-semibold mt-2">
                <span>Thực thu trừ hoàn trả:</span>
                <span>Hoàn {cashflowKpi.totalRefundsPaid.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GIÁ VỐN & LỢI NHUẬN TRỰC TIẾP (PHASE P7.2) */}
      {/* ========================================================================= */}
      {reportTab === 'cogs' && (
        <div className="space-y-6">
          {/* Main Direct Contribution KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl border border-indigo-200">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Doanh Thu Cơ Sở Tính LN</span>
              <p className="text-2xl font-black text-indigo-700 mt-2">
                {cogsSummary.recognizedRevenue.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-indigo-600 mt-2">Sản phẩm bán + Dịch vụ lẻ + Trừ buổi thực tế</p>
            </div>

            <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl border border-amber-200">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Giá Vốn SP & Chi Phí Vật Tư</span>
              <p className="text-2xl font-black text-amber-700 mt-2">
                {(cogsSummary.cogsProducts + cogsSummary.materialCost).toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center justify-between text-[11px] text-amber-700 mt-2">
                <span>SP: {cogsSummary.cogsProducts.toLocaleString('vi-VN')}đ</span>
                <span>Vật tư: {cogsSummary.materialCost.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-br from-rose-50/60 to-rose-100/40 rounded-2xl border border-rose-200">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Hoa Hồng Trực Tiếp</span>
              <p className="text-2xl font-black text-rose-700 mt-2">
                {cogsSummary.directCommission.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-rose-600 mt-2">Gắn liền với ca thực hiện & bán lẻ</p>
            </div>

            <div
              onClick={() =>
                setDrilldownModal({
                  isOpen: true,
                  type: 'cogs_materials',
                  title: 'Chi Tiết Xuất Dùng Vật Tư Ca Dịch Vụ',
                  subtitle: `Danh sách từng ca phục vụ kèm snapshot giá vốn (${startDate} đến ${endDate})`
                })
              }
              className="p-5 bg-gradient-to-br from-violet-50 to-violet-100/60 rounded-2xl border border-violet-200 hover:border-violet-400 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-violet-800 uppercase tracking-wider">Chênh Lệch Trực Tiếp (I)</span>
                <Eye className="w-4 h-4 text-violet-500 group-hover:text-violet-800 transition-colors" />
              </div>
              <p className={`text-2xl font-black mt-2 ${cogsSummary.directContribution >= 0 ? 'text-violet-700' : 'text-rose-700'}`}>
                {cogsSummary.directContribution.toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center justify-between text-[11px] text-violet-700 font-bold mt-2">
                <span>Tỷ suất sinh lời:</span>
                <span>{cogsSummary.marginPct !== null ? `${cogsSummary.marginPct}%` : 'Không áp dụng'}</span>
              </div>
            </div>
          </div>

          {/* Service Breakdown Table */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <Activity className="w-4 h-4 text-violet-600" />
              <span>Hiệu Quả Sinh Lời Trực Tiếp Theo Từng Dịch Vụ</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="pb-3 px-2">Tên Dịch Vụ</th>
                    <th className="pb-3 px-2">Nhóm</th>
                    <th className="pb-3 px-2 text-center">Số Ca Phục Vụ</th>
                    <th className="pb-3 px-2 text-right">Doanh Thu Phân Bổ</th>
                    <th className="pb-3 px-2 text-right">Chi Phí Vật Tư</th>
                    <th className="pb-3 px-2 text-right">Chênh Lệch Trực Tiếp</th>
                    <th className="pb-3 px-2 text-center">Tỷ Suất (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(cogsReportData?.serviceBreakdown || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Chưa có ca dịch vụ hoặc tiêu hao vật tư phát sinh trong kỳ lọc này.
                      </td>
                    </tr>
                  ) : (
                    (cogsReportData?.serviceBreakdown || []).map((s) => (
                      <tr key={s.serviceId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-2 font-bold text-slate-800">{s.serviceName}</td>
                        <td className="py-3 px-2 text-slate-500">{s.category}</td>
                        <td className="py-3 px-2 text-center font-semibold text-slate-700">{s.sessionCount} ca</td>
                        <td className="py-3 px-2 text-right font-bold text-slate-900">{s.recognizedRevenue.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-right text-amber-700 font-semibold">{s.materialCost.toLocaleString('vi-VN')}đ</td>
                        <td className={`py-3 px-2 text-right font-black ${s.directContribution >= 0 ? 'text-violet-700' : 'text-rose-600'}`}>
                          {s.directContribution.toLocaleString('vi-VN')}đ
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.marginPct !== null && s.marginPct >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {s.marginPct !== null ? `${s.marginPct}%` : 'K/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Variance & Shrinkage Breakdown Cards */}
          <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <Package className="w-4 h-4 text-slate-600" />
              <span>Phân Tích 5 Loại Chênh Lệch Vật Tư & Tồn Kho (Độc Lập & Minh Bạch)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-600">1. Chênh Lệch Định Mức BOM</span>
                <p className="text-base font-black text-indigo-700 mt-1">
                  {(cogsReportData?.varianceBreakdown?.bomVariance || 0).toLocaleString('vi-VN')}đ
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Thực tế dùng vs Định mức</p>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-600">2. Hao Hụt Kiểm Kê</span>
                <p className="text-base font-black text-rose-700 mt-1">
                  {(cogsReportData?.varianceBreakdown?.auditShrinkage || 0).toLocaleString('vi-VN')}đ
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Lệch tồn sổ sách vs Đếm thực</p>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-600">3. Hàng Hỏng / Hết Hạn</span>
                <p className="text-base font-black text-slate-800 mt-1">
                  {(cogsReportData?.varianceBreakdown?.damagedExpiredLoss || 0).toLocaleString('vi-VN')}đ
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Tổn thất hủy hàng</p>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-600">4. Chênh Lệch Điều Chuyển</span>
                <p className="text-base font-black text-slate-800 mt-1">
                  {(cogsReportData?.varianceBreakdown?.transferVariance || 0).toLocaleString('vi-VN')}đ
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Xuất gửi vs Thực nhận</p>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-600">5. Xuất Chưa Phân Bổ</span>
                <p className="text-base font-black text-slate-800 mt-1">
                  {(cogsReportData?.varianceBreakdown?.unassignedUsage || 0).toLocaleString('vi-VN')}đ
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Dùng nội bộ chưa gán ca</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: DOANH THU LIỆU TRÌNH TRỪ BUỔI */}
      {/* ========================================================================= */}
      {reportTab === 'earned' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl border border-indigo-200">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
                Doanh Thu Phân Bổ Theo Buổi Thực Hiện (Earned Revenue)
              </span>
              <p className="text-3xl font-black text-indigo-700 mt-2">
                {earnedKpi.earnedSessionRevenue.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-xs text-indigo-700 mt-2 font-semibold">
                Giá trị dịch vụ thực tế đã phục vụ khách hàng khi trừ thẻ liệu trình
              </p>
            </div>

            <div className="p-6 bg-gradient-to-br from-sky-50 to-sky-100/50 rounded-2xl border border-sky-200">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">
                Tổng Số Buổi Dịch Vụ Đã Thực Hiện
              </span>
              <p className="text-3xl font-black text-sky-700 mt-2">
                {earnedKpi.totalSessionsPerformed} <span className="text-lg font-bold text-slate-600">buổi</span>
              </p>
              <p className="text-xs text-sky-700 mt-2 font-semibold">
                Được ghi nhận qua nhật ký trừ buổi (<code className="text-sky-800">session_deductions</code>)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SỔ CÔNG NỢ */}
      {/* ========================================================================= */}
      {reportTab === 'debt' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-rose-50/80 rounded-2xl border border-rose-200">
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                Công Nợ Phải Thu Khách Hàng (AR)
              </span>
              <p className="text-3xl font-black text-rose-700 mt-2">
                {totalCustomerDebt.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-xs text-rose-600 mt-2">
                Tổng số dư nợ còn lại của toàn bộ khách hàng trên hệ thống
              </p>
            </div>

            <div className="p-6 bg-slate-100 rounded-2xl border border-slate-300">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Công Nợ Phải Trả Nhà Cung Cấp (AP)
              </span>
              <p className="text-3xl font-black text-slate-900 mt-2">
                {totalSupplierDebt.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-xs text-slate-600 mt-2">
                Tổng tiền hàng nhập kho (GRN) chưa thanh toán hết cho nhà cung cấp
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRILLDOWN MODAL (DANH SÁCH CHỨNG TỪ CHI TIẾT) */}
      {/* ========================================================================= */}
      {drilldownModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <h3 className="font-bold text-base text-slate-800">{drilldownModal.title}</h3>
                <p className="text-xs text-slate-500">{drilldownModal.subtitle}</p>
              </div>
              <button
                onClick={() => setDrilldownModal({ isOpen: false, type: 'invoices', title: '', subtitle: '' })}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {drilldownModal.type === 'cogs_materials' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold">
                        <th className="pb-3 px-2">Ngày Giờ</th>
                        <th className="pb-3 px-2">Chi Nhánh</th>
                        <th className="pb-3 px-2">Dịch Vụ</th>
                        <th className="pb-3 px-2">Vật Tư Tiêu Hao</th>
                        <th className="pb-3 px-2 text-center">Định Mức / Thực Tế</th>
                        <th className="pb-3 px-2 text-right">Giá Vốn Snapshot</th>
                        <th className="pb-3 px-2 text-right">Thành Tiền</th>
                        <th className="pb-3 px-2">KTV Thực Hiện</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(cogsReportData?.drilldown?.items || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            Không có dữ liệu tiêu hao vật tư nào trong kỳ này
                          </td>
                        </tr>
                      ) : (
                        (cogsReportData?.drilldown?.items || []).map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-2 text-slate-500 font-mono text-[11px]">{item.usedAt.slice(0, 16).replace('T', ' ')}</td>
                            <td className="py-3 px-2 font-semibold text-slate-700">{item.branchName}</td>
                            <td className="py-3 px-2 font-bold text-slate-800">{item.serviceName}</td>
                            <td className="py-3 px-2 text-slate-700">{item.productName}</td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-slate-400 font-mono">{item.standardQty}</span> / <span className="font-bold text-indigo-700 font-mono">{item.actualQty} {item.unit}</span>
                            </td>
                            <td className="py-3 px-2 text-right font-mono text-slate-600">{item.costPriceSnapshot.toLocaleString('vi-VN')}đ</td>
                            <td className="py-3 px-2 text-right font-bold text-violet-700">{item.totalCost.toLocaleString('vi-VN')}đ</td>
                            <td className="py-3 px-2 text-slate-600">{item.performerName || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : drilldownModal.type === 'invoices' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold">
                        <th className="pb-3 px-2">Mã Hóa Đơn</th>
                        <th className="pb-3 px-2">Chi Nhánh</th>
                        <th className="pb-3 px-2">Khách Hàng</th>
                        <th className="pb-3 px-2 text-right">Tổng Tiền</th>
                        <th className="pb-3 px-2 text-right">Đã Trả</th>
                        <th className="pb-3 px-2 text-right">Còn Nợ</th>
                        <th className="pb-3 px-2 text-center">Trạng Thái</th>
                        <th className="pb-3 px-2 text-right">Ngày Giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(reportData?.invoicesDrilldown || []).map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-2 font-mono font-bold text-sky-700">{inv.invoiceNumber}</td>
                          <td className="py-3 px-2 text-slate-700">{inv.branchName}</td>
                          <td className="py-3 px-2">
                            <p className="font-bold text-slate-800">{inv.customerName}</p>
                            <p className="text-[10px] text-slate-400">{inv.customerPhone}</p>
                          </td>
                          <td className="py-3 px-2 text-right font-bold text-slate-900">{inv.totalAmount.toLocaleString('vi-VN')}đ</td>
                          <td className="py-3 px-2 text-right text-emerald-600 font-semibold">{inv.paidAmount.toLocaleString('vi-VN')}đ</td>
                          <td className="py-3 px-2 text-right text-rose-600 font-bold">{inv.debtAmount > 0 ? `${inv.debtAmount.toLocaleString('vi-VN')}đ` : '-'}</td>
                          <td className="py-3 px-2 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{inv.status}</span>
                          </td>
                          <td className="py-3 px-2 text-right text-slate-500 font-mono text-[11px]">{inv.createdAt.slice(0, 16).replace('T', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : drilldownModal.type === 'staff_sessions' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold">
                        <th className="pb-3 px-2">Ngày Giờ</th>
                        <th className="pb-3 px-2">Chi Nhánh</th>
                        <th className="pb-3 px-2">Khách Hàng</th>
                        <th className="pb-3 px-2">Dịch Vụ</th>
                        <th className="pb-3 px-2">KTV / Bác Sĩ</th>
                        <th className="pb-3 px-2">Nguồn Ca</th>
                        <th className="pb-3 px-2 text-right">Doanh Thu Phân Bổ</th>
                        <th className="pb-3 px-2 text-center">Thời Lượng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(staffReportData?.drilldown?.items || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            Không có ca phục vụ nào trong kỳ lọc này.
                          </td>
                        </tr>
                      ) : (
                        (staffReportData?.drilldown?.items || []).map((item) => (
                          <tr key={item.sessionId} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-2 text-slate-500 font-mono text-[11px]">{item.performedAt.slice(0, 16).replace('T', ' ')}</td>
                            <td className="py-3 px-2 font-semibold text-slate-700">{item.branchName}</td>
                            <td className="py-3 px-2">
                              <p className="font-bold text-slate-800">{item.customerName}</p>
                              <p className="text-[10px] text-slate-400">{item.customerPhone}</p>
                            </td>
                            <td className="py-3 px-2 font-bold text-slate-800">{item.serviceName}</td>
                            <td className="py-3 px-2 text-slate-700 font-semibold">{item.staffName}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.sessionSource === 'course_deduct' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'
                              }`}>
                                {item.sessionSource === 'course_deduct' ? 'Trừ liệu trình' : 'Dịch vụ POS'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-bold text-blue-800">{item.allocatedRevenue.toLocaleString('vi-VN')}đ</td>
                            <td className="py-3 px-2 text-center font-mono text-slate-600">{item.durationHours}h</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold">
                        <th className="pb-3 px-2">Mã Phiếu</th>
                        <th className="pb-3 px-2">Chi Nhánh</th>
                        <th className="pb-3 px-2">Khách Hàng</th>
                        <th className="pb-3 px-2">Phương Thức</th>
                        <th className="pb-3 px-2 text-right">Số Tiền</th>
                        <th className="pb-3 px-2 text-center">Đối Soát</th>
                        <th className="pb-3 px-2 text-right">Ngày Giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(reportData?.paymentsDrilldown || []).map((pay) => (
                        <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-2 font-mono font-bold text-emerald-700">{pay.paymentNumber}</td>
                          <td className="py-3 px-2 text-slate-700">{pay.branchName}</td>
                          <td className="py-3 px-2 font-bold text-slate-800">{pay.customerName}</td>
                          <td className="py-3 px-2 text-slate-600 font-semibold">{pay.paymentMethod}</td>
                          <td className="py-3 px-2 text-right font-black text-slate-900">{pay.amount.toLocaleString('vi-VN')}đ</td>
                          <td className="py-3 px-2 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{pay.reconciliationStatus}</span>
                          </td>
                          <td className="py-3 px-2 text-right text-slate-500 font-mono text-[11px]">{pay.createdAt.slice(0, 16).replace('T', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Hiển thị dữ liệu phân trang phía máy chủ
              </span>
              <button
                onClick={() => setDrilldownModal({ isOpen: false, type: 'invoices', title: '', subtitle: '' })}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Report Modal Dialog (P7.5) */}
      {exportModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-100 shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-indigo-900 via-blue-900 to-sky-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                  <Download className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Xuất Báo Cáo Quản Trị BI (P7.5)</h3>
                  <p className="text-xs text-sky-200">Định dạng chuẩn Excel (.xlsx) & PDF Quản Trị A4</p>
                </div>
              </div>
              <button
                onClick={() => !exportModal.isExporting && setExportModal((p) => ({ ...p, isOpen: false }))}
                disabled={exportModal.isExporting}
                className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-all disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5">
              {exportModal.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{exportModal.error}</span>
                </div>
              )}

              {/* Scope summary */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span className="font-semibold">Kỳ báo cáo:</span>
                  <span className="font-bold text-slate-800">{startDate} đến {endDate}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span className="font-semibold">Phạm vi chi nhánh:</span>
                  <span className="font-bold text-slate-800">
                    {selectedBranchId === 'all'
                      ? 'Toàn chuỗi Phương Nam'
                      : branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span className="font-semibold">Múi giờ dữ liệu:</span>
                  <span className="font-bold text-indigo-700">Asia/Ho_Chi_Minh (UTC+7)</span>
                </div>
              </div>

              {/* Report Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  1. Chọn Phân Hệ Báo Cáo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'p7_1' as ReportType, title: 'Bán Hàng & Dòng Tiền (P7.1)', desc: 'Doanh số gộp, thực thu, cọc, nợ, chuyển khoản' },
                    { id: 'p7_2' as ReportType, title: 'Giá Vốn & Lợi Nhuận (P7.2)', desc: 'Chi phí BOM snapshot, hoa hồng, lãi gộp' },
                    { id: 'p7_3' as ReportType, title: 'Hiệu Suất Nhân Sự (P7.3)', desc: 'Giờ phục vụ, doanh số tư vấn, công suất phòng' },
                    { id: 'p7_4' as ReportType, title: 'Giữ Chân & Cohort (P7.4)', desc: 'Phân khúc RFM, Cohort 30/60/90, tỷ lệ quay lại' }
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setExportModal((p) => ({ ...p, selectedReport: r.id }))}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        exportModal.selectedReport === r.id
                          ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-slate-800">{r.title}</span>
                        {exportModal.selectedReport === r.id && (
                          <Check className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  2. Định Dạng File Xuất
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportModal((p) => ({ ...p, format: 'excel' }))}
                    className={`p-3 rounded-2xl border flex items-center space-x-3 transition-all ${
                      exportModal.format === 'excel'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-800">Microsoft Excel (.xlsx)</p>
                      <p className="text-[10px] text-slate-500">Đa sheet, kiểu số chuẩn, freeze panes</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportModal((p) => ({ ...p, format: 'pdf' }))}
                    className={`p-3 rounded-2xl border flex items-center space-x-3 transition-all ${
                      exportModal.format === 'pdf'
                        ? 'border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-800">Báo Cáo PDF Quản Trị</p>
                      <p className="text-[10px] text-slate-500">Khổ ngang A4, lặp tiêu đề, phân trang</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Detail Level Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  3. Mức Độ Chi Tiết
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2.5 p-3 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="detailLevel"
                      checked={exportModal.detailLevel === 'full'}
                      onChange={() => setExportModal((p) => ({ ...p, detailLevel: 'full' }))}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Đầy Đủ Tổng Hợp & Chi Tiết</p>
                      <p className="text-[10px] text-slate-500">Bao gồm toàn bộ chứng từ drill-down</p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 p-3 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="detailLevel"
                      checked={exportModal.detailLevel === 'summary'}
                      onChange={() => setExportModal((p) => ({ ...p, detailLevel: 'summary' }))}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800">Chỉ Tổng Hợp Quản Trị</p>
                      <p className="text-[10px] text-slate-500">Chỉ xuất bảng KPI & phân tích vĩ mô</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
              <div>
                {exportModal.isExporting ? (
                  <div className="flex items-center space-x-2 text-indigo-700 text-xs font-bold animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{exportModal.statusText || 'Đang tạo file báo cáo...'}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">
                    Sử dụng cùng quy tắc tính và phân quyền với màn hình
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setExportModal((p) => ({ ...p, isOpen: false }))}
                  disabled={exportModal.isExporting}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all disabled:opacity-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleExecuteExport}
                  disabled={exportModal.isExporting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {exportModal.isExporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang Xuất File...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Bắt Đầu Xuất File</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
