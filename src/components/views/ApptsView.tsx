import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Check,
  Sparkles,
  RotateCcw,
  User,
  Phone,
  BarChart3,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppointmentDetailModal } from '../modals/AppointmentDetailModal';
import type { Appointment } from '../../types';

export const ApptsView: React.FC<{ onOpenNewAppt: () => void }> = ({ onOpenNewAppt }) => {
  const { appointments, currentBranch, updateApptStatus, staffList, showToast, currentTheme } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [isFilterAllDates, setIsFilterAllDates] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [showSecondaryStats, setShowSecondaryStats] = useState(true);

  // Selected appointment for detail modal
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Check if any filter is active
  const isFiltered =
    searchTerm.trim() !== '' ||
    isFilterAllDates ||
    selectedDate !== todayStr ||
    filterStatus !== 'all' ||
    filterStaff !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedDate(todayStr);
    setIsFilterAllDates(false);
    setFilterStatus('all');
    setFilterStaff('all');
    setCurrentPage(1);
  };

  // Branch appointments & calculations
  const branchAppts = useMemo(() => {
    return appointments.filter((a) => !currentBranch?.id || a.branchId === currentBranch.id || !a.branchId);
  }, [appointments, currentBranch]);

  const todayBranchAppts = useMemo(() => {
    return branchAppts.filter((a) => a.date === todayStr || !a.date);
  }, [branchAppts, todayStr]);

  // Dynamic filter
  const filteredAppts = useMemo(() => {
    return branchAppts.filter((a) => {
      const matchDate = isFilterAllDates || !selectedDate || a.date === selectedDate;
      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'pending' && (a.status === 'booked' || (a.status as string) === 'pending')) ||
        (filterStatus === 'confirmed' && a.status === 'confirmed') ||
        (filterStatus === 'in_progress' && a.status === 'in_progress') ||
        (filterStatus === 'done' && (a.status === 'done' || (a.status as string) === 'completed')) ||
        (filterStatus === 'cancelled' && a.status === 'cancelled');
      const matchStaff = filterStaff === 'all' || (a.staffName && a.staffName.toLowerCase().includes(filterStaff.toLowerCase()));
      const matchSearch =
        searchTerm.trim() === '' ||
        (a.customerName && a.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (a.customerPhone && a.customerPhone.includes(searchTerm)) ||
        (a.id && a.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (a.serviceName && a.serviceName.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchDate && matchStatus && matchStaff && matchSearch;
    });
  }, [branchAppts, isFilterAllDates, selectedDate, filterStatus, filterStaff, searchTerm]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredAppts.length / pageSize));
  const paginatedAppts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAppts.slice(start, start + pageSize);
  }, [filteredAppts, currentPage, pageSize]);

  // KPI Calculations based on branch
  const pendingCount = branchAppts.filter((a) => a.status === 'booked' || (a.status as string) === 'pending').length;
  const confirmedCount = branchAppts.filter((a) => a.status === 'confirmed' || a.status === 'in_progress').length;
  const doneCount = branchAppts.filter((a) => a.status === 'done' || (a.status as string) === 'completed').length;
  const cancelledCount = branchAppts.filter((a) => a.status === 'cancelled').length;
  const todayCount = todayBranchAppts.length;

  const todayConfirmed = todayBranchAppts.filter((a) => a.status === 'confirmed' || a.status === 'in_progress').length;
  const todayPending = todayBranchAppts.filter((a) => a.status === 'booked' || (a.status as string) === 'pending').length;
  const todayDone = todayBranchAppts.filter((a) => a.status === 'done' || (a.status as string) === 'completed').length;
  const todayCancelled = todayBranchAppts.filter((a) => a.status === 'cancelled').length;

  const isSoftLight = currentTheme.isSoftLight;

  const hourlyDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      '09:00 - 10:00': 0,
      '10:00 - 11:00': 0,
      '11:00 - 12:00': 0,
      '14:00 - 15:00': 0,
      '15:00 - 16:00': 0
    };
    branchAppts.forEach((a) => {
      const hour = parseInt(a.time?.split(':')[0] || '0', 10);
      if (hour >= 9 && hour < 10) counts['09:00 - 10:00']++;
      else if (hour >= 10 && hour < 11) counts['10:00 - 11:00']++;
      else if (hour >= 11 && hour < 12) counts['11:00 - 12:00']++;
      else if (hour >= 14 && hour < 15) counts['14:00 - 15:00']++;
      else if (hour >= 15 && hour < 16) counts['15:00 - 16:00']++;
    });
    const max = Math.max(1, ...Object.values(counts));
    return Object.entries(counts).map(([time, count]) => ({
      time,
      count,
      pct: count > 0 ? Math.round((count / max) * 100) : 0
    }));
  }, [branchAppts]);

  const handleOpenDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setIsDetailModalOpen(true);
  };

  const handleQuickConfirm = (apptId: string) => {
    updateApptStatus(apptId, 'confirmed');
    showToast('✅ Đã xác nhận lịch hẹn thành công', 'success');
  };

  const statusBadges: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    booked: { label: 'Chờ xác nhận', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500' },
    pending: { label: 'Chờ xác nhận', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500' },
    confirmed: { label: 'Đã xác nhận', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500' },
    in_progress: { label: 'Đang làm', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800', dot: 'bg-sky-500' },
    done: { label: 'Hoàn thành', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-800', dot: 'bg-teal-500' },
    completed: { label: 'Hoàn thành', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-800', dot: 'bg-teal-500' },
    cancelled: { label: 'Đã hủy', bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12 w-full max-w-full">
      {/* 1. Header Title & Main Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">📅</span>
            <h1 className={`text-xl md:text-2xl font-black tracking-tight ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-900'}`}>
              Quản Lý Lịch Hẹn
            </h1>
          </div>
          <p className={`text-xs mt-0.5 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
            Tiếp đón khách hàng, theo dõi trạng thái ca làm và phân bổ kỹ thuật viên • Chi nhánh: <b>{currentBranch?.name || 'Toàn hệ thống'}</b>
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowSecondaryStats(!showSecondaryStats)}
            className={`text-xs font-semibold px-3 py-2.5 rounded-xl border flex items-center space-x-1.5 transition-all cursor-pointer ${
              isSoftLight
                ? 'bg-white hover:bg-[#FFF1F5] text-[#244B3C] border-[#E5E7E4]'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">{showSecondaryStats ? 'Thu gọn thống kê' : 'Mở rộng thống kê'}</span>
            {showSecondaryStats ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          <button
            onClick={onOpenNewAppt}
            className="text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer hover:opacity-90 active:scale-95 shadow-xs"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Lịch Hẹn</span>
          </button>
        </div>
      </div>

      {/* 2. Top 5 KPI Summary Cards (Aligned & Responsive) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* KPI 1: Chờ xác nhận */}
        <div
          onClick={() => {
            setFilterStatus('pending');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl bg-white border cursor-pointer transition-all ${
            filterStatus === 'pending'
              ? 'ring-2 border-amber-400 ring-amber-200 shadow-sm'
              : isSoftLight ? 'border-[#E5E7E4] hover:border-amber-300' : 'border-slate-200 hover:border-amber-300'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              Chờ xác nhận
            </span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{pendingCount}</p>
          <span className={`text-[10px] font-medium mt-0.5 block ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
            Toàn chi nhánh
          </span>
        </div>

        {/* KPI 2: Đã xác nhận */}
        <div
          onClick={() => {
            setFilterStatus('confirmed');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl bg-white border cursor-pointer transition-all ${
            filterStatus === 'confirmed'
              ? 'ring-2 border-emerald-400 ring-emerald-200 shadow-sm'
              : isSoftLight ? 'border-[#E5E7E4] hover:border-emerald-300' : 'border-slate-200 hover:border-emerald-300'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              Đã xác nhận
            </span>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{confirmedCount}</p>
          <span className={`text-[10px] font-medium mt-0.5 block ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
            Sẵn sàng phục vụ
          </span>
        </div>

        {/* KPI 3: Hoàn thành */}
        <div
          onClick={() => {
            setFilterStatus('done');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl bg-white border cursor-pointer transition-all ${
            filterStatus === 'done'
              ? 'ring-2 border-sky-400 ring-sky-200 shadow-sm'
              : isSoftLight ? 'border-[#E5E7E4] hover:border-sky-300' : 'border-slate-200 hover:border-sky-300'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              Hoàn thành
            </span>
            <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-600 mt-2">{doneCount}</p>
          <span className={`text-[10px] font-medium mt-0.5 block ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
            Đã kết thúc ca
          </span>
        </div>

        {/* KPI 4: Hủy */}
        <div
          onClick={() => {
            setFilterStatus('cancelled');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl bg-white border cursor-pointer transition-all ${
            filterStatus === 'cancelled'
              ? 'ring-2 border-slate-400 ring-slate-200 shadow-sm'
              : isSoftLight ? 'border-[#E5E7E4] hover:border-slate-300' : 'border-slate-200 hover:border-slate-300'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              Hủy
            </span>
            <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-2xl font-black mt-2 ${cancelledCount > 0 ? 'text-rose-600' : isSoftLight ? 'text-[#244B3C]' : 'text-slate-700'}`}>
            {cancelledCount}
          </p>
          <span className={`text-[10px] font-medium mt-0.5 block ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
            Lịch đã báo hủy
          </span>
        </div>

        {/* KPI 5: Hôm nay (Scope badge) */}
        <div
          onClick={() => {
            setIsFilterAllDates(false);
            setSelectedDate(todayStr);
            setFilterStatus('all');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl cursor-pointer transition-all border col-span-2 sm:col-span-1 ${
            !isFilterAllDates && selectedDate === todayStr && filterStatus === 'all'
              ? 'ring-2 ring-[#B83D62] shadow-sm'
              : ''
          } ${
            isSoftLight
              ? 'bg-[#FFF1F5] border-[#E5E7E4]'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-200'}`}>
              Hôm nay
            </span>
            <CalendarIcon className="w-4 h-4" style={{ color: isSoftLight ? currentTheme.primaryColor : '#ffffff' }} />
          </div>
          <p className="text-2xl font-black mt-2" style={{ color: isSoftLight ? currentTheme.primaryColor : '#ffffff' }}>
            {todayCount}
          </p>
          <span className={`text-[10px] font-medium mt-0.5 block ${isSoftLight ? 'text-[#59665F]' : 'text-slate-300'}`}>
            Ngày {todayStr}
          </span>
        </div>
      </div>

      {/* 3. Main Data Workspace: Full-width Table Card */}
      <div
        className={`bg-white rounded-2xl p-4 sm:p-5 border space-y-4 transition-shadow ${
          isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
        }`}
        style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
      >
        {/* Filter Toolbar (Flexible, responsive, uniform height) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm mã lịch, khách hàng, số điện thoại, dịch vụ..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-10 pl-9 pr-3 border rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F] focus:ring-[#B83D62]'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
              }`}
            />
          </div>

          {/* Date Picker + All Dates Toggle */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <input
              type="date"
              value={selectedDate}
              disabled={isFilterAllDates}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setCurrentPage(1);
              }}
              className={`h-10 px-3 border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              } ${isFilterAllDates ? 'opacity-40 cursor-not-allowed' : ''}`}
            />
            <button
              onClick={() => {
                setIsFilterAllDates(!isFilterAllDates);
                setCurrentPage(1);
              }}
              className={`h-10 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isFilterAllDates
                  ? 'bg-[#B83D62] text-white border-[#B83D62]'
                  : isSoftLight
                  ? 'bg-white hover:bg-[#FFF1F5] text-[#59665F] border-[#E5E7E4]'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Tất cả ngày
            </button>
          </div>

          {/* Status Dropdown */}
          <div className="shrink-0 min-w-[140px]">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-10 px-3 border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <option value="all">Trạng thái: Tất cả</option>
              <option value="pending">Chờ xác nhận</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="in_progress">Đang phục vụ</option>
              <option value="done">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>

          {/* Staff Dropdown */}
          <div className="shrink-0 min-w-[130px]">
            <select
              value={filterStaff}
              onChange={(e) => {
                setFilterStaff(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-10 px-3 border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <option value="all">KTV: Tất cả</option>
              {staffList.map((st) => (
                <option key={st.id} value={st.name}>{st.name}</option>
              ))}
            </select>
          </div>

          {/* Reset Filter Button */}
          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className={`h-10 px-3 rounded-xl text-xs font-bold border flex items-center space-x-1.5 transition-all cursor-pointer ${
                isSoftLight
                  ? 'bg-rose-50 hover:bg-rose-100 text-[#B83D62] border-rose-200'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>

        {/* Appointments Table Container */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs border-collapse min-w-[840px]">
            <thead>
              <tr className={`border-b font-bold ${
                isSoftLight
                  ? 'bg-[#FFF1F5]/70 border-[#E5E7E4] text-[#244B3C]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <th className="py-3 px-3.5 w-24">Mã Lịch</th>
                <th className="py-3 px-3.5 w-32 text-center">Giờ & Ngày</th>
                <th className="py-3 px-3.5">Khách Hàng</th>
                <th className="py-3 px-3.5">Dịch Vụ</th>
                <th className="py-3 px-3.5">KTV Phụ Trách</th>
                <th className="py-3 px-3.5 text-center w-28">Nguồn Đặt</th>
                <th className="py-3 px-3.5 text-center w-32">Trạng Thái</th>
                <th className="py-3 px-3.5 text-center w-28">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {paginatedAppts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                        <CalendarIcon className="w-6 h-6" />
                      </div>
                      <p className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}`}>
                        Không tìm thấy lịch hẹn nào
                      </p>
                      <p className={`text-xs ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
                        Không có lịch hẹn khớp với bộ lọc ngày, trạng thái hoặc từ khóa hiện tại.
                      </p>
                      {isFiltered && (
                        <button
                          onClick={handleResetFilters}
                          className="text-xs font-bold px-3.5 py-1.5 rounded-lg border border-[#E5E7E4] text-[#B83D62] hover:bg-[#FFF1F5] transition-all cursor-pointer"
                        >
                          Xóa bộ lọc tìm kiếm
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedAppts.map((appt, idx) => {
                  const badge = statusBadges[appt.status] || statusBadges.booked;
                  const code = `SP${appt.date.replace(/-/g, '').slice(2)}-${String(idx + 1 + (currentPage - 1) * pageSize).padStart(3, '0')}`;
                  const sources = ['Website', 'Facebook', 'Zalo OA', 'Hotline', 'Khách vãng lai'];
                  const src = sources[idx % sources.length];

                  return (
                    <tr
                      key={appt.id}
                      className={`transition-colors ${
                        isSoftLight ? 'hover:bg-[#FFF1F5]/40' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Mã Lịch */}
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-700 text-[11px]">
                        {code}
                      </td>

                      {/* Giờ & Ngày */}
                      <td className="py-3 px-3.5 text-center">
                        <span className={`font-bold text-xs ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}`}>
                          {appt.time}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-medium">
                          {appt.date}
                        </span>
                      </td>

                      {/* Khách Hàng */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center space-x-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSoftLight ? 'bg-[#FFF1F5] text-[#B83D62]' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {appt.customerName ? appt.customerName.charAt(0) : 'K'}
                          </div>
                          <div>
                            <p className={`font-bold ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
                              {appt.customerName}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 flex items-center">
                              <Phone className="w-2.5 h-2.5 mr-1 text-slate-400" />
                              {appt.customerPhone}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Dịch Vụ */}
                      <td className="py-3 px-3.5">
                        <span className={`font-medium ${isSoftLight ? 'text-[#26342F]' : 'text-slate-800'}`}>
                          {appt.serviceName}
                        </span>
                      </td>

                      {/* KTV Phụ Trách */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center space-x-1.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-700 font-semibold">{appt.staffName || 'Chưa phân công'}</span>
                        </div>
                      </td>

                      {/* Nguồn Đặt */}
                      <td className="py-3 px-3.5 text-center">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                          isSoftLight ? 'bg-[#FAFAF8] text-[#59665F] border-[#E5E7E4]' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {src}
                        </span>
                      </td>

                      {/* Trạng Thái */}
                      <td className="py-3 px-3.5 text-center">
                        <span className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${badge.bg} ${badge.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Thao Tác */}
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleOpenDetail(appt)}
                            title="Xem chi tiết lịch"
                            className="p-1.5 text-slate-500 hover:text-[#B83D62] hover:bg-[#FFF1F5] rounded-lg transition-all cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {(appt.status === 'booked' || (appt.status as string) === 'pending') && (
                            <button
                              onClick={() => handleQuickConfirm(appt.id)}
                              title="Xác nhận nhanh"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
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

        {/* Pagination & Status Counter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-2 font-sans">
          <span>
            {filteredAppts.length === 0
              ? 'Hiển thị 0 trong tổng số 0 lịch hẹn'
              : `Hiển thị ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredAppts.length)} trong tổng số ${filteredAppts.length} lịch hẹn`}
          </span>

          {filteredAppts.length > 0 && totalPages > 1 && (
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`w-7 h-7 font-bold rounded-lg transition-all ${
                    currentPage === pg
                      ? 'text-white'
                      : isSoftLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-[#FFF1F5]'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={currentPage === pg ? { backgroundColor: currentTheme.buttonBg } : undefined}
                >
                  {pg}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Secondary Operations & Analytics (Placed below table to ensure 100% table workspace) */}
      {showSecondaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Card 1: Lịch Hẹn Hôm Nay */}
          <div
            className={`bg-white rounded-2xl p-5 border space-y-3.5 ${
              isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
            }`}
            style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
          >
            <div className="flex items-center justify-between">
              <h3 className={`font-bold text-xs uppercase tracking-wider ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
                Tóm Tắt Hôm Nay ({todayStr})
              </h3>
              <span className={`text-[11px] font-semibold ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>
                Chi nhánh hiện tại
              </span>
            </div>

            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className={isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}>Tổng số lịch hôm nay:</span>
                <b className={isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}>{todayCount} lịch</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-emerald-600 font-semibold">Đã xác nhận / Đang làm:</span>
                <b className="text-emerald-700">{todayConfirmed}</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-amber-600 font-semibold">Chờ xác nhận:</span>
                <b className="text-amber-700">{todayPending}</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-teal-600 font-semibold">Hoàn thành:</span>
                <b className="text-teal-700">{todayDone}</b>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-rose-600 font-semibold">Hủy:</span>
                <b className="text-rose-700">{todayCancelled}</b>
              </div>
            </div>
          </div>

          {/* Card 2: Khung Giờ Đặt Hẹn Phổ Biến */}
          <div
            className={`bg-white rounded-2xl p-5 border space-y-3.5 ${
              isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
            }`}
            style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
          >
            <div className="flex items-center justify-between">
              <h3 className={`font-bold text-xs uppercase tracking-wider ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
                Khung Giờ Đặt Hẹn
              </h3>
              <span className={`text-[11px] font-semibold ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>
                Toàn chi nhánh ({branchAppts.length} lịch)
              </span>
            </div>

            <div className="space-y-2.5 text-xs font-sans">
              {hourlyDistribution.map((slot, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className={`font-semibold ${isSoftLight ? 'text-[#26342F]' : 'text-slate-700'}`}>{slot.time}</span>
                    <span className="font-bold" style={{ color: currentTheme.primaryColor }}>{slot.count} khách</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${slot.pct}%`,
                        backgroundColor: currentTheme.primaryColor
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Ghi Chú Vận Hành */}
          <div
            className={`bg-white rounded-2xl p-5 border space-y-3.5 ${
              isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
            }`}
            style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
          >
            <div className="flex items-center justify-between">
              <h3 className={`font-bold text-xs uppercase tracking-wider ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
                Ghi Chú Vận Hành
              </h3>
              <button
                onClick={() => showToast('Đã thêm ghi chú vận hành mới', 'info')}
                className="text-[11px] font-bold hover:underline cursor-pointer"
                style={{ color: currentTheme.primaryColor }}
              >
                + Thêm mới
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-sans">
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Kiểm tra tồn kho mỹ phẩm & vật tư</h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded-md">Quan trọng</span>
                </div>
                <p className="text-[10px] text-slate-500">Hạn chót: 21/05/2025 09:00</p>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Họp đội ngũ KTV đầu tuần</h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-200 text-emerald-900 rounded-md">Hoàn thành</span>
                </div>
                <p className="text-[10px] text-slate-500">Hạn chót: 20/05/2025 08:30</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
