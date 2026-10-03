import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Phone,
  Mail,
  Building,
  Plus,
  Search,
  Edit,
  ShieldCheck,
  Award,
  Lock,
  Calendar,
  KeyRound
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { UserRole, Staff } from '../../types';

export const StaffView: React.FC = () => {
  const { branches, currentBranch, currentTheme, currentRole, isLiveMode, org, services, showToast } = useApp();
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  // Password Reset Modal State
  const [resetPwStaff, setResetPwStaff] = useState<Staff | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [isSubmittingPw, setIsSubmittingPw] = useState(false);
  const [resetPwError, setResetPwError] = useState<string | null>(null);

  // Form State
  const [formFullName, setFormFullName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('technician_doctor');
  const [formPrimaryBranchId, setFormPrimaryBranchId] = useState('');
  const [formBranchIds, setFormBranchIds] = useState<string[]>([]);
  const [formBaseSalary, setFormBaseSalary] = useState<number>(8000000);
  const [formCommissionRate, setFormCommissionRate] = useState<number>(10);
  const [formEmploymentStatus, setFormEmploymentStatus] = useState<'active' | 'on_leave' | 'terminated'>('active');
  const [formPinCode, setFormPinCode] = useState('');
  const [formSkillIds, setFormSkillIds] = useState<string[]>([]);
  const [formEffectiveFrom, setFormEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);

  const isSoftLight = currentTheme.isSoftLight;

  // Check management role to view/edit salaries
  const isManagerOrAdmin = currentRole === 'owner_admin' || currentRole === 'branch_manager';


  const roleLabels: Record<UserRole, { label: string; color: string; bg: string }> = {
    owner_admin: { label: 'Chủ Cơ Sở (Admin)', color: 'text-purple-800', bg: 'bg-purple-100' },
    branch_manager: { label: 'Quản Lý Chi Nhánh', color: 'text-blue-800', bg: 'bg-blue-100' },
    cashier_receptionist: { label: 'Lễ Tân & Thu Ngân', color: 'text-amber-800', bg: 'bg-amber-100' },
    technician_doctor: { label: 'Bác Sĩ & KTV', color: 'text-emerald-800', bg: 'bg-emerald-100' }
  };

  const reloadStaff = useCallback(async () => {
    if (!isLiveMode) return;
    setIsLoading(true);
    try {
      const data = await masterDataService.getStaff(scope === 'branch' ? currentBranch?.id : undefined);
      setStaffList(data);
    } catch (err) {
      console.error('Lỗi tải danh sách nhân sự:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLiveMode, scope, currentBranch?.id]);

  useEffect(() => {
    reloadStaff();
  }, [reloadStaff]);

  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      // 1. Search text
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term) ||
        s.phone.includes(term) ||
        s.email.toLowerCase().includes(term);
      if (!matchesSearch) return false;

      // 2. Role filter
      if (filterRole !== 'all' && s.role !== filterRole) return false;

      // 3. Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'active' && s.status !== 'active') return false;
        if (filterStatus === 'inactive' && s.status !== 'inactive') return false;
        if (filterStatus === 'on_leave' && s.employmentStatus !== 'on_leave') return false;
      }

      return true;
    });
  }, [staffList, searchTerm, filterRole, filterStatus]);

  // Handle open create/edit modal
  const handleOpenModal = (staff?: Staff) => {
    setServerError(null);
    if (staff) {
      setEditingStaff(staff);
      setFormFullName(staff.name);
      setFormCode(staff.code);
      setFormPhone(staff.phone);
      setFormEmail(staff.email);
      setFormTitle(staff.title || '');
      setFormRole(staff.role);
      setFormPrimaryBranchId(staff.primaryBranchId || currentBranch?.id || '');
      setFormBranchIds(staff.branchIds || []);
      setFormBaseSalary(staff.baseSalary || 0);
      setFormCommissionRate(staff.commissionRate || 0);
      setFormEmploymentStatus(staff.employmentStatus || (staff.status === 'active' ? 'active' : 'on_leave'));
      setFormPinCode('');
      setFormSkillIds(staff.skills ? staff.skills.map((sk) => sk.serviceId) : []);
      setFormEffectiveFrom(new Date().toISOString().split('T')[0]);
    } else {
      setEditingStaff(null);
      setFormFullName('');
      setFormCode('');
      setFormPhone('');
      setFormEmail('');
      setFormTitle('');
      setFormRole('technician_doctor');
      setFormPrimaryBranchId(currentBranch?.id || branches[0]?.id || '');
      setFormBranchIds(currentBranch?.id ? [currentBranch.id] : []);
      setFormBaseSalary(8000000);
      setFormCommissionRate(10);
      setFormEmploymentStatus('active');
      setFormPinCode('');
      setFormSkillIds([]);
      setFormEffectiveFrom(new Date().toISOString().split('T')[0]);
    }
    setIsModalOpen(true);
  };

  const handleSubmitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!formFullName.trim()) {
      setServerError('Vui lòng nhập họ tên nhân viên.');
      return;
    }
    if (!formPhone.trim()) {
      setServerError('Vui lòng nhập số điện thoại.');
      return;
    }
    if (formBranchIds.length === 0) {
      setServerError('Vui lòng phân công ít nhất một chi nhánh làm việc.');
      return;
    }

    setIsSubmitting(true);
    try {
      const orgId = org?.id || '11111111-1111-1111-1111-111111111111';
      const res = await masterDataService.upsertStaffProfileRPC({
        orgId,
        staffId: editingStaff?.id,
        fullName: formFullName.trim(),
        code: formCode.trim() || undefined,
        phone: formPhone.trim(),
        email: formEmail.trim() || undefined,
        title: formTitle.trim() || undefined,
        role: formRole,
        primaryBranchId: formPrimaryBranchId || formBranchIds[0],
        branchIds: formBranchIds,
        baseSalary: formBaseSalary,
        commissionRate: formCommissionRate,
        employmentStatus: formEmploymentStatus,
        pinCode: formPinCode.trim() || undefined,
        skillIds: formSkillIds,
        effectiveFrom: formEffectiveFrom
      });

      if (!res.success) {
        throw new Error(res.message || 'Lỗi lưu hồ sơ nhân sự.');
      }

      showToast(`👤 Đã lưu hồ sơ nhân viên ${formFullName} (${res.code}) thành công!`, 'success');
      await reloadStaff();
      setIsModalOpen(false);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || 'Lỗi khi lưu nhân sự.';
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPwStaff) return;
    if (!newPasswordInput || newPasswordInput.trim().length < 6) {
      setResetPwError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    setIsSubmittingPw(true);
    setResetPwError(null);
    try {
      const res = await masterDataService.adminResetStaffPassword({
        staffId: resetPwStaff.id,
        newPassword: newPasswordInput.trim()
      });
      if (!res.success) {
        throw new Error(res.message || 'Không thể đổi mật khẩu.');
      }
      showToast(`🔑 Đã cấp lại mật khẩu cho ${resetPwStaff.name} thành công!`, 'success');
      setResetPwStaff(null);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || 'Lỗi khi đổi mật khẩu.';
      setResetPwError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmittingPw(false);
    }
  };


  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header with Scope Switcher & Actions */}
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
              Quản Lý Hồ Sơ Nhân Sự & Phân Quyền RBAC (P6.1)
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
            onClick={() => handleOpenModal()}
            className="text-xs text-white font-bold px-4 py-2.5 rounded-xl shadow-xs shrink-0 whitespace-nowrap cursor-pointer flex items-center justify-center space-x-1.5 hover:opacity-90 active:scale-95 transition-all"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>+ Thêm Nhân Viên Mới</span>
          </button>
        </div>
      </div>

      {/* Smart Search & Filter Bar */}
      <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên, mã NV, SĐT, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-7 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-hidden shadow-2xs"
          >
            <option value="all">👑 Tất cả Vai Trò</option>
            <option value="owner_admin">Chủ Cơ Sở (Admin)</option>
            <option value="branch_manager">Quản Lý Chi Nhánh</option>
            <option value="cashier_receptionist">Lễ Tân & Thu Ngân</option>
            <option value="technician_doctor">Bác Sĩ & KTV</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-hidden shadow-2xs"
          >
            <option value="all">⚡ Tất cả Trạng Thái</option>
            <option value="active">🟢 Đang Làm Việc</option>
            <option value="on_leave">🟡 Đang Nghỉ Phép</option>
            <option value="inactive">🔴 Ngừng Hoạt Động</option>
          </select>
        </div>
      </div>

      {/* Staff Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
            Đang tải dữ liệu nhân sự...
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
            Không tìm thấy nhân sự nào phù hợp với bộ lọc.
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
                          {st.title && (
                            <span className="text-[10px] text-slate-500 font-medium">({st.title})</span>
                          )}
                          {isPrimaryHere && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Cơ sở chính
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end space-y-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleConf.bg} ${roleConf.color}`}>
                        {roleConf.label}
                      </span>
                      <button
                        onClick={() => handleOpenModal(st)}
                        className="p-1 text-slate-400 hover:text-sky-600 rounded-lg transition-colors"
                        title="Chỉnh sửa hồ sơ nhân sự"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="mt-4 space-y-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> {st.phone}
                    </p>
                    {st.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" /> {st.email}
                      </p>
                    )}

                    {/* Assigned Branches */}
                    <div className="flex items-start gap-2">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className={`text-[11px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Phân công chi nhánh:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {assignedBranches.map((b) => {
                            const isCurrent = b.id === currentBranch.id;
                            const isPrim = b.id === st.primaryBranchId;
                            return (
                              <span
                                key={b.id}
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                  isPrim
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                                    : isCurrent
                                    ? 'bg-sky-50 text-sky-800 border-sky-300 font-bold'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {b.name.split(' - ')[0]} {isPrim && '★'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Skills list */}
                    {st.skills && st.skills.length > 0 && (
                      <div className="flex items-start gap-2 pt-1">
                        <Award className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[11px] text-slate-500 font-medium">Kỹ năng dịch vụ:</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {st.skills.map((sk, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-medium"
                              >
                                {sk.serviceName}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Salary & Commission footer (RBAC Protected) */}
                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div className={`p-2 rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/60'}`}>
                    <span className="text-[10px] text-slate-400 block flex items-center justify-between">
                      <span>Lương cơ bản</span>
                      {!isManagerOrAdmin && <Lock className="w-2.5 h-2.5 text-slate-400" />}
                    </span>
                    <span className="font-bold text-slate-800">
                      {isManagerOrAdmin ? `${(st.baseSalary || 0).toLocaleString('vi-VN')}đ` : '••••••••'}
                    </span>
                  </div>
                  <div className={`p-2 rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/60'}`}>
                    <span className="text-[10px] text-slate-400 block">Hoa hồng gốc</span>
                    <span className="font-bold text-sky-700">
                      {isManagerOrAdmin ? `${st.commissionRate || 0}%` : '••••'}
                    </span>
                  </div>
                </div>

                {/* Password Management Button for Admin ONLY */}
                {currentRole === 'owner_admin' && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setResetPwStaff(st);
                        setNewPasswordInput('PhuongNam@123');
                        setResetPwError(null);
                        setShowNewPw(false);
                      }}
                      className="w-full py-1.5 px-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-900 border border-amber-300/80 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-98"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                      <span>🔑 Cấp / Đổi Mật Khẩu</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ─── MODAL TẠO / SỬA HỒ SƠ NHÂN VIÊN ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingStaff ? `Cập Nhật Hồ Sơ Nhân Viên: ${editingStaff.name}` : 'Thêm Nhân Viên Mới Vào Tổ Chức'}
                </h3>
                <p className="text-xs text-slate-500">
                  Thiết lập hồ sơ dùng chung, phân công nhiều chi nhánh và phân quyền RBAC
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {serverError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmitStaff} className="space-y-4">
              {/* Thông tin cơ bản */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Họ và Tên *
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Mã Nhân Viên (Tự sinh nếu trống)
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="NV1001"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Số Điện Thoại *
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="0901234567"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="staff@phuongnam.vn"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Chức Danh / Vị Trí
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Bác Sĩ Da Liễu / KTV..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Vai trò RBAC & Trạng thái */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                    <span>Vai Trò Phân Quyền (RBAC) *</span>
                  </label>
                  <select
                    value={formRole}
                    onChange={(e: any) => setFormRole(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                    required
                  >
                    <option value="owner_admin">Chủ Cơ Sở (Toàn quyền hệ thống)</option>
                    <option value="branch_manager">Quản Lý Chi Nhánh</option>
                    <option value="cashier_receptionist">Lễ Tân & Thu Ngân</option>
                    <option value="technician_doctor">Bác Sĩ / Kỹ Thuật Viên</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Trạng Thái Làm Việc
                  </label>
                  <select
                    value={formEmploymentStatus}
                    onChange={(e: any) => setFormEmploymentStatus(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="active">🟢 Đang Làm Việc (Active)</option>
                    <option value="on_leave">🟡 Đang Nghỉ Phép (On-leave)</option>
                    <option value="terminated">🔴 Đã Nghỉ Việc (Terminated)</option>
                  </select>
                </div>
              </div>

              {/* Phân công Chi Nhánh & Ngày hiệu lực */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                    <Building className="w-3.5 h-3.5 text-sky-600" />
                    <span>Phân Công Chi Nhánh Hoạt Động *</span>
                  </label>
                  <div className="flex items-center space-x-1 text-xs">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500">Hiệu lực từ:</span>
                    <input
                      type="date"
                      value={formEffectiveFrom}
                      onChange={(e) => setFormEffectiveFrom(e.target.value)}
                      className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {branches.map((b) => {
                    const isChecked = formBranchIds.includes(b.id);
                    const isPrimary = formPrimaryBranchId === b.id;

                    return (
                      <div
                        key={b.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                          isChecked ? 'bg-white border-sky-300 shadow-2xs' : 'bg-slate-100/60 border-slate-200 opacity-60'
                        }`}
                      >
                        <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormBranchIds((prev) => [...prev, b.id]);
                                if (!formPrimaryBranchId) setFormPrimaryBranchId(b.id);
                              } else {
                                setFormBranchIds((prev) => prev.filter((id) => id !== b.id));
                                if (formPrimaryBranchId === b.id) {
                                  setFormPrimaryBranchId(formBranchIds.find((id) => id !== b.id) || '');
                                }
                              }
                            }}
                            className="rounded text-sky-600 focus:ring-sky-500"
                          />
                          <span className="font-bold text-slate-800">{b.name}</span>
                        </label>

                        {isChecked && (
                          <button
                            type="button"
                            onClick={() => setFormPrimaryBranchId(b.id)}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-all ${
                              isPrimary
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            {isPrimary ? '★ Cơ sở chính' : 'Đặt làm chính'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lương & Hoa Hồng (Chỉ hiển thị cho Quản lý / Admin) */}
              {isManagerOrAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1">
                      Lương Cơ Bản (VNĐ)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={100000}
                      value={formBaseSalary}
                      onChange={(e) => setFormBaseSalary(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1">
                      Hoa Hồng Gốc (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={formCommissionRate}
                      onChange={(e) => setFormCommissionRate(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1">
                      Mã PIN iPad POS (4-6 số)
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={formPinCode}
                      onChange={(e) => setFormPinCode(e.target.value)}
                      placeholder="Để trống nếu không đổi"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Kỹ năng dịch vụ KTV */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                  <Award className="w-3.5 h-3.5 text-purple-600" />
                  <span>Kỹ Năng & Dịch Vụ Được Phép Thực Hiện ({formSkillIds.length})</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
                  {services.map((svc) => {
                    const isSelected = formSkillIds.includes(svc.id);
                    return (
                      <label
                        key={svc.id}
                        className={`flex items-center space-x-2 text-xs p-1.5 rounded-lg border cursor-pointer ${
                          isSelected ? 'bg-purple-50 text-purple-900 border-purple-300 font-bold' : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormSkillIds((prev) => [...prev, svc.id]);
                            } else {
                              setFormSkillIds((prev) => prev.filter((id) => id !== svc.id));
                            }
                          }}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="truncate">{svc.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Submit buttons */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center space-x-1"
                >
                  <span>{isSubmitting ? 'Đang Lưu...' : '💾 Lưu Hồ Sơ Nhân Viên'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL CẤP / ĐỔI MẬT KHẨU NHÂN VIÊN CHO ADMIN ─── */}
      {resetPwStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shadow-2xs">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cấp / Đổi Mật Khẩu Nhân Viên</h3>
                  <p className="text-[11px] text-slate-500">Quản trị viên trực tiếp đổi mật khẩu đăng nhập</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetPwStaff(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Staff Info Box */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{resetPwStaff.name}</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded">
                  {resetPwStaff.code}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-0.5">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Email đăng nhập:</span>
                <strong className="text-slate-900 font-mono font-semibold">{resetPwStaff.email || 'Chưa có email'}</strong>
              </p>
            </div>

            {resetPwError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {resetPwError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mật khẩu mới (Tối thiểu 6 ký tự, bảo mật riêng cho nhân sự)
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Nhập hoặc tạo mật khẩu riêng..."
                    className="w-full pl-3.5 pr-14 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    {showNewPw ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>

              {/* Dynamic secure random password generator */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
                    const array = new Uint32Array(12);
                    window.crypto.getRandomValues(array);
                    const generated = Array.from(array, (x) => chars[x % chars.length]).join('');
                    setNewPasswordInput(generated);
                    setShowNewPw(true);
                  }}
                  className="text-[11px] px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-semibold transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  🎲 Tạo mật khẩu ngẫu nhiên an toàn
                </button>
                {newPasswordInput && (
                  <span className="text-[10px] text-slate-500 italic">
                    (Vui lòng gửi riêng mật khẩu này cho nhân sự sau khi xác nhận)
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetPwStaff(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmittingPw}
                onClick={handleConfirmResetPassword}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isSubmittingPw ? 'Đang cập nhật...' : 'Xác nhận Đổi Mật Khẩu'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

