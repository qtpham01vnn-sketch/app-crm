import React, { useState } from 'react';
import { Users, Search, Phone, Mail, DollarSign, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Customer } from '../../types';
import { masterDataService } from '../../services/masterDataService';

export const CustView: React.FC = () => {
  const { customers, setCustomers, courses, sales, currentBranch, branches, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(customers[0] || null);

  // New Customer Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTier, setNewTier] = useState<Customer['vipTier']>('standard');
  const [newNotes, setNewNotes] = useState('');
  const [newGender, setNewGender] = useState<Customer['gender']>('female');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingCust: Customer } | null>(null);

  const handleCreateCustomer = async (e: React.FormEvent, forceDuplicate: boolean = false) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
      showToast('Vui lòng nhập họ và tên khách hàng', 'warning');
      return;
    }

    const cleanPhone = newPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      showToast('Số điện thoại không hợp lệ (tối thiểu 9 số)', 'warning');
      return;
    }

    // Check duplicate phone locally
    const existingCust = customers.find((c) => c.phone.replace(/\D/g, '') === cleanPhone);
    if (existingCust && !forceDuplicate) {
      setDuplicateWarning({ existingCust });
      return;
    }

    setIsSubmitting(true);
    try {
      const orgId = currentBranch?.orgId || (branches.length > 0 ? branches[0].orgId : '');
      const branchId = currentBranch?.id || (branches.length > 0 ? branches[0].id : '');

      if (!orgId || !branchId || orgId.startsWith('org-') || branchId.startsWith('br-')) {
        throw new Error('Chưa đồng bộ ID tổ chức/chi nhánh từ máy chủ Supabase. Vui lòng kiểm tra kết nối mạng và thử lại.');
      }

      const created = await masterDataService.createCustomer(
        {
          name: trimmedName,
          phone: cleanPhone,
          email: newEmail.trim() || undefined,
          vipTier: newTier,
          notes: newNotes.trim() || undefined,
          gender: newGender
        },
        orgId,
        branchId
      );

      if (created) {
        setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        setSelectedCust(created);
        showToast(`✅ Đã thêm khách hàng "${created.name}" lên Supabase`, 'success');
        setIsCreateModalOpen(false);
        setNewName('');
        setNewPhone('');
        setNewEmail('');
        setNewNotes('');
        setDuplicateWarning(null);
      }
    } catch (err: unknown) {
      let errorMessage = 'Không thể lưu khách hàng lên máy chủ';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
        errorMessage = anyErr.message || anyErr.details || anyErr.hint || `Lỗi Supabase (Mã: ${anyErr.code || 'UNKNOWN'})`;
      }
      showToast(`❌ ${errorMessage}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  const tierBadges: Record<string, { label: string; color: string; bg: string }> = {
    standard: { label: 'Thành viên', color: 'text-slate-700', bg: 'bg-slate-100' },
    silver: { label: 'Bạc (Silver)', color: 'text-slate-700', bg: 'bg-slate-200' },
    gold: { label: 'Vàng (Gold)', color: 'text-amber-800', bg: 'bg-amber-100' },
    diamond: { label: 'Kim Cương (VIP)', color: 'text-indigo-800', bg: 'bg-indigo-100' }
  };

  const custCourses = selectedCust ? courses.filter((crs) => crs.customerId === selectedCust.id) : [];
  const custSales = selectedCust ? sales.filter((s) => s.customerId === selectedCust.id) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in items-start">
      {/* Left: Customer List (5 cols) */}
      <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-sky-600" />
            <h3 className="font-bold text-sm text-slate-800">Khách Hàng Toàn Chuỗi ({customers.length})</h3>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs bg-sky-50 text-sky-700 font-bold px-3 py-1.5 rounded-xl border border-sky-200 hover:bg-sky-100 cursor-pointer transition-all"
          >
            + Thêm Khách
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
          />
        </div>

        <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {filtered.map((c) => {
            const badge = tierBadges[c.vipTier] || tierBadges.standard;
            const isSelected = selectedCust?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCust(c)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer text-xs ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/50 shadow-xs'
                    : 'border-slate-200/70 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">{c.name}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-slate-500 font-mono mt-0.5">{c.phone}</p>
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                  <span className="text-slate-500">Chi tiêu: <b className="text-slate-800">{c.totalSpent.toLocaleString('vi-VN')}đ</b></span>
                  {c.debt > 0 ? (
                    <span className="text-rose-600 font-bold">Nợ: {c.debt.toLocaleString('vi-VN')}đ</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold">Không nợ</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Detailed Customer Profile & Treatment History (7 cols) */}
      <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
        {selectedCust ? (
          <>
            {/* Header Profile */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-md">
                  {selectedCust.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base text-slate-900">{selectedCust.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierBadges[selectedCust.vipTier].bg} ${tierBadges[selectedCust.vipTier].color}`}>
                      {tierBadges[selectedCust.vipTier].label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedCust.phone}</span>
                    {selectedCust.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedCust.email}</span>}
                  </p>
                </div>
              </div>

              <div className="text-right sm:self-center">
                <p className="text-[11px] text-slate-400">Khách cấp Tổ chức</p>
                <p className="text-xs font-bold text-sky-700">Dùng chung toàn chuỗi</p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-500 text-[11px]">Tổng Chi Tiêu</span>
                <p className="font-black text-sm text-slate-900 mt-0.5">{selectedCust.totalSpent.toLocaleString('vi-VN')}đ</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200/80">
                <span className="text-rose-600 text-[11px]">Công Nợ Phải Thu</span>
                <p className="font-black text-sm text-rose-700 mt-0.5">{selectedCust.debt.toLocaleString('vi-VN')}đ</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80">
                <span className="text-emerald-600 text-[11px]">Số Dư Ký Cọc</span>
                <p className="font-black text-sm text-emerald-700 mt-0.5">{selectedCust.creditBalance.toLocaleString('vi-VN')}đ</p>
              </div>
            </div>

            {/* Treatment Courses Section */}
            <div>
              <h4 className="font-bold text-xs text-slate-800 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Gói Liệu Trình Đang Theo Dõi ({custCourses.length})
              </h4>
              {custCourses.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-xl">Khách chưa đăng ký gói liệu trình nào.</p>
              ) : (
                <div className="space-y-3">
                  {custCourses.map((crs) => (
                    <div key={crs.id} className="p-4 bg-sky-50/40 rounded-xl border border-sky-200/70 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{crs.name}</span>
                        <span className="text-sky-700 font-bold">
                          Đã làm {crs.usedSessions} / {crs.totalSessions} buổi
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-sky-600 h-2 rounded-full transition-all"
                          style={{ width: `${(crs.usedSessions / crs.totalSessions) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                        <span>Bắt đầu: {crs.startDate}</span>
                        <span>Còn lại: <b className="text-emerald-700">{crs.totalSessions - crs.usedSessions} buổi</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices History */}
            <div>
              <h4 className="font-bold text-xs text-slate-800 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-sky-600" /> Lịch Sử Hóa Đơn ({custSales.length})
              </h4>
              <div className="space-y-2">
                {custSales.map((sale) => (
                  <div key={sale.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-sky-800">{sale.invoiceNo}</span>
                      <p className="text-[11px] text-slate-500">{sale.date} • {sale.paymentMethod}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900">{sale.total.toLocaleString('vi-VN')}đ</span>
                      <p className="text-[11px] text-emerald-600 font-semibold">Đã trả: {sale.paidAmount.toLocaleString('vi-VN')}đ</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs">Chọn khách hàng để xem chi tiết hồ sơ.</div>
        )}
      </div>

      {/* CREATE CUSTOMER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col p-5 sm:p-6 shadow-2xl border border-slate-200 animate-fade-in my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-base text-slate-900">Thêm Khách Hàng Mới (Supabase Live)</h3>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setDuplicateWarning(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-sm p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Duplicate Phone Notice if detected */}
            {duplicateWarning && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 shrink-0">
                <p className="font-bold text-amber-900">
                  ⚠️ Phát hiện số điện thoại trùng lặp:
                </p>
                <p className="text-amber-800">
                  Số <b>{newPhone}</b> đã thuộc về khách hàng <b>"{duplicateWarning.existingCust.name}"</b>.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCust(duplicateWarning.existingCust);
                      setIsCreateModalOpen(false);
                      setDuplicateWarning(null);
                      showToast(`Đã chuyển sang hồ sơ của "${duplicateWarning.existingCust.name}"`, 'info');
                    }}
                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 font-bold rounded-lg hover:bg-amber-100 text-[11px] cursor-pointer"
                  >
                    Xem Hồ Sơ Đã Có
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCreateCustomer(e, true)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                  >
                    Vẫn Tạo Mới (Dùng chung số)
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={(e) => handleCreateCustomer(e, false)} className="space-y-3.5 text-xs overflow-y-auto pt-3 flex-1">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Chị Nguyễn Phương Thảo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Số điện thoại <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ví dụ: 0918123456"
                    value={newPhone}
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      if (duplicateWarning) setDuplicateWarning(null);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Giới tính</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as Customer['gender'])}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="female">Nữ</option>
                    <option value="male">Nam</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Hạng thành viên</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as Customer['vipTier'])}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="standard">Thành viên chuẩn</option>
                    <option value="silver">Bạc (Silver)</option>
                    <option value="gold">Vàng (Gold)</option>
                    <option value="diamond">Kim Cương (VIP)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ghi chú y tế & Dị ứng mỹ phẩm</label>
                <textarea
                  rows={2}
                  placeholder="Tiền sử da nhạy cảm, dị ứng hoạt chất, tình trạng răng..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu Supabase...' : 'Lưu Khách Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
