import React, { useState } from 'react';
import { Package, Plus, X, Search, AlertTriangle, CheckCircle2, DollarSign, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { Product } from '../../types';

export const ProdView: React.FC = () => {
  const { products, setProducts, branchStocks, currentBranch, org, showToast, isLiveMode, currentTheme } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSoftLight = currentTheme.isSoftLight;

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Dược Mỹ Phẩm');
  const [unit, setUnit] = useState('Chai');
  const [costPrice, setCostPrice] = useState<number>(150000);
  const [retailPrice, setRetailPrice] = useState<number>(320000);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showToast('⚠️ Vui lòng nhập mã SKU và tên sản phẩm', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode) {
        if (!org?.id) {
          throw new Error('Chưa xác định tổ chức hợp lệ để tạo sản phẩm.');
        }

        const createdProd = await masterDataService.createProduct(
          {
            code: code.trim(),
            name: name.trim(),
            category: category.trim(),
            unit: unit.trim(),
            retailPrice: Number(retailPrice),
            costPrice: Number(costPrice),
            minStockAlert: Number(minStockAlert)
          },
          org.id
        );

        if (!createdProd) {
          throw new Error('Máy chủ Supabase không phản hồi dữ liệu sau khi tạo sản phẩm.');
        }

        setProducts((prev) => [createdProd, ...prev]);
        showToast(`✅ Đã thêm sản phẩm: ${createdProd.name} vào hệ thống`, 'success');
      } else {
        const demoProd: Product = {
          id: `prod_demo_${Date.now()}`,
          orgId: org.id,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          retailPrice: Number(retailPrice),
          costPrice: Number(costPrice),
          commissionPct: 5,
          minStockAlert: Number(minStockAlert),
          isActive: true
        };
        setProducts((prev) => [demoProd, ...prev]);
        showToast(`ℹ️ [Demo Mode] Đã thêm sản phẩm: ${demoProd.name} vào bộ nhớ thử nghiệm`, 'info');
      }

      setIsModalOpen(false);
      setCode('');
      setName('');
      setCostPrice(150000);
      setRetailPrice(320000);
      setMinStockAlert(5);
    } catch (err: unknown) {
      let msg = 'Lỗi lưu sản phẩm';
      if (typeof err === 'string') msg = err;
      else if (err instanceof Error) msg = err.message;
      else if (typeof err === 'object' && err !== null) {
        const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
        msg = anyErr.message || anyErr.details || anyErr.hint || `Lỗi Supabase (Mã: ${anyErr.code || 'UNKNOWN'})`;
      }
      showToast(`❌ Lỗi tạo sản phẩm: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`rounded-2xl p-6 border space-y-6 animate-fade-in ${
        isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
      }`}
      style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs"
            style={{ backgroundColor: currentTheme.iconBg, color: currentTheme.primaryColor }}
          >
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`font-bold text-base ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
              Danh Mục Sản Phẩm & Tồn Kho Chi Nhánh
            </h2>
            <p className={`text-xs ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              Chi nhánh: <b>{currentBranch?.name || 'Chi Nhánh'}</b> • {products.length} mặt hàng
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto text-xs text-white font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-95 hover:opacity-90"
          style={{ backgroundColor: currentTheme.buttonBg }}
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Sản Phẩm Mới</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên sản phẩm, mã SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 border rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 ${
              isSoftLight
                ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F] focus:ring-[#B83D62]'
                : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-sky-500'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            style={selectedCategory === 'all' ? { backgroundColor: currentTheme.buttonBg } : undefined}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              style={selectedCategory === cat ? { backgroundColor: currentTheme.buttonBg } : undefined}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200/70 rounded-xl">
        <table className="w-full text-left text-xs border-collapse min-w-[680px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Mã SKU</th>
              <th className="p-3">Tên Sản Phẩm</th>
              <th className="p-3">Danh Mục</th>
              <th className="p-3 text-center">ĐVT</th>
              <th className="p-3 text-right">Giá Vốn</th>
              <th className="p-3 text-right">Giá Bán Lẻ</th>
              <th className="p-3 text-center">Tồn Kho Hiện Tại</th>
              <th className="p-3 text-center">Trạng Thái Tồn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  Chưa có sản phẩm nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const stk = branchStocks.find((s) => s.branchId === currentBranch?.id && s.productId === p.id);
                const stockOnHand = stk?.stockOnHand ?? 0;
                const isLow = stockOnHand <= p.minStockAlert;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-700">{p.code}</td>
                    <td className="p-3 font-bold text-slate-900">{p.name}</td>
                    <td className="p-3 text-slate-600">
                      <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                        {p.category}
                      </span>
                    </td>
                    <td className="p-3 text-center text-slate-500 font-medium">{p.unit}</td>
                    <td className="p-3 text-right text-slate-500">{(p.costPrice).toLocaleString('vi-VN')}đ</td>
                    <td className="p-3 text-right font-black text-sky-700">{(p.retailPrice).toLocaleString('vi-VN')}đ</td>
                    <td className="p-3 text-center font-black text-sm text-slate-900">{stockOnHand}</td>
                    <td className="p-3 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Cảnh Báo Tồn Thấp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Đủ Tồn
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm Sản Phẩm */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-base text-slate-800">Thêm Sản Phẩm Mới</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã SKU (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: SP-SERUM01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Danh Mục</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Dược Mỹ Phẩm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Sản Phẩm (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Serum Vitamin C 21.5% Pure Brightening"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-600" /> Đơn Vị (ĐVT)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Chai, Lọ, Hộp"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-slate-600" /> Giá Vốn (đ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    required
                    value={costPrice}
                    onChange={(e) => setCostPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-sky-600" /> Giá Bán Lẻ (đ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    required
                    value={retailPrice}
                    onChange={(e) => setRetailPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-sky-700 focus:bg-white focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ngưỡng Báo Tồn Thấp</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={minStockAlert}
                  onChange={(e) => setMinStockAlert(Number(e.target.value))}
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
                  {isSubmitting ? 'Đang Lưu...' : 'Lưu Sản Phẩm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
