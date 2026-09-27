import React from 'react';
import {
  Menu,
  Search,
  MapPin,
  Shield,
  Palette,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { APP_THEMES } from '../../mock/themes';
import type { UserRole } from '../../types';

export const Topbar: React.FC<{ onOpenMobileMenu: () => void }> = ({ onOpenMobileMenu }) => {
  const {
    currentBranch,
    setCurrentBranch,
    branches,
    currentRole,
    setCurrentRole,
    currentUser,
    currentTheme,
    setCurrentTheme,
    setIsThemeModalOpen,
    searchQuery,
    setSearchQuery,
    activeTab,
    showToast
  } = useApp();

  const tabTitles: Record<string, string> = {
    home: 'Tổng Quan Hoạt Động',
    pos: 'Thu Ngân POS',
    appts: 'Quản Lý Lịch Hẹn',
    book: 'Đặt Chỗ Nhanh',
    wait: 'Hàng Đợi Chờ',
    cust: 'Hồ Sơ Khách Hàng',
    courses: 'Gói Liệu Trình',
    staff: 'Danh Sách Nhân Sự',
    roster: 'Phân Ca Làm Việc',
    times: 'Chấm Công',
    comm: 'Tính Hoa Hồng',
    payroll: 'Bảng Lương',
    prod: 'Sản Phẩm & Tồn Kho',
    svc: 'Dịch Vụ & Bảng Giá',
    pkg: 'Combo Dịch Vụ',
    inv: 'Kiểm Kê Kho',
    supp: 'Nhà Cung Cấp',
    po: 'Nhập Hàng (PO)',
    exp: 'Sổ Quỹ & Chi Phí',
    promos: 'Khuyến Mãi',
    reports: 'Báo Cáo Doanh Thu'
  };

  const roleDisplayNames: Record<UserRole, string> = {
    owner_admin: 'Chủ Admin',
    branch_manager: 'Quản Lý CN',
    cashier_receptionist: 'Lễ Tân/Thu Ngân',
    technician_doctor: 'Bác Sĩ/KTV'
  };

  return (
    <div className="sticky top-0 z-30 flex flex-col bg-white shadow-xs w-full max-w-full overflow-hidden">
      {/* Main Header Bar */}
      <header
        className="h-14 md:h-16 border-b border-slate-200/90 px-3 md:px-6 flex items-center justify-between transition-colors duration-300 w-full"
        style={{ borderTop: `3px solid ${currentTheme.primaryColor}` }}
      >
        {/* Left: Mobile Menu + Active Title */}
        <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none cursor-pointer shrink-0"
            aria-label="Mở menu điều hướng"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-1.5 min-w-0 truncate">
            <h2 className="text-sm sm:text-base md:text-lg font-black text-slate-800 tracking-tight truncate">
              {tabTitles[activeTab] || 'VUA APP CRM'}
            </h2>
            <span
              className="hidden sm:inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 transition-all"
              style={{
                backgroundColor: currentTheme.badgeBg,
                color: currentTheme.primaryColor,
                borderColor: currentTheme.primaryColor
              }}
            >
              <Sparkles className="w-3 h-3 mr-0.5" /> P2
            </span>
          </div>
        </div>

        {/* Center Desktop: 10 Instant Theme Swatches */}
        <div className="hidden lg:flex items-center bg-slate-100/90 hover:bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shadow-xs space-x-1.5 transition-all shrink-0">
          <div className="flex items-center px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 gap-1">
            <Palette className="w-3.5 h-3.5" style={{ color: currentTheme.primaryColor }} />
            <span>10 Theme:</span>
          </div>
          <div className="flex items-center space-x-1.5">
            {APP_THEMES.map((th) => {
              const isSelected = currentTheme.id === th.id;
              return (
                <button
                  key={th.id}
                  onClick={() => {
                    setCurrentTheme(th);
                    showToast(`🎨 Chuyển sang: ${th.name}`, 'info');
                  }}
                  className={`w-6 h-6 rounded-full transition-all duration-200 transform cursor-pointer flex items-center justify-center ${
                    isSelected ? 'scale-125 ring-2 ring-offset-1 shadow-md z-10' : 'hover:scale-115 opacity-85 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: th.previewColor,
                    boxShadow: isSelected ? `0 0 0 2px #ffffff, 0 0 0 4px ${th.primaryColor}` : undefined
                  }}
                  title={`${th.name} (${th.primaryColor}) - Bấm chuyển ngay lập tức`}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="ml-1 text-[10px] font-bold text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded hover:bg-slate-200/70 cursor-pointer transition-colors"
            title="Xem danh sách chi tiết 10 Theme"
          >
            Chi tiết ▾
          </button>
        </div>

        {/* Center Search on Ultra Wide */}
        <div className="hidden 2xl:flex items-center max-w-xs w-full mx-2">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nhanh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-1 transition-all"
            />
          </div>
        </div>

        {/* Right Desktop/Tablet Controls */}
        <div className="hidden md:flex items-center space-x-2 shrink-0">
          {/* Branch Switcher Desktop */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1">
            <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <select
              value={currentBranch.id}
              onChange={(e) => {
                const selected = branches.find((b) => b.id === e.target.value);
                if (selected) setCurrentBranch(selected);
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer pr-1"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} - {b.name.replace('Chi Nhánh ', '')}
                </option>
              ))}
            </select>
          </div>

          {/* Role Switcher Desktop */}
          <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200/80 rounded-xl px-2 py-1">
            <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <select
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value as UserRole)}
              className="bg-transparent text-xs font-semibold text-amber-900 focus:outline-none cursor-pointer pr-1"
              title="Chuyển vai trò thử nghiệm RBAC"
            >
              <option value="owner_admin">👑 Chủ Admin</option>
              <option value="branch_manager">👔 Quản Lý CN</option>
              <option value="cashier_receptionist">💼 Lễ Tân/Thu Ngân</option>
              <option value="technician_doctor">🩺 Bác Sĩ/KTV</option>
            </select>
          </div>

          {/* Staff Pill Desktop */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <div
              className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0"
              style={{ background: currentTheme.heroGradient }}
            >
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[120px]">{currentUser.name}</p>
              <p className="text-[10px] text-slate-500">{roleDisplayNames[currentRole]}</p>
            </div>
          </div>
        </div>

        {/* Mobile Right: Theme trigger + Staff Avatar */}
        <div className="md:hidden flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="flex items-center space-x-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 cursor-pointer active:scale-95"
            title="Đổi giao diện Theme"
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs inline-block shrink-0"
              style={{ backgroundColor: currentTheme.previewColor }}
            />
            <span className="text-[11px] font-semibold text-slate-700">Theme</span>
          </button>
          <div
            className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[11px] shadow-sm shrink-0"
            style={{ background: currentTheme.heroGradient }}
            title={`${currentUser.name} (${roleDisplayNames[currentRole]})`}
          >
            {currentUser.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Mobile Sub-Toolbar: Dedicated row on phones (< 768px) with 0 cut-off */}
      <div className="md:hidden px-3 py-1.5 bg-slate-50 border-b border-slate-200/90 flex items-center justify-between gap-2 text-xs w-full box-border">
        {/* Branch Selector Mobile */}
        <div className="flex-1 min-w-0 flex items-center space-x-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
          <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <select
            value={currentBranch.id}
            onChange={(e) => {
              const selected = branches.find((b) => b.id === e.target.value);
              if (selected) setCurrentBranch(selected);
            }}
            className="w-full bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer truncate"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} - {b.name.replace('Chi Nhánh ', '')}
              </option>
            ))}
          </select>
        </div>

        {/* Role Selector Mobile */}
        <div className="flex items-center space-x-1 bg-amber-50/90 border border-amber-200 rounded-lg px-2 py-1 shadow-2xs shrink-0">
          <Shield className="w-3 h-3 text-amber-600 shrink-0" />
          <select
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value as UserRole)}
            className="bg-transparent text-[11px] font-semibold text-amber-900 focus:outline-none cursor-pointer"
          >
            <option value="owner_admin">👑 Chủ</option>
            <option value="branch_manager">👔 QL</option>
            <option value="cashier_receptionist">💼 Lễ tân</option>
            <option value="technician_doctor">🩺 Bác sĩ</option>
          </select>
        </div>
      </div>
    </div>
  );
};
