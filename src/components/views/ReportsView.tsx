import React, { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReportsView: React.FC = () => {
  const { sales, payments, expenses, customers, suppliers, currentBranch } = useApp();
  const [reportTab, setReportTab] = useState<'cashflow' | 'accrual' | 'debt'>('cashflow');

  const branchSales = sales.filter((s) => s.branchId === currentBranch.id);
  const branchPayments = payments.filter((p) => p.branchId === currentBranch.id);
  const branchExpenses = expenses.filter((e) => e.branchId === currentBranch.id);

  const totalCashIn = branchPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalCashOut = branchExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netCashFlow = totalCashIn - totalCashOut;

  const totalAccrualRevenue = branchSales.reduce((sum, s) => sum + s.total, 0);
  const totalCustomerDebt = customers.reduce((sum, c) => sum + c.debt, 0);
  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + s.debt, 0);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* Header with 3 Subtabs */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Trung Tâm Báo Cáo Tài Chính & Đối Soát</h3>
            <p className="text-xs text-slate-500">Phân định rõ ràng: Dòng tiền thực tế • Doanh thu kế toán • Công nợ</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setReportTab('cashflow')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                reportTab === 'cashflow' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              1. Dòng Tiền (Cash Flow)
            </button>
            <button
              onClick={() => setReportTab('accrual')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                reportTab === 'accrual' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              2. Doanh Thu Kế Toán
            </button>
            <button
              onClick={() => setReportTab('debt')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                reportTab === 'debt' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              3. Sổ Công Nợ
            </button>
          </div>

          <button className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl flex items-center space-x-1">
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Cash Flow */}
      {reportTab === 'cashflow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200/80">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Tổng Thực Thu (Cash In)</span>
              <p className="text-2xl font-black text-emerald-700 mt-2">{totalCashIn.toLocaleString('vi-VN')}đ</p>
              <p className="text-[11px] text-emerald-600 mt-1">Từ thanh toán hóa đơn & cọc khách hàng</p>
            </div>

            <div className="p-5 bg-rose-50 rounded-2xl border border-rose-200/80">
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Tổng Thực Chi (Cash Out)</span>
              <p className="text-2xl font-black text-rose-700 mt-2">{totalCashOut.toLocaleString('vi-VN')}đ</p>
              <p className="text-[11px] text-rose-600 mt-1">Mặt bằng, điện nước, vận hành, NCC</p>
            </div>

            <div className="p-5 bg-sky-50 rounded-2xl border border-sky-200/80">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">Dòng Tiền Thuần (Net Cash)</span>
              <p className={`text-2xl font-black mt-2 ${netCashFlow >= 0 ? 'text-sky-700' : 'text-rose-700'}`}>
                {netCashFlow.toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Thực thu trừ thực chi trong kỳ</p>
            </div>
          </div>

          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-3">
            <h4 className="font-bold text-slate-800 text-sm">Ghi chú đối soát dòng tiền:</h4>
            <p className="text-slate-600 leading-relaxed">
              Báo cáo dòng tiền chỉ tính các giao dịch tiền mặt/chuyển khoản đã thực sự phát sinh trong tài khoản. Các đơn hàng ghi nợ chưa thu tiền sẽ không được tính vào dòng tiền thực thu này nhằm bảo đảm an toàn quỹ.
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Accrual Revenue */}
      {reportTab === 'accrual' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-200/80">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Doanh Thu Kế Toán Phát Sinh</span>
              <p className="text-2xl font-black text-indigo-700 mt-2">{totalAccrualRevenue.toLocaleString('vi-VN')}đ</p>
              <p className="text-[11px] text-indigo-600 mt-1">Tổng giá trị đơn hàng đã cung cấp cho khách</p>
            </div>

            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200/80">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Doanh Thu Chưa Thực Hiện (Cọc)</span>
              <p className="text-2xl font-black text-amber-700 mt-2">
                {customers.reduce((sum, c) => sum + c.creditBalance, 0).toLocaleString('vi-VN')}đ
              </p>
              <p className="text-[11px] text-amber-600 mt-1">Tiền khách đóng trước cho các buổi chưa làm</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Debt & Receivables */}
      {reportTab === 'debt' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-rose-50 rounded-2xl border border-rose-200/80">
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Công Nợ Phải Thu Khách Hàng (AR)</span>
              <p className="text-2xl font-black text-rose-700 mt-2">{totalCustomerDebt.toLocaleString('vi-VN')}đ</p>
              <p className="text-[11px] text-rose-600 mt-1">Các hóa đơn bán hàng cho nợ hoặc trả góp</p>
            </div>

            <div className="p-5 bg-slate-100 rounded-2xl border border-slate-300">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Công Nợ Phải Trả Nhà Cung Cấp (AP)</span>
              <p className="text-2xl font-black text-slate-900 mt-2">{totalSupplierDebt.toLocaleString('vi-VN')}đ</p>
              <p className="text-[11px] text-slate-500 mt-1">Các phiếu nhập kho GRN chưa thanh toán hết</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
