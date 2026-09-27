import React from 'react';
import { Percent } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const CommView: React.FC = () => {
  const { commissions } = useApp();

  const totalCommission = commissions.reduce((sum, c) => sum + c.commissionAmount, 0);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Bảng Tính Hoa Hồng Nhân Viên</h3>
            <p className="text-xs text-slate-500">Tự động tính theo dịch vụ thực hiện & sản phẩm tư vấn</p>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-right">
          <span className="text-[10px] text-emerald-700 font-bold uppercase block">Tổng Hoa Hồng Đã Phát Sinh</span>
          <span className="text-base font-black text-emerald-800">{totalCommission.toLocaleString('vi-VN')}đ</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Nhân Viên Thực Hiện</th>
              <th className="p-3">Mã Hóa Đơn</th>
              <th className="p-3">Dịch Vụ / Sản Phẩm</th>
              <th className="p-3 text-right">Giá Trị Món</th>
              <th className="p-3 text-center">Tỷ Lệ %</th>
              <th className="p-3 text-right">Tiền Hoa Hồng</th>
              <th className="p-3">Ngày Ghi Nhận</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {commissions.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-bold text-slate-900">{c.staffName}</td>
                <td className="p-3 font-mono text-sky-700 font-semibold">{c.saleId}</td>
                <td className="p-3 font-medium text-slate-800">{c.serviceOrProductName}</td>
                <td className="p-3 text-right font-medium text-slate-700">{(c.itemValue).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 text-center font-bold text-sky-700">{c.commissionPct}%</td>
                <td className="p-3 text-right font-black text-emerald-700">{(c.commissionAmount).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 font-mono text-slate-500">{c.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
