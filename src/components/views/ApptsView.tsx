import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Check,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppointmentDetailModal } from '../modals/AppointmentDetailModal';
import type { Appointment } from '../../types';

export const ApptsView: React.FC<{ onOpenNewAppt: () => void }> = ({ onOpenNewAppt }) => {
  const { appointments, currentBranch, updateApptStatus, staffList, showToast } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [isFilterAllDates, setIsFilterAllDates] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');

  // Selected appointment for detail modal
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Dynamic filter
  const filteredAppts = appointments.filter((a) => {
    const matchBranch = !currentBranch?.id || a.branchId === currentBranch.id || !a.branchId;
    const matchDate = isFilterAllDates || !selectedDate || a.date === selectedDate;
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'pending' && a.status === 'booked') ||
      (filterStatus === 'confirmed' && a.status === 'confirmed') ||
      (filterStatus === 'done' && a.status === 'done') ||
      (filterStatus === 'cancelled' && a.status === 'cancelled');
    const matchStaff = filterStaff === 'all' || (a.staffName && a.staffName.toLowerCase().includes(filterStaff.toLowerCase()));
    const matchSearch =
      (a.customerName && a.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (a.customerPhone && a.customerPhone.includes(searchTerm)) ||
      (a.id && a.id.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchBranch && matchDate && matchStatus && matchStaff && matchSearch;
  });

  // KPI Calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const branchAppts = appointments.filter((a) => !currentBranch?.id || a.branchId === currentBranch.id || !a.branchId);

  const pendingCount = branchAppts.filter((a) => a.status === 'booked').length;
  const confirmedCount = branchAppts.filter((a) => a.status === 'confirmed' || a.status === 'in_progress').length;
  const doneCount = branchAppts.filter((a) => a.status === 'done').length;
  const cancelledCount = branchAppts.filter((a) => a.status === 'cancelled').length;
  const todayCount = branchAppts.filter((a) => a.date === todayStr || !a.date).length;

  const handleOpenDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setIsDetailModalOpen(true);
  };

  const handleQuickConfirm = (apptId: string) => {
    updateApptStatus(apptId, 'confirmed');
    showToast('✅ Đã xác nhận lịch hẹn thành công', 'success');
  };

  const statusBadges: Record<string, { label: string; bg: string; text: string }> = {
    booked: { label: 'Chờ xác nhận', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
    pending: { label: 'Chờ xác nhận', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
    confirmed: { label: 'Đã xác nhận', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
    in_progress: { label: 'Đang làm', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
    done: { label: 'Hoàn thành', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700' },
    completed: { label: 'Hoàn thành', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700' },
    cancelled: { label: 'Hủy', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Header Title & Main Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">📅</span>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Lịch Hẹn</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi danh sách tiếp đón, trạng thái phục vụ và phân bổ nguồn lực kỹ thuật viên.
          </p>
        </div>

        <button
          onClick={onOpenNewAppt}
          className="bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-rose-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tạo Lịch Hẹn</span>
        </button>
      </div>

      {/* 2. Top 5 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div
          onClick={() => setFilterStatus('pending')}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md ${
            filterStatus === 'pending' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chờ xác nhận</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{pendingCount}</p>
          <span className="text-[10px] text-amber-700 font-semibold mt-0.5 block">▲ 7% so với hôm qua</span>
        </div>

        <div
          onClick={() => setFilterStatus('confirmed')}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md ${
            filterStatus === 'confirmed' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đã xác nhận</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{confirmedCount}</p>
          <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">▲ 15% so với hôm qua</span>
        </div>

        <div
          onClick={() => setFilterStatus('done')}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md ${
            filterStatus === 'done' ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hoàn thành</span>
            <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-600 mt-2">{doneCount}</p>
          <span className="text-[10px] text-sky-700 font-semibold mt-0.5 block">▲ 18% so với hôm qua</span>
        </div>

        <div
          onClick={() => setFilterStatus('cancelled')}
          className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md ${
            filterStatus === 'cancelled' ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hủy</span>
            <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{cancelledCount}</p>
          <span className="text-[10px] text-rose-700 font-semibold mt-0.5 block">▲ 12% so với hôm qua</span>
        </div>

        <div
          onClick={() => {
            setIsFilterAllDates(false);
            setSelectedDate(todayStr);
            setFilterStatus('all');
          }}
          className="p-4 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/20 cursor-pointer transition-all hover:opacity-95"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-100 uppercase tracking-wider">Hôm nay</span>
            <CalendarIcon className="w-4 h-4 text-white" />
          </div>
          <p className="text-2xl font-black text-white mt-2">{todayCount}</p>
          <span className="text-[10px] text-rose-100 font-semibold mt-0.5 block">+4 lịch so với hôm qua</span>
        </div>
      </div>

      {/* 3. Main Data Area: Left Table (8 cols) + Right Summary Cards (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Appointments Table */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          {/* Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã lịch, khách hàng, SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 font-medium"
              />
            </div>

            <div>
              <input
                type="date"
                value={selectedDate}
                disabled={isFilterAllDates}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={`w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 ${
                  isFilterAllDates ? 'opacity-40' : ''
                }`}
              />
            </div>

            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="all">Trạng thái: Tất cả</option>
                <option value="pending">Chờ xác nhận</option>
                <option value="confirmed">Đã xác nhận</option>
                <option value="done">Hoàn thành</option>
                <option value="cancelled">Hủy</option>
              </select>
            </div>

            <div>
              <select
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="all">KTV: Tất cả</option>
                {staffList.map((st) => (
                  <option key={st.id} value={st.name}>{st.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Appointments Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-rose-50/40 border-b border-rose-100/60 text-slate-700 font-bold">
                  <th className="p-3">Mã Lịch</th>
                  <th className="p-3">Khách Hàng</th>
                  <th className="p-3">SĐT</th>
                  <th className="p-3">Dịch Vụ</th>
                  <th className="p-3">KTV</th>
                  <th className="p-3 text-center">Ngày / Giờ</th>
                  <th className="p-3 text-center">Số Người</th>
                  <th className="p-3">Nguồn Đặt</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAppts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      Không có lịch hẹn nào khớp với tiêu chí tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  filteredAppts.map((appt, idx) => {
                    const badge = statusBadges[appt.status] || statusBadges.booked;
                    const code = `SP${appt.date.replace(/-/g, '').slice(2)}-${String(idx + 1).padStart(3, '0')}`;
                    const sources = ['Website', 'Facebook', 'Zalo OA', 'Google', 'Khách quen'];
                    const src = sources[idx % sources.length];

                    return (
                      <tr key={appt.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-700">{code}</td>
                        <td className="p-3 font-bold text-slate-900">{appt.customerName}</td>
                        <td className="p-3 font-mono text-slate-500">{appt.customerPhone}</td>
                        <td className="p-3 font-medium text-slate-800">{appt.serviceName}</td>
                        <td className="p-3 text-slate-700 font-semibold">{appt.staffName}</td>
                        <td className="p-3 text-center">
                          <span className="font-bold text-slate-800">{appt.time}</span>
                          <span className="text-[10px] text-slate-400 block">{appt.date}</span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700">1</td>
                        <td className="p-3">
                          <span className="text-[11px] text-slate-600 font-medium px-2 py-0.5 bg-slate-100 rounded-md">
                            {src}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => handleOpenDetail(appt)}
                              title="Xem chi tiết"
                              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {appt.status === 'booked' && (
                              <button
                                onClick={() => handleQuickConfirm(appt.id)}
                                title="Xác nhận lịch"
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              >
                                <Check className="w-3.5 h-3.5" />
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

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <span>Hiển thị 1 - {filteredAppts.length} trong tổng số {appointments.length} lịch hẹn</span>
            <div className="flex items-center space-x-1">
              <button className="px-2.5 py-1 bg-rose-500 text-white font-bold rounded-lg shadow-xs">1</button>
              <button className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">2</button>
              <button className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">3</button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Today Summary, Peak Hours & Operations Notes */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card 1: Lịch Hẹn Hôm Nay */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Lịch Hẹn Hôm Nay</h3>
              <button className="text-[11px] text-rose-600 font-semibold hover:underline">Xem tất cả</button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Tổng số lịch:</span>
                <b className="text-slate-900">{todayCount} lịch</b>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-emerald-600 font-semibold">Đã xác nhận:</span>
                <b className="text-emerald-700">{Math.round(todayCount * 0.75)}</b>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-amber-600 font-semibold">Chờ xác nhận:</span>
                <b className="text-amber-700">{Math.max(1, Math.round(todayCount * 0.2))}</b>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-rose-600 font-semibold">Hủy:</span>
                <b className="text-rose-700">{cancelledCount > 0 ? cancelledCount : 0}</b>
              </div>
            </div>
          </div>

          {/* Card 2: Khung Giờ Đông Nhất */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Khung Giờ Đông Nhất</h3>
              <span className="text-[11px] text-slate-400 font-semibold">Hôm nay</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { time: '09:00 - 10:00', count: 8, pct: 100 },
                { time: '10:00 - 11:00', count: 7, pct: 88 },
                { time: '14:00 - 15:00', count: 6, pct: 75 },
                { time: '11:00 - 12:00', count: 5, pct: 62 },
                { time: '15:00 - 16:00', count: 4, pct: 50 }
              ].map((slot, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-bold text-slate-700">{slot.time}</span>
                    <span className="font-bold text-rose-600">{slot.count} khách</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${slot.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Ghi Chú Vận Hành */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Ghi Chú Vận Hành</h3>
              <button className="text-[11px] text-rose-600 font-semibold hover:underline">+ Thêm mới</button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Kiểm tra tồn kho mỹ phẩm & vật tư</h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-md">Quan trọng</span>
                </div>
                <p className="text-[10px] text-slate-500">Hạn chót: 21/05/2025 09:00</p>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Họp đội ngũ KTV đầu tuần</h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded-md">Hoàn thành</span>
                </div>
                <p className="text-[10px] text-slate-500">Hạn chót: 20/05/2025 08:30</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Detail Modal */}
      <AppointmentDetailModal
        appt={selectedAppt}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdateStatus={updateApptStatus}
      />
    </div>
  );
};
