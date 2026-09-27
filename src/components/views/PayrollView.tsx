import React from 'react';
import { Wallet, CheckCircle, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PayrollView: React.FC = () => {
  const { payrolls } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Bảng Lương & Quyết Toán Thu Nhập</h3>
            <p className="text-xs text-slate-500">Lương cơ bản + Hoa hồng + Phụ cấp - Giảm trừ = Thực lĩnh</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Download className="w-4 h-4" />
          <span>Xuất Bảng Lương (Excel)</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Nhân Viên</th>
              <th className="p-3">Kỳ Lương</th>
              <th className="p-3 text-right">Lương Cơ Bản</th>
              <th className="p-3 text-right">Tổng Hoa Hồng</th>
              <th className="p-3 text-right">Phụ Cấp</th>
              <th className="p-3 text-right">Thực Lĩnh (Net)</th>
              <th className="p-3 text-center">Trạng Thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {payrolls.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-bold text-slate-900">{p.staffName}</td>
                <td className="p-3 font-mono text-slate-600 font-medium">Tháng {p.month}</td>
                <td className="p-3 text-right font-medium text-slate-700">{(p.baseSalary).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 text-right font-bold text-sky-700">{(p.commissionTotal).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 text-right text-slate-600">{(p.allowance).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 text-right font-black text-sm text-emerald-700">{(p.netSalary).toLocaleString('vi-VN')}đ</td>
                <td className="p-3 text-center">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" /> Đã Quyết Toán
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
