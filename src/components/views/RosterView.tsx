import React from 'react';
import { CalendarRange, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const RosterView: React.FC = () => {
  const { staffList, currentBranch, shifts } = useApp();

  const days = ['Thứ 2 (22/09)', 'Thứ 3 (23/09)', 'Thứ 4 (24/09)', 'Thứ 5 (25/09)', 'Thứ 6 (26/09)', 'Thứ 7 (27/09)', 'Chủ Nhật (28/09)'];

  const shiftBadges: Record<string, { label: string; bg: string; text: string }> = {
    morning: { label: 'Sáng (08:00 - 12:00)', bg: 'bg-amber-100', text: 'text-amber-800' },
    afternoon: { label: 'Chiều (13:00 - 17:30)', bg: 'bg-sky-100', text: 'text-sky-800' },
    evening: { label: 'Tối (17:30 - 21:00)', bg: 'bg-indigo-100', text: 'text-indigo-800' },
    full: { label: 'Cả Ngày (08:00 - 17:30)', bg: 'bg-emerald-100', text: 'text-emerald-800' }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Bảng Phân Ca Làm Việc Theo Tuần</h3>
            <p className="text-xs text-slate-500">Chi nhánh: {currentBranch.name}</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Gán Ca Làm Mới</span>
        </button>
      </div>

      {/* Roster Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3 w-44">Nhân Viên</th>
              {days.map((d, idx) => (
                <th key={idx} className="p-3 text-center border-l border-slate-200/60 font-semibold text-[11px]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {staffList.map((st) => (
              <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="p-3 font-bold text-slate-900 flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px]">
                    {st.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="leading-tight">{st.name}</p>
                    <span className="text-[10px] text-slate-400 font-normal">{st.code}</span>
                  </div>
                </td>

                {days.map((_, idx) => {
                  const isToday = idx === 4; // Thứ 6
                  const shift = isToday ? shifts.find((s) => s.staffId === st.id) : null;
                  const shiftType = shift ? shift.shiftType : idx % 2 === 0 ? 'full' : 'morning';
                  const conf = shiftBadges[shiftType];

                  return (
                    <td key={idx} className="p-2 text-center border-l border-slate-100">
                      <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-bold ${conf.bg} ${conf.text}`}>
                        {shiftType === 'full' ? 'Cả ngày' : shiftType === 'morning' ? 'Ca sáng' : 'Ca chiều'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
