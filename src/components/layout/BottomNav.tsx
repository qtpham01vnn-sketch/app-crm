import React from 'react';
import { LayoutDashboard, CreditCard, Calendar, Users, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { NavTab } from '../../context/AppContext';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, cart, currentTheme } = useApp();

  const isSoftLight = currentTheme.isSoftLight;

  const items: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; badge?: number }[] = [
    { id: 'home', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'pos', label: 'Thu ngân', icon: CreditCard, badge: cart.items.length },
    { id: 'appts', label: 'Lịch hẹn', icon: Calendar },
    { id: 'cust', label: 'Khách hàng', icon: Users },
    { id: 'courses', label: 'Liệu trình', icon: Sparkles }
  ];

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 border-t lg:hidden shadow-lg px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md ${
        isSoftLight
          ? 'bg-[#FFFEFA]/95 border-[#E8E3D8]'
          : 'bg-white/95 border-slate-200'
      }`}
    >
      <div className="flex items-center justify-around">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = activeTab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setActiveTab(it.id)}
              className="flex flex-col items-center justify-center py-1 px-3 relative rounded-lg transition-colors cursor-pointer"
              style={{
                color: isActive ? currentTheme.primaryColor : isSoftLight ? '#70776F' : '#64748b',
                fontWeight: isActive ? 700 : 500
              }}
            >
              <div className="relative">
                <Icon
                  className="w-5 h-5 transition-transform"
                  style={{ color: isActive ? currentTheme.primaryColor : isSoftLight ? '#70776F' : '#64748b' }}
                />
                {Boolean(it.badge && it.badge > 0) && (
                  <span
                    className="absolute -top-1 -right-2 text-white text-[9px] font-bold px-1 rounded-full min-w-3.5 text-center shadow-xs"
                    style={{ backgroundColor: currentTheme.primaryColor }}
                  >
                    {it.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5">{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
