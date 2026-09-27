import React from 'react';
import { Database } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const MockDataBanner: React.FC = () => {
  const { currentBranch, currentRole } = useApp();

  const roleLabels: Record<string, string> = {
    owner_admin: 'Chủ cơ sở (Admin)',
    branch_manager: 'Quản lý chi nhánh',
    cashier_receptionist: 'Lễ tân / Thu ngân',
    technician_doctor: 'Kỹ thuật viên / Bác sĩ'
  };

  return (
    <div className="relative z-30 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-3 md:px-4 py-1.5 text-xs font-medium flex flex-wrap items-center justify-between shadow-md border-b border-amber-500/30 gap-2 shrink-0">
      <div className="flex items-center space-x-2">
        <span className="bg-white/20 text-white font-bold px-2 py-0.5 rounded text-xs tracking-wider flex items-center gap-1">
          <Database className="w-3.5 h-3.5" />
          MOCK DATA P1
        </span>
        <span className="hidden sm:inline text-amber-100">
          Chế độ xem trước giao diện P1 (Dữ liệu giả lập - Chưa kết nối Database thật).
        </span>
        <span className="sm:hidden text-amber-100">Dữ liệu giả lập P1</span>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        <div className="bg-black/20 px-2.5 py-1 rounded-md flex items-center space-x-1.5">
          <span className="text-amber-200 font-normal">Chi nhánh:</span>
          <span className="font-semibold text-white">{currentBranch.code}</span>
        </div>
        <div className="bg-black/20 px-2.5 py-1 rounded-md flex items-center space-x-1.5">
          <span className="text-amber-200 font-normal">Quyền:</span>
          <span className="font-semibold text-emerald-300">{roleLabels[currentRole] || currentRole}</span>
        </div>
      </div>
    </div>
  );
};
