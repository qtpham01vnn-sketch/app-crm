import React, { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PoView: React.FC = () => {
  const { purchaseOrders, goodsReceipts } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'po' | 'grn' | 'ap'>('po');

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Chuỗi Cung Ứng & Nhập Kho (PO - GRN - AP)</h3>
            <p className="text-xs text-slate-500">Quy trình 3 bước: Đặt hàng (PO) → Nhập kho (GRN) → Thanh toán NCC (AP)</p>
          </div>
        </div>

        {/* 3 Step Workflow Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('po')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'po' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            1. Đơn Đặt Hàng (PO)
          </button>
          <button
            onClick={() => setActiveSubTab('grn')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'grn' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            2. Phiếu Nhập Kho (GRN)
          </button>
          <button
            onClick={() => setActiveSubTab('ap')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'ap' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            3. Thanh Toán NCC (AP)
          </button>
        </div>
      </div>

      {activeSubTab === 'po' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Danh Sách Đơn Đặt Hàng PO</h4>
            <button className="text-xs bg-sky-600 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs">
              + Tạo Đơn PO
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Mã PO</th>
                  <th className="p-3">Nhà Cung Cấp</th>
                  <th className="p-3">Ngày Đặt</th>
                  <th className="p-3">Dự Kiến Giao</th>
                  <th className="p-3 text-right">Tổng Tiền Đơn</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-sky-700">{po.poNumber}</td>
                    <td className="p-3 font-bold text-slate-900">{po.supplierName}</td>
                    <td className="p-3 text-slate-600">{po.orderDate}</td>
                    <td className="p-3 text-slate-600">{po.expectedDate}</td>
                    <td className="p-3 text-right font-black text-slate-900">{(po.totalAmount).toLocaleString('vi-VN')}đ</td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          po.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {po.status === 'completed' ? 'Đã Nhập Đủ' : 'Đang Đặt Hàng'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'grn' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Phiếu Nhập Kho Thực Tế (Tăng Tồn Kho)</h4>
            <button className="text-xs bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs">
              + Nhập Kho Mới
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Mã GRN</th>
                  <th className="p-3">Nhà Cung Cấp</th>
                  <th className="p-3">Ngày Nhập Thực Tế</th>
                  <th className="p-3 text-right">Tổng Tiền Nhập</th>
                  <th className="p-3 text-right">Đã Thanh Toán</th>
                  <th className="p-3 text-right">Còn Nợ NCC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {goodsReceipts.map((grn) => (
                  <tr key={grn.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-emerald-700">{grn.grnNumber}</td>
                    <td className="p-3 font-bold text-slate-900">{grn.supplierName}</td>
                    <td className="p-3 text-slate-600">{grn.receivedDate}</td>
                    <td className="p-3 text-right font-black text-slate-900">{(grn.totalAmount).toLocaleString('vi-VN')}đ</td>
                    <td className="p-3 text-right font-bold text-emerald-600">{(grn.paidAmount).toLocaleString('vi-VN')}đ</td>
                    <td className="p-3 text-right font-bold text-rose-600">{(grn.totalAmount - grn.paidAmount).toLocaleString('vi-VN')}đ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'ap' && (
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-3">
          <h4 className="font-bold text-slate-900 text-sm">Sổ Đối Soát Công Nợ Nhà Cung Cấp (Accounts Payable)</h4>
          <p className="text-slate-600">
            Tách biệt hoàn toàn luồng thanh toán với việc nhập kho: cho phép thanh toán từng đợt, cấn trừ công nợ theo từng phiếu nhập GRN.
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-bold text-slate-500">Tổng công nợ phải trả NCC hiện tại:</span>
            <p className="text-xl font-black text-rose-600 mt-0.5">12.500.000đ</p>
          </div>
        </div>
      )}
    </div>
  );
};
