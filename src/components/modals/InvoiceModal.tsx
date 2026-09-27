import React from 'react';
import { Printer, CheckCircle, QrCode, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const InvoiceModal: React.FC = () => {
  const { activeInvoiceSaleId, setActiveInvoiceSaleId, sales, org, currentBranch } = useApp();

  if (!activeInvoiceSaleId) return null;

  const sale = sales.find((s) => s.id === activeInvoiceSaleId);
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Top Action Bar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">HÓA ĐƠN BÁN HÀNG THÀNH CÔNG</span>
          </div>
          <button
            onClick={() => setActiveInvoiceSaleId(null)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt Sheet */}
        <div className="p-6 overflow-y-auto font-mono text-xs text-slate-800 space-y-4 print:p-0">
          {/* Header */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <h3 className="font-sans font-black text-base text-slate-900 tracking-tight">{org.name}</h3>
            <p className="text-[11px] text-slate-600">{currentBranch.address}</p>
            <p className="text-[11px] text-slate-600">Hotline: {currentBranch.phone}</p>
            <div className="pt-2">
              <span className="font-sans font-bold text-sm text-sky-700 uppercase tracking-wider">
                PHIẾU THANH TOÁN
              </span>
            </div>
            <p className="text-[10px] text-slate-500">Mã HĐ: <span className="font-bold text-slate-800">{sale.invoiceNo}</span></p>
            <p className="text-[10px] text-slate-500">Thời gian: {sale.date} {sale.time}</p>
          </div>

          {/* Customer & Cashier Info */}
          <div className="space-y-1 py-1 text-[11px] border-b border-dashed border-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Khách hàng:</span>
              <span className="font-bold text-slate-800">{sale.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Thu ngân:</span>
              <span>{sale.staffName}</span>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-300 text-[10px] text-slate-500 font-bold uppercase">
                  <th className="py-1">Món</th>
                  <th className="py-1 text-center">SL</th>
                  <th className="py-1 text-right">Đơn giá</th>
                  <th className="py-1 text-right">T.Tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-200">
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="py-1.5">
                    <td className="py-1 font-medium pr-1">{item.name}</td>
                    <td className="py-1 text-center text-slate-600">{item.qty}</td>
                    <td className="py-1 text-right text-slate-600">{(item.price).toLocaleString('vi-VN')}</td>
                    <td className="py-1 text-right font-bold text-slate-900">{(item.price * item.qty).toLocaleString('vi-VN')}đ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calculations */}
          <div className="space-y-1.5 pt-2 border-t border-dashed border-slate-300 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Tạm tính:</span>
              <span>{sale.subtotal.toLocaleString('vi-VN')}đ</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Chiết khấu ({sale.discountPct}%):</span>
                <span>-{sale.discountAmount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
            {sale.taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Thuế VAT ({sale.taxPct}%):</span>
                <span>+{sale.taxAmount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
            {sale.tipAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tip:</span>
                <span>+{sale.tipAmount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200 font-sans">
              <span>TỔNG CỘNG:</span>
              <span className="text-sky-700">{sale.total.toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="flex justify-between font-semibold text-emerald-700">
              <span>Đã thanh toán ({sale.paymentMethod}):</span>
              <span>{sale.paidAmount.toLocaleString('vi-VN')}đ</span>
            </div>
            {sale.debtAmount > 0 && (
              <div className="flex justify-between font-bold text-rose-600">
                <span>Ghi nợ còn lại:</span>
                <span>{sale.debtAmount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
          </div>

          {/* VietQR Demo Code */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
            <div className="flex items-center justify-center space-x-1 text-sky-700 font-bold text-[11px]">
              <QrCode className="w-4 h-4" />
              <span>VIETQR CHUYỂN KHOẢN TỰ ĐỘNG</span>
            </div>
            <div className="w-24 h-24 mx-auto bg-white border border-slate-300 rounded-lg p-1 flex items-center justify-center">
              <div className="w-full h-full bg-slate-800 rounded flex items-center justify-center text-white text-[9px] font-mono text-center p-1">
                [QR TECHCOMBANK 19008899]
              </div>
            </div>
            <p className="text-[9px] text-slate-500">Quét mã để đối soát tự động</p>
          </div>

          <div className="text-center text-[10px] text-slate-500 italic pt-1">
            Cảm ơn Quý khách! Hẹn gặp lại quý khách!
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex space-x-3">
          <button
            onClick={handlePrint}
            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-sky-600/20"
          >
            <Printer className="w-4 h-4" />
            <span>In Hóa Đơn (K80/A5)</span>
          </button>
          <button
            onClick={() => setActiveInvoiceSaleId(null)}
            className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-white transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
