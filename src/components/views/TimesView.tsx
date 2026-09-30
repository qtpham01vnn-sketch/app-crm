import React, { useState, useEffect } from 'react';
import {
  Timer,
  Clock,
  ShieldCheck,
  MapPin,
  AlertCircle,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Moon,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { AttendanceRecord, AttendanceAdjustment } from '../../types';

export const TimesView: React.FC = () => {
  const { staffList, currentBranch, branches, setCurrentBranch, showToast, currentTheme } = useApp();
  const orgId = currentBranch?.orgId || branches[0]?.orgId || '';

  const [activeTab, setActiveTab] = useState<'records' | 'adjustments'>('records');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [adjustments, setAdjustments] = useState<AttendanceAdjustment[]>([]);
  const [summary, setSummary] = useState({
    totalWorking: 0,
    totalCompleted: 0,
    totalApproved: 0,
    totalHours: 0
  });

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState<boolean>(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState<boolean>(false);
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [selectedRecordForApproval, setSelectedRecordForApproval] = useState<AttendanceRecord | null>(null);
  const [approvedHoursInput, setApprovedHoursInput] = useState<number>(0);
  const [approvalNotes, setApprovalNotes] = useState<string>('');

  // Check-in form
  const [checkInStaffId, setCheckInStaffId] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState<string>('');

  // Adjustment form
  const [adjForm, setAdjForm] = useState({
    staffId: '',
    workDate: new Date().toISOString().split('T')[0],
    requestedCheckInTime: '08:00',
    requestedCheckOutTime: '17:00',
    reason: ''
  });

  const fetchTimesheets = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await masterDataService.getTimesheetsDirectory({
        branchId: currentBranch?.id,
        startDate,
        endDate,
        staffId: selectedStaff !== 'all' ? selectedStaff : undefined
      });
      setRecords(res.records);
      setAdjustments(res.adjustments);
      setSummary(res.summary);
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu chấm công:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimesheets();
  }, [currentBranch?.id, startDate, endDate, selectedStaff]);

  // Handle Check-in
  const handleCheckIn = async () => {
    if (!checkInStaffId) {
      showToast('Vui lòng chọn nhân viên check-in', 'error');
      return;
    }
    try {
      let geoMeta: any = { source: 'browser_app' };
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
          });
          geoMeta = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: 'gps_verified'
          };
        } catch {
          // Fallback if permission not granted
        }
      }

      const res = await masterDataService.checkInAttendanceRPC({
        orgId,
        branchId: currentBranch?.id || '',
        staffId: checkInStaffId,
        method: geoMeta.source === 'gps_verified' ? 'gps' : 'manual_app',
        meta: geoMeta,
        notes: checkInNotes
      });

      if (res.success) {
        showToast(res.message || 'Check-in ca thành công!', 'success');
        setShowCheckInModal(false);
        setCheckInNotes('');
        fetchTimesheets();
      } else {
        showToast(res.message || 'Lỗi check-in', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi check-in', 'error');
    }
  };

  // Handle Check-out
  const handleCheckOut = async (attendanceId: string) => {
    try {
      let geoMeta: any = { source: 'browser_app' };
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
          });
          geoMeta = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: 'gps_verified'
          };
        } catch {
          // Fallback
        }
      }

      const res = await masterDataService.checkOutAttendanceRPC({
        attendanceId,
        method: geoMeta.source === 'gps_verified' ? 'gps' : 'manual_app',
        meta: geoMeta
      });

      if (res.success) {
        showToast(res.message || 'Check-out ca thành công!', 'success');
        fetchTimesheets();
      } else {
        showToast(res.message || 'Lỗi check-out', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi check-out', 'error');
    }
  };

  // Submit Adjustment Request
  const handleSubmitAdjustment = async () => {
    if (!adjForm.staffId) {
      showToast('Vui lòng chọn nhân viên', 'error');
      return;
    }
    if (!adjForm.reason.trim()) {
      showToast('Vui lòng nhập lý do điều chỉnh', 'error');
      return;
    }
    try {
      const inDateTime = `${adjForm.workDate}T${adjForm.requestedCheckInTime}:00+07:00`;
      const outDateTime = `${adjForm.workDate}T${adjForm.requestedCheckOutTime}:00+07:00`;

      const res = await masterDataService.requestAttendanceAdjustmentRPC({
        orgId,
        staffId: adjForm.staffId,
        branchId: currentBranch?.id || '',
        workDate: adjForm.workDate,
        requestedCheckIn: inDateTime,
        requestedCheckOut: outDateTime,
        reason: adjForm.reason
      });

      if (res.success) {
        showToast('Đã gửi yêu cầu điều chỉnh công thành công!', 'success');
        setShowAdjustmentModal(false);
        setAdjForm({
          staffId: '',
          workDate: new Date().toISOString().split('T')[0],
          requestedCheckInTime: '08:00',
          requestedCheckOutTime: '17:00',
          reason: ''
        });
        fetchTimesheets();
      } else {
        showToast(res.message || 'Lỗi gửi yêu cầu điều chỉnh', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi gửi yêu cầu', 'error');
    }
  };

  // Process Adjustment Approval
  const handleProcessAdjustment = async (adjId: string, action: 'approved' | 'rejected') => {
    try {
      const res = await masterDataService.processAttendanceAdjustmentRPC({
        adjustmentId: adjId,
        action,
        managerStaffId: staffList[0]?.id
      });
      if (res.success) {
        showToast(res.message || 'Đã xử lý điều chỉnh công thành công!', 'success');
        fetchTimesheets();
      } else {
        showToast(res.message || 'Lỗi xử lý điều chỉnh', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi xử lý', 'error');
    }
  };

  // Direct Timesheet Record Approval
  const handleApproveRecord = async () => {
    if (!selectedRecordForApproval) return;
    try {
      const res = await masterDataService.approveTimesheetRecordRPC({
        attendanceId: selectedRecordForApproval.id,
        approvedHours: approvedHoursInput,
        managerStaffId: staffList[0]?.id,
        notes: approvalNotes
      });
      if (res.success) {
        showToast(res.message || 'Đã duyệt giờ công thành công!', 'success');
        setShowApproveModal(false);
        setSelectedRecordForApproval(null);
        fetchTimesheets();
      } else {
        showToast(res.message || 'Lỗi duyệt giờ công', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi duyệt giờ công', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Top Header & KPI Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">⏱️</span>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Chấm Công & Giờ Làm Thực Tế</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ghi nhận Check-in/out, ca qua đêm, chống gian lận GPS/IP, quy trình bổ sung công quên & phê duyệt giờ làm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setCheckInStaffId(staffList[0]?.id || '');
              setShowCheckInModal(true);
            }}
            className="text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer hover:opacity-90 active:scale-95 shadow-xs"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Clock className="w-4 h-4" />
            <span>Check-in ca hôm nay</span>
          </button>

          <button
            onClick={() => {
              setAdjForm({
                staffId: staffList[0]?.id || '',
                workDate: new Date().toISOString().split('T')[0],
                requestedCheckInTime: '08:00',
                requestedCheckOutTime: '17:00',
                reason: ''
              });
              setShowAdjustmentModal(true);
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4 text-sky-500" />
            <span>Bổ sung / Sửa công</span>
          </button>

          <button
            onClick={fetchTimesheets}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Đang làm việc</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl font-black text-emerald-600">{summary.totalWorking}</span>
            <span className="text-xs text-slate-500 font-semibold">nhân viên</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Chờ duyệt công</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl font-black text-amber-600">{summary.totalCompleted}</span>
            <span className="text-xs text-slate-500 font-semibold">ca</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Đã duyệt công</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl font-black text-sky-600">{summary.totalApproved}</span>
            <span className="text-xs text-slate-500 font-semibold">ca</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng giờ công tháng</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-xl font-black text-rose-600">{summary.totalHours.toFixed(1)}</span>
            <span className="text-xs text-slate-500 font-semibold">giờ</span>
          </div>
        </div>
      </div>

      {/* 3. Toolbar & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Sub-tabs */}
        <div className="flex items-center space-x-1 bg-slate-100/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('records')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'records' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Bảng Chấm Công ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'adjustments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Yêu Cầu Điều Chỉnh</span>
            {adjustments.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-mono">
                {adjustments.length}
              </span>
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentBranch.id}
            onChange={(e) => {
              const b = branches.find((br) => br.id === e.target.value);
              if (b) setCurrentBranch(b);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
          >
            <option value="all">Tất cả nhân viên</option>
            {staffList.map((st) => (
              <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
            ))}
          </select>

          <div className="flex items-center space-x-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold"
            />
          </div>
        </div>
      </div>

      {/* 4. Tab 1: Records Table */}
      {activeTab === 'records' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Nhân Viên</th>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Giờ Vào (Check-in)</th>
                  <th className="p-3">Giờ Ra (Check-out)</th>
                  <th className="p-3 text-center">Giờ Thực Tế</th>
                  <th className="p-3 text-center">Giờ Duyệt</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                  <th className="p-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400 italic">
                      Không có bản ghi chấm công nào trong khoảng thời gian này.
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const isWorking = r.status === 'working';
                    const isApproved = r.status === 'approved';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-bold text-slate-900">
                          <div>{r.staffName}</div>
                          <span className="text-[10px] text-slate-400 font-mono font-normal">{r.staffCode || 'NV'}</span>
                        </td>
                        <td className="p-3 font-mono text-slate-600 font-semibold">{r.workDate}</td>
                        <td className="p-3">
                          <div className="flex items-center space-x-1 font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 w-fit">
                            <span>{new Date(r.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                            {r.checkInMethod === 'gps' && (
                              <span title="Định vị GPS"><MapPin className="w-3 h-3 text-emerald-500" /></span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {r.checkOutAt ? (
                            <div className="flex items-center space-x-1 font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 w-fit">
                              <span>{new Date(r.checkOutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                              {r.isOvernight && (
                                <span title="Ca qua đêm"><Moon className="w-3 h-3 text-indigo-500" /></span>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-600 font-bold text-[11px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Đang làm việc
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-slate-800">
                          {isWorking ? '--' : `${r.actualHours}h`}
                        </td>
                        <td className="p-3 text-center font-black font-mono text-rose-600">
                          {isWorking ? '--' : `${r.approvedHours}h`}
                        </td>
                        <td className="p-3 text-center">
                          {isApproved ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-3 h-3" /> Đã duyệt
                            </span>
                          ) : isWorking ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <Timer className="w-3 h-3" /> Đang làm
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" /> Chờ duyệt
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {isWorking ? (
                              <button
                                onClick={() => handleCheckOut(r.id)}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg transition-all cursor-pointer shadow-xs"
                              >
                                Check-out
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedRecordForApproval(r);
                                  setApprovedHoursInput(r.approvedHours || r.actualHours);
                                  setApprovalNotes(r.notes || '');
                                  setShowApproveModal(true);
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] rounded-lg border border-slate-200 transition-all cursor-pointer"
                              >
                                Duyệt công
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Adjustments Table */}
      {activeTab === 'adjustments' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Nhân Viên</th>
                  <th className="p-3">Ngày Làm Việc</th>
                  <th className="p-3">Giờ Yêu Cầu</th>
                  <th className="p-3 text-center">Tổng Giờ Xin</th>
                  <th className="p-3">Lý Do Điều Chỉnh</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                  <th className="p-3 text-right">Phê Duyệt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 italic">
                      Không có yêu cầu điều chỉnh nào đang chờ duyệt.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-bold text-slate-900">{a.staffName}</td>
                      <td className="p-3 font-mono text-slate-600 font-semibold">{a.workDate}</td>
                      <td className="p-3 font-mono">
                        <span className="text-slate-800 font-bold">
                          {new Date(a.requestedCheckIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-slate-400 mx-1">➜</span>
                        <span className="text-slate-800 font-bold">
                          {new Date(a.requestedCheckOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="p-3 text-center font-black font-mono text-rose-600">
                        {a.requestedHours}h
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs">{a.reason}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" /> Chờ duyệt
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleProcessAdjustment(a.id, 'approved')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                          </button>
                          <button
                            onClick={() => handleProcessAdjustment(a.id, 'rejected')}
                            className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Check-in */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                <span>Check-in Ca Hôm Nay</span>
              </h3>
              <button
                onClick={() => setShowCheckInModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nhân viên check-in *</label>
                <select
                  value={checkInStaffId}
                  onChange={(e) => setCheckInStaffId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900 space-y-1 text-[11px]">
                <p className="font-bold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Xác thực vị trí
                </p>
                <p className="text-slate-600">
                  Hệ thống tự động ghi nhận tọa độ GPS và thời gian chính xác của máy chủ để chống gian lận.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú (nếu có)</label>
                <input
                  type="text"
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="Ghi chú ca trực..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowCheckInModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleCheckIn}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
              >
                Xác nhận Check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Bổ Sung / Sửa Công */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-500" />
                <span>Bổ Sung / Điều Chỉnh Giờ Công</span>
              </h3>
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nhân viên *</label>
                <select
                  value={adjForm.staffId}
                  onChange={(e) => setAdjForm({ ...adjForm, staffId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ngày làm việc *</label>
                <input
                  type="date"
                  value={adjForm.workDate}
                  onChange={(e) => setAdjForm({ ...adjForm, workDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ vào yêu cầu *</label>
                  <input
                    type="time"
                    value={adjForm.requestedCheckInTime}
                    onChange={(e) => setAdjForm({ ...adjForm, requestedCheckInTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ ra yêu cầu *</label>
                  <input
                    type="time"
                    value={adjForm.requestedCheckOutTime}
                    onChange={(e) => setAdjForm({ ...adjForm, requestedCheckOutTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lý do điều chỉnh *</label>
                <textarea
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  placeholder="Ghi rõ lý do quên chấm công hoặc điều chỉnh giờ..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 resize-none h-20"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSubmitAdjustment}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
              >
                Gửi yêu cầu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Phê Duyệt Giờ Công Trực Tiếp */}
      {showApproveModal && selectedRecordForApproval && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Phê Duyệt Giờ Công</span>
              </h3>
              <button
                onClick={() => setShowApproveModal(false)}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{selectedRecordForApproval.staffName}</span>
                  <span className="font-mono text-slate-500">{selectedRecordForApproval.workDate}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Giờ thực tế ghi nhận:</span>
                  <b className="text-slate-900 font-mono">{selectedRecordForApproval.actualHours} giờ</b>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Số giờ công được duyệt *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="24"
                  value={approvedHoursInput}
                  onChange={(e) => setApprovedHoursInput(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú phê duyệt</label>
                <input
                  type="text"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Ghi chú duyệt công..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 cursor-pointer text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleApproveRecord}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all cursor-pointer text-xs shadow-xs"
              >
                Xác nhận Duyệt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
