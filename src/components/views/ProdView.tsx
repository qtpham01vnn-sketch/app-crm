import React from 'react';
import { Package, Plus, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ProdView: React.FC = () => {
  const { products, branchStocks, currentBranch } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Danh Mục Sản Phẩm & Tồn Kho Chi Nhánh</h3>
            <p className="text-xs text-slate-500">Chi nhánh hiện tại: {currentBranch.name} ({currentBranch.code})</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Thêm Sản Phẩm Mới</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
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
            {products.map((p) => {
              const stk = branchStocks.find((s) => s.branchId === currentBranch.id && s.productId === p.id);
              const stockOnHand = stk?.stockOnHand ?? 0;
              const isLow = stockOnHand <= p.minStockAlert;

              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-700">{p.code}</td>
                  <td className="p-3 font-bold text-slate-900">{p.name}</td>
                  <td className="p-3 text-slate-600">{p.category}</td>
                  <td className="p-3 text-center text-slate-500">{p.unit}</td>
                  <td className="p-3 text-right text-slate-500">{(p.costPrice).toLocaleString('vi-VN')}đ</td>
                  <td className="p-3 text-right font-black text-sky-700">{(p.retailPrice).toLocaleString('vi-VN')}đ</td>
                  <td className="p-3 text-center font-black text-sm text-slate-900">{stockOnHand}</td>
                  <td className="p-3 text-center">
                    {isLow ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> Cảnh Báo Tồn Thấp
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        Đủ Tồn
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
