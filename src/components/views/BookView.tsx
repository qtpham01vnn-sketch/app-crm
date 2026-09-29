import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Building2,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppointmentDetailModal } from '../modals/AppointmentDetailModal';
import { NewApptModal } from '../modals/NewApptModal';
import type { Appointment } from '../../types';

export const BookView: React.FC<{ onOpenNewAppt?: () => void }> = ({ onOpenNewAppt }) => {
  const { appointments, staffList, services, customers, currentBranch, currentTheme } = useApp();

  // Navigation state
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [viewMode, setViewMode] = useState<'staff' | 'room' | 'week'>('staff');
  const [filterStaffId, setFilterStaffId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modals state
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLocalNewApptOpen, setIsLocalNewApptOpen] = useState(false);
  const [slotPrefill, setSlotPrefill] = useState<{ staffId?: string; roomOrBed?: string; date: string; time: string } | null>(null);

  const handleOpenSlot = (prefill: { staffId?: string; roomOrBed?: string; date: string; time: string }) => {
    setSlotPrefill(prefill);
    setIsLocalNewApptOpen(true);
  };

  // Quick navigation handlers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  // Pre-defined branch rooms/beds
  const branchRooms = [
    { id: 'room-01', name: 'Phòng 01 (VIP Laser)' },
    { id: 'room-02', name: 'Phòng Chăm Sóc Da 02' },
    { id: 'room-03', name: 'Phòng Thẩm Mỹ 03' },
    { id: 'bed-01', name: 'Giường Thư Giãn 01' },
    { id: 'bed-02', name: 'Giường Thư Giãn 02' }
  ];

  // Filter staff active at this branch
  const activeBranchStaff = useMemo(() => {
    return staffList.filter(
      (s) => !s.branchIds || s.branchIds.length === 0 || s.branchIds.includes(currentBranch?.id || '')
    );
  }, [staffList, currentBranch]);

  // Appointments on selected date and current branch
  const dayAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const matchBranch = !currentBranch?.id || a.branchId === currentBranch.id || !a.branchId;
      const matchDate = a.date === selectedDate;
      const matchStaff = filterStaffId === 'all' || a.staffId === filterStaffId;
      const matchStatus = filterStatus === 'all' || a.status === filterStatus;
      return matchBranch && matchDate && matchStaff && matchStatus;
    });
  }, [appointments, currentBranch, selectedDate, filterStaffId, filterStatus]);

  // Generate 30-minute time slots from 08:00 to 19:30
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 8; h <= 19; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      slots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  // Helper: check conflicts (same staff or same room overlapping)
  const conflictApptIds = useMemo(() => {
    const conflicts = new Set<string>();
    for (let i = 0; i < dayAppointments.length; i++) {
      for (let j = i + 1; j < dayAppointments.length; j++) {
        const a1 = dayAppointments[i];
        const a2 = dayAppointments[j];
        if (a1.status === 'cancelled' || a2.status === 'cancelled') continue;

        const sameStaff = a1.staffId && a2.staffId && a1.staffId === a2.staffId;
        const sameRoom = a1.roomOrBed && a2.roomOrBed && a1.roomOrBed === a2.roomOrBed;

        if (sameStaff || sameRoom) {
          // Check time overlap
          const [h1, m1] = a1.time.split(':').map(Number);
          const start1 = h1 * 60 + m1;
          const end1 = start1 + (a1.durationMinutes || 60);

          const [h2, m2] = a2.time.split(':').map(Number);
          const start2 = h2 * 60 + m2;
          const end2 = start2 + (a2.durationMinutes || 60);

          if (start1 < end2 && start2 < end1) {
            conflicts.add(a1.id);
            conflicts.add(a2.id);
          }
        }
      }
    }
    return conflicts;
  }, [dayAppointments]);

  // Calculate day summary metrics
  const dayStats = useMemo(() => {
    const total = dayAppointments.length;
    const confirmed = dayAppointments.filter((a) => a.status === 'confirmed').length;
    const inProgress = dayAppointments.filter((a) => a.status === 'in_progress').length;
    const completed = dayAppointments.filter((a) => a.status === 'done').length;
    const conflicts = conflictApptIds.size;
    return { total, confirmed, inProgress, completed, conflicts };
  }, [dayAppointments, conflictApptIds]);

  const getStatusBadge = (status: Appointment['status']) => {
    switch (status) {
      case 'confirmed':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Đã xác nhận' };
      case 'in_progress':
        return { bg: 'bg-sky-50 text-sky-700 border-sky-200 animate-pulse', text: 'Đang làm' };
      case 'done':
        return { bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'Hoàn thành' };
      case 'cancelled':
        return { bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'Đã hủy' };
      default:
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'Tạo lịch' };
    }
  };

  const handleOpenApptDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Header & Navigation Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
              style={{ backgroundColor: `${currentTheme.primaryColor}15`, color: currentTheme.primaryColor }}
            >
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-black text-slate-900">Lưới Lịch Điều Phối Vận Hành</h2>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  {currentBranch?.name || 'Chi nhánh'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Điều phối phân bổ Kỹ thuật viên, Bác sĩ và Giường phòng theo thời gian thực
              </p>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => (onOpenNewAppt ? onOpenNewAppt() : setIsLocalNewApptOpen(true))}
            className="w-full sm:w-auto text-xs text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>Đặt Lịch Hẹn Mới</span>
          </button>
        </div>

        {/* Date Navigator, View Switcher & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date Navigator */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={handlePrevDay}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer transition-all"
              title="Ngày trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 bg-white shadow-xs rounded-lg text-xs font-bold text-slate-800 hover:text-rose-600 cursor-pointer"
            >
              Hôm nay
            </button>
            <button
              onClick={handleNextDay}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer transition-all"
              title="Ngày sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setViewMode('staff')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'staff' ? 'bg-white shadow-xs font-bold text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
              style={viewMode === 'staff' ? { color: currentTheme.primaryColor } : {}}
            >
              <User className="w-3.5 h-3.5" />
              <span>Theo KTV / Bác Sĩ ({activeBranchStaff.length})</span>
            </button>
            <button
              onClick={() => setViewMode('room')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'room' ? 'bg-white shadow-xs font-bold text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
              style={viewMode === 'room' ? { color: currentTheme.primaryColor } : {}}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Theo Phòng / Giường ({branchRooms.length})</span>
            </button>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center space-x-2">
            <select
              value={filterStaffId}
              onChange={(e) => setFilterStaffId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả KTV</option>
              {activeBranchStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="in_progress">Đang làm</option>
              <option value="done">Hoàn thành</option>
              <option value="booked">Chờ duyệt</option>
            </select>
          </div>
        </div>

        {/* Stats Strip & Conflict Alert */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-3 text-slate-600">
            <span>
              Tổng lịch ngày: <b className="text-slate-900">{dayStats.total}</b>
            </span>
            <span>•</span>
            <span className="text-emerald-700">
              Đã xác nhận: <b>{dayStats.confirmed}</b>
            </span>
            <span>•</span>
            <span className="text-sky-700">
              Đang làm: <b>{dayStats.inProgress}</b>
            </span>
            <span>•</span>
            <span className="text-slate-700">
              Hoàn thành: <b>{dayStats.completed}</b>
            </span>
          </div>

          {dayStats.conflicts > 0 && (
            <div className="flex items-center space-x-1 text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Phát hiện {dayStats.conflicts} lịch bị trùng giờ!</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Grid Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full border-collapse text-xs min-w-[860px]">
            {/* Table Header: Columns for Staff or Rooms */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <th className="p-3 font-bold text-center border-r border-slate-200 w-24 sticky left-0 bg-slate-100 z-10">
                  <div className="flex items-center justify-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Giờ</span>
                  </div>
                </th>

                {viewMode === 'staff'
                  ? activeBranchStaff.map((staff) => (
                      <th key={staff.id} className="p-3 font-bold text-left border-r border-slate-200 min-w-[200px]">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-slate-900 font-black">{staff.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              {staff.role.includes('doctor') ? 'Bác Sĩ' : 'Kỹ Thuật Viên'} • {staff.code}
                            </div>
                          </div>
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Đang trong ca trực"></span>
                        </div>
                      </th>
                    ))
                  : branchRooms.map((room) => (
                      <th key={room.id} className="p-3 font-bold text-left border-r border-slate-200 min-w-[200px]">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-slate-900 font-black">{room.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium">Cơ sở vật chất</div>
                          </div>
                          <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                        </div>
                      </th>
                    ))}
              </tr>
            </thead>

            {/* Table Body: 30-min Rows */}
            <tbody className="divide-y divide-slate-100">
              {timeSlots.map((slotTime) => {
                const isHourMark = slotTime.endsWith(':00');

                return (
                  <tr
                    key={slotTime}
                    className={`hover:bg-slate-50/50 transition-colors ${
                      isHourMark ? 'border-t-2 border-slate-200/80' : ''
                    }`}
                  >
                    {/* Time Label */}
                    <td className="p-2 text-center font-mono font-bold text-[11px] text-slate-500 border-r border-slate-200 sticky left-0 bg-slate-50/90 z-10">
                      {slotTime}
                    </td>

                    {/* Columns */}
                    {viewMode === 'staff'
                      ? activeBranchStaff.map((staff) => {
                          const slotAppts = dayAppointments.filter(
                            (a) => a.staffId === staff.id && a.time.slice(0, 5) === slotTime
                          );

                          return (
                            <td
                              key={staff.id}
                              className="p-1.5 border-r border-slate-200 align-top relative group min-h-[48px]"
                            >
                              {slotAppts.length === 0 ? (
                                <button
                                  onClick={() => handleOpenSlot({ staffId: staff.id, date: selectedDate, time: slotTime })}
                                  className="w-full h-full min-h-[38px] rounded-lg border border-dashed border-transparent group-hover:border-slate-300 group-hover:bg-slate-50/70 flex items-center justify-center text-transparent group-hover:text-slate-400 text-[10px] font-semibold cursor-pointer transition-all"
                                >
                                  + Đặt giờ {slotTime}
                                </button>
                              ) : (
                                <div className="space-y-1.5">
                                  {slotAppts.map((appt) => {
                                    const isConflict = conflictApptIds.has(appt.id);
                                    const badge = getStatusBadge(appt.status);

                                    return (
                                      <div
                                        key={appt.id}
                                        onClick={() => handleOpenApptDetail(appt)}
                                        className={`p-2.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:scale-[1.01] space-y-1 ${
                                          isConflict
                                            ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/40'
                                            : 'bg-white border-slate-200/90 hover:border-rose-300'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-1">
                                          <div className="font-bold text-slate-900 truncate">
                                            {appt.customerName || 'Khách hàng'}
                                          </div>
                                          <span
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${badge.bg}`}
                                          >
                                            {badge.text}
                                          </span>
                                        </div>

                                        <div className="text-[11px] text-slate-600 font-medium truncate">
                                          {appt.serviceName || 'Dịch vụ Spa'}
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                          <div className="flex items-center space-x-1 font-mono">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            <span>
                                              {appt.time} ({appt.durationMinutes}p)
                                            </span>
                                          </div>
                                          <span className="text-slate-700 font-semibold">{appt.roomOrBed || 'Phòng 01'}</span>
                                        </div>

                                        {isConflict && (
                                          <div className="text-[9px] font-bold text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded flex items-center space-x-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>Trùng lịch điều phối!</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })
                      : branchRooms.map((room) => {
                          const slotAppts = dayAppointments.filter(
                            (a) =>
                              (a.roomOrBed?.toLowerCase().includes(room.name.toLowerCase()) ||
                                (room.id === 'room-01' && a.roomOrBed === 'Phòng Điều Trị 01')) &&
                              a.time.slice(0, 5) === slotTime
                          );

                          return (
                            <td
                              key={room.id}
                              className="p-1.5 border-r border-slate-200 align-top relative group min-h-[48px]"
                            >
                              {slotAppts.length === 0 ? (
                                <button
                                  onClick={() => handleOpenSlot({ roomOrBed: room.name, date: selectedDate, time: slotTime })}
                                  className="w-full h-full min-h-[38px] rounded-lg border border-dashed border-transparent group-hover:border-slate-300 group-hover:bg-slate-50/70 flex items-center justify-center text-transparent group-hover:text-slate-400 text-[10px] font-semibold cursor-pointer transition-all"
                                >
                                  + Đặt phòng {slotTime}
                                </button>
                              ) : (
                                <div className="space-y-1.5">
                                  {slotAppts.map((appt) => {
                                    const isConflict = conflictApptIds.has(appt.id);
                                    const badge = getStatusBadge(appt.status);

                                    return (
                                      <div
                                        key={appt.id}
                                        onClick={() => handleOpenApptDetail(appt)}
                                        className={`p-2.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:scale-[1.01] space-y-1 ${
                                          isConflict
                                            ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/40'
                                            : 'bg-white border-slate-200/90 hover:border-rose-300'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-1">
                                          <div className="font-bold text-slate-900 truncate">
                                            {appt.customerName || 'Khách hàng'}
                                          </div>
                                          <span
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${badge.bg}`}
                                          >
                                            {badge.text}
                                          </span>
                                        </div>

                                        <div className="text-[11px] text-slate-600 font-medium truncate">
                                          {appt.serviceName || 'Dịch vụ Spa'}
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                          <div className="flex items-center space-x-1 font-mono">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            <span>
                                              {appt.time} ({appt.durationMinutes}p)
                                            </span>
                                          </div>
                                          <span className="text-slate-700 font-semibold">{appt.staffName || 'KTV'}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Appointment Detail Modal */}
      {isDetailModalOpen && selectedAppt && (
        <AppointmentDetailModal
          appt={selectedAppt}
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          customer={customers.find((c) => c.id === selectedAppt.customerId)}
          service={services.find((s) => s.id === selectedAppt.serviceId)}
        />
      )}

      {/* Local New Appointment Modal with prefill support */}
      {isLocalNewApptOpen && (
        <NewApptModal
          isOpen={isLocalNewApptOpen}
          onClose={() => {
            setIsLocalNewApptOpen(false);
            setSlotPrefill(null);
          }}
          initialStaffId={slotPrefill?.staffId}
          initialRoomOrBed={slotPrefill?.roomOrBed}
          initialDate={slotPrefill?.date || selectedDate}
          initialTime={slotPrefill?.time}
        />
      )}
    </div>
  );
};
