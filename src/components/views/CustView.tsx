import React, { useState } from 'react';
import { Users, Search, Phone, Mail, DollarSign, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Customer } from '../../types';
import { masterDataService } from '../../services/masterDataService';

export const CustView: React.FC = () => {
  const { customers, setCustomers, courses, sales, currentBranch, currentTheme, showToast, isLiveMode } = useApp();
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(customers[0] || null);

  const isSoftLight = currentTheme.isSoftLight;

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
      if (isLiveMode) {
        if (!currentBranch?.orgId || !currentBranch?.id) {
          throw new Error('Chưa xác định chi nhánh hợp lệ để tạo khách hàng.');
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
          currentBranch.orgId,
          currentBranch.id
        );

        if (!created) {
          throw new Error('Máy chủ Supabase không phản hồi bản ghi sau khi tạo.');
        }

        setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        setSelectedCust(created);
        showToast(`✅ Đã thêm khách hàng "${created.name}" vào hệ thống`, 'success');
      } else {
        // Demo mode only
        const demoCust: Customer = {
          id: `cust_demo_${Date.now()}`,
          orgId: currentBranch?.orgId || 'demo-org',
          name: trimmedName,
          phone: cleanPhone,
          email: newEmail.trim() || undefined,
          vipTier: newTier,
          gender: newGender,
          primaryBranchId: currentBranch?.id || 'demo-branch',
          totalSpent: 0,
          debt: 0,
          creditBalance: 0,
          notes: newNotes.trim() || undefined,
          createdAt: new Date().toISOString().slice(0, 10)
        };
        setCustomers((prev) => [demoCust, ...prev]);
        setSelectedCust(demoCust);
        showToast(`ℹ️ [Demo Mode] Đã thêm khách hàng "${demoCust.name}" vào bộ nhớ thử nghiệm`, 'info');
      }

      setIsCreateModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewNotes('');
      setDuplicateWarning(null);
    } catch (err: unknown) {
      let errorMessage = 'Không thể lưu khách hàng lên máy chủ';
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err instanceof Error) {
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
    diamond: { label: 'Kim Cương (VIP)', color: 'text-rose-800', bg: 'bg-rose-100' }
  };

  const custCourses = selectedCust ? courses.filter((crs) => crs.customerId === selectedCust.id) : [];
  const custSales = selectedCust ? sales.filter((s) => s.customerId === selectedCust.id) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in items-start pb-8">
      {/* Left: Customer List (5 cols) */}
      <div
        className={`lg:col-span-5 rounded-2xl p-5 border shadow-xs space-y-4 ${
          isSoftLight ? 'bg-[#FFFEFA] border-[#E8E3D8]' : 'bg-white border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5" style={{ color: currentTheme.primaryColor }} />
            <h3 className={`font-bold text-sm ${isSoftLight ? 'text-[#234737] font-serif-heading' : 'text-slate-800'}`}>
              Khách Hàng Toàn Chuỗi ({customers.length})
            </h3>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl border cursor-pointer transition-all hover:opacity-90"
            style={{
              backgroundColor: currentTheme.badgeBg,
              color: currentTheme.badgeText || currentTheme.primaryColor,
              borderColor: currentTheme.borderColor || currentTheme.primaryColor
            }}
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
            className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 ${
              isSoftLight
                ? 'bg-[#F8F6EF] border-[#E8E3D8] text-[#303833]'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
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
                    ? 'border-2 shadow-sm'
                    : isSoftLight
                    ? 'border-[#E8E3D8] hover:bg-[#F8F6EF]'
                    : 'border-slate-200/70 hover:border-slate-300 hover:bg-slate-50'
                }`}
                style={{
                  borderColor: isSelected ? currentTheme.primaryColor : undefined,
                  backgroundColor: isSelected ? currentTheme.badgeBg : undefined
                }}
              >
                <div className="flex items-center justify-between">
                  <h4 className={`font-bold text-sm ${isSoftLight ? 'text-[#234737]' : 'text-slate-900'}`}>{c.name}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-slate-500 font-mono mt-0.5">{c.phone}</p>
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                  <span className="text-slate-500">Chi tiêu: <b className="text-slate-800">{c.totalSpent.toLocaleString('vi-VN')} đ</b></span>
                  {c.debt > 0 ? (
                    <span className="text-rose-600 font-bold">Nợ: {c.debt.toLocaleString('vi-VN')} đ</span>
                  ) : (
                    <span className="text-emerald-700 font-semibold">Không nợ</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Detailed Customer Profile & Treatment History (7 cols) */}
      <div
        className={`lg:col-span-7 rounded-2xl p-6 border shadow-xs space-y-6 ${
          isSoftLight ? 'bg-[#FFFEFA] border-[#E8E3D8]' : 'bg-white border-slate-200/80'
        }`}
      >
        {selectedCust ? (
          <>
            {/* Header Profile */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className="w-12 h-12 rounded-2xl text-white flex items-center justify-center font-black text-lg shadow-md shrink-0"
                  style={{ background: currentTheme.heroGradient }}
                >
                  {selectedCust.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className={`font-bold text-base truncate ${isSoftLight ? 'text-[#234737] font-serif-heading' : 'text-slate-900'}`}>
                      {selectedCust.name}
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${tierBadges[selectedCust.vipTier].bg} ${tierBadges[selectedCust.vipTier].color}`}>
                      {tierBadges[selectedCust.vipTier].label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 font-mono"><Phone className="w-3.5 h-3.5" /> {selectedCust.phone}</span>
                    {selectedCust.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5" /> {selectedCust.email}</span>}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right sm:self-center shrink-0">
                <p className="text-[11px] text-slate-400">Khách cấp Tổ chức</p>
                <p className="text-xs font-bold" style={{ color: currentTheme.primaryColor }}>Dùng chung toàn chuỗi</p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${isSoftLight ? 'bg-[#F8F6EF] border-[#E8E3D8]' : 'bg-slate-50 border-slate-200/80'}`}>
                <span className="text-slate-500 text-[11px]">Tổng Chi Tiêu</span>
                <p className={`font-black text-sm mt-0.5 ${isSoftLight ? 'text-[#234737]' : 'text-slate-900'}`}>{selectedCust.totalSpent.toLocaleString('vi-VN')} đ</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200/80">
                <span className="text-rose-600 text-[11px]">Công Nợ Phải Thu</span>
                <p className="font-black text-sm text-rose-700 mt-0.5">{selectedCust.debt.toLocaleString('vi-VN')} đ</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80">
                <span className="text-emerald-700 text-[11px]">Số Dư Ký Cọc</span>
                <p className="font-black text-sm text-emerald-800 mt-0.5">{selectedCust.creditBalance.toLocaleString('vi-VN')} đ</p>
              </div>
            </div>

            {/* Treatment Courses Section */}
            <div>
              <h4 className={`font-bold text-xs mb-3 flex items-center gap-2 ${isSoftLight ? 'text-[#234737]' : 'text-slate-800'}`}>
                <Sparkles className="w-4 h-4 text-amber-500" /> Gói Liệu Trình Đang Theo Dõi ({custCourses.length})
              </h4>
              {custCourses.length === 0 ? (
                <p className={`text-xs py-3 text-center rounded-xl border ${isSoftLight ? 'bg-[#F8F6EF] text-[#70776F] border-[#E8E3D8]' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                  Khách chưa đăng ký gói liệu trình nào.
                </p>
              ) : (
                <div className="space-y-3">
                  {custCourses.map((crs) => (
                    <div
                      key={crs.id}
                      className={`p-4 rounded-xl border space-y-2 text-xs ${
                        isSoftLight ? 'bg-[#F8F6EF]/70 border-[#E8E3D8]' : 'bg-slate-50 border-slate-200/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{crs.name}</span>
                        <span className="font-bold" style={{ color: currentTheme.primaryColor }}>
                          Đã làm {crs.usedSessions} / {crs.totalSessions} buổi
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${(crs.usedSessions / crs.totalSessions) * 100}%`,
                            backgroundColor: currentTheme.buttonBg
                          }}
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
              <h4 className={`font-bold text-xs mb-3 flex items-center gap-2 ${isSoftLight ? 'text-[#234737]' : 'text-slate-800'}`}>
                <DollarSign className="w-4 h-4" style={{ color: currentTheme.primaryColor }} /> Lịch Sử Hóa Đơn ({custSales.length})
              </h4>
              <div className="space-y-2">
                {custSales.length === 0 ? (
                  <p className={`text-xs py-3 text-center rounded-xl border ${isSoftLight ? 'bg-[#F8F6EF] text-[#70776F] border-[#E8E3D8]' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                    Chưa có lịch sử thanh toán hóa đơn.
                  </p>
                ) : (
                  custSales.map((sale) => (
                    <div
                      key={sale.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        isSoftLight ? 'bg-[#F8F6EF]/70 border-[#E8E3D8]' : 'bg-slate-50 border-slate-200/70'
                      }`}
                    >
                      <div>
                        <span className="font-mono font-bold" style={{ color: currentTheme.primaryColor }}>{sale.invoiceNo}</span>
                        <p className="text-[11px] text-slate-500">{sale.date} • {sale.paymentMethod}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">{sale.total.toLocaleString('vi-VN')} đ</span>
                        <p className="text-[11px] text-emerald-700 font-semibold">Đã trả: {sale.paidAmount.toLocaleString('vi-VN')} đ</p>
                      </div>
                    </div>
                  ))
                )}
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
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col p-5 sm:p-6 shadow-2xl border border-slate-200 animate-fade-in my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5" style={{ color: currentTheme.primaryColor }} />
                <h3 className="font-bold text-base text-slate-900">Thêm Khách Hàng Mới</h3>
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Giới tính</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as Customer['gender'])}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer hover:opacity-90"
                  style={{ backgroundColor: currentTheme.buttonBg }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu Khách Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
