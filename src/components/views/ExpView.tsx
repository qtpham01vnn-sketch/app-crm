import React from 'react';
import { Receipt, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ExpView: React.FC = () => {
  const { expenses, currentBranch } = useApp();

  const branchExpenses = expenses.filter((e) => e.branchId === currentBranch.id);
  const totalExpense = branchExpenses.reduce((sum, e) => sum + e.amount, 0);

  const catLabels: Record<string, { label: string; bg: string; text: string }> = {
    rent: { label: 'Mặt Bằng', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    utilities: { label: 'Điện Nước', bg: 'bg-amber-50', text: 'text-amber-700' },
    marketing: { label: 'Quảng Cáo', bg: 'bg-rose-50', text: 'text-rose-700' },
    salary: { label: 'Lương & Phụ Cấp', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    supplies: { label: 'Vật Tư Tiêu Hao', bg: 'bg-sky-50', text: 'text-sky-700' },
    other: { label: 'Khác', bg: 'bg-slate-100', text: 'text-slate-700' }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Sổ Quỹ & Chi Phí Vận Hành</h3>
            <p className="text-xs text-slate-500">Ghi nhận các khoản chi phí mặt bằng, điện nước, marketing</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl text-right">
            <span className="text-[10px] text-rose-600 font-bold uppercase block">Tổng Chi Nhánh Này</span>
            <span className="text-sm font-black text-rose-700">{totalExpense.toLocaleString('vi-VN')}đ</span>
          </div>

          <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center space-x-1.5">
            <Plus className="w-4 h-4" />
            <span>Tạo Phiếu Chi</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Hạng Mục Chi</th>
              <th className="p-3">Phân Loại</th>
              <th className="p-3">Ngày Chi</th>
              <th className="p-3">Hình Thức</th>
              <th className="p-3 text-right">Số Tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {branchExpenses.map((e) => {
              const conf = catLabels[e.category] || catLabels.other;
              return (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-bold text-slate-900">
                    <p>{e.title}</p>
                    {e.notes && <p className="text-[10px] text-slate-400 font-normal">{e.notes}</p>}
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conf.bg} ${conf.text}`}>
                      {conf.label}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-slate-600">{e.date}</td>
                  <td className="p-3 font-medium text-slate-700">{e.paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : 'Tiền mặt'}</td>
                  <td className="p-3 text-right font-black text-rose-700">{(e.amount).toLocaleString('vi-VN')}đ</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
