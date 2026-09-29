import React from 'react';
import {
  LayoutDashboard,
  CreditCard,
  Calendar,
  CalendarPlus,
  Clock,
  Users,
  Sparkles,
  UserCheck,
  CalendarRange,
  Timer,
  Percent,
  Wallet,
  Package,
  Scissors,
  Layers,
  Boxes,
  Truck,
  FileSpreadsheet,
  Receipt,
  TicketPercent,
  BarChart3,
  Building2,
  Palette
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { APP_THEMES } from '../../mock/themes';
import type { NavTab } from '../../context/AppContext';

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { activeTab, setActiveTab, appointments, courses, cart, currentBranch, currentTheme, setIsThemeModalOpen } = useApp();

  const isSoftLight = currentTheme.isSoftLight;

  const pendingApptsCount = appointments.filter(
    (a) => (!currentBranch?.id || a.branchId === currentBranch.id || !a.branchId) && (a.status === 'booked' || a.status === 'confirmed')
  ).length;
  const cartItemsCount = cart.items.length;

  const navGroups: NavGroup[] = [
    {
      title: 'VẬN HÀNH & TIẾP ĐÓN',
      items: [
        { id: 'home', label: 'Tổng Quan', icon: LayoutDashboard },
        { id: 'pos', label: 'Thu Ngân POS', icon: CreditCard, badge: cartItemsCount > 0 ? cartItemsCount : undefined },
        { id: 'appts', label: 'Lịch Hẹn', icon: Calendar, badge: pendingApptsCount > 0 ? pendingApptsCount : undefined },
        { id: 'book', label: 'Đặt Chỗ Nhanh', icon: CalendarPlus },
        { id: 'wait', label: 'Danh Sách Chờ', icon: Clock }
      ]
    },
    {
      title: 'KHÁCH HÀNG & DỊCH VỤ',
      items: [
        { id: 'cust', label: 'Khách Hàng', icon: Users },
        { id: 'courses', label: 'Gói Liệu Trình', icon: Sparkles, badge: courses.length },
        { id: 'svc', label: 'Dịch Vụ & Giá CN', icon: Scissors },
        { id: 'pkg', label: 'Gói Combo Dịch Vụ', icon: Layers },
        { id: 'promos', label: 'Khuyến Mãi & Voucher', icon: TicketPercent }
      ]
    },
    {
      title: 'KHO & CHUỖI CUNG ỨNG',
      items: [
        { id: 'prod', label: 'Sản Phẩm & Tồn Kho', icon: Package },
        { id: 'inv', label: 'Kiểm Kê Kho', icon: Boxes },
        { id: 'supp', label: 'Nhà Cung Cấp', icon: Truck },
        { id: 'po', label: 'Nhập Hàng (PO-GRN)', icon: FileSpreadsheet }
      ]
    },
    {
      title: 'NHÂN SỰ & CHẤM CÔNG',
      items: [
        { id: 'staff', label: 'Hồ Sơ Nhân Sự', icon: UserCheck },
        { id: 'roster', label: 'Phân Ca Làm Việc', icon: CalendarRange },
        { id: 'times', label: 'Chấm Công & Giờ Làm', icon: Timer },
        { id: 'comm', label: 'Bảng Hoa Hồng', icon: Percent },
        { id: 'payroll', label: 'Tính Lương (Payroll)', icon: Wallet }
      ]
    },
    {
      title: 'TÀI CHÍNH & BÁO CÁO',
      items: [
        { id: 'exp', label: 'Sổ Chi Phí', icon: Receipt },
        { id: 'reports', label: 'Trung Tâm Báo Cáo', icon: BarChart3 }
      ]
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container: Flex child on desktop, fixed off-canvas on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-300 ease-in-out border-r lg:static lg:inset-auto lg:z-auto lg:translate-x-0 lg:shrink-0 relative ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        } ${
          isSoftLight
            ? 'bg-[#FCFAF7] text-[#26342F] border-[#E5E7E4]'
            : 'bg-slate-900 text-slate-300 border-slate-800'
        }`}
      >
        {/* Subtle Decorative Botanical Motif in soft light theme */}
        {isSoftLight && (
          <div className="absolute -bottom-6 -right-6 pointer-events-none opacity-[0.04] overflow-hidden">
            <svg width="180" height="180" viewBox="0 0 100 100" fill="currentColor" className="text-[#244B3C]">
              <path d="M50 0 C60 25 75 40 100 50 C75 60 60 75 50 100 C40 75 25 60 0 50 C25 40 40 25 50 0 Z" />
            </svg>
          </div>
        )}

        {/* Brand Header */}
        <div
          className={`h-16 px-4 flex items-center justify-between border-b ${
            isSoftLight
              ? 'border-[#E5E7E4] bg-[#FCFAF7]'
              : 'border-slate-800/80 bg-slate-950/40'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black transition-all"
              style={{
                backgroundColor: currentTheme.primaryColor
              }}
            >
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1
                className={`font-bold text-sm tracking-wide ${
                  isSoftLight ? 'text-[#244B3C]' : 'text-white'
                }`}
              >
                PHUONG NAM
              </h1>
              <p className="text-[10px] font-bold" style={{ color: currentTheme.primaryColor }}>
                SPA & DENTAL CRM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`lg:hidden p-1.5 rounded-lg cursor-pointer ${
              isSoftLight
                ? 'text-[#59665F] hover:text-[#244B3C] hover:bg-[#FFF1F5]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Navigation Items List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx}>
              <p
                className={`px-3 text-[10px] font-bold tracking-wider uppercase mb-2 ${
                  isSoftLight ? 'text-[#59665F]' : 'text-slate-400'
                }`}
              >
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'text-white font-bold'
                          : isSoftLight
                          ? 'text-[#26342F] hover:bg-[#FFF1F5] hover:text-[#B83D62]'
                          : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                      }`}
                      style={
                        isActive
                          ? {
                              backgroundColor: currentTheme.activeSidebarBg
                            }
                          : {}
                      }
                    >
                      <div className="flex items-center space-x-2.5">
                        <Icon
                          className={`w-4 h-4 ${
                            isActive
                              ? 'text-white'
                              : isSoftLight
                              ? 'text-[#59665F]'
                              : 'text-slate-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                          style={
                            isActive
                              ? { backgroundColor: '#ffffff', color: currentTheme.primaryColor }
                              : isSoftLight
                              ? { backgroundColor: currentTheme.badgeBg, color: currentTheme.badgeText, border: `1px solid ${currentTheme.borderColor || '#E5E7E4'}` }
                              : { backgroundColor: '#1e293b', color: currentTheme.primaryColor, border: '1px solid #334155' }
                          }
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info & Theme Switcher */}
        <div
          className={`p-3 border-t space-y-2 ${
            isSoftLight
              ? 'border-[#E5E7E4] bg-[#FCFAF7]'
              : 'border-slate-800/80 bg-slate-950/30'
          }`}
        >
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-bold text-xs border transition-all hover:opacity-90 cursor-pointer"
            style={{
              backgroundColor: isSoftLight ? '#FFF1F5' : currentTheme.buttonBg,
              color: isSoftLight ? currentTheme.primaryColor : '#ffffff',
              borderColor: isSoftLight ? '#E5E7E4' : currentTheme.primaryColor
            }}
          >
            <div className="flex items-center space-x-2">
              <Palette className="w-4 h-4" />
              <span>Đổi {APP_THEMES.length} Giao Diện</span>
            </div>
            <div
              className="w-3.5 h-3.5 rounded-full border border-white/80 shadow-xs"
              style={{ backgroundColor: currentTheme.previewColor }}
            />
          </button>

          <div
            className={`text-[10px] text-center ${
              isSoftLight ? 'text-[#59665F]' : 'text-slate-400'
            }`}
          >
            <span>Phiên bản v2.0 • Phase 1 UI</span>
          </div>
        </div>
      </aside>
    </>
  );
};
