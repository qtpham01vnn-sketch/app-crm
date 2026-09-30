import React, { useState, useEffect } from 'react';
import {
  Wallet,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCw,
  Edit3,
  CreditCard,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { PayrollPeriod, PayrollRecordDetail } from '../../types';

export const PayrollView: React.FC = () => {
  const { currentBranch, branches, setCurrentBranch, showToast, currentTheme } = useApp();
  const orgId = currentBranch?.orgId || branches[0]?.orgId || '';

  const [loading, setLoading] = useState<boolean>(false);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [records, setRecords] = useState<PayrollRecordDetail[]>([]);

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [selectedRecordForAdjust, setSelectedRecordForAdjust] = useState<PayrollRecordDetail | null>(null);

  // Form Generate
  const [genForm, setGenForm] = useState({
    periodName: `Kỳ Lương Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
    startDate: (() => {
      const d = new Date();
      d.setDate(1);
      return d.toISOString().split('T')[0];
    })(),
    endDate: (() => {
      const d = new Date();
      return d.toISOString().split('T')[0];
    })()
  });

  // Form Adjust
  const [adjAllowance, setAdjAllowance] = useState<number>(0);
  const [adjDeduction, setAdjDeduction] = useState<number>(0);
  const [adjNotes, setAdjNotes] = useState<string>('');

  const fetchPayroll = async (periodId?: string) => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await masterDataService.getPayrollOverview({
        branchId: currentBranch?.id,
        periodId: periodId || selectedPeriodId || undefined
      });
      setPeriods(res.periods);
      if (res.selectedPeriodId) {
        setSelectedPeriodId(res.selectedPeriodId);
      }
      setRecords(res.records);
    } catch (err: any) {
      console.error('Lỗi tải bảng lương:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [currentBranch?.id]);

  const currentPeriod = periods.find((p) => p.id === selectedPeriodId) || periods[0];

  // Generate new period
  const handleGeneratePeriod = async () => {
    try {
      const res = await masterDataService.generatePayrollPeriodRPC({
        orgId,
        branchId: currentBranch?.id || '',
        periodName: genForm.periodName,
        startDate: genForm.startDate,
        endDate: genForm.endDate
      });
      if (res.success) {
        showToast(res.message || 'Đã tính toán bảng lương thành công!', 'success');
        setShowGenerateModal(false);
        if (res.payrollPeriodId) {
          setSelectedPeriodId(res.payrollPeriodId);
          fetchPayroll(res.payrollPeriodId);
        } else {
          fetchPayroll();
        }
      } else {
        showToast(res.message || 'Lỗi tính bảng lương', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tính bảng lương', 'error');
    }
  };

  // Adjust allowance / deduction
  const handleSaveAdjustment = async () => {
    if (!selectedRecordForAdjust) return;
    try {
      const res = await masterDataService.updatePayrollRecordAdjustmentsRPC({
        recordId: selectedRecordForAdjust.id,
        allowance: adjAllowance,
        deduction: adjDeduction,
        notes: adjNotes
      });
      if (res.success) {
        showToast(res.message || 'Đã cập nhật phụ cấp & giảm trừ!', 'success');
        setShowAdjustModal(false);
        setSelectedRecordForAdjust(null);
        fetchPayroll(selectedPeriodId);
      } else {
        showToast(res.message || 'Lỗi cập nhật', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật', 'error');
    }
  };

  // Change Period Status (Lock, Approve, Pay)
  const handleProcessStatus = async (action: 'lock' | 'approve' | 'pay') => {
    if (!selectedPeriodId) return;
    try {
      const res = await masterDataService.processPayrollPeriodStatusRPC({
        periodId: selectedPeriodId,
        action
      });
      if (res.success) {
        showToast(res.message || 'Đã xử lý trạng thái kỳ lương!', 'success');
        fetchPayroll(selectedPeriodId);
      } else {
        showToast(res.message || 'Lỗi xử lý', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xử lý', 'error');
    }
  };

  const isLocked = currentPeriod?.status === 'locked' || currentPeriod?.status === 'paid';
  const isPaid = currentPeriod?.status === 'paid';

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">💰</span>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Bảng Lương & Quyết Toán Thu Nhập</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Lương cơ bản + Giờ công thực tế (P6.3) + Hoa hồng đủ điều kiện (P6.4) + Phụ cấp - Giảm trừ = Thực lĩnh Net.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowGenerateModal(true)}
            className="text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer hover:opacity-90 active:scale-95 shadow-xs"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>Tính kỳ lương mới</span>
          </button>

          <button
            onClick={() => fetchPayroll(selectedPeriodId)}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng nhân sự</p>
          <div className="flex items-baseline space-x-1 mt-1">
            <span className="text-xl font-black text-slate-900">{currentPeriod?.totalStaff || records.length}</span>
            <span className="text-xs text-slate-500 font-semibold">người</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lương cơ bản</p>
          <div className="flex items-baseline space-x-1 mt-1">
            <span className="text-lg font-black text-slate-900 font-mono">
              {(currentPeriod?.totalBaseSalary || 0).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng hoa hồng</p>
          <div className="flex items-baseline space-x-1 mt-1">
            <span className="text-lg font-black text-emerald-600 font-mono">
              +{(currentPeriod?.totalCommission || 0).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phụ cấp / Giảm trừ</p>
          <div className="flex items-baseline space-x-1 mt-1 text-xs font-mono font-bold">
            <span className="text-emerald-700">+{(currentPeriod?.totalAllowance || 0).toLocaleString('vi-VN')}đ</span>
            <span className="text-slate-300">/</span>
            <span className="text-rose-600">-{(currentPeriod?.totalDeduction || 0).toLocaleString('vi-VN')}đ</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs bg-gradient-to-br from-rose-50/50 to-amber-50/50">
          <p className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Tổng thực chi (Net)</p>
          <div className="flex items-baseline space-x-1 mt-1">
            <span className="text-xl font-black text-rose-600 font-mono">
              {(currentPeriod?.totalNetSalary || 0).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>
      </div>

      {/* 3. Toolbar: Select Period & Status Actions */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Chi nhánh</label>
            <select
              value={currentBranch.id}
              onChange={(e) => {
                const b = branches.find((br) => br.id === e.target.value);
                if (b) setCurrentBranch(b);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Chọn kỳ lương</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => {
                setSelectedPeriodId(e.target.value);
                fetchPayroll(e.target.value);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
            >
              {periods.length === 0 ? (
                <option value="">Chưa có kỳ lương nào</option>
              ) : (
                periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodName} ({p.status === 'paid' ? 'Đã chi' : p.status === 'locked' ? 'Đã khóa' : 'Dự thảo'})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Action buttons for Payroll Period lifecycle */}
        {currentPeriod && (
          <div className="flex items-center space-x-2">
            {!isLocked && (
              <button
                onClick={() => handleProcessStatus('lock')}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Khóa sổ kỳ lương</span>
              </button>
            )}

            {!isPaid && (
              <button
                onClick={() => handleProcessStatus('pay')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Quyết toán & Chi trả</span>
              </button>
            )}

            {isPaid && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Đã quyết toán chi trả
              </span>
            )}
          </div>
        )}
      </div>

      {/* 4. Table Detailed Records */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3">Nhân Viên</th>
                <th className="p-3 text-right">Lương Cơ Bản</th>
                <th className="p-3 text-center">Giờ Công Đã Duyệt</th>
                <th className="p-3 text-right">Tổng Hoa Hồng</th>
                <th className="p-3 text-right">Phụ Cấp</th>
                <th className="p-3 text-right">Giảm Trừ</th>
                <th className="p-3 text-right">Thực Lĩnh (Net)</th>
                <th className="p-3 text-center">Trạng Thái</th>
                <th className="p-3 text-right">Điều Chỉnh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400 italic">
                    Chưa có dữ liệu tính lương trong kỳ này. Bấm &quot;Tính kỳ lương mới&quot; để bắt đầu.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-bold text-slate-900">
                      <div>{r.staffName}</div>
                      <span className="text-[10px] text-slate-400 font-mono font-normal">{r.staffCode || 'NV'}</span>
                    </td>
                    <td className="p-3 text-right font-medium text-slate-700 font-mono">
                      {Number(r.baseSalary).toLocaleString('vi-VN')}đ
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">
                      {Number(r.actualWorkingHours).toFixed(1)}h
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-600 font-mono">
                      +{Number(r.commissionTotal).toLocaleString('vi-VN')}đ
                    </td>
                    <td className="p-3 text-right font-medium text-slate-600 font-mono">
                      {Number(r.allowance) > 0 ? `+${Number(r.allowance).toLocaleString('vi-VN')}đ` : '0đ'}
                    </td>
                    <td className="p-3 text-right font-medium text-rose-600 font-mono">
                      {Number(r.deduction) > 0 ? `-${Number(r.deduction).toLocaleString('vi-VN')}đ` : '0đ'}
                    </td>
                    <td className="p-3 text-right font-black text-rose-600 font-mono text-sm">
                      {Number(r.netSalary).toLocaleString('vi-VN')}đ
                    </td>
                    <td className="p-3 text-center">
                      {r.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Đã chi trả
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                          <Wallet className="w-3 h-3" /> Dự thảo
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {!isLocked ? (
                        <button
                          onClick={() => {
                            setSelectedRecordForAdjust(r);
                            setAdjAllowance(r.allowance);
                            setAdjDeduction(r.deduction);
                            setAdjNotes(r.adjustmentNotes || '');
                            setShowAdjustModal(true);
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer transition-colors"
                          title="Sửa phụ cấp / giảm trừ"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-slate-300 font-mono text-[11px]">Đã khóa</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Tính Kỳ Lương Mới */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-rose-500" />
                <span>Khởi Tạo Kỳ Lương Mới</span>
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên kỳ lương *</label>
                <input
                  type="text"
                  value={genForm.periodName}
                  onChange={(e) => setGenForm({ ...genForm, periodName: e.target.value })}
                  placeholder="Kỳ Lương Tháng 10/2026..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Từ ngày *</label>
                  <input
                    type="date"
                    value={genForm.startDate}
                    onChange={(e) => setGenForm({ ...genForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Đến ngày *</label>
                  <input
                    type="date"
                    value={genForm.endDate}
                    onChange={(e) => setGenForm({ ...genForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <p className="font-bold">Quy trình tự động tính toán:</p>
                <p>• Lấy toàn bộ nhân sự hoạt động trong tổ chức/chi nhánh.</p>
                <p>• Tự động quét giờ công đã duyệt từ Timesheet (P6.3).</p>
                <p>• Tổng hợp hoa hồng dịch vụ đủ điều kiện (P6.4).</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleGeneratePeriod}
                className="px-4 py-2 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
                style={{ backgroundColor: currentTheme.buttonBg }}
              >
                Bắt đầu tính toán
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Sửa Phụ Cấp / Giảm Trừ */}
      {showAdjustModal && selectedRecordForAdjust && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-sky-500" />
                <span>Điều Chỉnh Phụ Cấp & Giảm Trừ</span>
              </h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                <p className="font-bold text-slate-900 text-sm">{selectedRecordForAdjust.staffName}</p>
                <div className="flex items-center justify-between text-slate-600 text-[11px]">
                  <span>Lương cứng: {Number(selectedRecordForAdjust.baseSalary).toLocaleString('vi-VN')}đ</span>
                  <span>Hoa hồng: +{Number(selectedRecordForAdjust.commissionTotal).toLocaleString('vi-VN')}đ</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phụ cấp cộng thêm (VNĐ)</label>
                <input
                  type="number"
                  step="10000"
                  min="0"
                  value={adjAllowance}
                  onChange={(e) => setAdjAllowance(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-700 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Giảm trừ / Khấu trừ (VNĐ)</label>
                <input
                  type="number"
                  step="10000"
                  min="0"
                  value={adjDeduction}
                  onChange={(e) => setAdjDeduction(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-rose-600 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú điều chỉnh</label>
                <textarea
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="Ghi rõ lý do phụ cấp / giảm trừ để lưu vết lịch sử..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 resize-none h-16"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveAdjustment}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
              >
                Lưu điều chỉnh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
