import React from 'react';
import {
  Menu,
  Search,
  MapPin,
  Palette,
  Sparkles,
  LogOut,
  User
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
    currentUser,
    currentTheme,
    setCurrentTheme,
    setIsThemeModalOpen,
    searchQuery,
    setSearchQuery,
    activeTab,
    showToast,
    handleLogout,
    authSession,
    isLiveMode
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

  const displayName = isLiveMode
    ? (authSession?.staffName || authSession?.email || 'Người dùng')
    : (currentUser?.name || 'Demo');

  const displayRole = roleDisplayNames[currentRole] || currentRole;

  const isSoftLight = currentTheme.isSoftLight;

  return (
    <div
      className={`sticky top-0 z-30 flex flex-col shadow-xs w-full max-w-full overflow-hidden transition-colors duration-300 ${
        isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/90'
      }`}
    >
      {/* Main Header Bar */}
      <header
        className={`h-14 md:h-16 border-b px-3 md:px-6 flex items-center justify-between transition-colors duration-300 w-full ${
          isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/90'
        }`}
        style={{ borderTop: `3px solid ${currentTheme.primaryColor}` }}
      >
        {/* Left: Mobile Menu + Active Title */}
        <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1">
          <button
            onClick={onOpenMobileMenu}
            className={`lg:hidden p-1.5 -ml-1 rounded-lg focus:outline-none cursor-pointer shrink-0 ${
              isSoftLight ? 'text-[#59665F] hover:bg-[#FFF1F5]' : 'text-slate-600 hover:bg-slate-100'
            }`}
            aria-label="Mở menu điều hướng"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-1.5 min-w-0 truncate">
            <h2
              className={`text-sm sm:text-base md:text-lg font-black tracking-tight truncate ${
                isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'
              }`}
            >
              {tabTitles[activeTab] || 'PHUONG NAM CRM'}
            </h2>
            <span
              className="hidden sm:inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 transition-all"
              style={{
                backgroundColor: currentTheme.badgeBg,
                color: currentTheme.primaryColor,
                borderColor: isSoftLight ? '#E5E7E4' : currentTheme.primaryColor
              }}
            >
              <Sparkles className="w-3 h-3 mr-0.5" /> {isLiveMode ? 'Live' : 'Demo'}
            </span>
          </div>
        </div>

        {/* Center Desktop: Swatches on XL+, Compact Button on LG */}
        <div className="hidden xl:flex items-center p-1.5 rounded-2xl border shadow-xs space-x-1.5 transition-all shrink-0"
          style={{
            backgroundColor: isSoftLight ? '#FAFAF8' : '#f1f5f9',
            borderColor: isSoftLight ? '#E5E7E4' : '#e2e8f0'
          }}
        >
          <div className="flex items-center px-1.5 text-[10px] font-extrabold uppercase tracking-wider gap-1">
            <Palette className="w-3.5 h-3.5" style={{ color: currentTheme.primaryColor }} />
            <span className={isSoftLight ? 'text-[#59665F]' : 'text-slate-600'}>Theme:</span>
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
                  className={`w-5.5 h-5.5 rounded-full transition-all duration-200 transform cursor-pointer flex items-center justify-center ${
                    isSelected ? 'scale-125 ring-2 ring-offset-1 shadow-xs z-10' : 'hover:scale-115 opacity-85 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: th.previewColor,
                    boxShadow: isSelected ? `0 0 0 2px #ffffff, 0 0 0 3px ${th.primaryColor}` : undefined
                  }}
                  title={`${th.name}`}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors"
            style={{
              color: isSoftLight ? '#59665F' : '#475569',
              backgroundColor: isSoftLight ? '#FFF1F5' : '#e2e8f0'
            }}
            title="Xem danh sách chi tiết Theme"
          >
            {APP_THEMES.length} Theme ▾
          </button>
        </div>

        {/* Medium Desktop (LG only) Compact Theme Switcher */}
        <div className="hidden lg:flex xl:hidden items-center shrink-0">
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer"
            style={{
              backgroundColor: isSoftLight ? '#FAFAF8' : '#f8fafc',
              borderColor: isSoftLight ? '#E5E7E4' : '#e2e8f0',
              color: isSoftLight ? '#244B3C' : '#1e293b'
            }}
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-white shadow-xs inline-block shrink-0"
              style={{ backgroundColor: currentTheme.previewColor }}
            />
            <span className="truncate max-w-[110px]">{currentTheme.name.split('—')[0]}</span>
            <span className="text-[10px] opacity-70">▾</span>
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
          {branches.length > 0 && (
            <div className={`flex items-center space-x-1 border rounded-xl px-2 py-1 ${
              isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/80'
            }`}>
              <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <select
                value={currentBranch?.id || ''}
                onChange={(e) => {
                  const selected = branches.find((b) => b.id === e.target.value);
                  if (selected) setCurrentBranch(selected);
                }}
                className={`bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-1 ${
                  isSoftLight ? 'text-[#26342F]' : 'text-slate-700'
                }`}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Role Badge (read-only — role comes from membership, not user choice) */}
          <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200/80 rounded-xl px-2 py-1">
            <User className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-900">{displayRole}</span>
          </div>

          {/* Staff Pill Desktop + Logout */}
          <div className={`flex items-center space-x-2 pl-2 border-l ${isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200'}`}>
            <div
              className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0"
              style={{ background: isSoftLight ? currentTheme.buttonBg : currentTheme.heroGradient }}
            >
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden xl:block text-left">
              <p className={`text-xs font-bold leading-tight truncate max-w-[120px] ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}`}>{displayName}</p>
              <p className={`text-[10px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>{displayRole}</p>
            </div>
            {isLiveMode && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Right: Theme trigger + Staff Avatar */}
        <div className="md:hidden flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className={`flex items-center space-x-1 border rounded-lg px-2 py-1 cursor-pointer active:scale-95 ${
              isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-100 border-slate-200'
            }`}
            title="Đổi giao diện Theme"
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs inline-block shrink-0"
              style={{ backgroundColor: currentTheme.previewColor }}
            />
            <span className={`text-[11px] font-semibold ${isSoftLight ? 'text-[#26342F]' : 'text-slate-700'}`}>Theme</span>
          </button>
          <div
            className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-[11px] shrink-0"
            style={{ background: isSoftLight ? currentTheme.buttonBg : currentTheme.heroGradient }}
            title={`${displayName} (${displayRole})`}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Mobile Sub-Toolbar: Branch selector + user info */}
      <div className={`md:hidden px-3 py-1.5 border-b flex items-center justify-between gap-2 text-xs w-full box-border ${
        isSoftLight ? 'bg-[#FCFAF7] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/90'
      }`}>
        {/* Branch Selector Mobile */}
        {branches.length > 0 && (
          <div className={`flex-1 min-w-0 flex items-center space-x-1 border rounded-lg px-2 py-1 ${
            isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200'
          }`}>
            <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <select
              value={currentBranch?.id || ''}
              onChange={(e) => {
                const selected = branches.find((b) => b.id === e.target.value);
                if (selected) setCurrentBranch(selected);
              }}
              className={`w-full bg-transparent text-[11px] font-semibold focus:outline-none cursor-pointer truncate ${
                isSoftLight ? 'text-[#26342F]' : 'text-slate-700'
              }`}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Role Display (read-only) + Logout */}
        <div className="flex items-center space-x-1 shrink-0">
          <span className="text-[11px] font-semibold text-amber-900 bg-amber-50/90 border border-amber-200 rounded-lg px-2 py-1">
            {displayRole}
          </span>
          {isLiveMode && (
            <button
              onClick={handleLogout}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
