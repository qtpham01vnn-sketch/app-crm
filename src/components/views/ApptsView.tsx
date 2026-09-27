import React, { useState } from 'react';
import { Calendar as CalendarIcon, Plus, Scissors, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ApptsView: React.FC<{ onOpenNewAppt: () => void }> = ({ onOpenNewAppt }) => {
  const { appointments, currentBranch, updateApptStatus } = useApp();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const branchAppts = appointments.filter(
    (a) => a.branchId === currentBranch.id && (filterStatus === 'all' || a.status === filterStatus)
  );

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    booked: { label: 'Đã Đặt', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200' },
    confirmed: { label: 'Đã Xác Nhận', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    in_progress: { label: 'Đang Thực Hiện', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    done: { label: 'Hoàn Thành', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    cancelled: { label: 'Đã Hủy', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Filter & Action Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <CalendarIcon className="w-4 h-4 text-sky-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg ${filterStatus === 'all' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'}`}
            >
              Tất cả ({appointments.filter((a) => a.branchId === currentBranch.id).length})
            </button>
            <button
              onClick={() => setFilterStatus('in_progress')}
              className={`px-3 py-1 rounded-lg ${filterStatus === 'in_progress' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600'}`}
            >
              Đang làm
            </button>
            <button
              onClick={() => setFilterStatus('confirmed')}
              className={`px-3 py-1 rounded-lg ${filterStatus === 'confirmed' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}
            >
              Đã xác nhận
            </button>
            <button
              onClick={() => setFilterStatus('done')}
              className={`px-3 py-1 rounded-lg ${filterStatus === 'done' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'}`}
            >
              Hoàn thành
            </button>
          </div>
        </div>

        <button
          onClick={onOpenNewAppt}
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-sky-600/20 flex items-center space-x-1.5 transition-all self-end sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Đặt Lịch Mới</span>
        </button>
      </div>

      {/* Appointment Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branchAppts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
            Không có lịch hẹn nào phù hợp bộ lọc tại {currentBranch.name}.
          </div>
        ) : (
          branchAppts.map((appt) => {
            const conf = statusConfig[appt.status] || statusConfig.booked;
            return (
              <div
                key={appt.id}
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-sm text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                        {appt.time}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">({appt.durationMinutes} phút)</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${conf.bg} ${conf.color}`}>
                      {conf.label}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-slate-900">{appt.customerName}</h4>
                  <p className="text-xs text-slate-500">{appt.customerPhone}</p>

                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                    <div className="flex items-center space-x-2 text-slate-700 font-medium">
                      <Scissors className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>{appt.serviceName}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-600">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>KTV / Bác sĩ: <b className="text-slate-800">{appt.staffName}</b></span>
                    </div>
                    {appt.roomOrBed && (
                      <p className="text-[11px] text-indigo-600 font-medium pl-5.5">
                        Vị trí: {appt.roomOrBed}
                      </p>
                    )}
                    {appt.notes && (
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                        "{appt.notes}"
                      </p>
                    )}
                  </div>
                </div>

                {/* State Transition Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">
                    {(appt.priceSnapshot || 0).toLocaleString('vi-VN')}đ
                  </span>

                  <div className="flex items-center space-x-1.5">
                    {appt.status !== 'in_progress' && appt.status !== 'done' && (
                      <button
                        onClick={() => updateApptStatus(appt.id, 'in_progress')}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg border border-amber-200 text-[11px]"
                      >
                        Bắt đầu
                      </button>
                    )}
                    {appt.status === 'in_progress' && (
                      <button
                        onClick={() => updateApptStatus(appt.id, 'done')}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-200 text-[11px]"
                      >
                        Hoàn thành
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
