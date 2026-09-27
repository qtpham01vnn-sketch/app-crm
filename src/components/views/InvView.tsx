import React from 'react';
import { Boxes, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const InvView: React.FC = () => {
  const { products, branchStocks, currentBranch } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Kiểm Kê Kho & Điều Chỉnh Tồn Thực Tế</h3>
            <p className="text-xs text-slate-500">Mọi biến động kho phải sinh phiếu xuất/nhập rõ ràng</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Tạo Phiếu Kiểm Kê Mới</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Sản Phẩm</th>
              <th className="p-3 text-center">Đơn Vị</th>
              <th className="p-3 text-center">Tồn Hệ Thống</th>
              <th className="p-3 text-center">Tồn Thực Tế</th>
              <th className="p-3 text-center">Chênh Lệch</th>
              <th className="p-3 text-center">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.map((p) => {
              const stk = branchStocks.find((s) => s.branchId === currentBranch.id && s.productId === p.id);
              const sysStock = stk?.stockOnHand ?? 0;

              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-bold text-slate-900">
                    <p>{p.name}</p>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">{p.code}</span>
                  </td>
                  <td className="p-3 text-center text-slate-500">{p.unit}</td>
                  <td className="p-3 text-center font-bold text-slate-800">{sysStock}</td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      defaultValue={sysStock}
                      className="w-16 p-1 text-center font-bold bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </td>
                  <td className="p-3 text-center font-bold text-emerald-600">0</td>
                  <td className="p-3 text-center">
                    <button className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 px-2.5 py-1 rounded-lg">
                      Cân Bằng Kho
                    </button>
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
