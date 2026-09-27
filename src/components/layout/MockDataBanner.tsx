import React from 'react';
import { Database, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isSupabaseConfigured } from '../../lib/supabase';

export const MockDataBanner: React.FC = () => {
  const { currentBranch, currentRole } = useApp();

  const roleLabels: Record<string, string> = {
    owner_admin: 'Chủ cơ sở (Admin)',
    branch_manager: 'Quản lý chi nhánh',
    cashier_receptionist: 'Lễ tân / Thu ngân',
    technician_doctor: 'Kỹ thuật viên / Bác sĩ'
  };

  return (
    <div
      className={`relative z-30 text-white px-3 md:px-4 py-1.5 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between shadow-md border-b gap-1.5 sm:gap-2 shrink-0 w-full overflow-hidden ${
        isSupabaseConfigured
          ? 'bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 border-emerald-500/40'
          : 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 border-amber-500/30'
      }`}
    >
      <div className="flex items-center space-x-2 min-w-0">
        {isSupabaseConfigured ? (
          <span className="bg-emerald-500/30 text-emerald-200 font-bold px-2 py-0.5 rounded text-[10px] sm:text-[11px] tracking-wider flex items-center gap-1 border border-emerald-400/40 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            SUPABASE LIVE
          </span>
        ) : (
          <span className="bg-white/20 text-white font-bold px-2 py-0.5 rounded text-[10px] sm:text-[11px] tracking-wider flex items-center gap-1 shrink-0">
            <Database className="w-3.5 h-3.5" />
            MOCK DATA P1
          </span>
        )}
        <span className="hidden md:inline text-slate-200 text-xs truncate">
          {isSupabaseConfigured
            ? 'PostgreSQL Supabase (lskrcerzxltlrcewigrw) • P2 Auth & RLS'
            : 'Chế độ xem trước giao diện P1 (Dữ liệu giả lập).'}
        </span>
      </div>

      <div className="flex items-center space-x-2 text-[11px] sm:text-xs">
        <div className="bg-black/25 px-2 py-0.5 rounded-md flex items-center space-x-1 shrink-0">
          <span className="text-amber-200 font-normal">CN:</span>
          <span className="font-semibold text-white">{currentBranch.code}</span>
        </div>
        <div className="bg-black/25 px-2 py-0.5 rounded-md flex items-center space-x-1 min-w-0 truncate">
          <span className="text-amber-200 font-normal">Quyền:</span>
          <span className="font-semibold text-emerald-300 truncate">{roleLabels[currentRole] || currentRole}</span>
        </div>
      </div>
    </div>
  );
};
