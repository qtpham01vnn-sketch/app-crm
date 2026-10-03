import React from 'react';
import { Database, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabaseEnvType, supabaseProjectRef } from '../../lib/supabase';

export const MockDataBanner: React.FC = () => {
  const { currentBranch, currentRole, currentTheme } = useApp();

  const isSoftLight = currentTheme.isSoftLight;

  const roleLabels: Record<string, string> = {
    owner_admin: 'Chủ cơ sở (Admin)',
    branch_manager: 'Quản lý chi nhánh',
    cashier_receptionist: 'Lễ tân / Thu ngân',
    technician_doctor: 'Kỹ thuật viên / Bác sĩ'
  };

  const isStaging = supabaseEnvType === 'staging';
  const isLive = supabaseEnvType === 'live';

  return (
    <div
      className={`relative z-30 px-3 md:px-4 py-1.5 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between shadow-xs border-b gap-1.5 sm:gap-2 shrink-0 w-full overflow-hidden transition-colors duration-300 ${
        isSoftLight
          ? isStaging
            ? 'bg-amber-50 text-amber-900 border-amber-200'
            : 'bg-[#FCFAF7] text-[#26342F] border-[#E5E7E4]'
          : isStaging
          ? 'bg-gradient-to-r from-amber-900 via-orange-950 to-slate-900 border-amber-500/40 text-white'
          : isLive
          ? 'bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 border-emerald-500/40 text-white'
          : 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 border-amber-500/30 text-white'
      }`}
    >
      <div className="flex items-center space-x-2 min-w-0">
        {isStaging ? (
          <span
            className={`font-extrabold px-2.5 py-0.5 rounded text-[10px] sm:text-[11px] tracking-wider flex items-center gap-1.5 border shrink-0 ${
              isSoftLight
                ? 'bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400/50'
                : 'bg-amber-500/30 text-amber-200 border-amber-400/50 ring-1 ring-amber-400/30'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            STAGING • {supabaseProjectRef}
          </span>
        ) : isLive ? (
          <span
            className={`font-bold px-2 py-0.5 rounded text-[10px] sm:text-[11px] tracking-wider flex items-center gap-1 border shrink-0 ${
              isSoftLight
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            SUPABASE LIVE • {supabaseProjectRef}
          </span>
        ) : (
          <span
            className={`font-bold px-2 py-0.5 rounded text-[10px] sm:text-[11px] tracking-wider flex items-center gap-1 shrink-0 ${
              isSoftLight ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-white/20 text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            MOCK DATA P1
          </span>
        )}
        <span
          className={`hidden md:inline text-xs truncate font-medium ${
            isSoftLight
              ? isStaging ? 'text-amber-800' : 'text-[#59665F]'
              : isStaging ? 'text-amber-200/90' : 'text-slate-200'
          }`}
        >
          {isStaging
            ? 'Môi trường Diễn Tập Kỹ Thuật (Staging DB: yvwsitkgpujeqlgeiuge) • Tách biệt 100% với dữ liệu Live'
            : isLive
            ? 'Hệ thống Production Chính thức • P2-P10 Auth & RLS Active'
            : 'Chế độ xem trước giao diện P1 (Dữ liệu giả lập).'}
        </span>
      </div>

      <div className="flex items-center space-x-2 text-[11px] sm:text-xs">
        <div
          className={`px-2 py-0.5 rounded-md flex items-center space-x-1 shrink-0 ${
            isSoftLight ? 'bg-white border border-[#E5E7E4]' : 'bg-black/25'
          }`}
        >
          <span className={isSoftLight ? 'text-[#59665F] font-bold' : 'text-amber-200 font-normal'}>CN:</span>
          <span className={`font-semibold ${isSoftLight ? 'text-[#244B3C]' : 'text-white'}`}>
            {currentBranch?.code || '---'}
          </span>
        </div>
        <div
          className={`px-2 py-0.5 rounded-md flex items-center space-x-1 min-w-0 truncate ${
            isSoftLight ? 'bg-white border border-[#E5E7E4]' : 'bg-black/25'
          }`}
        >
          <span className={isSoftLight ? 'text-[#59665F] font-bold' : 'text-amber-200 font-normal'}>Quyền:</span>
          <span className={`font-semibold truncate ${isSoftLight ? 'text-[#B83D62]' : 'text-emerald-300'}`}>
            {roleLabels[currentRole] || currentRole}
          </span>
        </div>
      </div>
    </div>
  );
};
