import React from 'react';
import { TicketPercent, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PromosView: React.FC = () => {
  const { promotions } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <TicketPercent className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Chương Trình Khuyến Mãi & Voucher</h3>
            <p className="text-xs text-slate-500">Thiết lập mã coupon, giới hạn số lượt và điều kiện áp dụng</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Tạo Mã Voucher Mới</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {promotions.map((p) => (
          <div
            key={p.id}
            className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs font-black text-sky-700 bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-200">
                  {p.code}
                </span>
                <h4 className="font-bold text-sm text-slate-900 mt-2">{p.title}</h4>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {p.discountType === 'pct' ? `Giảm ${p.discountValue}%` : `Giảm ${p.discountValue.toLocaleString('vi-VN')}đ`}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs text-slate-600">
              <span>Đã dùng: <b className="text-slate-900">{p.usedCount}</b> / {p.usageLimit || '∞'} lượt</span>
              <span>Hạn dùng: <b className="font-mono text-slate-800">{p.endDate}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
