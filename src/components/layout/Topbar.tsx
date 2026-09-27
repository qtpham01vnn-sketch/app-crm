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
    pos: 'Thu Ngân & Bán Hàng POS',
    appts: 'Quản Lý Lịch Hẹn',
    book: 'Đặt Chỗ & Tiếp Nhận Nhanh',
    wait: 'Hàng Đợi Khách Chờ (Walk-in)',
    cust: 'Hồ Sơ Khách Hàng',
    courses: 'Quản Lý Gói Liệu Trình',
    staff: 'Danh Sách Nhân Sự',
    roster: 'Bảng Phân Ca Làm Việc',
    times: 'Chấm Công & Thời Gian',
    comm: 'Bảng Tính Hoa Hồng',
    payroll: 'Bảng Lương Nhân Viên',
    prod: 'Danh Mục Sản Phẩm & Tồn Kho',
    svc: 'Danh Mục Dịch Vụ & Bảng Giá Chi Nhánh',
    pkg: 'Combo Gói Dịch Vụ',
    inv: 'Kiểm Kê & Điều Chỉnh Kho',
    supp: 'Danh Bạ Nhà Cung Cấp',
    po: 'Nhập Hàng (PO - GRN - AP)',
    exp: 'Sổ Quỹ & Chi Phí Vận Hành',
    promos: 'Chương Trình Khuyến Mãi',
    reports: 'Trung Tâm Báo Cáo Tài Chính'
  };

  const roleDisplayNames: Record<UserRole, string> = {
    owner_admin: 'Chủ cơ sở (Admin)',
    branch_manager: 'Quản lý CN',
    cashier_receptionist: 'Lễ tân / Thu ngân',
    technician_doctor: 'Bác sĩ / KTV'
  };

  return (
    <header
      className="h-16 bg-white border-b border-slate-200/90 px-3 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs transition-colors duration-300"
      style={{ borderTop: `3px solid ${currentTheme.primaryColor}` }}
    >
      {/* Left: Mobile Menu + Active Title */}
      <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2">
          <h2 className="text-sm sm:text-base md:text-lg font-black text-slate-800 tracking-tight whitespace-nowrap">
            {tabTitles[activeTab] || 'VUA APP CRM'}
          </h2>
          <span
            className="hidden xl:inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all"
            style={{
              backgroundColor: currentTheme.badgeBg,
              color: currentTheme.primaryColor,
              borderColor: currentTheme.primaryColor
            }}
          >
            <Sparkles className="w-3 h-3 mr-1" /> P1
          </span>
        </div>
      </div>

      {/* Middle: 10 Instant Theme Swatches (Click to change immediately) */}
      <div className="hidden lg:flex items-center bg-slate-100/90 hover:bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shadow-xs space-x-1.5 transition-all">
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

      {/* Search Input on wide screens */}
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

      {/* Right Controls: Branch Switcher + Role Switcher + Profile */}
      <div className="flex items-center space-x-1.5 md:space-x-2.5">
        {/* Mobile/Tablet Theme Button */}
        <button
          onClick={() => setIsThemeModalOpen(true)}
          className="lg:hidden flex items-center space-x-1 bg-slate-100 border border-slate-200 rounded-xl px-2 py-1 text-xs font-bold text-slate-800 shadow-xs cursor-pointer"
          title="Bấm để đổi trong bộ sưu tập 10 giao diện"
        >
          <div
            className="w-3.5 h-3.5 rounded-full shadow-xs shrink-0"
            style={{ backgroundColor: currentTheme.previewColor }}
          />
          <Palette className="w-3.5 h-3.5 text-pink-600 shrink-0" />
          <span className="text-[10px] font-black">10 Theme</span>
        </button>

        {/* Branch Switcher */}
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

        {/* Role Switcher (RBAC Tester) */}
        <div className="hidden sm:flex items-center space-x-1 bg-amber-50 border border-amber-200/80 rounded-xl px-2 py-1">
          <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <select
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value as UserRole)}
            className="bg-transparent text-xs font-semibold text-amber-900 focus:outline-none cursor-pointer pr-1"
            title="Chuyển vai trò để xem giao diện và quyền hạn khác nhau"
          >
            <option value="owner_admin">👑 Chủ Admin</option>
            <option value="branch_manager">👔 Quản Lý CN</option>
            <option value="cashier_receptionist">💼 Lễ Tân/Thu Ngân</option>
            <option value="technician_doctor">🩺 Bác Sĩ/KTV</option>
          </select>
        </div>

        {/* Staff Pill */}
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
          <div
            className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-sm transition-all"
            style={{ background: currentTheme.heroGradient }}
          >
            {currentUser.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="hidden 2xl:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-tight">{currentUser.name}</p>
            <p className="text-[10px] text-slate-500">{roleDisplayNames[currentRole]}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
