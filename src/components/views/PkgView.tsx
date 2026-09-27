import React from 'react';
import { Layers, Plus, Sparkles, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PkgView: React.FC = () => {
  const { packages } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Combo Gói Dịch Vụ & Liệu Trình Trả Trước</h3>
            <p className="text-xs text-slate-500">Cấu hình gói nhiều buổi ưu đãi và hạn sử dụng</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Tạo Combo Gói Mới</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded">
                  {pkg.code}
                </span>
                <h4 className="font-bold text-sm text-slate-900 mt-1">{pkg.name}</h4>
              </div>
              <span className="text-sm font-black text-emerald-700">
                {(pkg.price).toLocaleString('vi-VN')}đ
              </span>
            </div>

            <p className="text-xs text-slate-500">{pkg.description}</p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-600">
              <span className="flex items-center gap-1 font-bold text-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {pkg.sessions} Buổi điều trị
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Hạn dùng: {pkg.validityDays} ngày
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
