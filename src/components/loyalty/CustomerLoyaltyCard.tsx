import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  Coins,
  Clock,
  TrendingUp,
  History,
  Sliders,
  Plus,
  Minus,
  AlertTriangle,
  X,
  ShieldCheck,
  Building2,
  Sparkles
} from 'lucide-react';
import type { Customer, CustomerLoyaltyOverview } from '../../types';
import { loyaltyService } from '../../services/loyaltyService';
import { useApp } from '../../context/AppContext';

interface CustomerLoyaltyCardProps {
  customer: Customer;
}

export const CustomerLoyaltyCard: React.FC<CustomerLoyaltyCardProps> = ({ customer }) => {
  const { org, staffList, showToast } = useApp();
  const [overview, setOverview] = useState<CustomerLoyaltyOverview | null>(null);
  const [loading, setLoading] = useState(false);

  // Manual Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'plus' | 'minus'>('plus');
  const [adjustPointsValue, setAdjustPointsValue] = useState<number>(100);
  const [adjustReason, setAdjustReason] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  const loadLoyaltyData = useCallback(async () => {
    if (!org?.id || !customer?.id) return;
    setLoading(true);
    try {
      const data = await loyaltyService.getCustomerLoyaltyOverview(org.id, customer.id);
      setOverview(data);
    } catch (err: any) {
      console.error('Lỗi khi tải thông tin loyalty:', err);
    } finally {
      setLoading(false);
    }
  }, [org?.id, customer?.id]);

  useEffect(() => {
    loadLoyaltyData();
  }, [loadLoyaltyData]);

  const handleAdjustPointsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id || !customer?.id || !staffList?.[0]?.id) {
      showToast('Thiếu thông tin xác thực nhân viên', 'error');
      return;
    }

    if (adjustPointsValue <= 0) {
      showToast('Số điểm điều chỉnh phải lớn hơn 0', 'warning');
      return;
    }

    if (!adjustReason.trim() || adjustReason.trim().length < 5) {
      showToast('Bắt buộc nhập lý do điều chỉnh tối thiểu 5 ký tự', 'warning');
      return;
    }

    const delta = adjustType === 'plus' ? adjustPointsValue : -adjustPointsValue;
    setIsSubmittingAdjust(true);
    try {
      const res = await loyaltyService.adjustPoints({
        orgId: org.id,
        customerId: customer.id,
        pointsDelta: delta,
        reason: adjustReason.trim(),
        staffId: staffList[0].id
      });

      if (res.success) {
        showToast(`✅ Đã điều chỉnh ${delta > 0 ? '+' : ''}${delta} điểm thành công`, 'success');
        setIsAdjustModalOpen(false);
        setAdjustReason('');
        loadLoyaltyData();
      } else {
        showToast(res.error || 'Lỗi khi điều chỉnh điểm', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi hệ thống khi điều chỉnh điểm', 'error');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  const handleManualEvaluateTier = async () => {
    if (!org?.id || !customer?.id) return;
    try {
      const res = await loyaltyService.evaluateTier({
        orgId: org.id,
        customerId: customer.id,
        staffId: staffList?.[0]?.id
      });

      if (res.success) {
        showToast(res.message || 'Đã kiểm tra hạng thành viên', 'success');
        loadLoyaltyData();
      } else {
        showToast(res.message || 'Không thể kiểm tra hạng', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi đánh giá hạng', 'error');
    }
  };

  // Tier Card Gradient Styles
  const getTierCardStyle = (tierCode?: string) => {
    switch (tierCode?.toLowerCase()) {
      case 'vip':
        return 'from-purple-900 via-indigo-900 to-slate-900 border-purple-500/30 text-purple-100 shadow-purple-950/30';
      case 'platinum':
        return 'from-slate-800 via-slate-700 to-zinc-900 border-slate-400/40 text-slate-100 shadow-slate-900/30';
      case 'gold':
        return 'from-amber-700 via-amber-600 to-yellow-800 border-amber-400/50 text-amber-50 shadow-amber-950/30';
      case 'silver':
        return 'from-slate-600 via-slate-500 to-slate-700 border-slate-300/40 text-slate-100 shadow-slate-900/20';
      default:
        return 'from-emerald-800 via-teal-800 to-slate-900 border-emerald-500/30 text-emerald-100 shadow-emerald-950/20';
    }
  };

  const currentTierCode = overview?.currentTier || customer.vipTier || 'standard';
  const pointsToCashValue = (overview?.availablePoints || 0) * (overview?.pointsToCurrencyRatio || 100);

  return (
    <div className="space-y-6">
      {/* 1. DIGITAL MEMBERSHIP TIER CARD */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br border shadow-xl transition-all ${getTierCardStyle(
          currentTierCode
        )}`}
      >
        <div className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div className="absolute -left-12 -top-12 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
          {/* Header Row */}
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 opacity-80" />
                <span className="text-xs font-semibold tracking-wider uppercase opacity-80">
                  {org?.name || 'PHƯƠNG NAM CLINIC & SPA'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-1">
                {overview?.tierName || currentTierCode.toUpperCase()} MEMBER
              </h3>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold">
              <Award className="w-3.5 h-3.5" />
              <span>Đặc quyền {overview?.tierDiscountPct || 0}%</span>
            </div>
          </div>

          {/* Points & Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-white/10">
            <div>
              <p className="text-[11px] opacity-75 font-medium flex items-center gap-1">
                <Coins className="w-3 h-3" /> Điểm Khả Dụng
              </p>
              <p className="text-2xl font-black tracking-tight mt-0.5">
                {(overview?.availablePoints || 0).toLocaleString('vi-VN')}
              </p>
              <p className="text-[10px] opacity-70">
                ≈ {pointsToCashValue.toLocaleString('vi-VN')} VNĐ
              </p>
            </div>

            <div>
              <p className="text-[11px] opacity-75 font-medium flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Chi Tiêu Tích Lũy
              </p>
              <p className="text-lg font-bold tracking-tight mt-1">
                {(overview?.tierQualifyingSpend || 0).toLocaleString('vi-VN')} đ
              </p>
              <p className="text-[10px] opacity-70">Xét hạng theo kỳ 12 tháng</p>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <p className="text-[11px] opacity-75 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> Hết Hạn 30 Ngày
              </p>
              <p className="text-lg font-bold tracking-tight mt-1 text-amber-200">
                {(overview?.expiringPoints30d || 0).toLocaleString('vi-VN')} điểm
              </p>
              <p className="text-[10px] opacity-70">Hạn 365 ngày từ khi tích</p>
            </div>
          </div>

          {/* Card Footer Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-white/10 text-xs">
            <div className="flex items-center space-x-1.5 opacity-80">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Khách hàng: <b>{customer.name}</b> ({customer.phone})</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleManualEvaluateTier}
                className="px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md font-semibold transition-all cursor-pointer flex items-center space-x-1"
                title="Đánh giá lại hạng dựa trên chi tiêu thực tế"
              >
                <Sparkles className="w-3 h-3" />
                <span>Xét Hạng</span>
              </button>
              <button
                onClick={() => setIsAdjustModalOpen(true)}
                className="px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md font-semibold transition-all cursor-pointer flex items-center space-x-1"
              >
                <Sliders className="w-3 h-3" />
                <span>Điều Chỉnh Điểm</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. POLICY NOTICE BANNER */}
      {!overview?.policyActive && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            <b>Lưu ý:</b> Chính sách tích điểm tự động hiện đang ở trạng thái <b>TẮT</b> (Môi trường an toàn). 
            Các giao dịch mua hàng chưa tự động cộng điểm cho đến khi Quản trị viên kích hoạt chính thức.
          </p>
        </div>
      )}

      {/* 3. POINTS LEDGER TIMELINE (IMMUTABLE SỔ CÁI) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h4 className="font-bold text-sm text-slate-900">Sổ Cái Điểm Thưởng (Points Ledger)</h4>
          </div>
          <span className="text-xs text-slate-500">
            Tổng tích lũy: <b>{(overview?.totalEarnedPoints || 0).toLocaleString('vi-VN')}</b> | Đã đổi: <b>{(overview?.totalRedeemedPoints || 0).toLocaleString('vi-VN')}</b>
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Đang tải lịch sử sổ cái điểm...</div>
        ) : !overview?.ledgerHistory || overview.ledgerHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Chưa có giao dịch tích / tiêu điểm nào được ghi nhận.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {overview.ledgerHistory.map((entry) => {
              const isPositive = entry.pointsDelta > 0;
              return (
                <div key={entry.id} className="py-3 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-xl transition-all">
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {isPositive ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-800">
                          {entry.reasonForChange}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            entry.transactionType === 'earn'
                              ? 'bg-emerald-100 text-emerald-700'
                              : entry.transactionType === 'redeem'
                              ? 'bg-blue-100 text-blue-700'
                              : entry.transactionType === 'adjust'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {entry.transactionType.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(entry.createdAt).toLocaleString('vi-VN')} {entry.staffName ? `• Bởi ${entry.staffName}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-black ${
                        isPositive ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {entry.pointsDelta.toLocaleString('vi-VN')}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      Số dư sau: {entry.balanceAfter.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. MODAL: ĐIỀU CHỈNH ĐIỂM THỦ CÔNG (AUDITED) */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Điều Chỉnh Điểm Thưởng (Có Audit)</h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustPointsSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Loại điều chỉnh</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('plus')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      adjustType === 'plus'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Cộng Thêm Điểm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('minus')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      adjustType === 'minus'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                    <span>Khấu Trừ Điểm</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Số điểm thay đổi</label>
                <input
                  type="number"
                  min="1"
                  value={adjustPointsValue}
                  onChange={(e) => setAdjustPointsValue(Math.max(1, Number(e.target.value) || 0))}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Lý do điều chỉnh (Bắt buộc kiểm toán tối thiểu 5 ký tự)
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ví dụ: Bù điểm cho khách do sự cố kỹ thuật ngày 01/10..."
                  rows={3}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingAdjust ? 'Đang xử lý...' : 'Xác Nhận Điều Chỉnh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
