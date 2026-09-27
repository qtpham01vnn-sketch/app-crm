import React, { useState } from 'react';
import { Layers, Plus, X, Sparkles, Clock, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { PackageCombo } from '../../types';

export const PkgView: React.FC = () => {
  const { packages, setPackages, services, org, showToast, isLiveMode } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState<string>(services[0]?.id || '');
  const [sessions, setSessions] = useState<number>(10);
  const [price, setPrice] = useState<number>(3000000);
  const [validityDays, setValidityDays] = useState<number>(180);

  const filteredPackages = packages.filter(
    (p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showToast('⚠️ Vui lòng nhập mã và tên gói combo', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      let createdPkg: PackageCombo | null = null;
      if (isLiveMode) {
        try {
          createdPkg = await masterDataService.createPackage(
            {
              code: code.trim(),
              name: name.trim(),
              serviceId: serviceId || (services[0]?.id ?? '55555555-5555-5555-5555-555555555551'),
              sessions: Number(sessions),
              price: Number(price),
              validityDays: Number(validityDays)
            },
            org.id
          );
        } catch (sbErr) {
          console.warn('Supabase createPackage fallback to local state:', sbErr);
        }
      }

      if (!createdPkg) {
        createdPkg = {
          id: `pkg_${Date.now()}`,
          orgId: org.id,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          serviceId: serviceId || (services[0]?.id ?? '55555555-5555-5555-5555-555555555551'),
          sessions: Number(sessions),
          price: Number(price),
          validityDays: Number(validityDays),
          isActive: true
        };
        setPackages((prev) => [createdPkg!, ...prev]);
        showToast(`✅ Đã thêm gói combo: ${createdPkg.name} (lưu bộ nhớ tạm)`, 'success');
      } else {
        setPackages((prev) => [createdPkg!, ...prev]);
        showToast(`✅ Đã thêm gói combo: ${createdPkg.name} lên Supabase`, 'success');
      }

      setIsModalOpen(false);
      setCode('');
      setName('');
      setSessions(10);
      setPrice(3000000);
      setValidityDays(180);
    } catch (err: unknown) {
      let msg = 'Lỗi lưu gói combo';
      if (typeof err === 'string') msg = err;
      else if (err instanceof Error) msg = err.message;
      else if (typeof err === 'object' && err !== null) {
        const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
        msg = anyErr.message || anyErr.details || anyErr.hint || `Lỗi Supabase (Mã: ${anyErr.code || 'UNKNOWN'})`;
      }
      showToast(`❌ Lỗi tạo gói combo: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Combo Gói Dịch Vụ & Liệu Trình Trả Trước</h3>
            <p className="text-xs text-slate-500">Cấu hình gói nhiều buổi ưu đãi và hạn sử dụng ({packages.length} gói)</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Combo Gói Mới</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm theo tên gói, mã combo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPackages.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Chưa có combo gói nào phù hợp với tìm kiếm.
          </div>
        ) : (
          filteredPackages.map((pkg) => (
            <div
              key={pkg.id}
              className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded">
                    {pkg.code}
                  </span>
                  <span className="text-sm font-black text-emerald-700">
                    {(pkg.price).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 mt-2">{pkg.name}</h4>
                {pkg.description && <p className="text-xs text-slate-500 mt-1">{pkg.description}</p>}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs text-slate-600">
                <span className="flex items-center gap-1 font-bold text-slate-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {pkg.sessions} Buổi điều trị
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Hạn: {pkg.validityDays} ngày
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Thêm Gói Combo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-base text-slate-800">Tạo Gói Combo Mới</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePackage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mã Gói Combo (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: PKG-SKIN10"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Gói Combo (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Gói Chăm Sóc Da Toàn Diện (10 Buổi)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {services.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dịch Vụ Gốc Áp Dụng</label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Số Buổi</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={sessions}
                    onChange={(e) => setSessions(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Giá Trọn Gói (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-sky-700 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Hạn Dùng (ngày)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang Lưu...' : 'Lưu Gói Combo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
