import React, { useState } from 'react';
import { Truck, Plus, Phone, Mail, MapPin, X, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { Supplier } from '../../types';

export const SuppView: React.FC = () => {
  const { suppliers, setSuppliers, org, showToast, isLiveMode } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.contactName && s.contactName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.phone.includes(searchTerm)
  );

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('⚠️ Vui lòng nhập tên nhà cung cấp và số điện thoại', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      let createdSup: Supplier | null = null;
      if (isLiveMode) {
        try {
          createdSup = await masterDataService.createSupplier(
            {
              name: name.trim(),
              contactPerson: contactPerson.trim() || undefined,
              phone: phone.trim()
            },
            org.id
          );
        } catch (sbErr) {
          console.warn('Supabase createSupplier fallback to local state:', sbErr);
        }
      }

      if (!createdSup) {
        createdSup = {
          id: `sup_${Date.now()}`,
          orgId: org.id,
          name: name.trim(),
          contactName: contactPerson.trim() || 'Người đại diện',
          phone: phone.trim(),
          debt: 0
        };
        setSuppliers((prev) => [createdSup!, ...prev]);
        showToast(`✅ Đã thêm nhà cung cấp: ${createdSup.name} (lưu bộ nhớ tạm)`, 'success');
      } else {
        setSuppliers((prev) => [createdSup!, ...prev]);
        showToast(`✅ Đã thêm nhà cung cấp: ${createdSup.name} lên Supabase`, 'success');
      }

      setIsModalOpen(false);
      setName('');
      setContactPerson('');
      setPhone('');
    } catch (err: unknown) {
      let msg = 'Lỗi lưu nhà cung cấp';
      if (typeof err === 'string') msg = err;
      else if (err instanceof Error) msg = err.message;
      else if (typeof err === 'object' && err !== null) {
        const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
        msg = anyErr.message || anyErr.details || anyErr.hint || `Lỗi Supabase (Mã: ${anyErr.code || 'UNKNOWN'})`;
      }
      showToast(`❌ Lỗi tạo nhà cung cấp: ${msg}`, 'error');
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
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Danh Bạ Nhà Cung Cấp & Công Nợ Phải Trả</h3>
            <p className="text-xs text-slate-500">Quản lý đối tác vật tư y tế, dược mỹ phẩm ({suppliers.length} đối tác)</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Nhà Cung Cấp</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm theo tên NCC, người liên hệ, SĐT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Chưa có nhà cung cấp nào phù hợp với tìm kiếm.
          </div>
        ) : (
          filteredSuppliers.map((sup) => (
            <div
              key={sup.id}
              className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <h4 className="font-bold text-sm text-slate-900">{sup.name}</h4>
                  <span className={`text-xs font-black ${sup.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    Nợ: {(sup.debt).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                {sup.contactName && <p className="text-xs text-slate-500 mt-1">Liên hệ: {sup.contactName}</p>}
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-200/70 pt-2.5">
                <p className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> {sup.phone}
                </p>
                {sup.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" /> {sup.email}
                  </p>
                )}
                {sup.address && (
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {sup.address}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Thêm Nhà Cung Cấp */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-base text-slate-800">Thêm Nhà Cung Cấp Mới</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Nhà Cung Cấp (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Cty Dược Mỹ Phẩm Sài Gòn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Người Liên Hệ Đại Diện</label>
                <input
                  type="text"
                  placeholder="VD: Anh Tuấn (Phụ trách KD)"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Điện Thoại (*)</label>
                <input
                  type="tel"
                  required
                  placeholder="VD: 0909123456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
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
                  {isSubmitting ? 'Đang Lưu...' : 'Lưu Nhà Cung Cấp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
