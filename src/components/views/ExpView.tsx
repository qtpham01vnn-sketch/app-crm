import React, { useState, useEffect } from 'react';
import { 
  Receipt, Plus, TrendingUp, TrendingDown, DollarSign, 
  Building2, Calendar, FileText, CheckCircle2, AlertCircle,
  PieChart, RefreshCw, X, ArrowUpRight, ArrowDownLeft, Ban, RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { expenseService } from '../../services/expenseService';
import type { ExpenseCategory, FinancialAccount, ExpenseVoucher, CashflowEntry, OperatingPnLReport } from '../../services/expenseService';
import { isSupabaseConfigured } from '../../lib/supabase';

export const ExpView: React.FC = () => {
  const { currentBranch, authSession } = useApp();
  const orgId = authSession?.orgId || '11111111-1111-1111-1111-111111111111';

  // Tabs
  const [activeTab, setActiveTab] = useState<'vouchers' | 'cashflow' | 'pnl'>('vouchers');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Data states
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [vouchers, setVouchers] = useState<ExpenseVoucher[]>([]);
  const [cashflow, setCashflow] = useState<CashflowEntry[]>([]);
  const [pnlReport, setPnlReport] = useState<OperatingPnLReport | null>(null);

  // Filter states
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [newPaidTo, setNewPaidTo] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState<string | null>(null);

  const loadPnL = async () => {
    setPnlLoading(true);
    setPnlError(null);
    try {
      const pnl = await expenseService.getOperatingPnLReport(orgId, currentBranch?.id, startDate, endDate);
      setPnlReport(pnl);
    } catch (err: any) {
      console.warn('Lỗi khi tải báo cáo P&L:', err);
      setPnlError(err.message || 'Không thể tải báo cáo P&L từ máy chủ.');
      setPnlReport(null);
    } finally {
      setPnlLoading(false);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [cats, accs, vchs, cfl] = await Promise.all([
        expenseService.getCategories(orgId),
        expenseService.getAccounts(orgId, currentBranch?.id),
        expenseService.getVouchers(orgId, currentBranch?.id, startDate, endDate),
        expenseService.getCashflowLedger(orgId, currentBranch?.id, 50)
      ]);

      setCategories(cats);
      if (cats.length > 0 && !newCategoryId) setNewCategoryId(cats[0].id);

      setAccounts(accs);
      if (accs.length > 0 && !newAccountId) setNewAccountId(accs[0].id);

      setVouchers(vchs);
      setCashflow(cfl);
    } catch (err: any) {
      console.error('Lỗi khi tải dữ liệu sổ quỹ & chi phí:', err);
      setErrorMessage(err.message || 'Lỗi không xác định khi kết nối cơ sở dữ liệu');
    } finally {
      setIsLoading(false);
    }

    // Tải PnL độc lập để không chặn các tab sổ quỹ/phiếu chi
    loadPnL();
  };

  useEffect(() => {
    loadData();
  }, [currentBranch?.id, startDate, endDate]);

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseInt(newAmount.replace(/\D/g, ''), 10);
    if (!newTitle || !newCategoryId || !newAccountId || isNaN(amountNum) || amountNum <= 0) {
      setNotification({ type: 'error', message: 'Vui lòng điền đầy đủ tiêu đề, chọn danh mục, tài khoản quỹ và số tiền hợp lệ.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await expenseService.createVoucher({
        orgId,
        branchId: currentBranch?.id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        categoryId: newCategoryId,
        accountId: newAccountId,
        title: newTitle,
        amount: amountNum,
        paymentMethod: newPaymentMethod,
        paidTo: newPaidTo,
        expenseDate: new Date().toISOString().slice(0, 10),
        notes: newNotes
      });

      if (res.success) {
        setNotification({ type: 'success', message: `Tạo phiếu chi thành công (${res.voucher_number || 'PC'})` });
        setIsModalOpen(false);
        setNewTitle('');
        setNewAmount('');
        setNewPaidTo('');
        setNewNotes('');
        await loadData();
      } else {
        setNotification({ type: 'error', message: res.message || 'Lỗi tạo phiếu chi' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Lỗi tạo phiếu chi' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisburse = async (voucherId: string) => {
    if (!window.confirm('Xác nhận duyệt và thực chi khoản tiền này từ tài khoản quỹ?')) return;
    try {
      const res = await expenseService.disburseVoucher(voucherId);
      if (res.success) {
        setNotification({ type: 'success', message: `Đã thực chi phiếu ${res.voucher_number} thành công!` });
        await loadData();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: `Lỗi thực chi: ${err.message}` });
    }
  };

  const handleCancelOrReverse = async (voucherId: string) => {
    const reason = window.prompt('Nhập lý do hủy/hoàn phiếu chi:');
    if (!reason) return;
    try {
      const res = await expenseService.cancelOrReverseVoucher(voucherId, reason);
      if (res.success) {
        setNotification({ type: 'success', message: 'Đã hủy/hoàn phiếu chi thành công!' });
        await loadData();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: `Lỗi hủy/hoàn: ${err.message}` });
    }
  };

  const totalDisbursed = vouchers
    .filter(v => v.status === 'disbursed')
    .reduce((sum, v) => sum + Number(v.amount), 0);

  const filteredVouchers = categoryFilter === 'all' 
    ? vouchers 
    : vouchers.filter(v => v.category_name?.toLowerCase().includes(categoryFilter.toLowerCase()));

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-slate-800">Sổ Quỹ & Chi Phí Vận Hành (P&L)</h3>
              {!isSupabaseConfigured && (
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  Demo Mode
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Quản lý dòng tiền thu/chi, phiếu chi thực tế và báo cáo kết quả kinh doanh</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button 
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Phiếu Chi</span>
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Lỗi truy vấn cơ sở dữ liệu:</p>
            <p className="font-mono mt-1 text-[11px]">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* NOTIFICATION */}
      {notification && (
        <div className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/70">
          <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Thực Thu Bán Hàng (POS)</span>
          <div className="flex items-center space-x-2">
            <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
            <span className="text-lg font-black text-emerald-700">
              {((pnlReport?.sales_and_revenue.cash_collected || 0)).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/70">
          <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Chi Phí Vận Hành Đã Chi</span>
          <div className="flex items-center space-x-2">
            <ArrowUpRight className="w-5 h-5 text-rose-600" />
            <span className="text-lg font-black text-rose-700">
              {totalDisbursed.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/70">
          <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Lợi Nhuận Gộp Sau COGS</span>
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <span className="text-lg font-black text-indigo-700">
              {((pnlReport?.cogs_and_gross_profit.gross_profit_after_cogs || 0)).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/70">
          <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Lợi Nhuận Hoạt Động Sơ Bộ</span>
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-sky-600" />
            <span className={`text-lg font-black ${
              (pnlReport?.operating_surplus_preliminary.amount || 0) >= 0 ? 'text-sky-700' : 'text-rose-700'
            }`}>
              {((pnlReport?.operating_surplus_preliminary.amount || 0)).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('vouchers')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'vouchers'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Phiếu Chi Vận Hành</span>
        </button>

        <button
          onClick={() => setActiveTab('cashflow')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'cashflow'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          <span>Sổ Quỹ Thu - Chi (Sổ Cái)</span>
        </button>

        <button
          onClick={() => setActiveTab('pnl')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'pnl'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Báo Cáo Hoạt Động Kinh Doanh (P&L)</span>
        </button>
      </div>

      {/* DATE FILTER */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/70">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-slate-700">Kỳ báo cáo:</span>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
          />
          <span>đến</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
          />
        </div>

        {activeTab === 'vouchers' && (
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Hạng mục:</span>
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-medium text-slate-700"
            >
              <option value="all">Tất cả hạng mục</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: DANH SÁCH PHIẾU CHI */}
      {activeTab === 'vouchers' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
                <th className="p-3">Số Phiếu</th>
                <th className="p-3">Hạng Mục Chi</th>
                <th className="p-3">Người Nhận</th>
                <th className="p-3">Ngày Chi</th>
                <th className="p-3">Hình Thức</th>
                <th className="p-3">Trạng Thái</th>
                <th className="p-3 text-right">Số Tiền</th>
                <th className="p-3 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400 font-medium">
                    {errorMessage ? 'Lỗi kết nối cơ sở dữ liệu' : 'Không có phiếu chi nào trong khoảng thời gian đã chọn'}
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">{v.voucher_number}</td>
                    <td className="p-3 font-medium text-slate-800">
                      <p className="font-bold">{v.title}</p>
                      <span className="text-[10px] text-slate-500">{v.category_name}</span>
                    </td>
                    <td className="p-3 text-slate-600">{v.paid_to || '—'}</td>
                    <td className="p-3 font-mono text-slate-600">{v.expense_date}</td>
                    <td className="p-3 font-medium text-slate-700">
                      {v.payment_method === 'bank_transfer' ? 'Chuyển khoản' : 'Tiền mặt'}
                    </td>
                    <td className="p-3">
                      {v.status === 'disbursed' ? (
                        <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Đã thực chi</span>
                        </span>
                      ) : v.status === 'reversed' ? (
                        <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          <RotateCcw className="w-3 h-3" />
                          <span>Đã hoàn tiền</span>
                        </span>
                      ) : v.status === 'cancelled' ? (
                        <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          <Ban className="w-3 h-3" />
                          <span>Đã hủy</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <span>Chờ thực chi</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-black text-rose-700">
                      {Number(v.amount).toLocaleString('vi-VN')}đ
                    </td>
                    <td className="p-3 text-center space-x-1">
                      {v.status === 'draft' && (
                        <button 
                          onClick={() => handleDisburse(v.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          Duyệt & Chi
                        </button>
                      )}
                      {v.status === 'disbursed' && (
                        <button 
                          onClick={() => handleCancelOrReverse(v.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-200 cursor-pointer transition-colors"
                          title="Hoàn tiền bằng bút toán đảo"
                        >
                          Hoàn chi
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: SỔ QUỸ THU - CHI */}
      {activeTab === 'cashflow' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map(acc => (
              <div key={acc.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-sky-600" />
                    <span>{acc.account_name}</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                    {acc.account_type === 'bank' ? 'Ngân hàng' : 'Tiền mặt'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Số dư hiện tại:</span>
                  <span className="text-lg font-black text-slate-900">{Number(acc.current_balance).toLocaleString('vi-VN')}đ</span>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Thời Điểm</th>
                  <th className="p-3">Loại Dòng Tiền</th>
                  <th className="p-3">Hạng Mục</th>
                  <th className="p-3">Nội Dung</th>
                  <th className="p-3 text-right">Số Tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cashflow.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400 font-medium">
                      {errorMessage ? 'Lỗi kết nối cơ sở dữ liệu' : 'Chưa có phát sinh dòng tiền nào'}
                    </td>
                  </tr>
                ) : (
                  cashflow.map(cf => (
                    <tr key={cf.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono text-slate-600">{new Date(cf.occurred_at).toLocaleString('vi-VN')}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cf.flow_type === 'inflow' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {cf.flow_type === 'inflow' ? 'Thu (Vào)' : 'Chi (Ra)'}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-800">{cf.transaction_category}</td>
                      <td className="p-3 text-slate-600">{cf.notes || '—'}</td>
                      <td className={`p-3 text-right font-black ${
                        cf.flow_type === 'inflow' ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {cf.flow_type === 'inflow' ? '+' : '-'}{Number(cf.amount).toLocaleString('vi-VN')}đ
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BÁO CÁO LÃI/LỖ (P&L) */}
      {activeTab === 'pnl' && (
        <div className="space-y-6">
          {pnlLoading ? (
            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-semibold text-slate-600">Đang tổng hợp báo cáo kinh doanh vận hành (P&L)...</p>
            </div>
          ) : pnlError || !pnlReport ? (
            <div className="bg-rose-50/60 p-6 rounded-2xl border border-rose-200 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-rose-900">Chưa tải được báo cáo kết quả hoạt động kinh doanh (P&L)</h4>
                  <p className="text-xs text-rose-700">
                    {pnlError || 'Hàm tổng hợp P&L từ máy chủ chưa sẵn sàng hoặc đang được nâng cấp.'}
                  </p>
                  <p className="text-[11px] text-rose-600/90 italic">
                    Hệ thống không hiển thị số 0 giả định để bảo đảm tính chính xác tuyệt đối của số liệu tài chính.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={loadPnL}
                  className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-100/50 rounded-lg text-xs font-semibold shadow-xs transition-all"
                >
                  🔄 Tải lại báo cáo
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 space-y-4">
              {/* Cảnh báo trạng thái đối soát */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <p className="text-[11px] font-semibold text-amber-900 leading-tight">
                  <span className="font-bold uppercase tracking-wider text-amber-800 mr-1">[ĐANG ĐỐI SOÁT]:</span>
                  Báo cáo P&L đang trong giai đoạn đối soát đa kỳ (Staging Rehearsal) — Chưa sử dụng để chốt số liệu tài chính chính thức.
                </p>
              </div>

              <div className="border-b border-slate-200 pb-2 flex justify-between items-center">
                <h4 className="font-bold text-sm text-slate-900">Báo Cáo Kết Quả Hoạt Động Kinh Doanh Sơ Bộ (P&L)</h4>
                <span className="text-[10px] text-slate-500 italic">Đối chiếu theo nguồn P7.1 & P7.2</span>
              </div>
              
              {/* PHẦN 1: GÓC NHÌN BÁN HÀNG & DÒNG TIỀN (P7.1) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <h5 className="font-bold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  💵 Góc nhìn 1: Bán Hàng & Dòng Tiền (Invoicing & Cashflow)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Doanh số hóa đơn (Net Invoiced):</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {(pnlReport.invoicing_and_cashflow_kpi?.net_invoiced_sales ?? pnlReport.sales_and_revenue?.net_invoiced_sales ?? 0).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                  <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                    <span className="text-[11px] text-emerald-700 block">Dòng tiền thực thu trong kỳ:</span>
                    <span className="font-bold text-emerald-800 text-sm">
                      {(pnlReport.invoicing_and_cashflow_kpi?.cash_collected ?? pnlReport.sales_and_revenue?.cash_collected ?? 0).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                  <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-100">
                    <span className="text-[11px] text-rose-700 block">Hoàn trả khách hàng trong kỳ:</span>
                    <span className="font-bold text-rose-800 text-sm">
                      {(pnlReport.invoicing_and_cashflow_kpi?.cash_refunded ?? 0).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>
              </div>

              {/* PHẦN 2: GÓC NHÌN DOANH THU THỰC HIỆN & LỢI NHUẬN (P7.2) */}
              <div className="space-y-2 text-xs pt-1">
                <h5 className="font-bold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  📊 Góc nhìn 2: Doanh Thu Thực Hiện & Lợi Nhuận Vận Hành
                </h5>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-bold text-slate-700">1. Tổng Doanh Thu Thực Hiện (Recognized Revenue):</span>
                  <span className="font-bold text-slate-900">
                    {(pnlReport.recognized_revenue_kpi?.total_recognized_revenue ?? pnlReport.sales_and_revenue?.net_invoiced_sales ?? 0).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                {pnlReport.recognized_revenue_kpi && (
                  <div className="pl-4 text-[11px] text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>• Bán lẻ sản phẩm:</span>
                      <span className="font-mono">{(pnlReport.recognized_revenue_kpi.recognized_product_sales || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Dịch vụ lẻ làm ngay:</span>
                      <span className="font-mono">{(pnlReport.recognized_revenue_kpi.recognized_single_services || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Trừ buổi liệu trình thực tế:</span>
                      <span className="font-mono">{(pnlReport.recognized_revenue_kpi.earned_treatment_revenue || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-600">
                  <span>2. Giá Vốn Hàng Bán & Tiêu Hao (COGS):</span>
                  <span className="font-mono text-rose-600">- {((pnlReport.cogs_and_gross_profit?.total_cogs || 0)).toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200 font-bold bg-indigo-50/50 px-2 rounded-lg">
                  <span className="text-indigo-900">3. LỢI NHUẬN GỘP SAU COGS (1 - 2):</span>
                  <span className="text-indigo-700 font-black">
                    {((pnlReport.cogs_and_gross_profit?.gross_profit_after_cogs || 0)).toLocaleString('vi-VN')}đ 
                    <span className="text-[10px] ml-1 text-indigo-500 font-normal">({pnlReport.cogs_and_gross_profit?.gross_profit_margin_pct || 0}%)</span>
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-600">
                  <span>4. Hoa Hồng KTV & Bác Sĩ:</span>
                  <span className="font-mono text-rose-600">- {((pnlReport.operating_deductions?.staff_commissions || 0)).toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-600">
                  <span>5. Chi Phí Vận Hành Thực Tế (Net OPEX sau hoàn chi):</span>
                  <span className="font-mono text-rose-600">
                    - {((pnlReport.operating_deductions?.net_operating_expenses ?? pnlReport.operating_deductions?.operating_expenses_opex ?? 0)).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-slate-300 font-black bg-sky-50 px-2 rounded-lg text-sm">
                  <span className="text-sky-900">6. LỢI NHUẬN HOẠT ĐỘNG SƠ BỘ (OPERATING SURPLUS) (3 - 4 - 5):</span>
                  <span className={`${(pnlReport.operating_surplus_preliminary?.amount || 0) >= 0 ? 'text-sky-800' : 'text-rose-700'}`}>
                    {((pnlReport.operating_surplus_preliminary?.amount || 0)).toLocaleString('vi-VN')}đ
                    <span className="text-xs ml-1 text-slate-500 font-normal">({pnlReport.operating_surplus_preliminary?.operating_margin_pct || 0}%)</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL TẠO PHIẾU CHI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-sm text-slate-800">Tạo Phiếu Chi Vận Hành</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVoucher} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nội Dung Chi *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Tiền thuê mặt bằng Tháng 10/2026"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Danh Mục Chi *</label>
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tài Khoản Quỹ *</label>
                  <select
                    value={newAccountId}
                    onChange={(e) => setNewAccountId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.account_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Số Tiền (VND) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 15,000,000"
                  value={newAmount}
                  onChange={(e) => {
                    const num = e.target.value.replace(/\D/g, '');
                    setNewAmount(num ? Number(num).toLocaleString('vi-VN') : '');
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-black text-sm text-rose-700 focus:outline-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Hình Thức</label>
                  <select
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium"
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="bank_transfer">Chuyển khoản</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Người Nhận Tiền</label>
                  <input
                    type="text"
                    placeholder="Chủ nhà / NCC"
                    value={newPaidTo}
                    onChange={(e) => setNewPaidTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ghi Chú & Số Hóa Đơn</label>
                <textarea
                  rows={2}
                  placeholder="Số hóa đơn đỏ, ghi chú chứng từ..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Tạo Phiếu Chi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
