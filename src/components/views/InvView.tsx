import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Search,
  ArrowRightLeft,
  ArrowRight,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
  History
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { BranchTransfer } from '../../types';

export const InvView: React.FC = () => {
  const { products, branchStocks, currentBranch, branches, currentUser, isLiveMode, org, showToast } = useApp();

  // ─── Sub-Tab State ───
  const [activeTab, setActiveTab] = useState<'transfers' | 'lots' | 'stocktake'>('transfers');

  // ─── Live Data States ───
  const [transfers, setTransfers] = useState<BranchTransfer[]>([]);
  const [inventoryLots, setInventoryLots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ─── Smart Filter States ───
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranchId, setFilterBranchId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ─── Modals State ───
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<BranchTransfer | null>(null);

  // ─── Form State: Create Transfer ───
  const [fromBranchId, setFromBranchId] = useState<string>('');
  const [toBranchId, setToBranchId] = useState<string>('');
  const [createNotes, setCreateNotes] = useState('');
  const [transferItems, setTransferItems] = useState<
    Array<{
      product_id: string;
      lot_number?: string;
      expiry_date?: string;
      quantity: number;
      unit_cost?: number;
      notes?: string;
    }>
  >([]);

  // ─── Form State: Receive Transfer Inspection ───
  const [receiveInspectionItems, setReceiveInspectionItems] = useState<
    Array<{
      transfer_item_id: string;
      product_name: string;
      quantity_dispatched: number;
      quantity_already_received: number;
      qty_accepted: number;
      qty_damaged: number;
      qty_missing: number;
      damage_reason: string;
      notes: string;
    }>
  >([]);
  const [receiveNotes, setReceiveNotes] = useState('');

  // ─── Helper: Fetch all transfer & inventory data ───
  const reloadData = useCallback(async () => {
    if (!isLiveMode) return;
    setIsLoading(true);
    try {
      const [transferData, lotData] = await Promise.all([
        masterDataService.getBranchTransfers(currentBranch?.id),
        masterDataService.getInventoryLotStocks(currentBranch?.id)
      ]);
      setTransfers(transferData);
      setInventoryLots(lotData);
    } catch (err) {
      console.error('Lỗi tải dữ liệu kho vận:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLiveMode, currentBranch?.id]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Set default fromBranch when modal opens
  useEffect(() => {
    if (currentBranch?.id) {
      setFromBranchId(currentBranch.id);
      const otherBranch = branches.find((b) => b.id !== currentBranch.id);
      if (otherBranch) {
        setToBranchId(otherBranch.id);
      }
    }
  }, [currentBranch?.id, branches]);

  // ─── HELPER: Check Date Range ───
  const isWithinDateRange = useCallback((dateStr?: string) => {
    if (!dateStr || filterDateRange === 'all') return true;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;
      const now = new Date();

      if (filterDateRange === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        return dateStr.startsWith(todayStr);
      }
      if (filterDateRange === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
        return d >= sevenDaysAgo && d <= now;
      }
      if (filterDateRange === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (filterDateRange === 'custom') {
        if (filterStartDate && d < new Date(filterStartDate + 'T00:00:00')) return false;
        if (filterEndDate && d > new Date(filterEndDate + 'T23:59:59')) return false;
        return true;
      }
      return true;
    } catch {
      return true;
    }
  }, [filterDateRange, filterStartDate, filterEndDate]);

  // ─── Filtered Transfers List ───
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      // 1. Search text
      const s = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !s ||
        t.transferNumber.toLowerCase().includes(s) ||
        (t.fromBranchName && t.fromBranchName.toLowerCase().includes(s)) ||
        (t.toBranchName && t.toBranchName.toLowerCase().includes(s)) ||
        t.items.some((it) => it.productName.toLowerCase().includes(s));
      if (!matchesSearch) return false;

      // 2. Branch Filter
      if (filterBranchId !== 'all') {
        if (t.fromBranchId !== filterBranchId && t.toBranchId !== filterBranchId) return false;
      }

      // 3. Status Filter
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;

      // 4. Date Filter
      if (!isWithinDateRange(t.createdAt)) return false;

      return true;
    });
  }, [transfers, searchTerm, filterBranchId, filterStatus, isWithinDateRange]);

  // Paginated Transfers Slice
  const paginatedTransfers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransfers.slice(start, start + pageSize);
  }, [filteredTransfers, currentPage, pageSize]);

  const isAnyFilterActive = useMemo(() => {
    return (
      searchTerm.trim() !== '' ||
      filterBranchId !== 'all' ||
      filterStatus !== 'all' ||
      filterDateRange !== 'all'
    );
  }, [searchTerm, filterBranchId, filterStatus, filterDateRange]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterBranchId('all');
    setFilterStatus('all');
    setFilterDateRange('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setCurrentPage(1);
  };

  // ─── HANDLER: Open Create Transfer Modal ───
  const handleOpenCreate = () => {
    setServerError(null);
    setCreateNotes('');
    const defaultProd = products[0];
    if (defaultProd) {
      setTransferItems([
        {
          product_id: defaultProd.id,
          quantity: 1,
          unit_cost: defaultProd.costPrice || 0,
          notes: ''
        }
      ]);
    } else {
      setTransferItems([]);
    }
    setIsCreateOpen(true);
  };

  const handleAddItemRow = () => {
    const defaultProd = products[0];
    if (defaultProd) {
      setTransferItems((prev) => [
        ...prev,
        {
          product_id: defaultProd.id,
          quantity: 1,
          unit_cost: defaultProd.costPrice || 0,
          notes: ''
        }
      ]);
    }
  };

  const handleRemoveItemRow = (idx: number) => {
    setTransferItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── SUBMIT: Create Draft Transfer ───
  const handleSubmitCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (fromBranchId === toBranchId) {
      setServerError('Chi nhánh xuất và chi nhánh nhận phải khác nhau.');
      return;
    }
    if (transferItems.length === 0) {
      setServerError('Vui lòng chọn ít nhất một sản phẩm cần chuyển.');
      return;
    }
    for (const it of transferItems) {
      if (it.quantity <= 0) {
        setServerError('Số lượng chuyển của từng mặt hàng phải lớn hơn 0.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const staffId = currentUser?.id || org?.id || '';
      const res = await masterDataService.createBranchTransferRPC({
        orgId: org?.id || '11111111-1111-1111-1111-111111111111',
        fromBranchId,
        toBranchId,
        staffId,
        items: transferItems,
        notes: createNotes.trim() || undefined
      });

      if (!res.success) {
        throw new Error(res.message || 'Lỗi tạo phiếu chuyển kho.');
      }

      showToast(`✅ Đã tạo phiếu điều chuyển nháp #${res.transferNumber} thành công!`, 'success');
      await reloadData();
      setIsCreateOpen(false);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || 'Lỗi khi tạo phiếu điều chuyển.';
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── SUBMIT: Dispatch Transfer (Reduce origin stock, In-transit) ───
  const handleConfirmDispatch = async () => {
    if (!selectedTransfer) return;
    setServerError(null);
    setIsSubmitting(true);

    try {
      const staffId = currentUser?.id || org?.id || '';
      const res = await masterDataService.dispatchBranchTransferRPC({
        orgId: org?.id || selectedTransfer.orgId,
        transferId: selectedTransfer.id,
        staffId,
        notes: 'Xác nhận xuất kho chuyển đi'
      });

      if (!res.success) {
        throw new Error(res.message || 'Lỗi xuất kho chuyển đi.');
      }

      showToast(`🚚 Đã xuất kho phiếu #${selectedTransfer.transferNumber}! Hàng đang vận chuyển.`, 'success');
      await reloadData();
      setIsDispatchOpen(false);
      setSelectedTransfer(null);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || 'Lỗi khi xuất kho chuyển đi.';
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── HANDLER: Open Receive Inspection Modal ───
  const handleOpenReceive = (transfer: BranchTransfer) => {
    setSelectedTransfer(transfer);
    setServerError(null);
    setReceiveNotes('');

    const inspectionEntries = transfer.items.map((it) => {
      const remaining = Math.max(0, it.quantityDispatched - it.quantityReceived);
      return {
        transfer_item_id: it.id,
        product_name: it.productName,
        quantity_dispatched: it.quantityDispatched,
        quantity_already_received: it.quantityReceived,
        qty_accepted: remaining, // Mặc định đề xuất nhận đủ phần còn lại
        qty_damaged: 0,
        qty_missing: 0,
        damage_reason: '',
        notes: ''
      };
    });

    setReceiveInspectionItems(inspectionEntries);
    setIsReceiveOpen(true);
  };

  // ─── SUBMIT: Confirm Receive Inspection at Destination ───
  const handleSubmitReceiveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;
    setServerError(null);

    // Validate entries
    for (const it of receiveInspectionItems) {
      const remaining = it.quantity_dispatched - it.quantity_already_received;
      const totalThisBatch = it.qty_accepted + it.qty_damaged + it.qty_missing;
      if (totalThisBatch > remaining) {
        setServerError(`Sản phẩm "${it.product_name}": Tổng số lượng kiểm nhận (${totalThisBatch}) vượt quá số lượng đang đi đường (${remaining}).`);
        return;
      }
      if (it.qty_damaged > 0 && !it.damage_reason.trim()) {
        setServerError(`Sản phẩm "${it.product_name}": Vui lòng nhập lý do hàng hỏng / cách ly.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const staffId = currentUser?.id || org?.id || '';
      const payloadItems = receiveInspectionItems.map((it) => ({
        transfer_item_id: it.transfer_item_id,
        qty_accepted: it.qty_accepted,
        qty_damaged: it.qty_damaged,
        qty_missing: it.qty_missing,
        damage_reason: it.damage_reason.trim() || undefined,
        notes: it.notes.trim() || undefined
      }));

      const res = await masterDataService.receiveBranchTransferRPC({
        orgId: org?.id || selectedTransfer.orgId,
        transferId: selectedTransfer.id,
        staffId,
        items: payloadItems,
        notes: receiveNotes.trim() || undefined
      });

      if (!res.success) {
        throw new Error(res.message || 'Lỗi nhận hàng chuyển kho.');
      }

      showToast(`📦 Đã xác nhận nhập kho phiếu #${selectedTransfer.transferNumber}! Tồn kho khả dụng chi nhánh nhận đã tăng.`, 'success');
      await reloadData();
      setIsReceiveOpen(false);
      setSelectedTransfer(null);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || 'Lỗi khi xác nhận nhập kho.';
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── HELPER: Render Pagination Controls ───
  const renderPagination = (totalItems: number) => {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (totalItems === 0) return null;

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 px-2 border-t border-slate-100 text-xs">
        <div className="text-slate-500">
          Hiển thị{' '}
          <span className="font-bold text-slate-800">
            {totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </span>{' '}
          -{' '}
          <span className="font-bold text-slate-800">
            {Math.min(totalItems, currentPage * pageSize)}
          </span>{' '}
          trên tổng số <span className="font-black text-sky-700">{totalItems}</span> phiếu
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-slate-400">Hiển thị:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-medium"
            >
              <option value={10}>10 dòng</option>
              <option value={20}>20 dòng</option>
              <option value={50}>50 dòng</option>
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Trang sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* ─── Header & Sub-Tab Navigation ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Kho Vận & Điều Chuyển (Đợt B: Inter-branch Transfers)</h3>
            <p className="text-xs text-slate-500">
              Quy trình chuẩn: Lập phiếu nháp ➔ Xuất chuyển (Giảm tồn A, In-transit) ➔ Nhận hàng (Tăng tồn B, Tách cách ly)
            </p>
          </div>
        </div>

        {/* 3 Step Workflow Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => { setActiveTab('transfers'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'transfers' ? 'bg-white text-sky-700 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Điều Chuyển Chi Nhánh ({transfers.length})
          </button>
          <button
            onClick={() => { setActiveTab('lots'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'lots' ? 'bg-white text-emerald-700 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Tồn Kho Theo Lô ({inventoryLots.length})
          </button>
          <button
            onClick={() => { setActiveTab('stocktake'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'stocktake' ? 'bg-white text-purple-700 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Kiểm Kê Kho (Đợt C)
          </button>
        </div>
      </div>

      {/* ─── TAB 1: ĐIỀU CHUYỂN KHO LIÊN CHI NHÁNH ─── */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          {/* ─── SMART FILTER BAR ─── */}
          <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {/* 1. Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm mã phiếu DC, tên chi nhánh, sản phẩm..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-7 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs placeholder:text-slate-400"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* 2. Filter Branch */}
                <div className="w-full sm:w-auto min-w-[160px]">
                  <select
                    value={filterBranchId}
                    onChange={(e) => {
                      setFilterBranchId(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
                  >
                    <option value="all">🏢 Tất cả Chi Nhánh</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Filter Status */}
                <div className="w-full sm:w-auto min-w-[150px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
                  >
                    <option value="all">📊 Tất cả Trạng Thái</option>
                    <option value="draft">📝 Phiếu Nháp</option>
                    <option value="dispatched">🚚 Đang Vận Chuyển</option>
                    <option value="partially_received">📦 Nhận Một Phần</option>
                    <option value="completed">✅ Hoàn Tất Đủ</option>
                    <option value="difference_resolved">⚠️ Có Hàng Hỏng/Thiếu</option>
                  </select>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleOpenCreate}
                className="w-full sm:w-auto text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Lập Phiếu Chuyển Kho Mới</span>
              </button>
            </div>

            {/* Quick Date Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Thời Gian:</span>
                </span>

                {(
                  [
                    { id: 'all', label: 'Toàn bộ thời gian' },
                    { id: 'today', label: 'Hôm nay' },
                    { id: '7days', label: '7 ngày qua' },
                    { id: 'month', label: 'Tháng này' },
                    { id: 'custom', label: 'Tùy chọn ngày...' }
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setFilterDateRange(t.id);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      filterDateRange === t.id
                        ? 'bg-sky-600 text-white font-bold shadow-2xs'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}

                {filterDateRange === 'custom' && (
                  <div className="flex items-center space-x-1.5 ml-1 bg-white p-1 rounded-lg border border-slate-200">
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => {
                        setFilterStartDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="text-xs px-1.5 py-0.5 border border-slate-200 rounded text-slate-700"
                    />
                    <span className="text-slate-400 text-xs">đến</span>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => {
                        setFilterEndDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="text-xs px-1.5 py-0.5 border border-slate-200 rounded text-slate-700"
                    />
                  </div>
                )}
              </div>

              {isAnyFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center space-x-1 px-2.5 py-1 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-bold transition-colors ml-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Xóa bộ lọc</span>
                </button>
              )}
            </div>
          </div>

          {/* ─── TRANSFERS TABLE ─── */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Mã Phiếu</th>
                  <th className="p-3">Tuyến Điều Chuyển</th>
                  <th className="p-3">Ngày Lập / Xuất</th>
                  <th className="p-3">Mặt Hàng & Số Lượng</th>
                  <th className="p-3 text-right">Tổng Giá Trị</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Đang tải danh sách phiếu điều chuyển...
                    </td>
                  </tr>
                ) : filteredTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      {isAnyFilterActive ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-slate-600">Không tìm thấy phiếu điều chuyển nào phù hợp với bộ lọc hiện tại.</p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="text-sky-600 hover:text-sky-700 font-bold underline text-xs"
                          >
                            Đặt lại bộ lọc để xem toàn bộ
                          </button>
                        </div>
                      ) : (
                        'Chưa có phiếu điều chuyển kho nào. Bấm "+ Lập Phiếu Chuyển Kho Mới" để bắt đầu.'
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedTransfers.map((t) => {
                    const isOrigin = currentBranch?.id === t.fromBranchId;
                    const isDest = currentBranch?.id === t.toBranchId;

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-sky-700 whitespace-nowrap">
                          {t.transferNumber}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center space-x-1.5 font-medium">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${isOrigin ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'}`}>
                              {t.fromBranchName || 'Kho Xuất'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${isDest ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-700'}`}>
                              {t.toBranchName || 'Kho Nhận'}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">
                          <div>{t.createdAt}</div>
                          {t.dispatchDate && (
                            <div className="text-[10px] text-slate-400">Xuất: {t.dispatchDate}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="space-y-0.5">
                            {t.items.map((it, idx) => (
                              <div key={idx} className="flex items-center space-x-1 text-[11px]">
                                <span className="font-semibold text-slate-800">{it.productName}:</span>
                                <span className="text-slate-600 font-bold">{it.quantityRequested} {it.productUnit || 'đv'}</span>
                                {it.quantityDispatched > 0 && (
                                  <span className="text-sky-700 font-medium text-[10px]">
                                    (Đã xuất: {it.quantityDispatched})
                                  </span>
                                )}
                                {it.quantityAccepted > 0 && (
                                  <span className="text-emerald-700 font-medium text-[10px]">
                                    (Nhận đạt: {it.quantityAccepted})
                                  </span>
                                )}
                                {it.quantityDamaged > 0 && (
                                  <span className="text-rose-600 font-bold text-[10px] bg-rose-50 px-1 rounded">
                                    ({it.quantityDamaged} hỏng)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right font-black text-slate-900 font-mono whitespace-nowrap">
                          {t.totalValue.toLocaleString('vi-VN')}đ
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              t.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : t.status === 'dispatched'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200 animate-pulse'
                                : t.status === 'partially_received'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : t.status === 'difference_resolved'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {t.status === 'completed'
                              ? '✅ Hoàn Tất Đủ'
                              : t.status === 'dispatched'
                              ? '🚚 Đang Đi Đường'
                              : t.status === 'partially_received'
                              ? '📦 Nhận Một Phần'
                              : t.status === 'difference_resolved'
                              ? '⚠️ Đã Xử Lý Chênh Lệch'
                              : '📝 Bản Nháp'}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1.5">
                            {/* Xem chi tiết */}
                            <button
                              onClick={() => {
                                setSelectedTransfer(t);
                                setIsDetailOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                              title="Xem chi tiết phiếu & lịch sử"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Xuất kho (Khi là Draft) */}
                            {t.status === 'draft' && (
                              <button
                                onClick={() => {
                                  setSelectedTransfer(t);
                                  setIsDispatchOpen(true);
                                }}
                                className="px-2.5 py-1 text-[11px] bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-2xs transition-colors flex items-center space-x-1"
                                title="Xác nhận xuất kho chuyển đi (Giảm tồn tại kho xuất)"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Xuất Kho</span>
                              </button>
                            )}

                            {/* Nhận hàng (Khi Đang đi đường hoặc Nhận 1 phần) */}
                            {(t.status === 'dispatched' || t.status === 'partially_received') && (
                              <button
                                onClick={() => handleOpenReceive(t)}
                                className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs transition-colors flex items-center space-x-1"
                                title="Kiểm nhận hàng tại kho đích"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Nhận Hàng</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {renderPagination(filteredTransfers.length)}
        </div>
      )}

      {/* ─── TAB 2: TỒN KHO THEO LÔ & HẠN DÙNG (BRANCH LOTS) ─── */}
      {activeTab === 'lots' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Theo Dõi Tồn Kho Theo Lô & Hạn Sử Dụng — Chi Nhánh: {currentBranch?.name}
              </h4>
              <p className="text-[11px] text-slate-500">
                Chi tiết tồn theo từng lô hàng, số lượng và giá vốn bình quân (WAC)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Sản Phẩm</th>
                  <th className="p-3">Số Lô Hàng</th>
                  <th className="p-3">Hạn Sử Dụng</th>
                  <th className="p-3 text-right">Tồn Khả Dụng</th>
                  <th className="p-3 text-right">Giá Vốn WAC</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {inventoryLots.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Chưa có dữ liệu lô hàng nào tại chi nhánh này. Lô hàng sẽ tự động sinh khi nhập kho GRN hoặc nhận chuyển kho.
                    </td>
                  </tr>
                ) : (
                  inventoryLots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-bold text-slate-900">{lot.productName}</td>
                      <td className="p-3 font-mono font-bold text-sky-700">{lot.lotNumber}</td>
                      <td className="p-3 text-slate-600">{lot.expiryDate || '—'}</td>
                      <td className="p-3 text-right font-black text-emerald-600 text-sm font-mono">
                        {lot.quantityOnHand} đv
                      </td>
                      <td className="p-3 text-right font-mono text-slate-800">
                        {lot.costPrice?.toLocaleString('vi-VN')}đ
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {lot.status === 'active' ? 'Đang lưu kho' : lot.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: KIỂM KÊ KHO ĐỊNH KỲ (ĐỢT C SẴN SÀNG) ─── */}
      {activeTab === 'stocktake' && (
        <div className="space-y-4">
          <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-2">
            <h4 className="font-bold text-sm text-purple-900 flex items-center space-x-2">
              <Boxes className="w-5 h-5 text-purple-700" />
              <span>Phân Hệ Kiểm Kê & Cân Bằng Tồn Kho Định Kỳ (Đợt C)</span>
            </h4>
            <p className="text-xs text-purple-800/80">
              Kiến trúc chốt số liệu snapshot ➔ Nhập số đếm thực tế ➔ Tự động tính chênh lệch thừa/thiếu ➔ Duyệt sinh bút toán điều chỉnh kho minh bạch.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Sản Phẩm</th>
                  <th className="p-3 text-center">Đơn Vị</th>
                  <th className="p-3 text-center">Tồn Hệ Thống (Snapshot)</th>
                  <th className="p-3 text-center">Tồn Thực Tế (Kiểm Đếm)</th>
                  <th className="p-3 text-center">Chênh Lệch Thừa/Thiếu</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {products.map((p) => {
                  const stk = branchStocks.find((s) => s.branchId === currentBranch?.id && s.productId === p.id);
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
                        <span className="font-bold text-slate-800">{sysStock}</span>
                      </td>
                      <td className="p-3 text-center font-bold text-emerald-600">0</td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Khớp 100%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODAL 1: TẠO PHIẾU ĐIỀU CHUYỂN KHO MỚI ─── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Lập Phiếu Điều Chuyển Kho Liên Chi Nhánh</h3>
                <p className="text-xs text-slate-500">
                  Tạo bản nháp điều chuyển. Tồn kho chỉ giảm tại chi nhánh gửi khi xác nhận "Xuất Kho".
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {serverError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmitCreateTransfer} className="space-y-4">
              {/* Chọn Tuyến Chi Nhánh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Kho Xuất Hàng (Chi Nhánh Gửi) *
                  </label>
                  <select
                    value={fromBranchId}
                    onChange={(e) => setFromBranchId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                    required
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Kho Nhận Hàng (Chi Nhánh Đích) *
                  </label>
                  <select
                    value={toBranchId}
                    onChange={(e) => setToBranchId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                    required
                  >
                    {branches
                      .filter((b) => b.id !== fromBranchId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Danh sách mặt hàng chuyển */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Danh Sách Sản Phẩm Cần Chuyển ({transferItems.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Thêm Sản Phẩm</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {transferItems.map((item, idx) => {
                    const stock = branchStocks.find((s) => s.branchId === fromBranchId && s.productId === item.product_id);
                    const availStock = stock?.stockOnHand ?? 0;

                    return (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={item.product_id}
                            onChange={(e) => {
                              const newProdId = e.target.value;
                              const p = products.find((prod) => prod.id === newProdId);
                              setTransferItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx
                                    ? { ...it, product_id: newProdId, unit_cost: p?.costPrice || 0 }
                                    : it
                                )
                              );
                            }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center space-x-2">
                            <div className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                              Tồn tại kho gửi: <span className="font-bold text-slate-800">{availStock}</span>
                            </div>

                            {transferItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 block">Số lượng chuyển *</label>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                const q = Math.max(1, parseInt(e.target.value) || 1);
                                setTransferItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, quantity: q } : it))
                                );
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800"
                              required
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 block">Số Lô (Tùy chọn)</label>
                            <input
                              type="text"
                              placeholder="Ví dụ: LOT-2026-A1"
                              value={item.lot_number || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTransferItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, lot_number: val } : it))
                                );
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 block">Ghi chú dòng</label>
                            <input
                              type="text"
                              placeholder="Ghi chú đóng gói..."
                              value={item.notes || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTransferItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, notes: val } : it))
                                );
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ghi chú tổng */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ghi Chú Điều Chuyển
                </label>
                <textarea
                  rows={2}
                  placeholder="Nhập lý do điều chuyển, tên đơn vị vận chuyển hoặc ghi chú..."
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  disabled={isSubmitting}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center space-x-1"
                >
                  <span>{isSubmitting ? 'Đang Tạo Phiếu...' : 'Tạo Phiếu Điều Chuyển Nháp'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: XÁC NHẬN XUẤT KHO CHUYỂN ĐI ─── */}
      {isDispatchOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Xác Nhận Xuất Kho Chuyển Đi</h3>
                <p className="text-xs text-slate-500">Phiếu: #{selectedTransfer.transferNumber}</p>
              </div>
            </div>

            {serverError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {serverError}
              </div>
            )}

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-2">
              <p className="font-bold flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Quy tắc vận hành xuất kho:</span>
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-800">
                <li>Tồn kho khả dụng tại <b>{selectedTransfer.fromBranchName}</b> sẽ lập tức bị trừ tương ứng.</li>
                <li>Hàng chuyển sang trạng thái <b>Đang Đi Đường (In-transit)</b>.</li>
                <li>Hành động này được ghi sổ kiểm toán và không thể xóa bỏ.</li>
              </ul>
            </div>

            <div className="space-y-1.5 text-xs text-slate-700 border-y border-slate-100 py-3">
              <div className="flex justify-between font-medium">
                <span>Kho xuất:</span>
                <span className="font-bold text-slate-900">{selectedTransfer.fromBranchName}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Kho nhận:</span>
                <span className="font-bold text-slate-900">{selectedTransfer.toBranchName}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Tổng số lượng:</span>
                <span className="font-bold text-sky-700">{selectedTransfer.totalItems} đơn vị</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Tổng giá trị luân chuyển:</span>
                <span className="font-bold text-slate-900">{selectedTransfer.totalValue.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => { setIsDispatchOpen(false); setSelectedTransfer(null); }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center space-x-1"
              >
                <span>{isSubmitting ? 'Đang Xuất Kho...' : 'Xác Nhận Xuất Kho'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: BIÊN BẢN KIỂM NHẬN HÀNG TẠI KHO ĐÍCH ─── */}
      {isReceiveOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Biên Bản Nghiệm Thu Nhập Kho Chi Nhánh</h3>
                <p className="text-xs text-slate-500">
                  Phiếu #{selectedTransfer.transferNumber} — Nhận tại: <b>{selectedTransfer.toBranchName}</b>
                </p>
              </div>
              <button
                onClick={() => { setIsReceiveOpen(false); setSelectedTransfer(null); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {serverError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmitReceiveInspection} className="space-y-4">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                <p className="font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Quy tắc kiểm nhận & Phân loại chất lượng:</span>
                </p>
                <p className="text-[11px] text-emerald-800">
                  Chỉ số lượng <b>Đạt chuẩn</b> mới được cộng vào tồn kho khả dụng để bán. Hàng <b>Hỏng/Vỡ</b> được chuyển vào kho cách ly.
                </p>
              </div>

              {/* Bảng kiểm nhận từng dòng */}
              <div className="space-y-3">
                {receiveInspectionItems.map((item, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 text-xs">{item.product_name}</span>
                      <div className="text-[11px] text-slate-600">
                        Đã xuất: <span className="font-bold text-slate-800">{item.quantity_dispatched}</span> |
                        Đã nhận trước: <span className="font-bold text-emerald-700">{item.quantity_already_received}</span> |
                        Đang đi đường: <span className="font-bold text-sky-700">{item.quantity_dispatched - item.quantity_already_received}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-emerald-800 block">
                          1. Số Đạt Chuẩn (Tăng Tồn) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={item.qty_accepted}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveInspectionItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, qty_accepted: val } : it))
                            );
                          }}
                          className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-800"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-rose-800 block">
                          2. Hàng Hỏng / Vỡ (Cách Ly)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={item.qty_damaged}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveInspectionItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, qty_damaged: val } : it))
                            );
                          }}
                          className="w-full bg-white border border-rose-300 rounded-lg px-2.5 py-1 text-xs font-bold text-rose-800"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-amber-800 block">
                          3. Thiếu Hụt Thất Lạc
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={item.qty_missing}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setReceiveInspectionItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, qty_missing: val } : it))
                            );
                          }}
                          className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs font-bold text-amber-800"
                        />
                      </div>
                    </div>

                    {item.qty_damaged > 0 && (
                      <div>
                        <label className="text-[10px] font-bold text-rose-700 block">
                          Lý do hàng hỏng / cách ly *
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Vỡ chai, rách nhãn khi vận chuyển..."
                          value={item.damage_reason}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReceiveInspectionItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, damage_reason: val } : it))
                            );
                          }}
                          className="w-full bg-white border border-rose-300 rounded-lg px-2.5 py-1 text-xs text-slate-800"
                          required
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Ghi chú biên bản */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ghi Chú Biên Bản Nghiệm Thu
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú người giao hàng, tình trạng bao bì kiện hàng..."
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsReceiveOpen(false); setSelectedTransfer(null); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  disabled={isSubmitting}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center space-x-1"
                >
                  <span>{isSubmitting ? 'Đang Nhập Kho...' : 'Xác Nhận Nhập Kho Thực Tế'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: CHI TIẾT & LỊCH SỬ ĐIỀU CHUYỂN ─── */}
      {isDetailOpen && selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Chi Tiết Phiếu Điều Chuyển #{selectedTransfer.transferNumber}</h3>
                <p className="text-xs text-slate-500">
                  Tuyến: {selectedTransfer.fromBranchName} ➔ {selectedTransfer.toBranchName}
                </p>
              </div>
              <button
                onClick={() => { setIsDetailOpen(false); setSelectedTransfer(null); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Bảng chi tiết sản phẩm */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Danh Sách Mặt Hàng</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="p-2.5">Sản Phẩm</th>
                      <th className="p-2.5 text-center">Yêu Cầu</th>
                      <th className="p-2.5 text-center">Đã Xuất A</th>
                      <th className="p-2.5 text-center text-emerald-800">Nhận Đạt B</th>
                      <th className="p-2.5 text-center text-rose-800">Hỏng/Cách Ly</th>
                      <th className="p-2.5 text-center text-amber-800">Thiếu Hụt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTransfer.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80">
                        <td className="p-2.5 font-bold text-slate-900">
                          {it.productName}
                          {it.lotNumber && <span className="text-[10px] text-slate-400 font-mono block">[{it.lotNumber}]</span>}
                        </td>
                        <td className="p-2.5 text-center text-slate-700 font-bold">{it.quantityRequested}</td>
                        <td className="p-2.5 text-center text-sky-700 font-bold">{it.quantityDispatched}</td>
                        <td className="p-2.5 text-center text-emerald-700 font-black">{it.quantityAccepted}</td>
                        <td className="p-2.5 text-center text-rose-600 font-bold">{it.quantityDamaged > 0 ? it.quantityDamaged : '—'}</td>
                        <td className="p-2.5 text-center text-amber-600 font-bold">{it.quantityMissing > 0 ? it.quantityMissing : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Nhật ký kiểm toán Timeline */}
            {selectedTransfer.events && selectedTransfer.events.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <History className="w-4 h-4 text-sky-600" />
                  <span>Lịch Sử Tác Nghiệp & Nhật Ký Kiểm Toán (Audit Trail)</span>
                </h4>
                <div className="space-y-2">
                  {selectedTransfer.events.map((ev) => (
                    <div key={ev.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs flex items-start justify-between">
                      <div>
                        <span className="font-bold text-slate-800 capitalize">
                          {ev.eventType === 'created' ? '📝 Lập phiếu nháp' : ev.eventType === 'dispatched' ? '🚚 Xuất kho chuyển đi' : ev.eventType === 'completed' ? '✅ Hoàn tất nhận đủ' : ev.eventType}
                        </span>
                        <span className="text-[11px] text-slate-500 block">Thực hiện bởi: {ev.actorName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{ev.createdAt?.slice(0, 19).replace('T', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setIsDetailOpen(false); setSelectedTransfer(null); }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
