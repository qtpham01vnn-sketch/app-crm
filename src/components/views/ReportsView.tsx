import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  Building2,
  Filter,
  DollarSign,
  TrendingUp,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  X,
  Layers,
  Sparkles,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { SalesCashflowReport } from '../../types';

export const ReportsView: React.FC = () => {
  const { org, branches, sales, payments, customers, suppliers } = useApp();

  // Navigation Subtabs
  const [reportTab, setReportTab] = useState<'sales' | 'cashflow' | 'earned' | 'debt'>('sales');

  // Filter States
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all'); // 'all' or specific branchId
  const [datePreset, setDatePreset] = useState<'today' | '7days' | 'this_month' | 'last_month' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');

  // Report Data & Loading State
  const [reportData, setReportData] = useState<SalesCashflowReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState<{
    isOpen: boolean;
    type: 'invoices' | 'payments';
    title: string;
    subtitle: string;
  }>({
    isOpen: false,
    type: 'invoices',
    title: '',
    subtitle: ''
  });

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
      const res = await masterDataService.getSalesAndCashflowReport({
        orgId: org.id,
        branchId: branchIdParam,
        startDate,
        endDate,
        paymentMethod: methodParam
      });
      setReportData(res);
    } catch (err: any) {
      console.error('Lỗi tải báo cáo P7.1:', err);
      setErrorMsg(err.message || 'Không thể tải báo cáo từ máy chủ.');
    } finally {
      setLoading(false);
    }
  }, [org?.id, selectedBranchId, startDate, endDate, paymentMethodFilter]);

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


  const earnedKpi = reportData?.earnedSummary || {
    totalSessionsPerformed: 0,
    earnedSessionRevenue: 0
  };

  // Debt KPIs
  const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);
  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + (s.debt || 0), 0);

  // Export to CSV Function
  const exportToCSV = () => {
    let csvContent = '\uFEFF'; // UTF-8 BOM
    if (reportTab === 'sales' || reportTab === 'earned') {
      csvContent += 'BÁO CÁO DOANH SỐ BÁN HÀNG & HÓA ĐƠN\n';
      csvContent += `Thời gian: ${startDate} đến ${endDate} (Múi giờ: Asia/Ho_Chi_Minh)\n`;
      csvContent += `Chi nhánh: ${selectedBranchId === 'all' ? 'Toàn chuỗi' : branches.find(b => b.id === selectedBranchId)?.name || selectedBranchId}\n\n`;
      csvContent += 'Mã Hóa Đơn,Chi Nhánh,Khách Hàng,Số Điện Thoại,Tổng Tiền (VNĐ),Đã Thanh Toán (VNĐ),Còn Nợ (VNĐ),Trạng Thái,Thời Gian Tạo\n';
      
      const invoices = reportData?.invoicesDrilldown || [];
      invoices.forEach(inv => {
        csvContent += `"${inv.invoiceNumber}","${inv.branchName}","${inv.customerName}","${inv.customerPhone || ''}",${inv.totalAmount},${inv.paidAmount},${inv.debtAmount},"${inv.status}","${inv.createdAt}"\n`;
      });
    } else {
      csvContent += 'BÁO CÁO DÒNG TIỀN & ĐỐI SOÁT THANH TOÁN\n';
      csvContent += `Thời gian: ${startDate} đến ${endDate} (Múi giờ: Asia/Ho_Chi_Minh)\n`;
      csvContent += `Chi nhánh: ${selectedBranchId === 'all' ? 'Toàn chuỗi' : branches.find(b => b.id === selectedBranchId)?.name || selectedBranchId}\n\n`;
      csvContent += 'Mã Phiếu,Chi Nhánh,Khách Hàng,Số Tiền (VNĐ),Phương Thức,Loại Giao Dịch,Đối Soát,Ghi Chú,Thời Gian\n';
      
      const paymentsList = reportData?.paymentsDrilldown || [];
      paymentsList.forEach(p => {
        csvContent += `"${p.paymentNumber}","${p.branchName}","${p.customerName}",${p.amount},"${p.paymentMethod}","${p.paymentType}","${p.reconciliationStatus}","${p.note || ''}","${p.createdAt}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_Cao_${reportTab}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
              <h3 className="font-bold text-lg text-slate-800">Trung Tâm Phân Tích & Báo Cáo BI (P7.1)</h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700">
                Asia/Ho_Chi_Minh
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Tách bạch chuẩn hóa: Bán hàng trên Hóa đơn • Dòng tiền Thực thu • Cọc • Liệu trình • Công nợ
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
            onClick={exportToCSV}
            className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel / CSV</span>
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
      <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
        <button
          onClick={() => setReportTab('sales')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            reportTab === 'sales'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>1. Bán Hàng & Hóa Đơn (Sales Invoiced)</span>
        </button>

        <button
          onClick={() => setReportTab('cashflow')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            reportTab === 'cashflow'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>2. Dòng Tiền & Thực Thu (Cash Flow)</span>
        </button>

        <button
          onClick={() => setReportTab('earned')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            reportTab === 'earned'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>3. Doanh Thu Dịch Vụ / Liệu Trình (Earned)</span>
        </button>

        <button
          onClick={() => setReportTab('debt')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            reportTab === 'debt'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>4. Sổ Công Nợ (AR / AP)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BÁN HÀNG & HÓA ĐƠN (SALES INVOICING) */}
      {/* ========================================================================= */}
      {reportTab === 'sales' && (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Gross Sales */}
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

            {/* KPI 2: Total Discounts */}
            <div className="p-5 bg-gradient-to-br from-rose-50/50 to-rose-100/30 rounded-2xl border border-rose-200/60">
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Chiết Khấu / Giảm Giá</span>
              <p className="text-2xl font-black text-rose-700 mt-2">
                -{salesKpi.totalDiscount.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-rose-600/80 mt-2">Voucher & khuyến mãi trực tiếp trên hóa đơn</p>
            </div>

            {/* KPI 3: Net Invoiced Sales */}
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

            {/* KPI 4: Unpaid Debt Generated */}
            <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl border border-amber-200">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Nợ Khách Mới Phát Sinh</span>
              <p className="text-2xl font-black text-amber-700 mt-2">
                {salesKpi.newCustomerDebt.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-amber-700 mt-2">Chưa thu tiền mặt / chuyển khoản trong kỳ</p>
            </div>
          </div>

          {/* Additional Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
              <div className="flex items-center space-x-2 text-indigo-800 font-bold text-xs uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Doanh Số Bán Gói Liệu Trình Trả Trước</span>
              </div>
              <p className="text-2xl font-black text-indigo-700">
                {salesKpi.packageCourseSales.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-xs text-indigo-600/90 mt-2 leading-relaxed">
                Số tiền khách mua gói dịch vụ trả trước (thẻ liệu trình). Doanh thu này sẽ được ghi nhận thực hiện (Earned Revenue) tương ứng khi khách đến làm từng buổi.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center space-x-1.5 font-bold text-slate-800 text-sm">
                <HelpCircle className="w-4 h-4 text-slate-500" />
                <span>Quy tắc hạch toán Doanh số Bán Hàng:</span>
              </div>
              <ul className="text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Lọc theo <strong>ngày tạo hóa đơn</strong> (<code className="text-sky-700">sales.created_at</code>) trong múi giờ <code className="text-sky-700">Asia/Ho_Chi_Minh</code>.</li>
                <li>Không bao gồm các hóa đơn đã bị hủy (<code className="text-rose-600">status = 'cancelled'</code>).</li>
                <li>Hóa đơn cho nợ vẫn tính đủ vào Doanh số hóa đơn, nhưng được theo dõi riêng tại mục Nợ phát sinh.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DÒNG TIỀN & THỰC THU (CASHFLOW & SETTLEMENT) */}
      {/* ========================================================================= */}
      {reportTab === 'cashflow' && (
        <div className="space-y-6">
          {/* Cashflow Main KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 6: Confirmed Cash In */}
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

            {/* KPI 7: Pending VietQR */}
            <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl border border-amber-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Chuyển Khoản Chờ Xác Nhận</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-3xl font-black text-amber-700 mt-2">
                {cashflowKpi.pendingBankTransfers.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-amber-700 font-semibold mt-2">
                ⚠️ Tuyệt đối chưa tính vào tiền thực thu két
              </p>
            </div>

            {/* KPI 12: Net Cashflow */}
            <div className="p-5 bg-gradient-to-br from-sky-50 to-sky-100/50 rounded-2xl border border-sky-200">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">Dòng Tiền Thuần Kỳ Này</span>
              <p className={`text-3xl font-black mt-2 ${cashflowKpi.netSalesCashflow >= 0 ? 'text-sky-700' : 'text-rose-700'}`}>
                {cashflowKpi.netSalesCashflow.toLocaleString('vi-VN')}đ
              </p>
              <div className="flex items-center justify-between text-[11px] text-sky-700 font-semibold mt-2">
                <span>Thực thu trừ hoàn trả:</span>
                <span>Hoàn {cashflowKpi.totalRefundsPaid.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          </div>

          {/* Sub KPIs: Deposits & Debt Recovery */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 uppercase">1. Tiền Cọc Thu Mới Kỳ Này</span>
              <p className="text-xl font-black text-slate-800 mt-1">
                {cashflowKpi.newDepositsCollected.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Khách đặt cọc trước (đã nằm trong Thực thu)</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 uppercase">2. Cọc Cũ Cấn Trừ Vào Đơn</span>
              <p className="text-xl font-black text-indigo-700 mt-1">
                {cashflowKpi.depositRedeemed.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-indigo-600 mt-1">Không tính vào tiền mới để chống đếm trùng</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 uppercase">3. Thu Hồi Nợ Cũ Trong Kỳ</span>
              <p className="text-xl font-black text-emerald-700 mt-1">
                {cashflowKpi.debtRecovered.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-emerald-600 mt-1">Khách trả nợ của các đơn kỳ trước</p>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          {reportData?.methodBreakdown && reportData.methodBreakdown.length > 0 && (
            <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-sky-600" />
                <span>Cơ Cấu Phương Thức Thanh Toán (Thực Thu Đã Xác Nhận)</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {reportData.methodBreakdown.map((m) => {
                  const methodLabels: Record<string, string> = {
                    cash: 'Tiền mặt',
                    transfer_vietqr: 'Chuyển khoản VietQR',
                    card: 'Thẻ POS',
                    deposit_credit: 'Cấn trừ cọc'
                  };
                  return (
                    <div key={m.paymentMethod} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                      <p className="text-xs font-bold text-slate-600">{methodLabels[m.paymentMethod] || m.paymentMethod}</p>
                      <p className="text-lg font-black text-slate-800 mt-1">{m.totalAmount.toLocaleString('vi-VN')}đ</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{m.transactionCount} giao dịch</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DOANH THU DỊCH VỤ / LIỆU TRÌNH (EARNED REVENUE) */}
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

          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-3">
            <h4 className="font-bold text-slate-800 text-sm">Phân biệt Doanh thu Bán Thẻ vs Doanh thu Thực Hiện:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-600 leading-relaxed">
              <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 mb-1">1. Bán Thẻ / Gói Liệu Trình (Deferred Revenue)</p>
                <p>Khách thanh toán 10.000.000đ cho gói 10 buổi. Dòng tiền thực thu ghi nhận +10tr, nhưng đây là doanh thu nhận trước (chưa thực hiện).</p>
              </div>
              <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 mb-1">2. Trừ Buổi Khi Khách Làm (Earned Revenue)</p>
                <p>Mỗi lần khách đến làm 1 buổi, hệ thống trừ 1 buổi và hạch toán doanh thu thực hiện là 1.000.000đ. Đảm bảo phản ánh chính xác hiệu suất phục vụ.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SỔ CÔNG NỢ (DEBT OVERVIEW) */}
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

          <div className="p-5 bg-amber-50/60 rounded-2xl border border-amber-200 text-xs space-y-2">
            <h4 className="font-bold text-amber-900 text-sm">Nguyên tắc quản trị công nợ Spa & Thẩm Mỹ:</h4>
            <p className="text-amber-800 leading-relaxed">
              Các khoản nợ phát sinh từ hóa đơn bán hàng chỉ được ghi nhận giảm trừ khi có phiếu thu loại <code className="text-amber-950 font-bold">debt_collection</code> (thu nợ). Hàng hóa hoàn trả hoặc điều chỉnh dịch vụ phải có biên bản đối soát và chỉ người có thẩm quyền mới được duyệt điều chỉnh sổ nợ.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRILLDOWN MODAL (DANH SÁCH CHỨNG TỪ CHI TIẾT) */}
      {/* ========================================================================= */}
      {drilldownModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
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

            {/* Modal Content Table */}
            <div className="p-6 overflow-y-auto flex-1">
              {drilldownModal.type === 'invoices' ? (
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
                      {(reportData?.invoicesDrilldown || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            Không có hóa đơn nào trong khoảng thời gian này
                          </td>
                        </tr>
                      ) : (
                        (reportData?.invoicesDrilldown || []).map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-2 font-mono font-bold text-sky-700">{inv.invoiceNumber}</td>
                            <td className="py-3 px-2 text-slate-700">{inv.branchName}</td>
                            <td className="py-3 px-2">
                              <p className="font-bold text-slate-800">{inv.customerName}</p>
                              <p className="text-[10px] text-slate-400">{inv.customerPhone}</p>
                            </td>
                            <td className="py-3 px-2 text-right font-bold text-slate-900">
                              {inv.totalAmount.toLocaleString('vi-VN')}đ
                            </td>
                            <td className="py-3 px-2 text-right text-emerald-600 font-semibold">
                              {inv.paidAmount.toLocaleString('vi-VN')}đ
                            </td>
                            <td className="py-3 px-2 text-right text-rose-600 font-bold">
                              {inv.debtAmount > 0 ? `${inv.debtAmount.toLocaleString('vi-VN')}đ` : '-'}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  inv.status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : inv.status === 'partial'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {inv.status}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right text-slate-500 font-mono text-[11px]">
                              {inv.createdAt.slice(0, 16).replace('T', ' ')}
                            </td>
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
                        <th className="pb-3 px-2">Loại GD</th>
                        <th className="pb-3 px-2 text-right">Số Tiền</th>
                        <th className="pb-3 px-2 text-center">Đối Soát</th>
                        <th className="pb-3 px-2 text-right">Ngày Giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(reportData?.paymentsDrilldown || []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            Không có phiếu thanh toán nào trong khoảng thời gian này
                          </td>
                        </tr>
                      ) : (
                        (reportData?.paymentsDrilldown || []).map((pay) => (
                          <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-2 font-mono font-bold text-emerald-700">{pay.paymentNumber}</td>
                            <td className="py-3 px-2 text-slate-700">{pay.branchName}</td>
                            <td className="py-3 px-2 font-bold text-slate-800">{pay.customerName}</td>
                            <td className="py-3 px-2 font-semibold text-slate-600">{pay.paymentMethod}</td>
                            <td className="py-3 px-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                {pay.paymentType}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-black text-slate-900">
                              {pay.amount.toLocaleString('vi-VN')}đ
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  pay.reconciliationStatus === 'confirmed'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : pay.reconciliationStatus === 'pending_reconciliation'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {pay.reconciliationStatus}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right text-slate-500 font-mono text-[11px]">
                              {pay.createdAt.slice(0, 16).replace('T', ' ')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Hiển thị tối đa 100 chứng từ gần nhất trong kỳ lọc
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
    </div>
  );
};
