import React from 'react';
import { UserCheck, Phone, Mail, Building } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

export const StaffView: React.FC = () => {
  const { staffList, branches } = useApp();

  const roleLabels: Record<UserRole, { label: string; color: string; bg: string }> = {
    owner_admin: { label: 'Chủ Cơ Sở (Admin)', color: 'text-purple-800', bg: 'bg-purple-100' },
    branch_manager: { label: 'Quản Lý Chi Nhánh', color: 'text-blue-800', bg: 'bg-blue-100' },
    cashier_receptionist: { label: 'Lễ Tân & Thu Ngân', color: 'text-amber-800', bg: 'bg-amber-100' },
    technician_doctor: { label: 'Bác Sĩ & KTV', color: 'text-emerald-800', bg: 'bg-emerald-100' }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Danh Sách Nhân Sự & Phân Quyền RBAC</h3>
            <p className="text-xs text-slate-500">Quản lý nhân viên cấp tổ chức, phân bổ chi nhánh công tác</p>
          </div>
        </div>
        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs">
          + Thêm Nhân Viên
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staffList.map((st) => {
          const roleConf = roleLabels[st.role] || roleLabels.cashier_receptionist;
          const assignedBranches = branches.filter((b) => st.branchIds.includes(b.id));

          return (
            <div
              key={st.id}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                      {st.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{st.name}</h4>
                      <p className="text-xs text-slate-400 font-mono font-medium">{st.code}</p>
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
                      <span className="text-[11px] text-slate-500">Chi nhánh:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {assignedBranches.map((b) => (
                          <span key={b.id} className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            {b.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Lương cơ bản</span>
                  <span className="font-bold text-slate-800">{(st.baseSalary).toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Hoa hồng gốc</span>
                  <span className="font-bold text-sky-700">{st.commissionRate}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
