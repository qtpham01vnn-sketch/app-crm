import React from 'react';
import { Timer, Clock, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const TimesView: React.FC = () => {
  const { timesheets, currentBranch } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Bảng Chấm Công & Giờ Làm Thực Tế</h3>
            <p className="text-xs text-slate-500">Xác thực vị trí GPS / IP Chi Nhánh ({currentBranch.code})</p>
          </div>
        </div>

        <button className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Clock className="w-4 h-4" />
          <span>Check-in Ca Hôm Nay</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Nhân Viên</th>
              <th className="p-3">Ngày</th>
              <th className="p-3">Giờ Vào (Check-in)</th>
              <th className="p-3">Giờ Ra (Check-out)</th>
              <th className="p-3 text-center">Tổng Giờ Làm</th>
              <th className="p-3 text-center">Xác Thực Quản Lý</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {timesheets.map((ts) => (
              <tr key={ts.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-bold text-slate-900">{ts.staffName}</td>
                <td className="p-3 font-mono text-slate-600">{ts.date}</td>
                <td className="p-3">
                  <span className="bg-emerald-50 text-emerald-700 font-mono font-bold px-2 py-0.5 rounded border border-emerald-200">
                    {ts.checkIn}
                  </span>
                </td>
                <td className="p-3">
                  {ts.checkOut ? (
                    <span className="bg-slate-100 text-slate-700 font-mono font-bold px-2 py-0.5 rounded border border-slate-200">
                      {ts.checkOut}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-bold text-[11px]">Đang làm việc</span>
                  )}
                </td>
                <td className="p-3 text-center font-bold text-slate-900">{ts.workingHours} giờ</td>
                <td className="p-3 text-center">
                  {ts.isApproved ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="w-3 h-3" /> Đã Duyệt
                    </span>
                  ) : (
                    <button className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 px-2.5 py-1 rounded-lg">
                      Duyệt Công
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
