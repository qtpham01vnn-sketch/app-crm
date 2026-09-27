import React from 'react';
import { Scissors, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const SvcView: React.FC = () => {
  const { services } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Danh Mục Dịch Vụ Chuẩn & Bảng Giá Chi Nhánh</h3>
            <p className="text-xs text-slate-500">Cấu hình giá dịch vụ, thời lượng và tỷ lệ hoa hồng KTV</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Thêm Dịch Vụ Mới</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Mã Dịch Vụ</th>
              <th className="p-3">Tên Dịch Vụ</th>
              <th className="p-3">Phân Loại</th>
              <th className="p-3 text-center">Thời Lượng</th>
              <th className="p-3 text-right">Đơn Giá Chuẩn</th>
              <th className="p-3 text-center">Hoa Hồng Thợ</th>
              <th className="p-3 text-center">Áp Dụng Chi Nhánh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {services.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-mono font-bold text-slate-700">{s.code}</td>
                <td className="p-3 font-bold text-slate-900">
                  <p>{s.name}</p>
                  <p className="text-[10px] text-slate-400 font-normal">{s.description}</p>
                </td>
                <td className="p-3 text-slate-600 font-medium">{s.category}</td>
                <td className="p-3 text-center font-medium text-slate-700">{s.durationMinutes} phút</td>
                <td className="p-3 text-right font-black text-sm text-sky-700">{(s.basePrice).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 text-center font-bold text-emerald-700">{s.commissionPct}%</td>
                <td className="p-3 text-center">
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    Toàn Hệ Thống
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
