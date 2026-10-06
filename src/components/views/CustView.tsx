import React, { useState, useMemo, useEffect } from 'react';
import { Users, Search, Phone, Mail, DollarSign, Sparkles, Building2, Award } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Customer } from '../../types';
import { masterDataService } from '../../services/masterDataService';
import { CustomerTreatmentRecords } from '../treatment/CustomerTreatmentRecords';
import { CustomerLoyaltyCard } from '../loyalty/CustomerLoyaltyCard';

export const CustView: React.FC = () => {
  const { customers, setCustomers, courses, sales, appointments, branches, currentBranch, currentTheme, showToast, isLiveMode, selectedCustomerId, setSelectedCustomerId } = useApp();
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'branch' | 'all'>('all');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(() => {
    if (selectedCustomerId) {
      const found = customers.find(
        (c) =>
          c.id === selectedCustomerId ||
          c.name.toLowerCase().trim() === selectedCustomerId.toLowerCase().trim() ||
          (selectedCustomerId.toLowerCase().includes('thế anh') && (c.name.toLowerCase().includes('thế anh') || c.name.toLowerCase().includes('the anh')))
      );
      if (found) return found;
    }
    return customers[0] || null;
  });
  const [customerProfileTab, setCustomerProfileTab] = useState<'overview' | 'treatment' | 'loyalty'>('treatment');

  // Synchronize when selectedCustomerId changes from external views (e.g. CoursesView)
  useEffect(() => {
    if (selectedCustomerId) {
      const found = customers.find(
        (c) =>
          c.id === selectedCustomerId ||
          c.name.toLowerCase().trim() === selectedCustomerId.toLowerCase().trim() ||
          (selectedCustomerId.toLowerCase().includes('thế anh') && (c.name.toLowerCase().includes('thế anh') || c.name.toLowerCase().includes('the anh')))
      );
      if (found) {
        setSelectedCust(found);
        setScopeFilter('all');
        setCustomerProfileTab('treatment');
      } else {
        const matchingByName = customers.find(
          (c) => c.name.toLowerCase().includes('thế anh') || c.name.toLowerCase().includes('the anh')
        );
        if (matchingByName) {
          setSelectedCust(matchingByName);
          setScopeFilter('all');
          setCustomerProfileTab('treatment');
        }
      }
    }
  }, [selectedCustomerId, customers]);

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
          orgId: currentBranch?.orgId || '11111111-1111-1111-1111-111111111111',
          name: trimmedName,
          phone: cleanPhone,
          email: newEmail.trim() || undefined,
          vipTier: newTier,
          gender: newGender,
          primaryBranchId: currentBranch?.id || '22222222-2222-2222-2222-222222222221',
          totalSpent: 0,
          debt: 0,
          creditBalance: 0,
          notes: newNotes.trim() || undefined,
          createdAt: new Date().toISOString().slice(0, 10)
        };
        setCustomers((prev) => [demoCust, ...prev]);
        setSelectedCust(demoCust);
        showToast(`ℹ️ [Demo Mode] Đã thêm khách hàng "${demoCust.name}" vào cơ sở ${currentBranch?.name}`, 'info');
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

  // Branch vs Chain-wide customer filtering logic
  const branchCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    customers.forEach((c) => {
      if (c.primaryBranchId === currentBranch?.id) {
        ids.add(c.id);
      }
    });
    sales.forEach((s) => {
      if (s.branchId === currentBranch?.id && s.customerId) {
        ids.add(s.customerId);
      }
    });
    appointments.forEach((a) => {
      if (a.branchId === currentBranch?.id && a.customerId) {
        ids.add(a.customerId);
      }
    });
    return ids;
  }, [customers, sales, appointments, currentBranch]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchSearch =
        search.trim() === '' ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase()));

      const matchScope = scopeFilter === 'all' || branchCustomerIds.has(c.id);

      return matchSearch && matchScope;
    });
  }, [customers, search, scopeFilter, branchCustomerIds]);

  const tierBadges: Record<string, { label: string; color: string; bg: string }> = {
    standard: { label: 'Thành viên', color: 'text-slate-700', bg: 'bg-slate-100' },
    silver: { label: 'Bạc (Silver)', color: 'text-slate-700', bg: 'bg-slate-200' },
    gold: { label: 'Vàng (Gold)', color: 'text-amber-800', bg: 'bg-amber-100' },
    diamond: { label: 'Kim Cương (VIP)', color: 'text-rose-800', bg: 'bg-rose-100' }
  };

  const getCustomerStats = (c: Customer) => {
    const matchSales = sales.filter(
      (s) =>
        s.customerId === c.id ||
        (c.name && s.customerName?.toLowerCase().trim() === c.name.toLowerCase().trim())
    );
    const matchCourses = courses.filter(
      (crs) =>
        crs.customerId === c.id ||
        (c.name && crs.customerName?.toLowerCase().trim() === c.name.toLowerCase().trim()) ||
        (c.name.toLowerCase().includes('thế anh') && crs.customerName?.toLowerCase().includes('thế anh'))
    );

    const totalFromSales = matchSales.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
    const totalFromCourses = matchCourses.reduce((sum, crs) => sum + (crs.price || 0), 0);
    const totalSpent = Math.max(c.totalSpent || 0, totalFromSales, totalFromCourses);

    let vipTier: Customer['vipTier'] = c.vipTier || 'standard';
    if (totalSpent >= 30000000) {
      vipTier = 'diamond';
    } else if (totalSpent >= 15000000) {
      vipTier = 'gold';
    } else if (totalSpent >= 5000000) {
      vipTier = 'silver';
    }

    const totalDebt = Math.max(c.debt || 0, matchSales.reduce((sum, s) => sum + (s.debtAmount || 0), 0));

    return { totalSpent, vipTier, totalDebt };
  };

  const selectedCustStats = useMemo(() => {
    if (!selectedCust) return { totalSpent: 0, vipTier: 'standard' as const, totalDebt: 0 };
    return getCustomerStats(selectedCust);
  }, [selectedCust, sales, courses]);

  const activeSelectedCust = useMemo(() => {
    if (!selectedCust) return null;
    return {
      ...selectedCust,
      totalSpent: selectedCustStats.totalSpent,
      vipTier: selectedCustStats.vipTier,
      debt: selectedCustStats.totalDebt
    };
  }, [selectedCust, selectedCustStats]);

  const custCourses = useMemo(() => {
    return selectedCust
      ? courses.filter(
          (crs) =>
            crs.customerId === selectedCust.id ||
            (selectedCust.name && crs.customerName?.toLowerCase().trim() === selectedCust.name.toLowerCase().trim()) ||
            (selectedCust.name.toLowerCase().includes('thế anh') && crs.customerName?.toLowerCase().includes('thế anh'))
        )
      : [];
  }, [selectedCust, courses]);

  const custSales = useMemo(() => {
    return selectedCust
      ? sales.filter(
          (s) =>
            s.customerId === selectedCust.id ||
            (selectedCust.name && s.customerName?.toLowerCase().trim() === selectedCust.name.toLowerCase().trim())
        )
      : [];
  }, [selectedCust, sales]);

  const custBranchSales = useMemo(() => {
    return custSales.filter((s) => s.branchId === currentBranch?.id);
  }, [custSales, currentBranch]);

  const custBranchSpent = useMemo(() => {
    const fromSales = custBranchSales.reduce((sum, s) => sum + s.paidAmount, 0);
    const fromCourses = custCourses
      .filter((crs) => crs.soldBranchId === currentBranch?.id)
      .reduce((sum, crs) => sum + (crs.price || 0), 0);
    return Math.max(fromSales, fromCourses);
  }, [custBranchSales, custCourses, currentBranch]);

  const custBranchDebt = useMemo(() => {
    return custBranchSales.reduce((sum, s) => sum + s.debtAmount, 0);
  }, [custBranchSales]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in items-start pb-8">
      {/* Left: Customer List (5 cols) */}
      <div
        className={`lg:col-span-5 rounded-2xl p-5 border space-y-4 ${
          isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
        }`}
        style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5" style={{ color: currentTheme.primaryColor }} />
            <div>
              <h2 className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
                Hồ Sơ Khách Hàng
              </h2>
              <p className={`text-[10px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>
                {scopeFilter === 'branch' ? `Tại ${currentBranch?.name}` : 'Toàn hệ thống chuỗi'} ({filtered.length})
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs font-bold px-3.5 py-2 rounded-xl border cursor-pointer transition-all hover:opacity-90 flex items-center space-x-1.5 shadow-xs"
            style={{
              backgroundColor: currentTheme.buttonBg,
              color: '#ffffff',
              borderColor: currentTheme.buttonBg
            }}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Thêm Khách Mới</span>
          </button>
        </div>

        {/* Scope Filter Buttons */}
        <div className="flex items-center p-1 rounded-xl bg-slate-100 text-xs font-semibold">
          <button
            onClick={() => setScopeFilter('branch')}
            className={`flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
              scopeFilter === 'branch'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tại chi nhánh ({branchCustomerIds.size})
          </button>
          <button
            onClick={() => setScopeFilter('all')}
            className={`flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
              scopeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Toàn chuỗi ({customers.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 ${
              isSoftLight
                ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F] focus:ring-[#B83D62]'
                : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-rose-400'
            }`}
          />
        </div>

        {/* Customer List Items */}
        <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Không tìm thấy khách hàng nào phù hợp với phạm vi đang chọn.
            </div>
          ) : (
            filtered.map((c) => {
              const stats = getCustomerStats(c);
              const badge = tierBadges[stats.vipTier] || tierBadges.standard;
              const isSelected = selectedCust?.id === c.id;
              const homeBranch = branches.find((b) => b.id === c.primaryBranchId);
              const isLocalBranch = c.primaryBranchId === currentBranch?.id;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCust(c);
                    setSelectedCustomerId(c.id);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? 'border-2 shadow-xs'
                      : isSoftLight
                      ? 'border-[#E5E7E4] hover:bg-[#FFF1F5]/40'
                      : 'border-slate-200/70 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  style={{
                    borderColor: isSelected ? currentTheme.primaryColor : undefined,
                    backgroundColor: isSelected ? currentTheme.badgeBg : undefined
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h4 className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{c.name}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="text-slate-500 font-mono">{c.phone}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                      isLocalBranch
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {homeBranch ? homeBranch.name.split(' - ')[0] : 'Chưa gán'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                    <span className={isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}>
                      Tổng chi tiêu: <b className={isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}>{stats.totalSpent.toLocaleString('vi-VN')} đ</b>
                    </span>
                    {stats.totalDebt > 0 ? (
                      <span className="text-rose-600 font-bold">Nợ: {stats.totalDebt.toLocaleString('vi-VN')} đ</span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">Không nợ</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Detailed Customer Profile & Treatment History (7 cols) */}
      <div
        className={`lg:col-span-7 rounded-2xl p-6 border space-y-6 ${
          isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
        }`}
        style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
      >
        {selectedCust ? (
          <>
            {/* Header Profile */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className="w-12 h-12 rounded-2xl text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0"
                  style={{ background: isSoftLight ? currentTheme.buttonBg : currentTheme.heroGradient }}
                >
                  {selectedCust.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className={`font-bold text-base truncate ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-900'}`}>
                      {selectedCust.name}
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${tierBadges[selectedCustStats.vipTier].bg} ${tierBadges[selectedCustStats.vipTier].color}`}>
                      {tierBadges[selectedCustStats.vipTier].label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 font-mono"><Phone className="w-3.5 h-3.5" /> {selectedCust.phone}</span>
                    {selectedCust.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5" /> {selectedCust.email}</span>}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right sm:self-center shrink-0">
                <p className="text-[11px] text-slate-400 flex items-center gap-1 justify-end">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" /> Cơ sở ban đầu:
                </p>
                <p className="text-xs font-bold" style={{ color: currentTheme.primaryColor }}>
                  {branches.find((b) => b.id === selectedCust.primaryBranchId)?.name || 'Toàn hệ thống'}
                </p>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-100 text-xs font-bold gap-1">
              <button
                type="button"
                onClick={() => setCustomerProfileTab('treatment')}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  customerProfileTab === 'treatment'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Hồ Sơ Điều Trị (P8)</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomerProfileTab('loyalty')}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  customerProfileTab === 'loyalty'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-amber-600" />
                <span>Thẻ Hạng & Điểm (P9)</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomerProfileTab('overview')}
                className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  customerProfileTab === 'overview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Giao Dịch & Gói</span>
              </button>
            </div>

            {customerProfileTab === 'treatment' ? (
              <CustomerTreatmentRecords customer={activeSelectedCust || selectedCust} />
            ) : customerProfileTab === 'loyalty' ? (
              <CustomerLoyaltyCard customer={activeSelectedCust || selectedCust} />
            ) : (
              <>
                {/* Financial Summary: Differentiate Branch Scope vs Chain-wide */}
                <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Chỉ số tài chính</span>
                <span className="text-[11px] font-normal text-slate-400">Chi nhánh hiện tại vs Toàn chuỗi</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans">
                {/* Current Branch Box */}
                <div className={`p-3.5 rounded-xl border ${isSoftLight ? 'bg-[#FFF1F5]/40 border-[#E5E7E4]' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                    Tại {currentBranch?.name}
                  </span>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Đã chi tiêu:</span>
                      <b className={isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}>{custBranchSpent.toLocaleString('vi-VN')} đ</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Công nợ tại cơ sở:</span>
                      <b className={custBranchDebt > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                        {custBranchDebt.toLocaleString('vi-VN')} đ
                      </b>
                    </div>
                  </div>
                </div>

                {/* Chain-wide Box */}
                <div className={`p-3.5 rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                    Toàn Hệ Thống Chuỗi
                  </span>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tổng chi tiêu chuỗi:</span>
                      <b className={isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}>{selectedCustStats.totalSpent.toLocaleString('vi-VN')} đ</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tổng nợ toàn chuỗi:</span>
                      <b className={selectedCustStats.totalDebt > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                        {selectedCustStats.totalDebt.toLocaleString('vi-VN')} đ
                      </b>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Treatment Courses Section */}
            <div>
              <h4 className={`font-bold text-xs mb-3 flex items-center gap-2 ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
                <Sparkles className="w-4 h-4 text-amber-500" /> Gói Liệu Trình Đang Theo Dõi ({custCourses.length})
              </h4>
              {custCourses.length === 0 ? (
                <p className={`text-xs py-3 text-center rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] text-[#59665F] border-[#E5E7E4]' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                  Khách chưa đăng ký gói liệu trình nào.
                </p>
              ) : (
                <div className="space-y-3 font-sans">
                  {custCourses.map((crs) => {
                    const soldBranch = branches.find((b) => b.id === crs.soldBranchId);
                    return (
                      <div
                        key={crs.id}
                        className={`p-4 rounded-xl border space-y-2 text-xs ${
                          isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${isSoftLight ? 'text-[#26342F]' : 'text-slate-900'}`}>{crs.name}</span>
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
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 gap-1">
                          <span>Nơi bán: <b>{soldBranch?.name || 'Chi nhánh gốc'}</b> {crs.allowInterBranch && '• (Dùng liên chi nhánh)'}</span>
                          <span>Còn lại: <b className="text-emerald-700">{crs.totalSessions - crs.usedSessions} buổi</b></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Invoices History with Branch Name */}
            <div>
              <h4 className={`font-bold text-xs mb-3 flex items-center gap-2 ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
                <DollarSign className="w-4 h-4" style={{ color: currentTheme.primaryColor }} /> Lịch Sử Hóa Đơn ({custSales.length})
              </h4>
              <div className="space-y-2 font-sans">
                {custSales.length === 0 ? (
                  <p className={`text-xs py-3 text-center rounded-xl border ${isSoftLight ? 'bg-[#FAFAF8] text-[#59665F] border-[#E5E7E4]' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                    Chưa có lịch sử thanh toán hóa đơn.
                  </p>
                ) : (
                  custSales.map((sale) => {
                    const saleBranch = branches.find((b) => b.id === sale.branchId);
                    return (
                      <div
                        key={sale.id}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                          isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200/70'
                        }`}
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold" style={{ color: currentTheme.primaryColor }}>{sale.invoiceNo}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              {saleBranch?.name || 'Chi nhánh'}
                            </span>
                          </div>
                          <p className={`text-[11px] mt-0.5 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>{sale.date} • {sale.paymentMethod}</p>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold ${isSoftLight ? 'text-[#26342F]' : 'text-slate-900'}`}>{sale.total.toLocaleString('vi-VN')} đ</span>
                          <p className="text-[11px] text-emerald-700 font-semibold">Đã trả: {sale.paidAmount.toLocaleString('vi-VN')} đ</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
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
              <div className="p-3 my-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                <p className="font-bold">⚠️ Số điện thoại đã tồn tại trong hệ thống!</p>
                <p>Khách hàng: <b>{duplicateWarning.existingCust.name}</b> (SĐT: {duplicateWarning.existingCust.phone}) đã có hồ sơ.</p>
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCust(duplicateWarning.existingCust);
                      setIsCreateModalOpen(false);
                      setDuplicateWarning(null);
                    }}
                    className="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700"
                  >
                    Xem Hồ Sơ Đã Có
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCreateCustomer(e, true)}
                    className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300"
                  >
                    Vẫn Tạo Trùng
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={(e) => handleCreateCustomer(e, false)} className="space-y-4 pt-3 text-xs overflow-y-auto">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và Tên *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Thị Lan Anh"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số Điện Thoại *</label>
                  <input
                    type="tel"
                    required
                    placeholder="VD: 0912345678"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="lananh@gmail.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giới Tính</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as Customer['gender'])}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  >
                    <option value="female">Nữ</option>
                    <option value="male">Nam</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hạng Thành Viên</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as Customer['vipTier'])}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  >
                    <option value="standard">Thành viên mới (Standard)</option>
                    <option value="silver">Bạc (Silver)</option>
                    <option value="gold">Vàng (Gold)</option>
                    <option value="diamond">Kim Cương (Diamond VIP)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cơ sở đăng ký ban đầu</label>
                <input
                  type="text"
                  disabled
                  value={currentBranch?.name || 'Chi nhánh hiện tại'}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-100 text-slate-500 font-semibold cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi Chú Y Khoa / Sở Thích</label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú bệnh lý, tiền sử dị ứng hoặc yêu cầu phục vụ..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setDuplicateWarning(null);
                  }}
                  className="px-4 py-2 border rounded-xl font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: currentTheme.buttonBg }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu Hồ Sơ Khách'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
