import React, { useState } from 'react';
import { TicketPercent, Plus, X, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';

export const PromosView: React.FC = () => {
  const { promotions, setPromotions, org, showToast, isLiveMode } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discountType, setDiscountType] = useState<'pct' | 'fixed'>('pct');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minOrderValue, setMinOrderValue] = useState<number>(500000);
  const [usageLimit, setUsageLimit] = useState<number>(100);
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-12-31');

  const filteredPromos = promotions.filter(
    (p) =>
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) {
      showToast('⚠️ Vui lòng nhập mã và mô tả voucher khuyến mãi', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode) {
        const newPromo = await masterDataService.createPromotion(
          {
            code: code.trim(),
            title: title.trim(),
            discountType,
            discountValue: Number(discountValue),
            minOrderValue: Number(minOrderValue),
            usageLimit: Number(usageLimit),
            startDate,
            endDate
          },
          org.id
        );

        if (newPromo) {
          setPromotions((prev) => [newPromo, ...prev]);
          showToast(`✅ Đã tạo voucher: ${newPromo.code}`, 'success');
        }
      } else {
        const mockNewPromo = {
          id: `promo_${Date.now()}`,
          orgId: org.id,
          code: code.trim().toUpperCase(),
          title: title.trim(),
          discountType,
          discountValue: Number(discountValue),
          minOrderValue: Number(minOrderValue),
          usageLimit: Number(usageLimit),
          usedCount: 0,
          startDate,
          endDate,
          isActive: true
        };
        setPromotions((prev) => [mockNewPromo, ...prev]);
        showToast(`✅ Đã tạo voucher demo: ${mockNewPromo.code}`, 'success');
      }

      setIsModalOpen(false);
      setCode('');
      setTitle('');
      setDiscountValue(10);
      setMinOrderValue(500000);
      setUsageLimit(100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`❌ Lỗi tạo voucher: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <TicketPercent className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Chương Trình Khuyến Mãi & Voucher</h3>
            <p className="text-xs text-slate-500">Thiết lập mã coupon, giới hạn số lượt và điều kiện áp dụng ({promotions.length} mã)</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Mã Voucher Mới</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm theo mã voucher, tiêu đề..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPromos.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Chưa có mã voucher nào phù hợp với tìm kiếm.
          </div>
        ) : (
          filteredPromos.map((p) => (
            <div
              key={p.id}
              className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="font-mono text-xs font-black text-sky-700 bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-200">
                    {p.code}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    {p.discountType === 'pct' ? `Giảm ${p.discountValue}%` : `Giảm ${p.discountValue.toLocaleString('vi-VN')}đ`}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 mt-2">{p.title}</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Đơn tối thiểu: {(p.minOrderValue || 0).toLocaleString('vi-VN')}đ
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs text-slate-600">
                <span>
                  Đã dùng: <b className="text-slate-900">{p.usedCount}</b> / {p.usageLimit || '∞'}
                </span>
                <span className="text-[11px] text-slate-500">
                  Hạn: <b className="font-mono text-slate-800">{p.endDate}</b>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Tạo Voucher */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <TicketPercent className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-base text-slate-800">Tạo Mã Voucher Mới</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePromo} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Voucher (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: CHAOTHU20"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hình Thức Giảm</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as 'pct' | 'fixed')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="pct">Theo phần trăm (%)</option>
                    <option value="fixed">Số tiền cố định (VNĐ)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu Đề / Mô Tả Voucher (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Giảm 20% Chào Thu Cho Hóa Đơn Spa"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {discountType === 'pct' ? 'Mức Giảm (%)' : 'Mức Giảm (đ)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-sky-700 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Đơn Tối Thiểu (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    required
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Giới Hạn Lượt</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày Bắt Đầu</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày Kết Thúc</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang Lưu...' : 'Lưu Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
