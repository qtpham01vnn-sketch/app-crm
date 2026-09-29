import React, { useState } from 'react';
import { Printer, CheckCircle, X, FileText, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Hàm đọc số 3 chữ số tiếng Việt chuẩn ngữ pháp
const readThreeDigits = (hundred: number, ten: number, unit: number, isFirstGroup: boolean): string => {
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  let res = '';
  
  if (!isFirstGroup || hundred > 0) {
    res += digits[hundred] + ' trăm ';
  }
  
  if (ten === 0) {
    if (unit > 0 && (!isFirstGroup || hundred > 0)) {
      res += 'lẻ ';
    }
  } else if (ten === 1) {
    res += 'mười ';
  } else {
    res += digits[ten] + ' mươi ';
  }
  
  if (unit === 1 && ten > 1) {
    res += 'mốt';
  } else if (unit === 5 && ten >= 1) {
    res += 'lăm';
  } else if (unit > 0) {
    res += digits[unit];
  }
  
  return res.trim();
};

export const numberToVietnameseWords = (num: number): string => {
  if (!num || num === 0) return 'Không đồng chẵn.';
  const n = Math.abs(Math.round(num));
  const numStr = n.toString();
  const groups: string[] = [];
  for (let i = numStr.length; i > 0; i -= 3) {
    groups.unshift(numStr.substring(Math.max(0, i - 3), i));
  }

  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  let words = '';

  for (let i = 0; i < groups.length; i++) {
    const padded = groups[i].padStart(3, '0');
    const h = parseInt(padded[0], 10);
    const t = parseInt(padded[1], 10);
    const u = parseInt(padded[2], 10);
    const groupVal = parseInt(groups[i], 10);

    if (groupVal > 0) {
      const isFirst = (i === 0);
      const groupWord = readThreeDigits(h, t, u, isFirst);
      const scaleIndex = groups.length - 1 - i;
      words += groupWord + ' ' + scales[scaleIndex] + ' ';
    }
  }

  words = words.trim().replace(/\s+/g, ' ');
  if (!words) return 'Không đồng chẵn.';
  return words.charAt(0).toUpperCase() + words.slice(1) + ' đồng chẵn.';
};

export const InvoiceModal: React.FC = () => {
  const { activeInvoiceSaleId, setActiveInvoiceSaleId, sales, org, currentBranch } = useApp();
  const [printFormat, setPrintFormat] = useState<'a5' | 'k80' | 'k58'>('a5');
  const [isBankConfirmed, setIsBankConfirmed] = useState(false);

  if (!activeInvoiceSaleId) return null;

  const sale = sales.find((s) => s.id === activeInvoiceSaleId);
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  // Tách ngày giờ
  const today = new Date();
  const day = today.getDate().toString().padStart(2, '0');
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const year = today.getFullYear();

  // VietQR URL
  const vietQrUrl = `https://img.vietqr.io/image/970407-19036888999011-compact2.png?amount=${sale.total}&addInfo=${encodeURIComponent(sale.invoiceNo + ' ' + sale.customerName)}&accountName=PHUONG%20NAM%20GROUP`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[94vh]">
        
        {/* Top Action Bar (Không in) */}
        <div className="bg-[#244B3C] text-white px-5 py-3.5 flex items-center justify-between no-print">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-300 shrink-0" />
            <div>
              <span className="font-bold text-sm block">XUẤT HÓA ĐƠN & PHIẾU THU THÀNH CÔNG</span>
              <span className="text-[11px] text-emerald-100">Số phiếu: #{sale.invoiceNo}</span>
            </div>
          </div>
          <button
            onClick={() => setActiveInvoiceSaleId(null)}
            className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh chọn khổ in (Không in) */}
        <div className="bg-slate-50 px-4 sm:px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
          <span className="font-semibold text-slate-700">Mẫu in văn bản:</span>
          <div className="flex space-x-1 sm:space-x-1.5 bg-slate-200/80 p-0.5 rounded-lg overflow-x-auto">
            <button
              onClick={() => setPrintFormat('a5')}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1 ${
                printFormat === 'a5'
                  ? 'bg-white text-[#244B3C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>A4 / A5 (TCVN)</span>
            </button>
            <button
              onClick={() => setPrintFormat('k80')}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1 ${
                printFormat === 'k80'
                  ? 'bg-white text-[#244B3C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Bill K80 (80mm)</span>
            </button>
            <button
              onClick={() => setPrintFormat('k58')}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1 ${
                printFormat === 'k58'
                  ? 'bg-white text-[#244B3C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Bill K58 (58mm Mini)</span>
            </button>
          </div>
        </div>

        {/* VÙNG IN VĂN BẢN (PRINTABLE AREA) */}
        <div className="overflow-y-auto flex-1 p-3 sm:p-6 bg-slate-100/70 flex justify-center">
          
          {/* MẪU 1: PHIẾU THU / HÓA ĐƠN CHUẨN THỂ THỨC TCVN (A4 / A5) */}
          {printFormat === 'a5' && (
            <div className="print-receipt-container bg-white shadow-md border-2 border-black w-full max-w-[750px] p-5 sm:p-7 text-black font-serif text-[13px] leading-relaxed relative">
              <div className="border border-black p-4 sm:p-5 space-y-3">
                <div className="flex justify-between items-start border-b border-black pb-2 text-[12px] font-sans">
                  <div className="space-y-0.5">
                    <div className="font-bold uppercase text-[13px] tracking-tight">{org.name || 'HỆ THỐNG THẨM MỸ & NHA KHOA PHƯƠNG NAM'}</div>
                    <div>{currentBranch.name}: {currentBranch.address}</div>
                    <div>Hotline: <strong className="font-semibold">{currentBranch.phone || '028 3822 9999'}</strong> | MST: 0314899988</div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <div className="font-bold">Mẫu số: 01-TT / SP-NK</div>
                    <div>Số HĐ: <strong className="font-mono text-sm">{sale.invoiceNo}</strong></div>
                    <div className="italic text-[11px]">Ký hiệu: PN/{year}</div>
                  </div>
                </div>

                <div className="text-center py-1">
                  <h2 className="font-bold text-lg sm:text-xl uppercase tracking-wide text-black font-sans">
                    HÓA ĐƠN BÁN HÀNG & PHIẾU THU DỊCH VỤ
                  </h2>
                  <div className="italic text-xs font-serif pt-0.5">
                    Ngày {day} tháng {month} năm {year} (Giờ xuất: {sale.time})
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px] font-sans border-y border-dashed border-black py-2">
                  <div>
                    Họ tên khách hàng: <strong className="font-semibold text-black uppercase">{sale.customerName}</strong>
                  </div>
                  <div>
                    Hình thức: <strong className="font-semibold capitalize">{sale.paymentMethod === 'cash' ? 'Tiền mặt' : sale.paymentMethod === 'bank_transfer' ? 'Chuyển khoản VietQR' : 'Thẻ / Khác'}</strong>
                  </div>
                  <div>
                    Nhân viên thu ngân: <span>{sale.staffName || 'BS. Phạm Minh Tuấn'}</span>
                  </div>
                  <div>
                    Trạng thái: <strong className={sale.debtAmount > 0 ? 'text-rose-700' : 'text-emerald-800'}>{sale.debtAmount > 0 ? 'Ghi nhận công nợ còn lại' : 'Đã thanh toán đủ 100%'}</strong>
                  </div>
                </div>

                <div className="pt-1">
                  <table className="w-full border-collapse border border-black text-[12px] font-sans">
                    <thead>
                      <tr className="bg-slate-100 font-bold text-center border-b border-black">
                        <th className="border border-black py-1 px-1.5 w-8">STT</th>
                        <th className="border border-black py-1 px-2 text-left">Tên Dịch Vụ / Sản Phẩm / Liệu Trình</th>
                        <th className="border border-black py-1 px-1.5 w-12 text-center">ĐVT</th>
                        <th className="border border-black py-1 px-1.5 w-10 text-center">SL</th>
                        <th className="border border-black py-1 px-2 text-right w-24">Đơn Giá</th>
                        <th className="border border-black py-1 px-2 text-right w-28">Thành Tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-black">
                          <td className="border border-black py-1 text-center">{idx + 1}</td>
                          <td className="border border-black py-1 px-2 font-medium">{item.name}</td>
                          <td className="border border-black py-1 text-center text-[11px]">Gói/Lần</td>
                          <td className="border border-black py-1 text-center font-bold">{item.qty}</td>
                          <td className="border border-black py-1 px-2 text-right font-mono">{item.price.toLocaleString('vi-VN')}</td>
                          <td className="border border-black py-1 px-2 text-right font-mono font-bold">{(item.price * item.qty).toLocaleString('vi-VN')}đ</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-black font-sans">
                        <td colSpan={4} className="border border-black py-1 px-2 text-right font-medium">Tạm tính tiền hàng:</td>
                        <td colSpan={2} className="border border-black py-1 px-2 text-right font-mono font-semibold">{sale.subtotal.toLocaleString('vi-VN')}đ</td>
                      </tr>
                      {sale.discountAmount > 0 && (
                        <tr className="border-t border-black text-rose-800">
                          <td colSpan={4} className="border border-black py-1 px-2 text-right font-medium">Chiết khấu ({sale.discountPct}%):</td>
                          <td colSpan={2} className="border border-black py-1 px-2 text-right font-mono font-semibold">-{sale.discountAmount.toLocaleString('vi-VN')}đ</td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-black font-bold text-[13px] bg-slate-50">
                        <td colSpan={4} className="border border-black py-1.5 px-2 text-right uppercase">TỔNG CỘNG TIỀN PHẢI THANH TOÁN:</td>
                        <td colSpan={2} className="border border-black py-1.5 px-2 text-right font-mono text-sm">{sale.total.toLocaleString('vi-VN')}đ</td>
                      </tr>
                      <tr className="border-t border-black text-[11px]">
                        <td colSpan={3} className="border border-black py-1 px-2">Đã thanh toán: <strong className="font-mono">{sale.paidAmount.toLocaleString('vi-VN')}đ</strong></td>
                        <td colSpan={3} className="border border-black py-1 px-2 text-right">Ghi nợ còn lại: <strong className="font-mono text-rose-700">{sale.debtAmount.toLocaleString('vi-VN')}đ</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="text-[12px] font-sans pt-1">
                  <strong>Số tiền viết bằng chữ:</strong> <span className="italic font-serif font-semibold">{numberToVietnameseWords(sale.total)}</span>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-end pt-3 border-t border-black gap-3">
                  <div className="flex items-center space-x-2 border border-black p-1.5 rounded-sm bg-slate-50">
                    <img src={vietQrUrl} alt="VietQR" className="w-16 h-16 object-contain" />
                    <div className="text-[10px] font-sans leading-tight">
                      <strong>VIETQR 24/7</strong><br />
                      Techcombank: <strong>19036888999011</strong><br />
                      Chủ TK: PHUONG NAM GROUP<br />
                      Nội dung: <strong>{sale.invoiceNo}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center text-[11px] font-sans flex-1">
                    <div>
                      <div className="font-bold uppercase">Người Nộp Tiền</div>
                      <div className="italic text-[10px] text-slate-500">(Ký, họ tên)</div>
                      <div className="h-12"></div>
                      <div className="font-semibold text-slate-800">{sale.customerName}</div>
                    </div>
                    <div>
                      <div className="font-bold uppercase">Kỹ Thuật Viên</div>
                      <div className="italic text-[10px] text-slate-500">(Ký, họ tên)</div>
                      <div className="h-12"></div>
                      <div className="font-semibold text-slate-800">KTV Phụ Trách</div>
                    </div>
                    <div>
                      <div className="font-bold uppercase">Người Lập Phiếu</div>
                      <div className="italic text-[10px] text-slate-500">(Ký, đóng dấu)</div>
                      <div className="h-12"></div>
                      <div className="font-semibold text-slate-800">{sale.staffName || 'BS. Phạm Minh Tuấn'}</div>
                    </div>
                  </div>
                </div>

                <div className="text-center text-[10px] italic font-serif text-slate-600 pt-1 border-t border-dashed border-slate-300">
                  (Phiếu thu này có giá trị xác nhận thanh toán & bảo hành dịch vụ theo quy định của Phương Nam Group)
                </div>
              </div>
            </div>
          )}

          {/* MẪU 2: BILL NHIỆT K80 (80mm) */}
          {printFormat === 'k80' && (
            <div className="print-receipt-container bg-white shadow-xs border border-slate-300 text-slate-900 font-mono w-full max-w-[340px] p-4 text-[12px] leading-relaxed">
              <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
                <h3 className="font-sans font-extrabold text-[14px] text-slate-900 uppercase">
                  {org.name || 'HỆ THỐNG THẨM MỸ & NHA KHOA PHƯƠNG NAM'}
                </h3>
                <p className="text-[11px] text-slate-700">{currentBranch.address}</p>
                <p className="text-[11px] text-slate-700">Hotline: <strong>{currentBranch.phone}</strong></p>
                <div className="pt-1">
                  <span className="font-sans font-bold text-xs uppercase tracking-widest inline-block border-y border-black py-0.5 px-2">
                    PHIẾU THANH TOÁN
                  </span>
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span>Mã HĐ: <strong>{sale.invoiceNo}</strong></span>
                  <span>{sale.date} {sale.time}</span>
                </div>
              </div>

              <div className="space-y-1 py-2 text-[11px] border-b border-dashed border-slate-400">
                <div className="flex justify-between">
                  <span>Khách hàng:</span>
                  <strong>{sale.customerName}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Thu ngân:</span>
                  <span>{sale.staffName}</span>
                </div>
              </div>

              <div className="py-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 text-[11px] font-bold uppercase">
                      <th className="py-1">Món</th>
                      <th className="py-1 text-center w-8">SL</th>
                      <th className="py-1 text-right">Đ.Giá</th>
                      <th className="py-1 text-right">T.Tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-slate-300">
                    {sale.items.map((item, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="py-1 pr-1 font-medium">{item.name}</td>
                        <td className="py-1 text-center">{item.qty}</td>
                        <td className="py-1 text-right font-mono">{item.price.toLocaleString('vi-VN')}</td>
                        <td className="py-1 text-right font-mono font-bold">{(item.price * item.qty).toLocaleString('vi-VN')}đ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 pt-2 border-t-2 border-black text-[11px]">
                <div className="flex justify-between">
                  <span>Tạm tính:</span>
                  <span className="font-mono">{sale.subtotal.toLocaleString('vi-VN')}đ</span>
                </div>
                {sale.discountAmount > 0 && (
                  <div className="flex justify-between text-[#B83D62] font-semibold">
                    <span>Chiết khấu ({sale.discountPct}%):</span>
                    <span className="font-mono">-{sale.discountAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-dashed border-black font-sans">
                  <span>TỔNG CỘNG:</span>
                  <span className="font-mono">{sale.total.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="text-[10px] italic pt-0.5">
                  Bằng chữ: <strong>{numberToVietnameseWords(sale.total)}</strong>
                </div>
                <div className="flex justify-between pt-1">
                  <span>Đã thanh toán ({sale.paymentMethod}):</span>
                  <span className="font-mono font-semibold">{sale.paidAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>

              <div className="mt-3 p-2 bg-slate-50 border border-slate-300 rounded text-center space-y-1">
                <img src={vietQrUrl} alt="VietQR" className="w-24 h-24 mx-auto object-contain" />
                <div className="text-[10px] leading-tight">
                  Quét VietQR Techcombank: <strong>19036888999011</strong>
                </div>
              </div>

              <div className="text-center text-[10px] italic pt-3 border-t border-dashed border-slate-300 mt-2">
                Cảm ơn Quý khách & Hẹn gặp lại quý khách!
              </div>
            </div>
          )}

          {/* MẪU 3: BILL NHIỆT K58 (58mm MINI) */}
          {printFormat === 'k58' && (
            <div className="print-receipt-container bg-white shadow-xs border border-slate-300 text-slate-900 font-mono w-full max-w-[260px] p-2 text-[10px] leading-tight">
              <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-400">
                <h4 className="font-sans font-extrabold text-[12px] uppercase">
                  {org.name || 'PHƯƠNG NAM GROUP'}
                </h4>
                <p className="text-[9px] text-slate-600">{currentBranch.address}</p>
                <p className="text-[9px]">Hotline: <strong>{currentBranch.phone}</strong></p>
                <div className="font-bold text-[11px] pt-0.5 uppercase tracking-wider">
                  PHIẾU THANH TOÁN (K58)
                </div>
                <div className="flex justify-between text-[9px] pt-0.5">
                  <span>#{sale.invoiceNo}</span>
                  <span>{sale.time}</span>
                </div>
              </div>

              <div className="py-1 text-[9px] border-b border-dashed border-slate-300 space-y-0.5">
                <div className="flex justify-between">
                  <span>Khách:</span>
                  <strong className="truncate max-w-[140px]">{sale.customerName}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Thu ngân:</span>
                  <span>{sale.staffName}</span>
                </div>
              </div>

              <div className="py-1">
                <table className="w-full text-left border-collapse text-[9px]">
                  <thead>
                    <tr className="border-b border-slate-400 font-bold uppercase text-[8px]">
                      <th className="py-0.5">Món (SL)</th>
                      <th className="py-0.5 text-right">T.Tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-slate-200">
                    {sale.items.map((item, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="py-1 pr-1">
                          <div className="font-medium text-slate-900 leading-tight">{item.name}</div>
                          <div className="text-slate-500 text-[8px]">SL: {item.qty} x {item.price.toLocaleString('vi-VN')}</div>
                        </td>
                        <td className="py-1 text-right font-bold whitespace-nowrap align-bottom">
                          {(item.price * item.qty).toLocaleString('vi-VN')}đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-0.5 pt-1 border-t-2 border-black text-[9px]">
                <div className="flex justify-between">
                  <span>Tạm tính:</span>
                  <span>{sale.subtotal.toLocaleString('vi-VN')}đ</span>
                </div>
                {sale.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>Giảm ({sale.discountPct}%):</span>
                    <span>-{sale.discountAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] font-extrabold pt-0.5 border-t border-black">
                  <span>TỔNG:</span>
                  <span>{sale.total.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="text-[8px] italic leading-tight pt-0.5">
                  ({numberToVietnameseWords(sale.total)})
                </div>
                <div className="flex justify-between pt-0.5 font-semibold text-emerald-800">
                  <span>Đã trả:</span>
                  <span>{sale.paidAmount.toLocaleString('vi-VN')}đ</span>
                </div>
                {sale.debtAmount > 0 && (
                  <div className="flex justify-between font-bold text-rose-700">
                    <span>Nợ:</span>
                    <span>{sale.debtAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
              </div>

              <div className="mt-2 p-1 bg-slate-50 border border-slate-300 rounded text-center space-y-0.5">
                <img src={vietQrUrl} alt="VietQR" className="w-16 h-16 mx-auto object-contain" />
                <div className="text-[8px] leading-tight">
                  Quét VietQR Techcombank<br />
                  <strong>19036888999011</strong>
                </div>
              </div>

              <div className="text-center text-[8px] italic pt-1 border-t border-dashed border-slate-300 mt-1">
                Cảm ơn Quý khách!
              </div>
            </div>
          )}

        </div>

        {/* Thanh Xác nhận Tiền Ngân Hàng & In Hóa Đơn (Không in) */}
        <div className="bg-white p-3 sm:p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
          
          {/* Badge & Nút Xác thực Ngân Hàng (Có QR không đồng nghĩa đã nhận tiền!) */}
          <div className="flex items-center space-x-2 text-xs w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-slate-700">Thanh toán:</span>
              {isBankConfirmed ? (
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[11px] border border-emerald-300">
                  ✓ Đã khớp tiền ngân hàng
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[11px] border border-amber-300 animate-pulse">
                  ⏳ Chờ xác nhận chuyển khoản
                </span>
              )}
            </div>

            {!isBankConfirmed && (
              <button
                onClick={() => setIsBankConfirmed(true)}
                className="text-[11px] font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-md border border-sky-200 transition-colors"
              >
                Xác nhận đã nhận tiền
              </button>
            )}
          </div>

          {/* Nút bấm in */}
          <div className="flex space-x-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial bg-[#244B3C] hover:bg-[#1a382c] text-white font-semibold py-2 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-950/20 active:scale-[0.98]"
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu ({printFormat.toUpperCase()})</span>
            </button>
            <button
              onClick={() => setActiveInvoiceSaleId(null)}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Đóng
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
