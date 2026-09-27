import React, { useState } from 'react';
import { Scissors, Plus, X, Search, CheckCircle2, Clock, DollarSign, Percent } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';

export const SvcView: React.FC = () => {
  const { services, setServices, org, showToast, isLiveMode } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Chăm Sóc Da');
  const [basePrice, setBasePrice] = useState<number>(350000);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [commissionPct, setCommissionPct] = useState<number>(10);

  const categories = Array.from(new Set(services.map((s) => s.category).filter(Boolean)));

  const filteredServices = services.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCategory === 'all' || s.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showToast('⚠️ Vui lòng nhập mã và tên dịch vụ', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode) {
        const newSvc = await masterDataService.createService(
          {
            code: code.trim(),
            name: name.trim(),
            category: category.trim(),
            basePrice: Number(basePrice),
            durationMinutes: Number(durationMinutes),
            commissionPct: Number(commissionPct)
          },
          org.id
        );

        if (newSvc) {
          setServices((prev) => [newSvc, ...prev]);
          showToast(`✅ Đã thêm dịch vụ: ${newSvc.name}`, 'success');
        }
      } else {
        const mockNewSvc = {
          id: `svc_${Date.now()}`,
          orgId: org.id,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          category: category.trim(),
          basePrice: Number(basePrice),
          durationMinutes: Number(durationMinutes),
          commissionPct: Number(commissionPct),
          isActive: true
        };
        setServices((prev) => [mockNewSvc, ...prev]);
        showToast(`✅ Đã thêm dịch vụ demo: ${mockNewSvc.name}`, 'success');
      }

      setIsModalOpen(false);
      setCode('');
      setName('');
      setBasePrice(350000);
      setDurationMinutes(60);
      setCommissionPct(10);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`❌ Lỗi tạo dịch vụ: ${msg}`, 'error');
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
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Danh Mục Dịch Vụ Chuẩn & Bảng Giá Chi Nhánh</h3>
            <p className="text-xs text-slate-500">Cấu hình giá dịch vụ, thời lượng và tỷ lệ hoa hồng KTV ({services.length} dịch vụ)</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Dịch Vụ Mới</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên dịch vụ, mã code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200/70 rounded-xl">
        <table className="w-full text-left text-xs border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Mã Dịch Vụ</th>
              <th className="p-3">Tên Dịch Vụ</th>
              <th className="p-3">Phân Loại</th>
              <th className="p-3 text-center">Thời Lượng</th>
              <th className="p-3 text-right">Đơn Giá Chuẩn</th>
              <th className="p-3 text-center">Hoa Hồng Thợ</th>
              <th className="p-3 text-center">Trạng Thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredServices.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  Chưa có dịch vụ nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredServices.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-700">{s.code}</td>
                  <td className="p-3 font-bold text-slate-900">
                    <p>{s.name}</p>
                    {s.description && <p className="text-[10px] text-slate-400 font-normal">{s.description}</p>}
                  </td>
                  <td className="p-3">
                    <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                      {s.category}
                    </span>
                  </td>
                  <td className="p-3 text-center font-medium text-slate-700">{s.durationMinutes} phút</td>
                  <td className="p-3 text-right font-black text-sm text-sky-700">{(s.basePrice).toLocaleString('vi-VN')}đ</td>
                  <td className="p-3 text-center font-bold text-emerald-700">{s.commissionPct}%</td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Đang Phục Vụ
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm Dịch Vụ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Scissors className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-base text-slate-800">Thêm Dịch Vụ Mới</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateService} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Dịch Vụ (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: DV-FACIAL01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phân Loại</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Chăm Sóc Da"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Dịch Vụ (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Chăm Sóc Da Chuyên Sâu Gold 24K"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-sky-600" /> Giá Chuẩn (đ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-sky-700 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-600" /> Thời Lượng (phút)
                  </label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Percent className="w-3 h-3 text-emerald-600" /> Hoa Hồng (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:bg-white focus:ring-2 focus:ring-sky-500"
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
                  {isSubmitting ? 'Đang Lưu...' : 'Lưu Dịch Vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
