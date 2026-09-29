import React, { useState, useMemo } from 'react';
import { UserCheck, Phone, Mail, Building, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

export const StaffView: React.FC = () => {
  const { staffList, branches, currentBranch, currentTheme, showToast } = useApp();
  const [scope, setScope] = useState<'branch' | 'all'>('branch');

  const isSoftLight = currentTheme.isSoftLight;

  const roleLabels: Record<UserRole, { label: string; color: string; bg: string }> = {
    owner_admin: { label: 'Chủ Cơ Sở (Admin)', color: 'text-purple-800', bg: 'bg-purple-100' },
    branch_manager: { label: 'Quản Lý Chi Nhánh', color: 'text-blue-800', bg: 'bg-blue-100' },
    cashier_receptionist: { label: 'Lễ Tân & Thu Ngân', color: 'text-amber-800', bg: 'bg-amber-100' },
    technician_doctor: { label: 'Bác Sĩ & KTV', color: 'text-emerald-800', bg: 'bg-emerald-100' }
  };

  const filteredStaff = useMemo(() => {
    if (scope === 'branch') {
      return staffList.filter((s) => s.branchIds.includes(currentBranch.id));
    }
    return staffList;
  }, [staffList, scope, currentBranch]);

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header with Scope Switcher */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
        }`}
        style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
      >
        <div className="flex items-center space-x-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-xs"
            style={{ backgroundColor: currentTheme.iconBg, color: currentTheme.primaryColor }}
          >
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className={`font-bold text-base ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
              Danh Sách Nhân Sự & Phân Quyền RBAC
            </h2>
            <p className={`text-xs ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              {scope === 'branch' ? `Phân công tại ${currentBranch.name}` : 'Toàn hệ thống tổ chức'} ({filteredStaff.length} nhân sự)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center p-1 rounded-xl bg-slate-100 text-xs font-semibold">
            <button
              onClick={() => setScope('branch')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scope === 'branch'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tại chi nhánh ({staffList.filter((s) => s.branchIds.includes(currentBranch.id)).length})
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toàn chuỗi ({staffList.length})
            </button>
          </div>

          <button
            onClick={() => showToast('Mở form tạo nhân sự mới', 'info')}
            className="text-xs text-white font-bold px-4 py-2.5 rounded-xl shadow-xs shrink-0 whitespace-nowrap cursor-pointer flex items-center justify-center space-x-1.5 hover:opacity-90 active:scale-95 transition-all"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Nhân Viên</span>
          </button>
        </div>
      </div>

      {/* Staff Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
            Không có nhân sự nào được phân công tại chi nhánh này.
          </div>
        ) : (
          filteredStaff.map((st) => {
            const roleConf = roleLabels[st.role] || roleLabels.cashier_receptionist;
            const assignedBranches = branches.filter((b) => st.branchIds.includes(b.id));
            const isPrimaryHere = st.primaryBranchId === currentBranch.id;

            return (
              <div
                key={st.id}
                className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                  isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80 hover:border-slate-300'
                }`}
                style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-11 h-11 rounded-2xl text-white flex items-center justify-center font-black text-sm shadow-xs"
                        style={{ background: isSoftLight ? currentTheme.buttonBg : currentTheme.heroGradient }}
                      >
                        {st.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{st.name}</h4>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="text-xs text-slate-400 font-mono font-medium">{st.code}</span>
                          {isPrimaryHere && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Cơ sở chính
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleConf.bg} ${roleConf.color}`}>
                      {roleConf.label}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> {st.phone}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" /> {st.email}
                    </p>
                    <div className="flex items-start gap-2">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className={`text-[11px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Phân công chi nhánh:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {assignedBranches.map((b) => {
                            const isCurrent = b.id === currentBranch.id;
                            return (
                              <span
                                key={b.id}
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                  isCurrent
                                    ? 'bg-[#FFF1F5] text-[#244B3C] border-[#B83D62] font-bold'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {b.name.split(' - ')[0]}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div className={`p-2 rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/60'}`}>
                    <span className="text-[10px] text-slate-400 block">Lương cơ bản</span>
                    <span className="font-bold text-slate-800">{(st.baseSalary).toLocaleString('vi-VN')}đ</span>
                  </div>
                  <div className={`p-2 rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/60'}`}>
                    <span className="text-[10px] text-slate-400 block">Hoa hồng gốc</span>
                    <span className="font-bold" style={{ color: currentTheme.primaryColor }}>{st.commissionRate}%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
