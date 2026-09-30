import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Ban,
  Printer,
  ChevronLeft,
  ChevronRight,
  Flame,
  ArrowRightLeft,
  Calendar,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { RosterShift, LeaveRequest, ShiftSwapRequest } from '../../types';

export const RosterView: React.FC = () => {
  const { staffList, currentBranch, branches, setCurrentBranch, showToast, currentTheme } = useApp();
  const orgId = currentBranch?.orgId || branches[0]?.orgId || '';

  // Active sub-tab / view
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');

  // Week calculation state
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);

  // Modals
  const [showShiftModal, setShowShiftModal] = useState<boolean>(false);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [appointmentWarning, setAppointmentWarning] = useState<{
    open: boolean;
    count: number;
    pendingAction: () => Promise<void>;
  }>({ open: false, count: 0, pendingAction: async () => {} });

  // Shift form state
  const [shiftFormData, setShiftFormData] = useState({
    id: '',
    staffId: '',
    branchId: currentBranch?.id || '',
    shiftDate: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '17:00',
    shiftType: 'day_shift' as 'morning' | 'afternoon' | 'day_shift' | 'night' | 'custom',
    breakMinutes: 60,
    isOff: false,
    notes: ''
  });

  // Leave form state
  const [leaveFormData, setLeaveFormData] = useState({
    staffId: '',
    leaveType: 'annual_leave' as 'annual_leave' | 'unpaid' | 'sick' | 'personal',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  // 7 Days array of current week
  const weekDays = useMemo(() => {
    const days = [];
    const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      days.push({
        name: dayNames[i],
        date: displayDate,
        fullDate: dateStr
      });
    }
    return days;
  }, [currentWeekStart]);

  const currentWeekRange = useMemo(() => {
    if (weekDays.length < 7) return '';
    return `${weekDays[0].date}/${currentWeekStart.getFullYear()} - ${weekDays[6].date}/${currentWeekStart.getFullYear()}`;
  }, [weekDays, currentWeekStart]);

  const hours = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
  ];

  // Load roster data from Supabase RPC
  const fetchRosterData = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const startDate = weekDays[0].fullDate;
      const endDate = weekDays[6].fullDate;
      const res = await masterDataService.getRosterMatrix({
        branchId: currentBranch?.id,
        startDate,
        endDate
      });
      setShifts(res.shifts);
      setLeaveRequests(res.leaveRequests);
      setSwapRequests(res.swapRequests);
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu phân ca:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRosterData();
  }, [currentBranch?.id, currentWeekStart]);

  // Navigate weeks
  const handlePrevWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const handleToday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  // Preset shifts handler
  const handlePresetShiftChange = (type: 'morning' | 'afternoon' | 'day_shift' | 'night' | 'custom') => {
    if (type === 'morning') {
      setShiftFormData(prev => ({ ...prev, shiftType: type, startTime: '08:00', endTime: '12:00', breakMinutes: 0 }));
    } else if (type === 'afternoon') {
      setShiftFormData(prev => ({ ...prev, shiftType: type, startTime: '13:00', endTime: '17:00', breakMinutes: 0 }));
    } else if (type === 'night') {
      setShiftFormData(prev => ({ ...prev, shiftType: type, startTime: '17:30', endTime: '21:30', breakMinutes: 0 }));
    } else if (type === 'day_shift') {
      setShiftFormData(prev => ({ ...prev, shiftType: type, startTime: '08:00', endTime: '17:00', breakMinutes: 60 }));
    } else {
      setShiftFormData(prev => ({ ...prev, shiftType: type }));
    }
  };

  // Submit Shift (Create / Edit)
  const handleSaveShift = async (force: boolean = false) => {
    if (!shiftFormData.staffId) {
      showToast('Vui lòng chọn nhân viên phân ca', 'error');
      return;
    }
    try {
      const res = await masterDataService.upsertRosterShiftRPC({
        orgId,
        shiftId: shiftFormData.id || undefined,
        staffId: shiftFormData.staffId,
        branchId: shiftFormData.branchId || currentBranch?.id || '',
        shiftDate: shiftFormData.shiftDate,
        startTime: shiftFormData.startTime,
        endTime: shiftFormData.endTime,
        shiftType: shiftFormData.shiftType,
        breakMinutes: shiftFormData.breakMinutes,
        isOff: shiftFormData.isOff,
        notes: shiftFormData.notes,
        force
      });

      if (res.success) {
        showToast(res.message || 'Đã lưu phân ca thành công!', 'success');
        setShowShiftModal(false);
        setAppointmentWarning({ open: false, count: 0, pendingAction: async () => {} });
        fetchRosterData();
      } else if (res.code === 'HAS_ACTIVE_APPOINTMENTS') {
        setAppointmentWarning({
          open: true,
          count: res.affectedCount || 1,
          pendingAction: async () => {
            await handleSaveShift(true);
          }
        });
      } else {
        showToast(res.message || 'Xung đột lịch phân ca!', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu ca làm việc', 'error');
    }
  };

  // Submit Leave Request
  const handleSaveLeaveRequest = async () => {
    if (!leaveFormData.staffId) {
      showToast('Vui lòng chọn nhân viên xin nghỉ phép', 'error');
      return;
    }
    try {
      await masterDataService.createLeaveRequest({
        orgId,
        staffId: leaveFormData.staffId,
        branchId: currentBranch?.id,
        leaveType: leaveFormData.leaveType,
        startDate: leaveFormData.startDate,
        endDate: leaveFormData.endDate,
        reason: leaveFormData.reason
      });
      showToast('Đã gửi đơn xin nghỉ phép thành công!', 'success');
      setShowLeaveModal(false);
      fetchRosterData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi gửi đơn nghỉ phép', 'error');
    }
  };

  // Approve / Reject Leave
  const handleProcessLeave = async (requestId: string, action: 'approved' | 'rejected', force: boolean = false) => {
    try {
      const res = await masterDataService.processLeaveRequestRPC({
        requestId,
        action,
        managerStaffId: staffList[0]?.id,
        force
      });

      if (res.success) {
        showToast(res.message || 'Đã xử lý đơn nghỉ phép thành công!', 'success');
        setAppointmentWarning({ open: false, count: 0, pendingAction: async () => {} });
        fetchRosterData();
      } else if (res.code === 'APPOINTMENTS_REQUIRE_REASSIGNMENT') {
        setAppointmentWarning({
          open: true,
          count: res.appointmentCount || 1,
          pendingAction: async () => {
            await handleProcessLeave(requestId, action, true);
          }
        });
      } else {
        showToast(res.message || 'Không thể xử lý đơn nghỉ phép', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xử lý đơn nghỉ phép', 'error');
    }
  };

  // Approve / Reject Swap
  const handleProcessSwap = async (swapId: string, action: 'approve' | 'reject') => {
    try {
      const res = await masterDataService.processShiftSwapRPC({
        swapId,
        action,
        managerStaffId: staffList[0]?.id
      });
      if (res.success) {
        showToast(res.message || 'Đã xử lý đổi ca thành công!', 'success');
        fetchRosterData();
      } else {
        showToast(res.message || 'Không thể xử lý đổi ca', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xử lý đổi ca', 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Header Title & Top Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🗓️</span>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Lịch Làm Việc & Phân Ca (Roster)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý ca trực đa chi nhánh, chống trùng lịch & thời gian di chuyển, tích hợp an toàn lịch hẹn khách hàng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setShiftFormData({
                id: '',
                staffId: staffList[0]?.id || '',
                branchId: currentBranch?.id || '',
                shiftDate: weekDays[0].fullDate,
                startTime: '08:00',
                endTime: '17:00',
                shiftType: 'day_shift',
                breakMinutes: 60,
                isOff: false,
                notes: ''
              });
              setShowShiftModal(true);
            }}
            className="text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer hover:opacity-90 active:scale-95 shadow-xs"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>Phân ca mới</span>
          </button>

          <button
            onClick={() => {
              setLeaveFormData({
                staffId: staffList[0]?.id || '',
                leaveType: 'annual_leave',
                startDate: weekDays[0].fullDate,
                endDate: weekDays[0].fullDate,
                reason: ''
              });
              setShowLeaveModal(true);
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Ban className="w-4 h-4 text-amber-500" />
            <span>Đăng ký nghỉ phép</span>
          </button>

          <button
            onClick={fetchRosterData}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-500' : ''}`} />
          </button>

          <button
            onClick={handlePrint}
            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>In lịch tuần</span>
          </button>
        </div>
      </div>

      {/* 2. Filters Toolbar & Date Controls */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Chi nhánh</label>
          <select
            value={currentBranch.id}
            onChange={(e) => {
              const b = branches.find((br) => br.id === e.target.value);
              if (b) setCurrentBranch(b);
            }}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Phòng trị liệu</label>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            <option value="all">Tất cả phòng</option>
            <option value="P. Sen 1">P. Sen 1 (Body)</option>
            <option value="P. Sen 2">P. Sen 2 (Facial)</option>
            <option value="P. Sen 3">P. Sen 3 (Trị liệu)</option>
            <option value="P. Trúc 1">P. Trúc 1 (VIP)</option>
            <option value="P. Trúc 2">P. Trúc 2 (Đá nóng)</option>
            <option value="P. Mộc">P. Mộc (Gội dưỡng sinh)</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Kỹ thuật viên</label>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            <option value="all">Tất cả KTV ({staffList.length})</option>
            {staffList.map((st) => (
              <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Khung xem</label>
          <button
            onClick={handleToday}
            className="w-full px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-rose-500" />
            <span>Tuần hiện tại</span>
          </button>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Tuần</label>
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
            <button onClick={handlePrevWeek} className="p-0.5 hover:bg-slate-200 rounded cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="font-mono text-[11px] font-bold text-slate-700">{currentWeekRange}</span>
            <button onClick={handleNextWeek} className="p-0.5 hover:bg-slate-200 rounded cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* 3. Main Weekly Scheduling Grid (8 cols) + Right Sidebar (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 cols: Weekly Dispatching Grid */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Lịch Phân Ca Tuần & Điểm Danh</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              Tổng cộng: <b className="text-rose-600">{shifts.length}</b> ca trực
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  <th className="p-2.5 w-16 text-slate-400 font-mono text-center">Giờ</th>
                  {weekDays.map((d, dIdx) => (
                    <th key={dIdx} className="p-2.5 text-center font-bold text-slate-800 border-l border-slate-100">
                      <div>{d.name}</div>
                      <span className="text-[11px] text-slate-400 font-mono font-normal">{d.date}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hours.map((h, hIdx) => (
                  <tr key={hIdx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="p-2 font-mono text-[11px] text-slate-400 text-center font-semibold border-r border-slate-100">
                      {h}
                    </td>
                    {weekDays.map((d, dIdx) => {
                      const currentHourNum = parseInt(h.split(':')[0], 10);
                      const matchingShifts = shifts.filter((s) => {
                        if (s.shiftDate !== d.fullDate) return false;
                        if (selectedStaff !== 'all' && s.staffId !== selectedStaff) return false;
                        const startH = parseInt((s.startTime || '08:00').split(':')[0], 10);
                        const endH = parseInt((s.endTime || '17:00').split(':')[0], 10);
                        return currentHourNum >= startH && currentHourNum < endH;
                      });

                      return (
                        <td key={dIdx} className="p-1 border-l border-slate-100 align-top h-14 w-[13%]">
                          {matchingShifts.map((sh, sIdx) => {
                            const isLeave = sh.isOff || sh.status === 'leave';
                            return (
                              <div
                                key={sIdx}
                                onClick={() => {
                                  setShiftFormData({
                                    id: sh.id,
                                    staffId: sh.staffId,
                                    branchId: sh.branchId,
                                    shiftDate: sh.shiftDate,
                                    startTime: sh.startTime.slice(0, 5),
                                    endTime: sh.endTime.slice(0, 5),
                                    shiftType: sh.shiftType,
                                    breakMinutes: sh.breakMinutes || 0,
                                    isOff: sh.isOff,
                                    notes: sh.notes || ''
                                  });
                                  setShowShiftModal(true);
                                }}
                                className={`p-1.5 rounded-xl border text-[10px] space-y-0.5 shadow-xs hover:shadow-md transition-all cursor-pointer mb-1 ${
                                  isLeave
                                    ? 'bg-rose-50/80 border-rose-200 text-rose-800'
                                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                }`}
                              >
                                <div className="flex items-center justify-between font-mono font-bold text-[9px]">
                                  <span>{sh.startTime.slice(0, 5)} - {sh.endTime.slice(0, 5)}</span>
                                  {sh.appointmentsCount ? (
                                    <span className="px-1 py-0.2 bg-amber-200 text-amber-900 rounded font-bold">
                                      {sh.appointmentsCount} hẹn
                                    </span>
                                  ) : null}
                                </div>
                                <p className="font-bold line-clamp-1">{sh.staffName || 'KTV'}</p>
                                <div className="flex items-center justify-between text-[9px] pt-0.5 border-t border-black/5">
                                  <span className="font-semibold text-slate-500">
                                    {isLeave ? 'Nghỉ phép' : 'Ca trực'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Color Legend at Bottom */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t border-slate-100 text-[11px]">
            <div className="flex items-center space-x-1.5">
              <span className="w-3.5 h-3.5 rounded-md border bg-emerald-50 border-emerald-200"></span>
              <span className="font-medium text-slate-600">Ca làm việc chuẩn</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3.5 h-3.5 rounded-md border bg-amber-50 border-amber-200"></span>
              <span className="font-medium text-slate-600">Có lịch hẹn khách hàng</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3.5 h-3.5 rounded-md border bg-rose-50 border-rose-200"></span>
              <span className="font-medium text-slate-600">Nghỉ phép / Chặn lịch</span>
            </div>
          </div>
        </div>

        {/* Right 4 cols: Leave Requests, Shift Swaps & Technician Status */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card 1: Yêu Cầu Nghỉ Phép Chờ Duyệt */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-rose-600" /> Nghỉ Phép Chờ Duyệt ({leaveRequests.filter(l => l.status === 'pending').length})
              </h3>
            </div>

            <div className="space-y-2 text-xs">
              {leaveRequests.filter(l => l.status === 'pending').length === 0 ? (
                <p className="text-slate-400 text-center py-3 text-[11px] italic">Không có đơn nghỉ phép nào chờ duyệt</p>
              ) : (
                leaveRequests.filter(l => l.status === 'pending').map((lr) => (
                  <div key={lr.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{lr.staffName}</span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                        {lr.leaveType === 'annual_leave' ? 'Phép năm' : lr.leaveType === 'sick' ? 'Nghỉ ốm' : 'Không lương'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Từ: <b className="text-slate-800">{lr.startDate}</b> đến <b className="text-slate-800">{lr.endDate}</b>
                    </p>
                    {lr.reason && <p className="text-[10px] text-slate-500 italic">Lý do: {lr.reason}</p>}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                      <button
                        onClick={() => handleProcessLeave(lr.id, 'approved')}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Duyệt đơn
                      </button>
                      <button
                        onClick={() => handleProcessLeave(lr.id, 'rejected')}
                        className="flex-1 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" /> Từ chối
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 2: Yêu Cầu Đổi Ca */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-sky-600" /> Yêu Cầu Đổi Ca ({swapRequests.length})
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              {swapRequests.length === 0 ? (
                <p className="text-slate-400 text-center py-3 text-[11px] italic">Không có yêu cầu đổi ca nào</p>
              ) : (
                swapRequests.map((sw) => (
                  <div key={sw.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-900">{sw.requesterName}</span>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-sky-500" />
                      <span className="font-bold text-slate-900">{sw.targetName || 'KTV'}</span>
                    </div>
                    {sw.reason && <p className="text-[10px] text-slate-500 italic">Lý do: {sw.reason}</p>}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                      <button
                        onClick={() => handleProcessSwap(sw.id, 'approve')}
                        className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Duyệt đổi
                      </button>
                      <button
                        onClick={() => handleProcessSwap(sw.id, 'reject')}
                        className="flex-1 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" /> Từ chối
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 3: Khung Giờ Cao Điểm */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" /> Khung Giờ Cao Điểm (Hôm Nay)
            </h3>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                <p className="text-[10px] text-slate-500 font-mono">09:00 - 11:00</p>
                <b className="font-black text-rose-600 text-sm block mt-1">23 lịch</b>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <p className="text-[10px] text-rose-700 font-mono font-bold">14:00 - 16:00</p>
                <b className="font-black text-rose-700 text-sm block mt-1">28 lịch</b>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                <p className="text-[10px] text-slate-500 font-mono">19:00 - 21:00</p>
                <b className="font-black text-rose-600 text-sm block mt-1">19 lịch</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: Phân Ca / Sửa Ca Làm Việc */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-500" />
                <span>{shiftFormData.id ? 'Cập Nhật Ca Làm Việc' : 'Tạo Phân Ca Làm Việc Mới'}</span>
              </h3>
              <button
                onClick={() => setShowShiftModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nhân viên *</label>
                <select
                  value={shiftFormData.staffId}
                  onChange={(e) => setShiftFormData({ ...shiftFormData, staffId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chi nhánh *</label>
                  <select
                    value={shiftFormData.branchId}
                    onChange={(e) => setShiftFormData({ ...shiftFormData, branchId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày làm việc *</label>
                  <input
                    type="date"
                    value={shiftFormData.shiftDate}
                    onChange={(e) => setShiftFormData({ ...shiftFormData, shiftDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Shift Presets */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mẫu ca trực</label>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePresetShiftChange('morning')}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[10px] border transition-all cursor-pointer ${
                      shiftFormData.shiftType === 'morning' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Ca Sáng
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetShiftChange('afternoon')}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[10px] border transition-all cursor-pointer ${
                      shiftFormData.shiftType === 'afternoon' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Ca Chiều
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetShiftChange('night')}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[10px] border transition-all cursor-pointer ${
                      shiftFormData.shiftType === 'night' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Ca Tối
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetShiftChange('day_shift')}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[10px] border transition-all cursor-pointer ${
                      shiftFormData.shiftType === 'day_shift' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Ca Full
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={shiftFormData.startTime}
                    onChange={(e) => setShiftFormData({ ...shiftFormData, startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={shiftFormData.endTime}
                    onChange={(e) => setShiftFormData({ ...shiftFormData, endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="is_off_toggle"
                  checked={shiftFormData.isOff}
                  onChange={(e) => setShiftFormData({ ...shiftFormData, isOff: e.target.checked })}
                  className="w-4 h-4 text-rose-600 rounded border-slate-300"
                />
                <label htmlFor="is_off_toggle" className="font-bold text-slate-800 cursor-pointer">
                  Đặt là ngày nghỉ / Đóng ca trực
                </label>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú</label>
                <textarea
                  value={shiftFormData.notes}
                  onChange={(e) => setShiftFormData({ ...shiftFormData, notes: e.target.value })}
                  placeholder="Ghi chú phân công..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 resize-none h-16"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowShiftModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => handleSaveShift(false)}
                className="px-4 py-2 text-white rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all cursor-pointer text-xs shadow-xs"
                style={{ backgroundColor: currentTheme.buttonBg }}
              >
                Lưu phân ca
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Xin Nghỉ Phép */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 text-amber-500" />
                <span>Đăng Ký Nghỉ Phép</span>
              </h3>
              <button
                onClick={() => setShowLeaveModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nhân viên xin nghỉ *</label>
                <select
                  value={leaveFormData.staffId}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, staffId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Loại nghỉ phép</label>
                <select
                  value={leaveFormData.leaveType}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, leaveType: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                >
                  <option value="annual_leave">Nghỉ phép năm (hưởng lương)</option>
                  <option value="sick">Nghỉ ốm đau</option>
                  <option value="unpaid">Nghỉ không lương</option>
                  <option value="personal">Nghỉ việc riêng</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Từ ngày *</label>
                  <input
                    type="date"
                    value={leaveFormData.startDate}
                    onChange={(e) => setLeaveFormData({ ...leaveFormData, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Đến ngày *</label>
                  <input
                    type="date"
                    value={leaveFormData.endDate}
                    onChange={(e) => setLeaveFormData({ ...leaveFormData, endDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lý do xin nghỉ</label>
                <textarea
                  value={leaveFormData.reason}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, reason: e.target.value })}
                  placeholder="Ghi rõ lý do xin nghỉ để quản lý phê duyệt..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 resize-none h-20"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveLeaveRequest}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
              >
                Gửi đơn duyệt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Cảnh Báo Lịch Hẹn Khách Hàng (Appointment Safety Modal) */}
      {appointmentWarning.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in border border-amber-200">
            <div className="p-4 bg-amber-500 text-white flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h3 className="font-black text-sm">Cảnh Báo An Toàn Lịch Hẹn Khách Hàng</h3>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-800 leading-relaxed">
                Nhân viên này đang có <b className="text-rose-600 font-black text-sm">{appointmentWarning.count}</b> lịch hẹn khách hàng đang chờ phục vụ trong khung giờ/ngày này.
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <p className="font-bold">Hệ thống sẽ bảo toàn quyền lợi khách hàng bằng cách:</p>
                <p>• Chuyển các lịch hẹn trên về trạng thái chờ điều phối KTV khác.</p>
                <p>• Thông báo cho lễ tân để sắp xếp nhân sự thay thế.</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
              <button
                onClick={() => setAppointmentWarning({ open: false, count: 0, pendingAction: async () => {} })}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Quay lại
              </button>
              <button
                onClick={appointmentWarning.pendingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
              >
                Xác nhận & Điều phối lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
