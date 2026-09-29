import React, { useState } from 'react';
import { Truck, Plus, Phone, Mail, MapPin, X, Search, History, DollarSign } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { Supplier } from '../../types';

export const SuppView: React.FC = () => {
  const { suppliers, setSuppliers, org, currentBranch, currentUser, showToast, isLiveMode, reloadMasterData } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states: Create Supplier
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');

  // Ledger Modal states
  const [selectedSupForLedger, setSelectedSupForLedger] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<Array<{
    id: string;
    entryType: string;
    referenceType: string;
    referenceId?: string;
    debitAmount: number;
    creditAmount: number;
    balanceAfter: number;
    notes?: string;
    createdAt: string;
  }>>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Quick Pay Modal from Supplier
  const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer');
  const [payBankRef, setPayBankRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.contactName && s.contactName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.phone.includes(searchTerm)
  );

  const handleOpenLedger = async (sup: Supplier) => {
    setSelectedSupForLedger(sup);
    setIsLoadingLedger(true);
    try {
      if (isLiveMode) {
        const data = await masterDataService.getSupplierLedger(sup.id);
        setLedgerEntries(data);
      } else {
        setLedgerEntries([
          {
            id: 'mock-led-1',
            entryType: 'purchase_invoice',
            referenceType: 'grn',
            debitAmount: 0,
            creditAmount: sup.debt,
            balanceAfter: sup.debt,
            notes: 'Hóa đơn mua hàng nhập kho',
            createdAt: '2026-09-26 14:00'
          }
        ]);
      }
    } catch (err) {
      console.error('Lỗi tải sổ cái NCC:', err);
    } finally {
      setIsLoadingLedger(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('⚠️ Vui lòng nhập tên nhà cung cấp và số điện thoại', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode) {
        if (!org?.id) {
          throw new Error('Chưa xác định tổ chức hợp lệ để tạo nhà cung cấp.');
        }

        const createdSup = await masterDataService.createSupplier(
          {
            name: name.trim(),
            contactPerson: contactPerson.trim() || undefined,
            phone: phone.trim()
          },
          org.id
        );

        if (!createdSup) {
          throw new Error('Máy chủ Supabase không phản hồi dữ liệu sau khi tạo nhà cung cấp.');
        }

        setSuppliers((prev: Supplier[]) => [createdSup, ...prev]);
        showToast(`✅ Đã thêm nhà cung cấp: ${createdSup.name} vào hệ thống`, 'success');
      } else {
        const demoSup: Supplier = {
          id: `sup_demo_${Date.now()}`,
          orgId: org?.id || 'demo_org',
          name: name.trim(),
          contactName: contactPerson.trim() || 'Người đại diện',
          phone: phone.trim(),
          debt: 0
        };
        setSuppliers((prev: Supplier[]) => [demoSup, ...prev]);
        showToast(`ℹ️ [Demo Mode] Đã thêm nhà cung cấp: ${demoSup.name} vào bộ nhớ thử nghiệm`, 'info');
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

  const handleQuickPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupForLedger || payAmount <= 0) return;

    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id && currentBranch?.id) {
        const staffId = currentUser?.id || org.id;
        const res = await masterDataService.paySupplierRPC({
          orgId: org.id,
          branchId: currentBranch.id,
          supplierId: selectedSupForLedger.id,
          staffId,
          amount: payAmount,
          paymentMethod: payMethod,
          bankRefCode: payBankRef.trim() || undefined,
          notes: payNotes.trim() || undefined
        });

        if (!res.success) throw new Error(res.message || 'Lỗi thanh toán NCC');

        showToast(`✅ Đã thanh toán ${payAmount.toLocaleString('vi-VN')}đ cho ${selectedSupForLedger.name}`, 'success');
        await reloadMasterData();
        await handleOpenLedger(selectedSupForLedger);
      } else {
        showToast(`ℹ️ [Demo Mode] Đã thanh toán ${payAmount.toLocaleString('vi-VN')}đ`, 'success');
      }
      setIsQuickPayOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi thanh toán';
      showToast(`❌ ${msg}`, 'error');
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
            <h3 className="font-bold text-base text-slate-800">Danh Mục & Công Nợ Nhà Cung Cấp</h3>
            <p className="text-xs text-slate-500">Quản lý đối tác cung ứng dược mỹ phẩm, vật tư và sổ cái công nợ AP</p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Nhà Cung Cấp</span>
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, người liên hệ, SĐT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          />
        </div>
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

              {/* Action Button: View Ledger */}
              <div className="pt-2 border-t border-slate-200/60">
                <button
                  onClick={() => handleOpenLedger(sup)}
                  className="w-full py-1.5 px-3 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Xem Sổ Cái & Lịch Sử Công Nợ</span>
                </button>
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

      {/* Modal Sổ Cái Chi Tiết NCC */}
      {selectedSupForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Sổ Cái Công Nợ: {selectedSupForLedger.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Dư nợ hiện tại: <strong className="text-rose-600 font-bold">{selectedSupForLedger.debt.toLocaleString('vi-VN')}đ</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedSupForLedger(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
                    <th className="p-2.5">Thời Gian</th>
                    <th className="p-2.5">Nghiệp Vụ</th>
                    <th className="p-2.5">Diễn Giải</th>
                    <th className="p-2.5 text-right">Giảm Nợ</th>
                    <th className="p-2.5 text-right">Tăng Nợ</th>
                    <th className="p-2.5 text-right">Dư Nợ Sau</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingLedger ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Đang tải dữ liệu...
                      </td>
                    </tr>
                  ) : ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Chưa có giao dịch nào được ghi nhận cho nhà cung cấp này.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/60">
                        <td className="p-2.5 text-slate-500 font-mono text-[11px]">{row.createdAt}</td>
                        <td className="p-2.5">
                          <span className="font-semibold text-slate-800">
                            {row.entryType === 'purchase_invoice'
                              ? 'Hóa Đơn Mua'
                              : row.entryType === 'supplier_payment'
                              ? 'Thanh Toán'
                              : row.entryType === 'supplier_advance'
                              ? 'Đặt Cọc'
                              : 'Trả Hàng NCC'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{row.notes || '—'}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-600">
                          {row.debitAmount > 0 ? `-${row.debitAmount.toLocaleString('vi-VN')}đ` : '—'}
                        </td>
                        <td className="p-2.5 text-right font-bold text-rose-600">
                          {row.creditAmount > 0 ? `+${row.creditAmount.toLocaleString('vi-VN')}đ` : '—'}
                        </td>
                        <td className="p-2.5 text-right font-black text-slate-900">
                          {row.balanceAfter.toLocaleString('vi-VN')}đ
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setPayAmount(selectedSupForLedger.debt);
                  setIsQuickPayOpen(true);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Thanh Toán Công Nợ</span>
              </button>

              <button
                onClick={() => setSelectedSupForLedger(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thanh Toán Nhanh từ Sổ Cái */}
      {isQuickPayOpen && selectedSupForLedger && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-3.5">
            <h4 className="font-bold text-sm text-slate-900">
              Thanh Toán Cho {selectedSupForLedger.name}
            </h4>

            <form onSubmit={handleQuickPay} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Số tiền thanh toán</label>
                <input
                  type="number"
                  step={1000}
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono font-bold text-rose-600"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Phương thức</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'transfer' | 'cash')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold"
                >
                  <option value="transfer">Chuyển khoản ngân hàng</option>
                  <option value="cash">Tiền mặt</option>
                </select>
              </div>

              {payMethod === 'transfer' && (
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Mã tham chiếu</label>
                  <input
                    type="text"
                    value={payBankRef}
                    onChange={(e) => setPayBankRef(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono"
                    placeholder="UNC ngân hàng"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-600 font-bold mb-1">Ghi chú</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2"
                  placeholder="Ghi chú chi trả..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickPayOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
                >
                  {isSubmitting ? 'Đang Lưu...' : 'Xác Nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
