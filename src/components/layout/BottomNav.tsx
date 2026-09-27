import React from 'react';
import { LayoutDashboard, CreditCard, Calendar, Users, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { NavTab } from '../../context/AppContext';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, cart } = useApp();

  const items: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'home', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'pos', label: 'Thu ngân', icon: CreditCard, badge: cart.items.length },
    { id: 'appts', label: 'Lịch hẹn', icon: Calendar },
    { id: 'cust', label: 'Khách hàng', icon: Users },
    { id: 'courses', label: 'Liệu trình', icon: Sparkles }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden shadow-lg px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-center justify-around">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = activeTab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setActiveTab(it.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 relative rounded-lg transition-colors ${
                isActive ? 'text-sky-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-sky-600' : 'text-slate-500'}`} />
                {Boolean(it.badge && it.badge > 0) && (
                  <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-bold px-1 rounded-full min-w-3.5 text-center">
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
