import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Package,
  Layers,
  DollarSign,
  Undo2,
  RefreshCw,
  X,
  PackagePlus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { PurchaseOrder, GoodsReceiptNote, Product } from '../../types';

const isUuid = (val?: string | null): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export const PoView: React.FC = () => {
  const {
    purchaseOrders,
    setPurchaseOrders,
    goodsReceipts,
    setGoodsReceipts,
    products,
    setProducts,
    suppliers,
    setSuppliers,
    currentBranch,
    org,
    currentUser,
    isLiveMode,
    showToast,
    reloadMasterData
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'po' | 'grn' | 'ap'>('po');
  const [searchTerm, setSearchTerm] = useState('');

  // ─── Smart Filter States ───
  const [filterSupplierId, setFilterSupplierId] = useState<string>('all');
  const [filterProductId, setFilterProductId] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterPoStatus, setFilterPoStatus] = useState<string>('all');
  const [filterGrnHasRejection, setFilterGrnHasRejection] = useState<string>('all');
  const [filterApEntryType, setFilterApEntryType] = useState<string>('all');

  // ─── Pagination States ───
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // ─── Modal States ───
  const [isCreatePoOpen, setIsCreatePoOpen] = useState(false);
  const [isReceiveGrnOpen, setIsReceiveGrnOpen] = useState(false);
  const [isViewPoDetailOpen, setIsViewPoDetailOpen] = useState(false);
  const [isPaySupplierOpen, setIsPaySupplierOpen] = useState(false);
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isQuickAddSupOpen, setIsQuickAddSupOpen] = useState(false);

  // Quick Add Supplier States
  const [quickSupName, setQuickSupName] = useState('');
  const [quickSupPhone, setQuickSupPhone] = useState('');
  const [quickSupContact, setQuickSupContact] = useState('');
  const [quickSupTarget, setQuickSupTarget] = useState<'po' | 'grn'>('po');
  const [isCreatingSup, setIsCreatingSup] = useState(false);

  // Quick Add Product States
  const [isQuickAddProdOpen, setIsQuickAddProdOpen] = useState(false);
  const [quickProdName, setQuickProdName] = useState('');
  const [quickProdCode, setQuickProdCode] = useState('');
  const [quickProdCategory, setQuickProdCategory] = useState('Dược Mỹ Phẩm');
  const [quickProdUnit, setQuickProdUnit] = useState('hộp');
  const [quickProdCostPrice, setQuickProdCostPrice] = useState(100000);
  const [quickProdRetailPrice, setQuickProdRetailPrice] = useState(180000);
  const [quickProdTarget, setQuickProdTarget] = useState<'po' | 'grn'>('po');
  const [quickProdActiveIndex, setQuickProdActiveIndex] = useState<number | null>(null);
  const [isCreatingProd, setIsCreatingProd] = useState(false);

  // Selected entities for modals
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // Sổ cái NCC & Tiền trả trước states
  const [supplierLedger, setSupplierLedger] = useState<Array<{
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
  const [supplierAdvances, setSupplierAdvances] = useState<Array<{
    id: string;
    advanceNumber: string;
    supplierId: string;
    totalAmount: number;
    usedAmount: number;
    remainingAmount: number;
    status: string;
    paymentMethod: string;
    bankRefCode?: string;
    notes?: string;
    createdAt: string;
  }>>([]);
  const [inventoryLots, setInventoryLots] = useState<Array<{
    id: string;
    branchId: string;
    productId: string;
    productName: string;
    lotNumber: string;
    expiryDate?: string;
    quantityOnHand: number;
    costPrice: number;
    status: string;
  }>>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [ledgerSortOrder, setLedgerSortOrder] = useState<'chronological' | 'latest_first'>('chronological');

  // ─── Submitting & Form States ───
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Form State: Create PO
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<Array<{
    productId: string;
    purchaseUnit: string;
    conversionRate: number;
    quantity: number;
    unitCost: number;
  }>>([{ productId: '', purchaseUnit: 'hộp', conversionRate: 1, quantity: 10, unitCost: 100000 }]);

  // Form State: Receive Goods (GRN)
  const [grnPoId, setGrnPoId] = useState<string>('');
  const [grnSupplierId, setGrnSupplierId] = useState('');
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnAdvanceId, setGrnAdvanceId] = useState('');
  const [grnAdvanceAmount, setGrnAdvanceAmount] = useState(0);
  const [grnNotes, setGrnNotes] = useState('');
  const [grnAutoClosePo, setGrnAutoClosePo] = useState(true);
  const [grnItems, setGrnItems] = useState<Array<{
    poItemId?: string;
    productId: string;
    productName?: string;
    lotNumber: string;
    expiryDate: string;
    purchaseUnit: string;
    conversionRate: number;
    qtyReceived: number;
    qtyAccepted: number;
    qtyRejected: number;
    rejectionReason: string;
    unitCost: number;
  }>>([]);

  // Form State: Pay Supplier
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer');
  const [payBankRef, setPayBankRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Form State: Create Advance
  const [advAmount, setAdvAmount] = useState(0);
  const [advMethod, setAdvMethod] = useState('transfer');
  const [advBankRef, setAdvBankRef] = useState('');
  const [advNotes, setAdvNotes] = useState('');

  // Form State: Return to Supplier
  const [retProductId, setRetProductId] = useState('');
  const [retLotNumber, setRetLotNumber] = useState('');
  const [retQty, setRetQty] = useState(1);
  const [retUnitCost, setRetUnitCost] = useState(0);
  const [retIsQuarantine, setRetIsQuarantine] = useState(false);
  const [retIsHoldingRejection, setRetIsHoldingRejection] = useState(false);
  const [retReason, setRetReason] = useState('');

  // ─── Fetch Supplier Ledger & Advances when selecting a supplier ───
  const fetchSupplierDetails = useCallback(async (supId: string) => {
    if (!supId) return;
    setIsLoadingLedger(true);
    try {
      if (isLiveMode) {
        const [ledger, advances] = await Promise.all([
          masterDataService.getSupplierLedger(supId),
          masterDataService.getSupplierAdvances(supId)
        ]);
        setSupplierLedger(ledger);
        setSupplierAdvances(advances);
      } else {
        setSupplierLedger([
          {
            id: 'mock-led-1',
            entryType: 'purchase_invoice',
            referenceType: 'grn',
            referenceId: 'grn-01',
            debitAmount: 6000000,
            creditAmount: 18500000,
            balanceAfter: 12500000,
            notes: 'Nhập hàng phiếu PNK-202609-01',
            createdAt: '2026-09-24 10:30:00'
          }
        ]);
        setSupplierAdvances([]);
      }
    } catch (err) {
      console.error('Lỗi nạp sổ cái NCC:', err);
    } finally {
      setIsLoadingLedger(false);
    }
  }, [isLiveMode]);

  useEffect(() => {
    if (suppliers.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  useEffect(() => {
    if (selectedSupplierId) {
      fetchSupplierDetails(selectedSupplierId);
    }
  }, [selectedSupplierId, fetchSupplierDetails]);

  // Load Lot Stocks, Purchase Orders & Goods Receipts from DB
  useEffect(() => {
    if (isLiveMode && currentBranch?.id) {
      masterDataService.getInventoryLotStocks(currentBranch.id).then(setInventoryLots).catch(console.error);

      masterDataService.getPurchaseOrders(currentBranch.id).then((pos) => {
        if (pos && pos.length > 0) {
          setPurchaseOrders(pos);
        }
      }).catch(console.error);

      masterDataService.getGoodsReceipts(currentBranch.id).then((grns) => {
        if (grns && grns.length > 0) {
          setGoodsReceipts(grns);
        }
      }).catch(console.error);
    }
  }, [isLiveMode, currentBranch?.id, setPurchaseOrders, setGoodsReceipts]);

  // ─── HELPER: Kiểm tra ngày thuộc khoảng lọc ───
  const isWithinDateRange = useCallback((itemDateStr?: string) => {
    if (!itemDateStr || filterDateRange === 'all') return true;
    try {
      const d = new Date(itemDateStr);
      if (isNaN(d.getTime())) return true;
      const now = new Date();

      if (filterDateRange === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        return itemDateStr.startsWith(todayStr);
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

  // ─── Filtered Data: PO ───
  const filteredPos = useMemo(() => {
    return purchaseOrders.filter((po) => {
      // 1. Text Search
      const s = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !s ||
        po.poNumber.toLowerCase().includes(s) ||
        (po.supplierName && po.supplierName.toLowerCase().includes(s)) ||
        po.items.some((it) => it.productName.toLowerCase().includes(s));
      if (!matchesSearch) return false;

      // 2. Supplier Filter
      if (filterSupplierId !== 'all' && po.supplierId !== filterSupplierId) return false;

      // 3. Product Filter
      if (filterProductId !== 'all' && !po.items.some((it) => it.productId === filterProductId)) return false;

      // 4. Status Filter
      if (filterPoStatus !== 'all') {
        const isFullyReceived =
          po.status === 'received' ||
          po.status === 'completed' ||
          (po.items && po.items.length > 0 && po.items.every((it) => it.qtyReceived >= it.qtyOrdered));
        const isPartiallyReceived =
          !isFullyReceived &&
          (po.status === 'partially_received' || (po.items && po.items.some((it) => it.qtyReceived > 0)));

        if (filterPoStatus === 'ordered' && (isFullyReceived || isPartiallyReceived)) return false;
        if (filterPoStatus === 'partially_received' && !isPartiallyReceived) return false;
        if ((filterPoStatus === 'received' || filterPoStatus === 'completed') && !isFullyReceived) return false;
      }

      // 5. Date Filter
      if (!isWithinDateRange(po.orderDate)) return false;

      return true;
    });
  }, [purchaseOrders, searchTerm, filterSupplierId, filterProductId, filterPoStatus, isWithinDateRange]);

  // ─── Filtered Data: GRN ───
  const filteredGrns = useMemo(() => {
    return goodsReceipts.filter((grn) => {
      // 1. Text Search
      const s = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !s ||
        grn.grnNumber.toLowerCase().includes(s) ||
        (grn.supplierName && grn.supplierName.toLowerCase().includes(s)) ||
        (grn.invoiceNumber && grn.invoiceNumber.toLowerCase().includes(s)) ||
        grn.items.some(
          (it) =>
            it.productName.toLowerCase().includes(s) ||
            (it.lotNumber && it.lotNumber.toLowerCase().includes(s))
        );
      if (!matchesSearch) return false;

      // 2. Supplier Filter
      if (filterSupplierId !== 'all' && grn.supplierId !== filterSupplierId) return false;

      // 3. Product Filter
      if (filterProductId !== 'all' && !grn.items.some((it) => it.productId === filterProductId)) return false;

      // 4. Rejection / Defective Filter
      if (filterGrnHasRejection === 'rejected_only') {
        const hasRej = grn.items.some((it) => (it.qtyRejected || 0) > 0);
        if (!hasRej) return false;
      } else if (filterGrnHasRejection === 'accepted_only') {
        const hasRej = grn.items.some((it) => (it.qtyRejected || 0) > 0);
        if (hasRej) return false;
      }

      // 5. Date Filter
      if (!isWithinDateRange(grn.receivedDate)) return false;

      return true;
    });
  }, [goodsReceipts, searchTerm, filterSupplierId, filterProductId, filterGrnHasRejection, isWithinDateRange]);

  // ─── Filtered Data: AP Ledger ───
  const filteredLedger = useMemo(() => {
    return supplierLedger.filter((row) => {
      // 1. Text Search
      const s = searchTerm.trim().toLowerCase();
      const matchesSearch = !s || (row.notes && row.notes.toLowerCase().includes(s));
      if (!matchesSearch) return false;

      // 2. Entry Type Filter
      if (filterApEntryType !== 'all' && row.entryType !== filterApEntryType) return false;

      // 3. Date Filter
      if (!isWithinDateRange(row.createdAt)) return false;

      return true;
    });
  }, [supplierLedger, searchTerm, filterApEntryType, isWithinDateRange]);

  // ─── Paginated Slices ───
  const paginatedPos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPos.slice(start, start + pageSize);
  }, [filteredPos, currentPage, pageSize]);

  const paginatedGrns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGrns.slice(start, start + pageSize);
  }, [filteredGrns, currentPage, pageSize]);

  const paginatedLedger = useMemo(() => {
    const sorted = [...filteredLedger].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return ledgerSortOrder === 'chronological' ? tA - tB : tB - tA;
    });
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [filteredLedger, currentPage, pageSize, ledgerSortOrder]);

  // ─── Check Active Filters & Reset Handler ───
  const isAnyFilterActive = useMemo(() => {
    return (
      searchTerm.trim() !== '' ||
      filterSupplierId !== 'all' ||
      filterProductId !== 'all' ||
      filterDateRange !== 'all' ||
      filterPoStatus !== 'all' ||
      filterGrnHasRejection !== 'all' ||
      filterApEntryType !== 'all'
    );
  }, [
    searchTerm,
    filterSupplierId,
    filterProductId,
    filterDateRange,
    filterPoStatus,
    filterGrnHasRejection,
    filterApEntryType
  ]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterSupplierId('all');
    setFilterProductId('all');
    setFilterDateRange('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterPoStatus('all');
    setFilterGrnHasRejection('all');
    setFilterApEntryType('all');
    setCurrentPage(1);
  };

  // ─── HELPER: Component phân trang tái sử dụng ───
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
          trên tổng số <span className="font-black text-sky-700">{totalItems}</span> bản ghi
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

  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0] || null;
  }, [suppliers, selectedSupplierId]);

  // ─── HELPER: Định dạng ngày giờ thân thiện cho sổ cái ───
  const formatLedgerDateTime = (isoStr: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${minutes} • ${day}/${month}/${year}`;
    } catch {
      return isoStr;
    }
  };

  // ─── HELPER: Thêm dấu phân cách hàng nghìn cho số tiền trong diễn giải ───
  const formatLedgerNotes = (notes?: string) => {
    if (!notes) return '—';
    return notes.replace(/(\d+)(đ)/g, (_match, p1, p2) => {
      return Number(p1).toLocaleString('vi-VN') + p2;
    });
  };

  // ─── HANDLER: Refresh Suppliers from Supabase ───
  const handleRefreshSuppliers = async () => {
    try {
      showToast('🔄 Đang đồng bộ danh sách nhà cung cấp từ máy chủ...', 'info');
      await reloadMasterData();
      showToast('✅ Đã cập nhật danh sách nhà cung cấp mới nhất!', 'success');
    } catch {
      showToast('❌ Không thể tải lại nhà cung cấp.', 'error');
    }
  };

  // ─── HANDLER: Quick Create Supplier directly from Modal ───
  const handleQuickCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupName.trim() || !quickSupPhone.trim()) {
      showToast('⚠️ Vui lòng nhập tên nhà cung cấp và số điện thoại.', 'warning');
      return;
    }

    setIsCreatingSup(true);
    try {
      if (isLiveMode && org?.id) {
        const createdSup = await masterDataService.createSupplier(
          {
            name: quickSupName.trim(),
            contactPerson: quickSupContact.trim() || undefined,
            phone: quickSupPhone.trim()
          },
          org.id
        );

        if (createdSup) {
          setSuppliers((prev) => [createdSup, ...prev]);
          if (quickSupTarget === 'po') {
            setPoSupplierId(createdSup.id);
          } else {
            setGrnSupplierId(createdSup.id);
          }
          showToast(`✅ Đã thêm nhà cung cấp: ${createdSup.name}`, 'success');
        }
      } else {
        const demoSup = {
          id: `sup_demo_${Date.now()}`,
          orgId: org?.id || 'demo_org',
          name: quickSupName.trim(),
          contactName: quickSupContact.trim() || 'Người liên hệ',
          phone: quickSupPhone.trim(),
          debt: 0
        };
        setSuppliers((prev) => [demoSup, ...prev]);
        if (quickSupTarget === 'po') {
          setPoSupplierId(demoSup.id);
        } else {
          setGrnSupplierId(demoSup.id);
        }
        showToast(`✅ Đã thêm nhà cung cấp: ${demoSup.name}`, 'success');
      }

      setIsQuickAddSupOpen(false);
      setQuickSupName('');
      setQuickSupPhone('');
      setQuickSupContact('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo nhà cung cấp.';
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsCreatingSup(false);
    }
  };

  // ─── HANDLER: Open Quick Add Product Modal ───
  const handleOpenQuickAddProduct = (target: 'po' | 'grn' = 'po', rowIndex?: number) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setQuickProdTarget(target);
    setQuickProdActiveIndex(rowIndex !== undefined ? rowIndex : null);
    setQuickProdName('');
    setQuickProdCode(`SP-${randomSuffix}`);
    setQuickProdCategory('Dược Mỹ Phẩm');
    setQuickProdUnit('hộp');
    setQuickProdCostPrice(100000);
    setQuickProdRetailPrice(180000);
    setIsQuickAddProdOpen(true);
  };

  // ─── HANDLER: Submit Quick Add Product ───
  const handleQuickCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickProdName.trim()) {
      showToast('❌ Vui lòng nhập tên sản phẩm.', 'error');
      return;
    }
    if (!quickProdCode.trim()) {
      showToast('❌ Vui lòng nhập mã sản phẩm.', 'error');
      return;
    }
    setIsCreatingProd(true);
    try {
      let createdProduct: Product | null = null;
      if (isLiveMode && org?.id) {
        createdProduct = await masterDataService.createProduct(
          {
            code: quickProdCode.trim().toUpperCase(),
            name: quickProdName.trim(),
            category: quickProdCategory.trim(),
            unit: quickProdUnit.trim(),
            costPrice: Number(quickProdCostPrice) || 0,
            retailPrice: Number(quickProdRetailPrice) || 0,
            minStockAlert: 5
          },
          org.id
        );
      } else {
        createdProduct = {
          id: `prod_demo_${Date.now()}`,
          orgId: org?.id || 'demo_org',
          code: quickProdCode.trim().toUpperCase(),
          name: quickProdName.trim(),
          category: quickProdCategory.trim(),
          unit: quickProdUnit.trim(),
          retailPrice: Number(quickProdRetailPrice) || 0,
          costPrice: Number(quickProdCostPrice) || 0,
          commissionPct: 5,
          minStockAlert: 5,
          isActive: true
        };
      }

      if (createdProduct) {
        // 1. Cập nhật danh sách sản phẩm hiện có
        setProducts((prev) => [createdProduct!, ...prev]);

        // 2. Tự động gán sản phẩm vừa tạo vào form PO hoặc GRN
        if (quickProdTarget === 'po') {
          setPoItems((prev) => {
            if (quickProdActiveIndex !== null && prev[quickProdActiveIndex]) {
              return prev.map((item, idx) =>
                idx === quickProdActiveIndex
                  ? {
                      ...item,
                      productId: createdProduct!.id,
                      purchaseUnit: createdProduct!.unit || 'hộp',
                      unitCost: createdProduct!.costPrice || 100000
                    }
                  : item
              );
            } else {
              return [
                ...prev,
                {
                  productId: createdProduct!.id,
                  purchaseUnit: createdProduct!.unit || 'hộp',
                  conversionRate: 1,
                  quantity: 10,
                  unitCost: createdProduct!.costPrice || 100000
                }
              ];
            }
          });
        } else if (quickProdTarget === 'grn') {
          setGrnItems((prev) => {
            if (quickProdActiveIndex !== null && prev[quickProdActiveIndex]) {
              return prev.map((item, idx) =>
                idx === quickProdActiveIndex
                  ? {
                      ...item,
                      productId: createdProduct!.id,
                      productName: createdProduct!.name,
                      purchaseUnit: createdProduct!.unit || 'hộp',
                      unitCost: createdProduct!.costPrice || 100000
                    }
                  : item
              );
            } else {
              return [
                ...prev,
                {
                  productId: createdProduct!.id,
                  productName: createdProduct!.name,
                  lotNumber: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
                  expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
                  purchaseUnit: createdProduct!.unit || 'hộp',
                  conversionRate: 1,
                  qtyReceived: 10,
                  qtyAccepted: 10,
                  qtyRejected: 0,
                  rejectionReason: '',
                  unitCost: createdProduct!.costPrice || 100000
                }
              ];
            }
          });
        }

        showToast(`✅ Đã thêm sản phẩm mới: ${createdProduct.name} (${createdProduct.code})`, 'success');
        setIsQuickAddProdOpen(false);
      }
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || (err instanceof Error ? err.message : 'Lỗi khi tạo sản phẩm.');
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsCreatingProd(false);
    }
  };

  // ─── HANDLER: Open Create PO Modal ───
  const handleOpenCreatePo = () => {
    setServerError(null);
    setPoSupplierId(suppliers[0]?.id || '');
    setPoExpectedDate(new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]);
    setPoNotes('');
    setPoItems([
      {
        productId: products[0]?.id || '',
        purchaseUnit: 'hộp',
        conversionRate: 1,
        quantity: 10,
        unitCost: products[0]?.costPrice || 100000
      }
    ]);
    setIsCreatePoOpen(true);
  };

  // Add Item in Create PO
  const handleAddPoItem = () => {
    setPoItems((prev) => [
      ...prev,
      {
        productId: products[0]?.id || '',
        purchaseUnit: 'hộp',
        conversionRate: 1,
        quantity: 5,
        unitCost: products[0]?.costPrice || 100000
      }
    ]);
  };

  const handleRemovePoItem = (idx: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── SUBMIT: Create PO ───
  const handleSubmitCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!poSupplierId) {
      setServerError('Vui lòng chọn nhà cung cấp.');
      return;
    }
    if (poItems.length === 0) {
      setServerError('Đơn đặt hàng phải có ít nhất một mặt hàng.');
      return;
    }
    for (const item of poItems) {
      if (!item.productId) {
        setServerError('Vui lòng chọn sản phẩm cho tất cả các dòng.');
        return;
      }
      if (item.quantity <= 0 || item.unitCost < 0 || item.conversionRate < 1) {
        setServerError('Số lượng đặt, giá mua và hệ số quy đổi phải hợp lệ (>= 1).');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id && currentBranch?.id) {
        const staffId = currentUser?.id && isUuid(currentUser.id) ? currentUser.id : null;
        const res = await masterDataService.createPurchaseOrderRPC({
          orgId: org.id,
          branchId: currentBranch.id,
          supplierId: poSupplierId,
          staffId: staffId || undefined as any,
          items: poItems.map((it) => ({
            product_id: it.productId,
            purchase_unit: it.purchaseUnit.trim() || 'đơn vị',
            conversion_rate: it.conversionRate,
            quantity: it.quantity,
            unit_cost: it.unitCost
          })),
          expectedDate: poExpectedDate || undefined,
          notes: poNotes.trim() || undefined
        });

        if (!res.success) {
          throw new Error(res.message || 'Lỗi tạo PO từ server.');
        }

        showToast(`✅ Tạo PO #${res.poNumber} thành công! Tổng tiền: ${(res.totalAmount || 0).toLocaleString('vi-VN')}đ`, 'success');

        const sup = suppliers.find((s) => s.id === poSupplierId);
        const newPoRecord: PurchaseOrder = {
          id: res.poId || `po_${Date.now()}`,
          orgId: org.id,
          branchId: currentBranch.id,
          supplierId: poSupplierId,
          supplierName: sup?.name || 'Nhà cung cấp',
          poNumber: res.poNumber || `PO-${Date.now().toString().slice(-6)}`,
          orderDate: new Date().toISOString().split('T')[0],
          expectedDate: poExpectedDate || undefined,
          totalAmount: res.totalAmount || poItems.reduce((acc, it) => acc + it.quantity * it.unitCost, 0),
          notes: poNotes,
          status: 'ordered',
          items: poItems.map((it) => {
            const prod = products.find((p) => p.id === it.productId);
            return {
              productId: it.productId,
              productName: prod?.name || 'Sản phẩm',
              purchaseUnit: it.purchaseUnit,
              conversionRate: it.conversionRate,
              qtyOrdered: it.quantity,
              qtyReceived: 0,
              unitPrice: it.unitCost,
              lineTotal: it.quantity * it.unitCost
            };
          })
        };

        // Cập nhật ngay lên state hiển thị và dọn dẹp các dòng mock data cũ
        setPurchaseOrders((prev) => [
          newPoRecord,
          ...prev.filter((p) => p.id !== newPoRecord.id && !p.id.startsWith('po_demo_'))
        ]);

        const refreshedPos = await masterDataService.getPurchaseOrders(currentBranch?.id);
        if (refreshedPos && refreshedPos.length > 0) {
          setPurchaseOrders(refreshedPos);
        }
        await reloadMasterData();
      } else {
        // Offline / Demo
        const sup = suppliers.find((s) => s.id === poSupplierId);
        const newMockPo: PurchaseOrder = {
          id: `po_demo_${Date.now()}`,
          orgId: org?.id || 'demo_org',
          branchId: currentBranch?.id || 'demo_branch',
          supplierId: poSupplierId,
          supplierName: sup?.name || 'Nhà cung cấp',
          poNumber: `PO-${Date.now().toString().slice(-6)}`,
          orderDate: new Date().toISOString().split('T')[0],
          expectedDate: poExpectedDate || undefined,
          totalAmount: poItems.reduce((acc, it) => acc + it.quantity * it.unitCost, 0),
          notes: poNotes,
          status: 'ordered',
          items: poItems.map((it) => {
            const prod = products.find((p) => p.id === it.productId);
            return {
              productId: it.productId,
              productName: prod?.name || 'Sản phẩm',
              purchaseUnit: it.purchaseUnit,
              conversionRate: it.conversionRate,
              qtyOrdered: it.quantity,
              qtyReceived: 0,
              unitPrice: it.unitCost,
              lineTotal: it.quantity * it.unitCost
            };
          })
        };
        setPurchaseOrders((prev) => [newMockPo, ...prev]);
        showToast(`ℹ️ [Demo Mode] Tạo đơn PO #${newMockPo.poNumber} thành công`, 'success');
      }

      setIsCreatePoOpen(false);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || (err instanceof Error ? err.message : 'Lỗi hệ thống khi tạo đơn PO.');
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── HANDLER: Đóng Đơn PO Trực Tiếp (Không Chờ Giao Bù) ───
  const handleClosePoDirectly = async (po: PurchaseOrder) => {
    if (!window.confirm(`Xác nhận hoàn tất và đóng đơn đặt hàng #${po.poNumber}?\n\nĐơn sẽ được đánh dấu "Đã Nhập Đủ" và kết thúc nghiệm thu (không chờ giao bù hàng lỗi).`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id) {
        await masterDataService.closePurchaseOrderRPC(po.id, 'Đóng đơn kết thúc nghiệm thu');
        showToast(`✅ Đã đóng và hoàn tất đơn #${po.poNumber}.`, 'success');
        setPurchaseOrders((prev) =>
          prev.map((p) => (p.id === po.id ? { ...p, status: 'received' as const } : p))
        );
        const refreshedPos = await masterDataService.getPurchaseOrders(currentBranch?.id);
        if (refreshedPos && refreshedPos.length > 0) {
          setPurchaseOrders(refreshedPos);
        }
      } else {
        setPurchaseOrders((prev) =>
          prev.map((p) => (p.id === po.id ? { ...p, status: 'received' as const } : p))
        );
        showToast(`ℹ️ [Demo Mode] Đã đóng đơn #${po.poNumber}.`, 'success');
      }
      setIsViewPoDetailOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi đóng đơn đặt hàng.';
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── HANDLER: Open Receive Goods Modal (GRN) from PO or Standalone ───
  const handleOpenReceiveGrn = (po?: PurchaseOrder) => {
    setServerError(null);
    setGrnAutoClosePo(true);
    if (po) {
      if (po.status === 'received' || po.status === 'completed') {
        showToast(`Đơn đặt hàng #${po.poNumber} đã được nhập đủ trước đó, không thể nhận thêm.`, 'warning');
        return;
      }
      const hasRemaining = po.items.some((it) => it.qtyOrdered > it.qtyReceived);
      if (!hasRemaining && po.items.length > 0) {
        showToast(`Tất cả mặt hàng trong đơn #${po.poNumber} đã được nhập kho đủ.`, 'warning');
        return;
      }

      setGrnPoId(po.id);
      setGrnSupplierId(po.supplierId);
      // Pre-fill items from PO
      const unreceivedItems = po.items.map((it) => {
        const remaining = Math.max(0, it.qtyOrdered - it.qtyReceived);
        return {
          poItemId: it.id,
          productId: it.productId,
          productName: it.productName,
          lotNumber: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
          expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
          purchaseUnit: it.purchaseUnit || 'hộp',
          conversionRate: it.conversionRate || 1,
          qtyReceived: remaining,
          qtyAccepted: remaining,
          qtyRejected: 0,
          rejectionReason: '',
          unitCost: it.unitPrice
        };
      });
      setGrnItems(unreceivedItems);
    } else {
      setGrnPoId('');
      setGrnSupplierId(suppliers[0]?.id || '');
      setGrnItems([
        {
          productId: products[0]?.id || '',
          productName: products[0]?.name || 'Sản phẩm',
          lotNumber: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
          expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
          purchaseUnit: 'hộp',
          conversionRate: 1,
          qtyReceived: 10,
          qtyAccepted: 10,
          qtyRejected: 0,
          rejectionReason: '',
          unitCost: products[0]?.costPrice || 100000
        }
      ]);
    }
    setGrnInvoiceNo('');
    setGrnAdvanceId('');
    setGrnAdvanceAmount(0);
    setGrnNotes('');
    setIsReceiveGrnOpen(true);
  };

  // ─── SUBMIT: Confirm GRN ───
  const handleSubmitConfirmGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!grnSupplierId) {
      setServerError('Vui lòng chọn nhà cung cấp.');
      return;
    }
    if (grnItems.length === 0) {
      setServerError('Phiếu nhận hàng phải có ít nhất một mặt hàng.');
      return;
    }

    for (const item of grnItems) {
      if (item.qtyReceived < 0 || item.qtyAccepted < 0 || item.qtyRejected < 0) {
        setServerError('Số lượng thực nhận, đạt chuẩn hoặc lỗi không được âm.');
        return;
      }
      if (item.qtyAccepted + item.qtyRejected !== item.qtyReceived) {
        setServerError(`Dòng "${item.productName}": Tổng số đạt chuẩn (${item.qtyAccepted}) và lỗi (${item.qtyRejected}) phải bằng thực nhận (${item.qtyReceived}).`);
        return;
      }
      if (item.qtyRejected > 0 && !item.rejectionReason.trim()) {
        setServerError(`Dòng "${item.productName}": Có ${item.qtyRejected} sản phẩm lỗi nhưng chưa nhập lý do từ chối.`);
        return;
      }
      if (item.conversionRate < 1) {
        setServerError('Hệ số quy đổi đơn vị phải >= 1.');
        return;
      }
    }

    // Kiểm tra nhận vượt số đặt nếu liên kết đơn PO
    if (grnPoId) {
      const linkedPo = purchaseOrders.find((p) => p.id === grnPoId);
      if (linkedPo) {
        for (const item of grnItems) {
          const poItem = linkedPo.items.find(
            (pi) => (item.poItemId && pi.id === item.poItemId) || pi.productId === item.productId
          );
          if (poItem) {
            const remaining = Math.max(0, poItem.qtyOrdered - poItem.qtyReceived);
            if (item.qtyAccepted > remaining) {
              setServerError(
                `Dòng "${item.productName}": Số lượng đạt chuẩn (${item.qtyAccepted}) vượt quá số lượng còn chờ giao của đơn đặt hàng (${remaining} ${poItem.purchaseUnit || 'đơn vị'}). Vui lòng điều chỉnh hoặc tạo PO bổ sung nếu NCC giao thêm.`
              );
              return;
            }
          }
        }
      }
    }

    // Kiểm tra cấn trừ cọc
    if (grnAdvanceId && grnAdvanceAmount > 0) {
      const adv = supplierAdvances.find((a) => a.id === grnAdvanceId);
      if (!adv || adv.remainingAmount < grnAdvanceAmount) {
        setServerError(`Khoản trả trước không hợp lệ hoặc số dư không đủ (Khả dụng: ${(adv?.remainingAmount || 0).toLocaleString('vi-VN')}đ).`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id && currentBranch?.id) {
        const staffId = currentUser?.id && isUuid(currentUser.id) ? currentUser.id : null;
        const res = await masterDataService.confirmGoodsReceiptRPC({
          orgId: org.id,
          branchId: currentBranch.id,
          poId: grnPoId || undefined,
          supplierId: grnSupplierId,
          staffId: staffId || undefined as any,
          invoiceNumber: grnInvoiceNo.trim() || undefined,
          advanceId: grnAdvanceId || undefined,
          advancePaid: grnAdvanceAmount,
          notes: grnNotes.trim() || undefined,
          closePo: grnAutoClosePo,
          items: grnItems.map((it) => ({
            po_item_id: it.poItemId,
            product_id: it.productId,
            lot_number: it.lotNumber.trim() || 'LOT-DEFAULT',
            expiry_date: it.expiryDate || undefined,
            purchase_unit: it.purchaseUnit,
            conversion_rate: it.conversionRate,
            qty_received: it.qtyReceived,
            qty_accepted: it.qtyAccepted,
            qty_rejected: it.qtyRejected,
            rejection_reason: it.rejectionReason.trim() || undefined,
            unit_cost: it.unitCost
          }))
        });

        if (!res.success) {
          throw new Error(res.message || 'Lỗi xác nhận nhập kho từ máy chủ.');
        }

        showToast(`✅ Xác nhận nhập kho #${res.grnNumber} thành công! Tồn kho đã tăng, sổ cái công nợ đã ghi nhận.`, 'success');

        const sup = suppliers.find((s) => s.id === grnSupplierId);
        const totalAcceptedVal = grnItems.reduce((acc, it) => acc + it.qtyAccepted * it.unitCost, 0);
        const newGrnRecord: GoodsReceiptNote = {
          id: res.grnId || `grn_${Date.now()}`,
          orgId: org.id,
          branchId: currentBranch.id,
          poId: grnPoId || undefined,
          supplierId: grnSupplierId,
          supplierName: sup?.name || 'Nhà cung cấp',
          grnNumber: res.grnNumber || `PNK-${Date.now().toString().slice(-6)}`,
          invoiceNumber: grnInvoiceNo || undefined,
          receivedDate: new Date().toISOString().split('T')[0],
          receiverStaffId: currentUser?.id || '',
          totalAmount: totalAcceptedVal,
          paidAmount: grnAdvanceAmount,
          notes: grnNotes,
          status: 'confirmed',
          items: grnItems.map((it) => ({
            productId: it.productId,
            productName: it.productName || 'Sản phẩm',
            lotNumber: it.lotNumber,
            expiryDate: it.expiryDate,
            purchaseUnit: it.purchaseUnit,
            conversionRate: it.conversionRate,
            qty: it.qtyReceived,
            qtyAccepted: it.qtyAccepted,
            qtyRejected: it.qtyRejected,
            rejectionReason: it.rejectionReason,
            acceptedBaseUnits: it.qtyAccepted * it.conversionRate,
            unitPrice: it.unitCost,
            lineTotal: it.qtyAccepted * it.unitCost
          }))
        };

        // Cập nhật trạng thái của đơn PO ngay lập tức trong React state
        if (grnPoId) {
          setPurchaseOrders((prev) =>
            prev.map((po) => {
              if (po.id !== grnPoId) return po;
              const updatedItems = po.items.map((pi) => {
                const grnMatch = grnItems.find(
                  (gi) => (gi.poItemId && gi.poItemId === pi.id) || gi.productId === pi.productId
                );
                const addedQty = grnMatch ? grnMatch.qtyAccepted : 0;
                const newQtyReceived = pi.qtyReceived + addedQty;
                return { ...pi, qtyReceived: newQtyReceived };
              });
              const isAllReceived = updatedItems.every((pi) => pi.qtyReceived >= pi.qtyOrdered);
              return {
                ...po,
                items: updatedItems,
                status: (grnAutoClosePo || isAllReceived) ? 'received' : 'partially_received'
              };
            })
          );
        }

        setGoodsReceipts((prev) => [
          newGrnRecord,
          ...prev.filter((g) => g.id !== newGrnRecord.id && !g.id.startsWith('grn_demo_'))
        ]);

        const [refreshedPos, refreshedGrns] = await Promise.all([
          masterDataService.getPurchaseOrders(currentBranch?.id),
          masterDataService.getGoodsReceipts(currentBranch?.id)
        ]);
        if (refreshedPos && refreshedPos.length > 0) {
          setPurchaseOrders(refreshedPos);
        }
        if (refreshedGrns && refreshedGrns.length > 0) {
          setGoodsReceipts(refreshedGrns);
        }
        await reloadMasterData();
        if (selectedSupplierId) {
          await fetchSupplierDetails(selectedSupplierId);
        }
      } else {
        // Offline / Demo
        const sup = suppliers.find((s) => s.id === grnSupplierId);
        const totalAcceptedVal = grnItems.reduce((acc, it) => acc + it.qtyAccepted * it.unitCost, 0);
        const newMockGrn: GoodsReceiptNote = {
          id: `grn_demo_${Date.now()}`,
          orgId: org?.id || 'demo_org',
          branchId: currentBranch?.id || 'demo_branch',
          poId: grnPoId || undefined,
          supplierId: grnSupplierId,
          supplierName: sup?.name || 'Nhà cung cấp',
          grnNumber: `PNK-${Date.now().toString().slice(-6)}`,
          invoiceNumber: grnInvoiceNo || undefined,
          receivedDate: new Date().toISOString().split('T')[0],
          receiverStaffId: currentUser?.id || 'staff_01',
          totalAmount: totalAcceptedVal,
          paidAmount: grnAdvanceAmount,
          notes: grnNotes,
          status: 'confirmed',
          items: grnItems.map((it) => ({
            productId: it.productId,
            productName: it.productName || 'Sản phẩm',
            lotNumber: it.lotNumber,
            expiryDate: it.expiryDate,
            purchaseUnit: it.purchaseUnit,
            conversionRate: it.conversionRate,
            qty: it.qtyReceived,
            qtyAccepted: it.qtyAccepted,
            qtyRejected: it.qtyRejected,
            rejectionReason: it.rejectionReason,
            acceptedBaseUnits: it.qtyAccepted * it.conversionRate,
            unitPrice: it.unitCost,
            lineTotal: it.qtyAccepted * it.unitCost
          }))
        };
        setGoodsReceipts((prev) => [newMockGrn, ...prev]);

        // Cập nhật PO status nếu có
        if (grnPoId) {
          setPurchaseOrders((prev) =>
            prev.map((p) => (p.id === grnPoId ? { ...p, status: 'completed' as const } : p))
          );
        }

        // Cập nhật công nợ nhà cung cấp tức thì
        const netDebtAdded = totalAcceptedVal - grnAdvanceAmount;
        setSuppliers((prev) =>
          prev.map((s) => (s.id === grnSupplierId ? { ...s, debt: Math.max(0, (s.debt || 0) + netDebtAdded) } : s))
        );

        // Ghi sổ cái công nợ AP tức thì
        const calculatedBal = Math.max(0, (selectedSupplier?.debt || 0) + netDebtAdded);
        setSupplierLedger((prev) => [
          {
            id: `led-${Date.now()}`,
            entryType: 'purchase_invoice',
            referenceType: 'grn',
            referenceId: newMockGrn.id,
            debitAmount: grnAdvanceAmount,
            creditAmount: totalAcceptedVal,
            balanceAfter: calculatedBal,
            notes: `Nhập kho #${newMockGrn.grnNumber}${grnAdvanceAmount > 0 ? ` (Đã cấn trừ cọc ${grnAdvanceAmount.toLocaleString('vi-VN')}đ)` : ''}`,
            createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
          },
          ...prev
        ]);

        showToast(`ℹ️ [Demo Mode] Xác nhận nhập kho #${newMockGrn.grnNumber} thành công! Công nợ tăng: ${netDebtAdded.toLocaleString('vi-VN')}đ`, 'success');
      }

      setIsReceiveGrnOpen(false);
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || (err instanceof Error ? err.message : 'Lỗi khi xác nhận nhập kho.');
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── SUBMIT: Pay Supplier AP ───
  const handleSubmitPaySupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (payAmount <= 0) {
      setServerError('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id && currentBranch?.id && selectedSupplierId) {
        const staffId = currentUser?.id && isUuid(currentUser.id) ? currentUser.id : null;
        const res = await masterDataService.paySupplierRPC({
          orgId: org.id,
          branchId: currentBranch.id,
          supplierId: selectedSupplierId,
          staffId: staffId || undefined as any,
          amount: payAmount,
          paymentMethod: payMethod,
          bankRefCode: payBankRef.trim() || undefined,
          notes: payNotes.trim() || undefined
        });

        if (!res.success) {
          throw new Error(res.message || 'Lỗi thanh toán NCC từ máy chủ.');
        }

        showToast(`✅ Đã thanh toán ${(res.amountPaid || payAmount).toLocaleString('vi-VN')}đ cho NCC! Dư nợ còn: ${(res.debtBalanceAfter || 0).toLocaleString('vi-VN')}đ`, 'success');
        await reloadMasterData();
        await fetchSupplierDetails(selectedSupplierId);
      } else {
        const payVal = payAmount;
        setSuppliers((prev) =>
          prev.map((s) => (s.id === selectedSupplierId ? { ...s, debt: Math.max(0, (s.debt || 0) - payVal) } : s))
        );
        const newBal = Math.max(0, (selectedSupplier?.debt || 0) - payVal);
        setSupplierLedger((prev) => [
          {
            id: `pay-led-${Date.now()}`,
            entryType: 'supplier_payment',
            referenceType: 'payment',
            debitAmount: payVal,
            creditAmount: 0,
            balanceAfter: newBal,
            notes: payNotes || `Thanh toán công nợ NCC qua ${payMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}`,
            createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
          },
          ...prev
        ]);
        showToast(`ℹ️ [Demo Mode] Đã thanh toán ${payAmount.toLocaleString('vi-VN')}đ cho NCC`, 'success');
      }

      setIsPaySupplierOpen(false);
      setPayAmount(0);
      setPayBankRef('');
      setPayNotes('');
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || (err instanceof Error ? err.message : 'Lỗi khi thanh toán NCC.');
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── SUBMIT: Create Supplier Advance ───
  const handleSubmitCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (advAmount <= 0) {
      setServerError('Số tiền đặt cọc/trả trước phải lớn hơn 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id && currentBranch?.id && selectedSupplierId) {
        const staffId = currentUser?.id && isUuid(currentUser.id) ? currentUser.id : null;
        const res = await masterDataService.createSupplierAdvanceRPC({
          orgId: org.id,
          branchId: currentBranch.id,
          supplierId: selectedSupplierId,
          staffId: staffId || undefined as any,
          amount: advAmount,
          paymentMethod: advMethod,
          bankRefCode: advBankRef.trim() || undefined,
          notes: advNotes.trim() || undefined
        });

        if (!res.success) {
          throw new Error(res.message || 'Lỗi tạo chứng từ trả trước từ máy chủ.');
        }

        showToast(`✅ Đã tạo chứng từ trả trước #${res.advanceNumber} thành công!`, 'success');
        await reloadMasterData();
        await fetchSupplierDetails(selectedSupplierId);
      } else {
        const advVal = advAmount;
        const newAdv = {
          id: `adv-${Date.now()}`,
          advanceNumber: `TU-${Date.now().toString().slice(-6)}`,
          supplierId: selectedSupplierId,
          totalAmount: advVal,
          usedAmount: 0,
          remainingAmount: advVal,
          status: 'confirmed',
          paymentMethod: advMethod,
          bankRefCode: advBankRef || undefined,
          notes: advNotes || 'Tạm ứng cọc hàng hóa',
          createdAt: new Date().toISOString()
        };
        setSupplierAdvances((prev) => [newAdv, ...prev]);
        setSupplierLedger((prev) => [
          {
            id: `adv-led-${Date.now()}`,
            entryType: 'advance_payment',
            referenceType: 'advance',
            referenceId: newAdv.id,
            debitAmount: advVal,
            creditAmount: 0,
            balanceAfter: Math.max(0, (selectedSupplier?.debt || 0) - advVal),
            notes: `Tạm ứng cọc hàng #${newAdv.advanceNumber}`,
            createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
          },
          ...prev
        ]);
        showToast(`ℹ️ [Demo Mode] Đã tạo khoản trả trước ${advAmount.toLocaleString('vi-VN')}đ`, 'success');
      }

      setIsAdvanceOpen(false);
      setAdvAmount(0);
      setAdvBankRef('');
      setAdvNotes('');
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || (err instanceof Error ? err.message : 'Lỗi khi tạo khoản trả trước.');
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── SUBMIT: Return to Supplier ───
  const handleSubmitReturnGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!retProductId) {
      setServerError('Vui lòng chọn sản phẩm cần xuất trả.');
      return;
    }
    if (retQty <= 0) {
      setServerError('Số lượng xuất trả phải lớn hơn 0.');
      return;
    }
    if (!retReason.trim()) {
      setServerError('Vui lòng nhập lý do xuất trả hàng.');
      return;
    }

    const isHolding = retIsHoldingRejection;
    const debtReduction = isHolding ? 0 : retQty * retUnitCost;

    setIsSubmitting(true);
    try {
      if (isLiveMode && org?.id && currentBranch?.id && selectedSupplierId) {
        const staffId = currentUser?.id && isUuid(currentUser.id) ? currentUser.id : null;
        const res = await masterDataService.returnGoodsToSupplierRPC({
          orgId: org.id,
          branchId: currentBranch.id,
          supplierId: selectedSupplierId,
          staffId: staffId || undefined as any,
          items: [
            {
              product_id: retProductId,
              lot_number: retLotNumber || undefined,
              quantity: retQty,
              unit_cost: retUnitCost,
              is_from_quarantined: retIsQuarantine || isHolding,
              is_holding_rejection: isHolding
            }
          ],
          reason: retReason.trim()
        });

        if (!res.success) {
          throw new Error(res.message || 'Lỗi xuất trả hàng từ máy chủ.');
        }

        const actualDebtReduction = res.totalDebtReduction ?? debtReduction;
        const noteMsg = actualDebtReduction > 0
          ? `Dư nợ NCC đã giảm: ${actualDebtReduction.toLocaleString('vi-VN')}đ`
          : 'Hàng giữ hộ từ chối lúc nhận: Công nợ NCC giữ nguyên (0đ).';

        showToast(`✅ Đã lập phiếu trả hàng #${res.returnNumber}! ${noteMsg}`, 'success');
        await reloadMasterData();
        await fetchSupplierDetails(selectedSupplierId);
      } else {
        if (!isHolding && debtReduction > 0) {
          setSuppliers((prev) =>
            prev.map((s) => (s.id === selectedSupplierId ? { ...s, debt: Math.max(0, (s.debt || 0) - debtReduction) } : s))
          );
        }
        const newBal = isHolding
          ? (selectedSupplier?.debt || 0)
          : Math.max(0, (selectedSupplier?.debt || 0) - debtReduction);

        setSupplierLedger((prev) => [
          {
            id: `ret-led-${Date.now()}`,
            entryType: 'supplier_return',
            referenceType: 'return',
            debitAmount: isHolding ? 0 : debtReduction,
            creditAmount: 0,
            balanceAfter: newBal,
            notes: isHolding
              ? `Xuất trả hàng lỗi giữ hộ (Từ chối lúc nhận, 0đ giảm nợ): ${retReason} (${retQty} SP)`
              : `Xuất trả hàng NCC (Giảm nợ AP): ${retReason} (${retQty} SP)`,
            createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
          },
          ...prev
        ]);
        showToast(
          isHolding
            ? `ℹ️ [Demo Mode] Đã xuất trả ${retQty} sản phẩm lỗi giữ hộ cho NCC (Công nợ giữ nguyên 0đ)`
            : `ℹ️ [Demo Mode] Đã xuất trả ${retQty} sản phẩm cho NCC (Giảm nợ: ${debtReduction.toLocaleString('vi-VN')}đ)`,
          'success'
        );
      }

      setIsReturnOpen(false);
      setRetQty(1);
      setRetReason('');
    } catch (err: unknown) {
      const errorObj = err as any;
      const msg = errorObj?.message || errorObj?.details || (err instanceof Error ? err.message : 'Lỗi khi trả hàng NCC.');
      setServerError(msg);
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      {/* ─── Header & Sub-Tab Navigation ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Kho Vận & Nhà Cung Cấp (Đợt A: PO - GRN - AP)</h3>
            <p className="text-xs text-slate-500">
              Quy trình chuẩn: Đặt hàng (PO) → Nhận hàng từng phần (GRN) → Quản lý Lô & Cách ly → Sổ cái công nợ & Trả trước (AP)
            </p>
          </div>
        </div>

        {/* 3 Step Workflow Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => { setActiveSubTab('po'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'po' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Đơn Đặt Hàng ({purchaseOrders.length})
          </button>
          <button
            onClick={() => { setActiveSubTab('grn'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'grn' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Phiếu Nhập Kho ({goodsReceipts.length})
          </button>
          <button
            onClick={() => { setActiveSubTab('ap'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'ap' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Sổ Cái & Công Nợ NCC (AP)
          </button>
        </div>
      </div>

      {/* ─── SMART FILTER BAR (Bộ Lọc Thông Minh Đa Tiêu Chí & Tác Vụ Nhanh) ─── */}
      <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs">
        {/* Hàng 1: Tìm kiếm từ khóa + Lọc Nhà Cung Cấp + Lọc Sản Phẩm + Lọc Trạng thái/Loại + Nút Thao Tác */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* 1. Ô Tìm kiếm chung */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={
                  activeSubTab === 'po'
                    ? "Tìm mã PO, nhà cung cấp..."
                    : activeSubTab === 'grn'
                    ? "Tìm mã GRN, số hóa đơn, số lô, NCC..."
                    : "Tìm diễn giải bút toán sổ cái..."
                }
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
                  title="Xóa tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 2. Lọc theo Nhà Cung Cấp */}
            <div className="w-full sm:w-auto min-w-[160px]">
              <select
                value={filterSupplierId}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterSupplierId(val);
                  if (val !== 'all') {
                    setSelectedSupplierId(val);
                  }
                  setCurrentPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
              >
                <option value="all">🏢 Tất cả Nhà Cung Cấp</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Lọc theo Sản Phẩm (Chỉ cần thiết ở Tab 1 & Tab 2) */}
            {activeSubTab !== 'ap' && (
              <div className="w-full sm:w-auto min-w-[160px]">
                <select
                  value={filterProductId}
                  onChange={(e) => {
                    setFilterProductId(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
                >
                  <option value="all">📦 Tất cả Sản Phẩm</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 4. Dropdown lọc theo trạng thái riêng từng Tab */}
            {activeSubTab === 'po' && (
              <div className="w-full sm:w-auto min-w-[150px]">
                <select
                  value={filterPoStatus}
                  onChange={(e) => {
                    setFilterPoStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
                >
                  <option value="all">📊 Tất cả Trạng Thái</option>
                  <option value="ordered">⏳ Đang Đặt Hàng</option>
                  <option value="partially_received">📦 Nhận Một Phần</option>
                  <option value="completed">✅ Đã Nhập Đủ</option>
                </select>
              </div>
            )}

            {activeSubTab === 'grn' && (
              <div className="w-full sm:w-auto min-w-[160px]">
                <select
                  value={filterGrnHasRejection}
                  onChange={(e) => {
                    setFilterGrnHasRejection(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
                >
                  <option value="all">🔍 Phân loại kiểm đạt/lỗi</option>
                  <option value="rejected_only">⚠️ Có Hàng Lỗi / Giữ Hộ</option>
                  <option value="accepted_only">✨ 100% Đạt Chuẩn</option>
                </select>
              </div>
            )}

            {activeSubTab === 'ap' && (
              <div className="w-full sm:w-auto min-w-[160px]">
                <select
                  value={filterApEntryType}
                  onChange={(e) => {
                    setFilterApEntryType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 shadow-2xs"
                >
                  <option value="all">📑 Tất cả loại nghiệp vụ</option>
                  <option value="purchase_invoice">📦 Hóa Đơn Nhập Hàng</option>
                  <option value="supplier_payment">💵 Thanh Toán Nợ NCC</option>
                  <option value="supplier_advance">⭐ Đặt Cọc / Trả Trước</option>
                  <option value="supplier_return">↺ Xuất Trả Hàng Cho NCC</option>
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            {activeSubTab === 'po' && (
              <button
                onClick={handleOpenCreatePo}
                className="w-full sm:w-auto text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tạo Đơn PO Mới</span>
              </button>
            )}

            {activeSubTab === 'grn' && (
              <button
                onClick={() => handleOpenReceiveGrn()}
                className="w-full sm:w-auto text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Package className="w-4 h-4" />
                <span>+ Nhập Kho Mới (GRN)</span>
              </button>
            )}

            {activeSubTab === 'ap' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => {
                    setServerError(null);
                    setAdvAmount(2000000);
                    setIsAdvanceOpen(true);
                  }}
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-2 rounded-xl shadow-xs flex items-center space-x-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nạp Trả Trước</span>
                </button>
                <button
                  onClick={() => {
                    setServerError(null);
                    setPayAmount(selectedSupplier?.debt || 0);
                    setIsPaySupplierOpen(true);
                  }}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-2 rounded-xl shadow-xs flex items-center space-x-1 transition-colors"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Trả Nợ NCC</span>
                </button>
                <button
                  onClick={() => {
                    setServerError(null);
                    setRetProductId(products[0]?.id || '');
                    setRetUnitCost(products[0]?.costPrice || 0);
                    setIsReturnOpen(true);
                  }}
                  className="text-xs bg-slate-700 hover:bg-slate-800 text-white font-bold px-2.5 py-2 rounded-xl shadow-xs flex items-center space-x-1 transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Trả Hàng</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hàng 2: Bộ lọc nhanh theo Ngày + Reset bộ lọc */}
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

          {/* Nút reset bộ lọc khi có điều kiện lọc đang kích hoạt */}
          {isAnyFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-bold transition-colors ml-auto"
              title="Đặt lại toàn bộ tiêu chí tìm kiếm và bộ lọc về mặc định"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc ({[
                searchTerm ? 'Từ khóa' : null,
                filterSupplierId !== 'all' ? 'NCC' : null,
                filterProductId !== 'all' ? 'SP' : null,
                filterDateRange !== 'all' ? 'Ngày' : null,
                filterPoStatus !== 'all' ? 'Trạng thái PO' : null,
                filterGrnHasRejection !== 'all' ? 'Lỗi/đạt' : null,
                filterApEntryType !== 'all' ? 'Loại AP' : null
              ].filter(Boolean).join(', ')})</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── TAB 1: DANH SÁCH ĐƠN ĐẶT HÀNG (PO) ─── */}
      {activeSubTab === 'po' && (
        <div className="space-y-4">
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
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      {isAnyFilterActive ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-slate-600">Không tìm thấy đơn đặt hàng nào phù hợp với bộ lọc hiện tại.</p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="text-sky-600 hover:text-sky-700 font-bold underline text-xs"
                          >
                            Đặt lại bộ lọc để xem toàn bộ
                          </button>
                        </div>
                      ) : (
                        'Chưa có đơn đặt hàng nào trong hệ thống. Bấm "+ Tạo Đơn PO Mới" để bắt đầu.'
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedPos.map((po) => {
                    const isFullyReceived =
                      po.status === 'received' ||
                      po.status === 'completed' ||
                      (po.items && po.items.length > 0 && po.items.every((it) => it.qtyReceived >= it.qtyOrdered));
                    const isPartiallyReceived =
                      !isFullyReceived &&
                      (po.status === 'partially_received' || (po.items && po.items.some((it) => it.qtyReceived > 0)));
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-sky-700">{po.poNumber}</td>
                        <td className="p-3 font-bold text-slate-900">{po.supplierName}</td>
                        <td className="p-3 text-slate-600">{po.orderDate}</td>
                        <td className="p-3 text-slate-600">{po.expectedDate || '—'}</td>
                        <td className="p-3 text-right font-black text-slate-900">
                          {po.totalAmount.toLocaleString('vi-VN')}đ
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isFullyReceived
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isPartiallyReceived
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-sky-50 text-sky-700 border border-sky-200'
                            }`}
                          >
                            {isFullyReceived
                              ? 'Đã Nhập Đủ'
                              : isPartiallyReceived
                              ? 'Nhận Một Phần'
                              : 'Đang Đặt Hàng'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => {
                                setSelectedPo(po);
                                setIsViewPoDetailOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                              title="Xem chi tiết đơn"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {!isFullyReceived && (
                              <div className="flex items-center space-x-1.5">
                                {isPartiallyReceived ? (
                                  <>
                                    <button
                                      onClick={() => handleOpenReceiveGrn(po)}
                                      className="px-2 py-1 text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg border border-amber-300 transition-colors flex items-center space-x-0.5"
                                      title="Nhận số lượng còn thiếu do đợt trước lỗi hoặc thiếu"
                                    >
                                      <span>Nhận Bù ({po.items.reduce((s, it) => s + Math.max(0, it.qtyOrdered - it.qtyReceived), 0)})</span>
                                    </button>
                                    <button
                                      onClick={() => handleClosePoDirectly(po)}
                                      className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-200 transition-colors"
                                      title="Đóng đơn ngay nếu không chờ giao bù"
                                    >
                                      Đóng Đơn
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleOpenReceiveGrn(po)}
                                    className="px-2.5 py-1 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg border border-emerald-200 transition-colors"
                                  >
                                    Nhận Hàng (GRN)
                                  </button>
                                )}
                              </div>
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
          {renderPagination(filteredPos.length)}
        </div>
      )}

      {/* ─── TAB 2: DANH SÁCH PHIẾU NHẬP KHO (GRN) ─── */}
      {activeSubTab === 'grn' && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Mã GRN</th>
                  <th className="p-3">Nhà Cung Cấp</th>
                  <th className="p-3">Hóa Đơn NCC</th>
                  <th className="p-3">Ngày Nhập</th>
                  <th className="p-3">Mặt Hàng & Số Lô</th>
                  <th className="p-3 text-right">Tổng Tiền Nhập</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGrns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      {isAnyFilterActive ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-slate-600">Không tìm thấy phiếu nhập kho nào phù hợp với bộ lọc hiện tại.</p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="text-emerald-600 hover:text-emerald-700 font-bold underline text-xs"
                          >
                            Đặt lại bộ lọc để xem toàn bộ
                          </button>
                        </div>
                      ) : (
                        'Chưa có phiếu nhập kho nào. Bấm "+ Nhập Kho Mới" để ghi nhận nhập kho thực tế.'
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedGrns.map((grn) => (
                    <tr key={grn.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono font-bold text-emerald-700">{grn.grnNumber}</td>
                      <td className="p-3 font-bold text-slate-900">{grn.supplierName}</td>
                      <td className="p-3 text-slate-600 font-mono">{grn.invoiceNumber || '—'}</td>
                      <td className="p-3 text-slate-600">{grn.receivedDate}</td>
                      <td className="p-3 text-slate-700">
                        <div className="space-y-0.5">
                          {grn.items.map((it, idx) => (
                            <div key={idx} className="flex items-center space-x-1.5 text-[11px]">
                              <span className="font-semibold text-slate-800">{it.productName}:</span>
                              <span className="text-emerald-700 font-bold">{it.qtyAccepted ?? it.qty} đạt</span>
                              {it.qtyRejected ? (
                                <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">
                                  ({it.qtyRejected} lỗi)
                                </span>
                              ) : null}
                              {it.lotNumber && (
                                <span className="text-slate-400 font-mono text-[10px]">[{it.lotNumber}]</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right font-black text-slate-900">
                        {grn.totalAmount.toLocaleString('vi-VN')}đ
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Đã Nhập Kho (Tăng Tồn)
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {renderPagination(filteredGrns.length)}

          {/* Kho hàng theo Lô (Inventory Lots Overview) */}
          {inventoryLots.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-sky-600" />
                <span>Theo Dõi Tồn Kho Theo Lô & Hạn Sử Dụng (Branch Lots)</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {inventoryLots.slice(0, 6).map((lot) => (
                  <div key={lot.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 truncate">{lot.productName}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded font-bold">
                        {lot.lotNumber}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Hạn dùng: {lot.expiryDate || 'Không có'}</span>
                      <span className="font-black text-emerald-600">{lot.quantityOnHand} đơn vị</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Giá vốn WAC chi nhánh: {lot.costPrice.toLocaleString('vi-VN')}đ
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: SỔ ĐỐI SOÁT CÔNG NỢ & THANH TOÁN NCC (AP) ─── */}
      {activeSubTab === 'ap' && (() => {
        const totalPurchased = supplierLedger.reduce((sum, row) => sum + row.creditAmount, 0);
        const totalPaid = supplierLedger.reduce((sum, row) => sum + row.debitAmount, 0);
        const currentDebt = selectedSupplier?.debt || 0;

        return (
          <div className="space-y-6">
            {/* Supplier Selector Bar & 3 Financial KPI Cards */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <span className="text-xs font-bold text-slate-700 shrink-0">Chọn Nhà Cung Cấp:</span>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSupplierId(val);
                      setFilterSupplierId(val);
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 w-full sm:w-80 shadow-xs"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.contactName || 'Đại diện'} - {s.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsAdvanceOpen(true)}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-2 rounded-xl shadow-xs flex items-center space-x-1 transition-colors"
                  >
                    <span>+ Nạp Tiền Trả Trước NCC</span>
                  </button>
                  <button
                    onClick={() => setIsPaySupplierOpen(true)}
                    className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-2 rounded-xl shadow-xs flex items-center space-x-1 transition-colors"
                  >
                    <span>$ Thanh Toán Công Nợ</span>
                  </button>
                  <button
                    onClick={() => setIsReturnOpen(true)}
                    className="text-xs bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-xl shadow-xs flex items-center space-x-1 transition-colors"
                  >
                    <span>↺ Trả Hàng NCC</span>
                  </button>
                </div>
              </div>

              {/* 3 Thẻ Chỉ Số Tài Chính Minh Bạch Rõ Ràng */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    1. Tổng Tiền Hàng Mua Vào
                  </span>
                  <p className="text-xl font-black text-slate-800 mt-0.5 font-mono">
                    +{totalPurchased.toLocaleString('vi-VN')}đ
                  </p>
                  <span className="text-[10px] text-slate-400">Tích lũy từ tất cả phiếu nhập hàng (GRN)</span>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                    2. Đã Thanh Toán Cho NCC
                  </span>
                  <p className="text-xl font-black text-emerald-600 mt-0.5 font-mono">
                    {totalPaid > 0 ? `-${totalPaid.toLocaleString('vi-VN')}đ` : '0đ'}
                  </p>
                  <span className="text-[10px] text-emerald-600/70">Tổng tiền đã chi trả và cấn trừ cọc</span>
                </div>

                <div className="bg-gradient-to-r from-rose-50 to-amber-50 p-3.5 rounded-xl border border-rose-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                    3. Số Dư Nợ Hiện Tại Phải Trả
                  </span>
                  <p className="text-2xl font-black text-rose-600 mt-0.5 font-mono">
                    {currentDebt.toLocaleString('vi-VN')}đ
                  </p>
                  <span className="text-[10px] text-rose-700/80 font-medium">(= Tiền mua hàng - Tiền đã thanh toán)</span>
                </div>
              </div>
            </div>

            {/* Supplier Advances (Tiền trả trước khả dụng) */}
            {supplierAdvances.length > 0 && (
              <div className="space-y-2">
                <h5 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Khoản Đặt Cọc / Trả Trước Khả Dụng ({supplierAdvances.length})</span>
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {supplierAdvances.map((adv) => (
                    <div key={adv.id} className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-amber-800">{adv.advanceNumber}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          {adv.status === 'exhausted' ? 'Đã dùng hết' : 'Khả dụng'}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Tổng cọc: {adv.totalAmount.toLocaleString('vi-VN')}đ</span>
                        <span className="font-bold text-emerald-700">Còn: {adv.remainingAmount.toLocaleString('vi-VN')}đ</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sổ Cái Biến Động Công Nợ (Supplier Ledger) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                    Sổ Cái Biến Động Công Nợ Chi Tiết (Accounts Payable Ledger)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Theo dõi lịch sử từng dòng mua hàng, thanh toán và số dư nợ tích lũy sau mỗi giao dịch
                  </p>
                </div>

                {/* Nút Đổi Thứ Tự Sắp Xếp */}
                <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                  <button
                    onClick={() => setLedgerSortOrder('chronological')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      ledgerSortOrder === 'chronological'
                        ? 'bg-white text-sky-800 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Hiển thị theo trình tự thời gian từ cũ đến mới, tổng nợ nằm ở dòng cuối"
                  >
                    ⏱️ Trình Tự Thời Gian (Cũ ➔ Mới)
                  </button>
                  <button
                    onClick={() => setLedgerSortOrder('latest_first')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      ledgerSortOrder === 'latest_first'
                        ? 'bg-white text-sky-800 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Hiển thị giao dịch mới nhất ở trên đầu"
                  >
                    ⚡ Mới Nhất Trên Đầu
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="p-3">Thời Gian</th>
                      <th className="p-3">Loại Giao Dịch</th>
                      <th className="p-3">Nội Dung / Diễn Giải Nghiệp Vụ</th>
                      <th className="p-3 text-right text-emerald-800">Đã Trả NCC (Giảm Nợ)</th>
                      <th className="p-3 text-right text-rose-800">Tiền Mua Hàng (Tăng Nợ)</th>
                      <th className="p-3 text-right text-slate-900">Dư Nợ Sau Giao Dịch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {isLoadingLedger ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          Đang tải sổ cái đối chiếu công nợ...
                        </td>
                      </tr>
                    ) : filteredLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          {isAnyFilterActive ? (
                            <div className="space-y-2">
                              <p className="font-semibold text-slate-600">Không tìm thấy giao dịch nào phù hợp với bộ lọc hiện tại.</p>
                              <button
                                type="button"
                                onClick={handleResetFilters}
                                className="text-rose-600 hover:text-rose-700 font-bold underline text-xs"
                              >
                                Đặt lại bộ lọc để xem toàn bộ
                              </button>
                            </div>
                          ) : (
                            'Chưa có bút toán nào trong sổ cái của nhà cung cấp này.'
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedLedger.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-slate-600 font-medium text-[11px] whitespace-nowrap">
                            {formatLedgerDateTime(row.createdAt)}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                row.entryType === 'purchase_invoice'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : row.entryType === 'supplier_payment'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : row.entryType === 'supplier_advance'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {row.entryType === 'purchase_invoice'
                                ? 'Hóa Đơn Mua'
                                : row.entryType === 'supplier_payment'
                                ? 'Thanh Toán'
                                : row.entryType === 'supplier_advance'
                                ? 'Nộp Tiền Cọc'
                                : 'Trả Hàng NCC'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-700">
                            {formatLedgerNotes(row.notes)}
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                            {row.debitAmount > 0 ? `-${row.debitAmount.toLocaleString('vi-VN')}đ` : '—'}
                          </td>
                          <td className="p-3 text-right font-bold text-rose-600 whitespace-nowrap">
                            {row.creditAmount > 0 ? `+${row.creditAmount.toLocaleString('vi-VN')}đ` : '—'}
                          </td>
                          <td className="p-3 text-right font-black text-slate-900 font-mono whitespace-nowrap">
                            {row.balanceAfter.toLocaleString('vi-VN')}đ
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  {/* FOOTER TỔNG KẾT SỔ CÁI ĐỐI SOÁT CÔNG NỢ */}
                  {filteredLedger.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                        <td colSpan={3} className="p-3 uppercase text-[11px] tracking-wider text-slate-700">
                          TỔNG KẾT ĐỐI SOÁT ({filteredLedger.length} giao dịch{isAnyFilterActive ? ' đang lọc' : ''})
                        </td>
                        <td className="p-3 text-right font-black text-emerald-700 font-mono whitespace-nowrap">
                          {filteredLedger.reduce((sum, r) => sum + r.debitAmount, 0) > 0
                            ? `-${filteredLedger.reduce((sum, r) => sum + r.debitAmount, 0).toLocaleString('vi-VN')}đ`
                            : '0đ'}
                        </td>
                        <td className="p-3 text-right font-black text-rose-700 font-mono whitespace-nowrap">
                          +{filteredLedger.reduce((sum, r) => sum + r.creditAmount, 0).toLocaleString('vi-VN')}đ
                        </td>
                        <td className="p-3 text-right font-black text-slate-900 font-mono text-sm bg-amber-50/80 whitespace-nowrap">
                          {currentDebt.toLocaleString('vi-VN')}đ
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {renderPagination(filteredLedger.length)}
            </div>
          </div>
        );
      })()}

      {/* ─── MODAL 1: TẠO ĐƠN ĐẶT HÀNG (PO) ─── */}
      {isCreatePoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Tạo Đơn Đặt Hàng PO (Chưa Tăng Tồn Kho)</h3>
                <p className="text-xs text-slate-500">
                  Đơn PO chỉ xác lập thỏa thuận mua hàng. Tồn kho chỉ tăng khi xác nhận phiếu GRN thực nhận.
                </p>
              </div>
              <button
                onClick={() => setIsCreatePoOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitCreatePo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-700">Nhà Cung Cấp *</label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleRefreshSuppliers}
                        title="Đồng bộ danh sách NCC từ máy chủ"
                        className="text-[11px] text-slate-500 hover:text-sky-600 flex items-center space-x-0.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Làm mới</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickSupTarget('po');
                          setIsQuickAddSupOpen(true);
                        }}
                        className="text-[11px] text-sky-600 hover:text-sky-700 font-bold flex items-center space-x-0.5 bg-sky-50 px-2 py-0.5 rounded-md"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Thêm NCC Mới</span>
                      </button>
                    </div>
                  </div>
                  <select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dự Kiến Giao Hàng</label>
                  <input
                    type="date"
                    value={poExpectedDate}
                    onChange={(e) => setPoExpectedDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs text-slate-800">Danh Sách Mặt Hàng Đặt Mua</h4>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenQuickAddProduct('po')}
                      className="text-xs text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1 transition-colors"
                      title="Thêm sản phẩm mới vào danh mục hàng hóa"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>+ Thêm SP Mới</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPoItem}
                      className="text-xs text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Thêm Dòng Mặt Hàng</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {poItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5 text-xs"
                    >
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="block text-[10px] text-slate-500 font-bold">Sản Phẩm</label>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickAddProduct('po', idx)}
                            className="text-[10px] text-amber-600 hover:text-amber-700 font-bold hover:underline"
                            title="Tạo sản phẩm mới và gắn vào dòng này"
                          >
                            + Tạo SP Mới
                          </button>
                        </div>
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            if (pid === '__NEW__') {
                              handleOpenQuickAddProduct('po', idx);
                              return;
                            }
                            const prod = products.find((p) => p.id === pid);
                            setPoItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      productId: pid,
                                      unitCost: prod?.costPrice || it.unitCost,
                                      purchaseUnit: prod?.unit || it.purchaseUnit
                                    }
                                  : it
                              )
                            );
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-semibold"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.code})
                            </option>
                          ))}
                          <option value="__NEW__">➕ [Tạo Sản Phẩm Mới...]</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Đơn Vị Mua</label>
                        <input
                          type="text"
                          value={item.purchaseUnit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, purchaseUnit: val } : it)));
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs"
                          placeholder="thùng/hộp"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Quy Đổi (Ra Chai)</label>
                        <input
                          type="number"
                          min={1}
                          value={item.conversionRate}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, conversionRate: val } : it)));
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Số Lượng Đặt</label>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it)));
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono font-bold"
                        />
                      </div>

                      <div className="col-span-2 flex items-center justify-between">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Đơn Giá Mua</label>
                          <input
                            type="number"
                            step={1000}
                            value={item.unitCost}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unitCost: val } : it)));
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono"
                          />
                        </div>
                        {poItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePoItem(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1 ml-1"
                            title="Xóa dòng này"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Thanh Hiển Thị Chi Tiết: Thành Tiền Dòng & Quy Đổi Nhập Kho */}
                    <div className="flex flex-wrap items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 mt-2 text-xs shadow-2xs">
                      <div className="flex items-center space-x-2 text-slate-600">
                        <span className="font-semibold text-slate-500">📦 Quy đổi kho:</span>
                        <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {item.quantity} {item.purchaseUnit || 'đơn vị'} = {item.quantity * item.conversionRate} chai/lọ cơ sở
                        </span>
                        {item.conversionRate > 1 && (
                          <span className="text-[11px] text-slate-500">
                            (Giá vốn: <strong className="text-slate-700">~{Math.round(item.unitCost / item.conversionRate).toLocaleString('vi-VN')}đ</strong> / chai)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5 font-bold">
                        <span className="text-slate-500 text-[11px]">Thành tiền dòng:</span>
                        <span className="font-mono text-sm font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                          {(item.quantity * item.unitCost).toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú Đơn Hàng</label>
              <input
                type="text"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                placeholder="Ghi chú điều kiện giao, thanh toán..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center space-x-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-4 py-2 rounded-xl shadow-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                    Tổng Tiền Đơn Hàng PO
                  </span>
                  <span className="text-xl font-mono font-black text-emerald-700">
                    {poItems.reduce((acc, it) => acc + it.quantity * it.unitCost, 0).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="text-[11px] text-emerald-900 border-l border-emerald-200 pl-3 leading-snug">
                  <div>Mặt hàng: <strong>{poItems.length}</strong> loại</div>
                  <div>Tổng nhập kho: <strong>{poItems.reduce((acc, it) => acc + it.quantity * it.conversionRate, 0)}</strong> đơn vị cơ sở</div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePoOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 flex items-center space-x-1.5 transition-all"
                >
                  <span>{isSubmitting ? 'Đang Tạo Đơn...' : 'Xác Nhận Tạo Đơn PO'}</span>
                </button>
              </div>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: XÁC NHẬN NHẬP KHO THỰC TẾ (GRN) ─── */}
      {isReceiveGrnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Xác Nhận Nhập Kho GRN (Quy Đổi, Phân Loại Lô & Lỗi)
                </h3>
                <p className="text-xs text-slate-500">
                  Chỉ số lượng đạt chuẩn mới cộng vào tồn bán; hàng lỗi đưa vào cách ly; tính giá vốn WAC chi nhánh.
                </p>
              </div>
              <button
                onClick={() => setIsReceiveGrnOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitConfirmGrn} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-700">Nhà Cung Cấp *</label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleRefreshSuppliers}
                        title="Đồng bộ danh sách NCC từ máy chủ"
                        className="text-[10px] text-slate-500 hover:text-emerald-700 flex items-center space-x-0.5"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Làm mới</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickSupTarget('grn');
                          setIsQuickAddSupOpen(true);
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center space-x-0.5 bg-emerald-50 px-1.5 py-0.5 rounded-md"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>+ Thêm NCC</span>
                      </button>
                    </div>
                  </div>
                  <select
                    value={grnSupplierId}
                    onChange={(e) => setGrnSupplierId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Hóa Đơn NCC (VAT)</label>
                  <input
                    type="text"
                    value={grnInvoiceNo}
                    onChange={(e) => setGrnInvoiceNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono"
                    placeholder="VD: VAT-2026-9988"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cấn Trừ Tiền Trả Trước (Cọc)</label>
                  <select
                    value={grnAdvanceId}
                    onChange={(e) => {
                      const advId = e.target.value;
                      setGrnAdvanceId(advId);
                      const adv = supplierAdvances.find((a) => a.id === advId);
                      setGrnAdvanceAmount(adv ? adv.remainingAmount : 0);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs"
                  >
                    <option value="">Không cấn trừ cọc</option>
                    {supplierAdvances
                      .filter((a) => a.remainingAmount > 0)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.advanceNumber} (Còn: {a.remainingAmount.toLocaleString('vi-VN')}đ)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs text-slate-800">Chi Tiết Mặt Hàng Nghiệm Thu Nhập Kho</h4>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenQuickAddProduct('grn')}
                      className="text-xs text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1 transition-colors"
                      title="Thêm sản phẩm mới vào danh mục hàng hóa"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>+ Thêm SP Mới</span>
                    </button>
                    {!grnPoId && (
                      <button
                        type="button"
                        onClick={() =>
                          setGrnItems((prev) => [
                            ...prev,
                            {
                              productId: products[0]?.id || '',
                              productName: products[0]?.name || 'Sản phẩm',
                              lotNumber: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
                              expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
                              purchaseUnit: 'hộp',
                              conversionRate: 1,
                              qtyReceived: 10,
                              qtyAccepted: 10,
                              qtyRejected: 0,
                              rejectionReason: '',
                              unitCost: products[0]?.costPrice || 100000
                            }
                          ])
                        }
                        className="text-xs text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Thêm Dòng Nhập</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {grnItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2.5"
                    >
                      <div className="flex justify-between items-center font-bold text-slate-900">
                        {grnPoId ? (
                          <span>
                            {idx + 1}. {item.productName}
                          </span>
                        ) : (
                          <div className="flex items-center space-x-2 w-1/2">
                            <span className="text-slate-500 font-bold">{idx + 1}.</span>
                            <select
                              value={item.productId}
                              onChange={(e) => {
                                const pid = e.target.value;
                                if (pid === '__NEW__') {
                                  handleOpenQuickAddProduct('grn', idx);
                                  return;
                                }
                                const prod = products.find((p) => p.id === pid);
                                setGrnItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          productId: pid,
                                          productName: prod?.name || 'Sản phẩm',
                                          unitCost: prod?.costPrice || it.unitCost,
                                          purchaseUnit: prod?.unit || it.purchaseUnit
                                        }
                                      : it
                                  )
                                );
                              }}
                              className="bg-white border border-slate-300 rounded-lg p-1 text-xs font-semibold w-full"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.code})
                                </option>
                              ))}
                              <option value="__NEW__">➕ [Tạo Sản Phẩm Mới...]</option>
                            </select>
                          </div>
                        )}
                        <span className="text-[11px] text-slate-500 font-normal">
                          Đơn vị mua: <strong className="text-slate-800">{item.purchaseUnit}</strong> (Quy đổi: 1{' '}
                          {item.purchaseUnit} = {item.conversionRate} chai/lọ)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Số Lô (Lot No)</label>
                          <input
                            type="text"
                            value={item.lotNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, lotNumber: val } : it))
                              );
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Hạn Dùng (Expiry)</label>
                          <input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, expiryDate: val } : it))
                              );
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Thực Giao</label>
                          <input
                            type="number"
                            min={0}
                            value={item.qtyReceived}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setGrnItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, qtyReceived: val, qtyAccepted: val, qtyRejected: 0 } : it
                                )
                              );
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-emerald-700 font-bold mb-0.5">
                            Đạt Chuẩn (Tăng Tồn)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={item.qtyReceived}
                            value={item.qtyAccepted}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const rej = Math.max(0, item.qtyReceived - val);
                              setGrnItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, qtyAccepted: val, qtyRejected: rej } : it
                                )
                              );
                            }}
                            className="w-full bg-emerald-50 border border-emerald-300 rounded-lg p-1.5 text-xs font-mono font-bold text-emerald-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-rose-700 font-bold mb-0.5">
                            Lỗi/Hỏng (Cách Ly)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={item.qtyReceived}
                            value={item.qtyRejected}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const acc = Math.max(0, item.qtyReceived - val);
                              setGrnItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, qtyRejected: val, qtyAccepted: acc } : it
                                )
                              );
                            }}
                            className="w-full bg-rose-50 border border-rose-300 rounded-lg p-1.5 text-xs font-mono font-bold text-rose-800"
                          />
                        </div>
                      </div>

                      {item.qtyRejected > 0 && (
                        <div className="pt-1">
                          <label className="block text-[10px] text-rose-600 font-bold mb-0.5">
                            Lý do từ chối / tình trạng lỗi *
                          </label>
                          <input
                            type="text"
                            value={item.rejectionReason}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, rejectionReason: val } : it))
                              );
                            }}
                            className="w-full bg-white border border-rose-200 rounded-lg p-1.5 text-xs text-rose-900"
                            placeholder="Mô tả lỗi (vỡ hộp, rách seal, cận hạn...)"
                            required
                          />
                        </div>
                      )}

                      {/* Thanh Tóm Tắt & Giá Trị Nhập Kho Của Dòng */}
                      <div className="flex flex-wrap items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 mt-2 text-xs shadow-2xs">
                        <div className="flex items-center space-x-2 text-slate-600 text-[11px]">
                          <span>📦 Nhập kho thực nhận:</span>
                          <strong className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            +{item.qtyAccepted * item.conversionRate} chai/lọ cơ sở
                          </strong>
                          {item.qtyRejected > 0 && (
                            <span className="text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Cách ly lỗi: {item.qtyRejected * item.conversionRate} chai
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1.5 font-bold">
                          <span className="text-slate-500 text-[11px]">Thành tiền đạt chuẩn:</span>
                          <span className="font-mono text-xs font-black text-emerald-700">
                            {(item.qtyAccepted * item.unitCost).toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú Phiếu Nhập</label>
                <input
                  type="text"
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                  placeholder="Ghi chú người giao, biên bản nghiệm thu..."
                />
              </div>

              {grnPoId && (
                <div className="flex items-center space-x-2.5 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <input
                    type="checkbox"
                    id="grnAutoClosePo"
                    checked={grnAutoClosePo}
                    onChange={(e) => setGrnAutoClosePo(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="grnAutoClosePo" className="text-xs text-slate-800 font-bold cursor-pointer select-none">
                    Hoàn tất và đóng đơn đặt hàng (PO) này
                    <span className="text-slate-500 font-normal ml-1">
                      (Chuyển trạng thái sang "Đã Nhập Đủ" ngay sau khi nhận, không chờ giao bù hàng lỗi)
                    </span>
                  </label>
                </div>
              )}

              {(() => {
                const totalOrderedVal = grnItems.reduce((acc, it) => acc + it.qtyReceived * it.unitCost, 0);
                const totalAcceptedVal = grnItems.reduce((acc, it) => acc + it.qtyAccepted * it.unitCost, 0);
                const totalRejectedVal = grnItems.reduce((acc, it) => acc + it.qtyRejected * it.unitCost, 0);
                const totalAcceptedBaseUnits = grnItems.reduce((acc, it) => acc + it.qtyAccepted * it.conversionRate, 0);
                const totalRejectedBaseUnits = grnItems.reduce((acc, it) => acc + it.qtyRejected * it.conversionRate, 0);

                return (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border border-emerald-200 px-4 py-2.5 rounded-xl shadow-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                          Tổng Giá Trị Nghiệm Thu (Thực Trả NCC)
                        </span>
                        <span className="text-2xl font-mono font-black text-emerald-700">
                          {totalAcceptedVal.toLocaleString('vi-VN')}đ
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-700 border-l border-emerald-200 pl-3 leading-snug space-y-0.5">
                        <div>
                          Tổng giá trị hàng giao: <strong className="font-mono text-slate-900">{totalOrderedVal.toLocaleString('vi-VN')}đ</strong>
                        </div>
                        {totalRejectedVal > 0 ? (
                          <div className="text-rose-600 font-bold">
                            Đã trừ hàng lỗi/hỏng: <span className="font-mono">-{totalRejectedVal.toLocaleString('vi-VN')}đ</span> ({totalRejectedBaseUnits} đơn vị cách ly)
                          </div>
                        ) : (
                          <div className="text-slate-500 text-[10px]">
                            (Không có hàng lỗi, nghiệm thu đủ 100%)
                          </div>
                        )}
                        {grnAdvanceAmount > 0 && (
                          <div className="text-amber-700 font-bold">
                            Đã cấn trừ cọc: <span className="font-mono">-{grnAdvanceAmount.toLocaleString('vi-VN')}đ</span> (Dư nợ NCC tăng: {Math.max(0, totalAcceptedVal - grnAdvanceAmount).toLocaleString('vi-VN')}đ)
                          </div>
                        )}
                        <div className="text-slate-600 pt-0.5">
                          Cộng kho bán: <strong className="text-emerald-700 font-bold">+{totalAcceptedBaseUnits}</strong> cơ sở
                          {totalRejectedBaseUnits > 0 && (
                            <span className="text-rose-600 font-semibold"> | Cách ly: <strong className="font-bold">{totalRejectedBaseUnits}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsReceiveGrnOpen(false)}
                        className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 flex items-center space-x-1.5 transition-all"
                      >
                        <span>{isSubmitting ? 'Đang Xử Lý...' : 'Xác Nhận Nhập Kho'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: XEM CHI TIẾT ĐƠN PO ─── */}
      {isViewPoDetailOpen && selectedPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-base text-slate-900">Chi Tiết Đơn Đặt Hàng #{selectedPo.poNumber}</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      selectedPo.status === 'completed' || selectedPo.status === 'received'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedPo.status === 'partially_received'
                        ? 'bg-amber-100 text-amber-800'
                        : selectedPo.status === 'cancelled'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {selectedPo.status === 'completed' || selectedPo.status === 'received'
                      ? 'Đã hoàn thành'
                      : selectedPo.status === 'partially_received'
                      ? 'Đang giao từng phần'
                      : selectedPo.status === 'cancelled'
                      ? 'Đã hủy'
                      : 'Chờ giao hàng'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Nhà cung cấp: <strong className="text-slate-800">{selectedPo.supplierName}</strong> | Ngày đặt:{' '}
                  {selectedPo.orderDate} {selectedPo.expectedDate && `| Dự kiến giao: ${selectedPo.expectedDate}`}
                </p>
                {selectedPo.notes && (
                  <p className="text-xs text-slate-600 italic">Ghi chú: {selectedPo.notes}</p>
                )}
              </div>
              <button
                onClick={() => setIsViewPoDetailOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bảng Mặt Hàng Chi Tiết Với Đầy Đủ Cột Nghiệp Vụ */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-800">Tiến Độ Nghiệm Thu Giao Nhận Theo Mặt Hàng</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="p-2.5">Sản Phẩm & ĐVT</th>
                      <th className="p-2.5 text-center">Đã Đặt</th>
                      <th className="p-2.5 text-center">Giao Đến</th>
                      <th className="p-2.5 text-center text-emerald-700">Đạt Chuẩn (Kho)</th>
                      <th className="p-2.5 text-center text-rose-700">Từ Chối (Cách Ly)</th>
                      <th className="p-2.5 text-center text-amber-700">Còn Chờ Giao</th>
                      <th className="p-2.5 text-right">Đơn Giá Mua</th>
                      <th className="p-2.5 text-right">Thành Tiền Đặt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPo.items.map((it, idx) => {
                      const linkedGrns = goodsReceipts.filter((g) => g.poId === selectedPo.id);
                      const totalDelivered = linkedGrns.length > 0
                        ? linkedGrns.reduce((sum, g) => {
                            const gi = g.items.find(
                              (item) => (it.id && item.poItemId === it.id) || item.productId === it.productId
                            );
                            return sum + (gi ? gi.qty : 0);
                          }, 0)
                        : (it.qtyReceived || 0);

                      const totalAccepted = linkedGrns.length > 0
                        ? linkedGrns.reduce((sum, g) => {
                            const gi = g.items.find(
                              (item) => (it.id && item.poItemId === it.id) || item.productId === it.productId
                            );
                            return sum + (gi ? (gi.qtyAccepted ?? gi.qty) : 0);
                          }, 0)
                        : (it.qtyReceived || 0);

                      const totalRejected = linkedGrns.reduce((sum, g) => {
                        const gi = g.items.find(
                          (item) => (it.id && item.poItemId === it.id) || item.productId === it.productId
                        );
                        return sum + (gi ? (gi.qtyRejected ?? 0) : 0);
                      }, 0);

                      const isPoClosed = selectedPo.status === 'received' || selectedPo.status === 'completed';
                      const remaining = isPoClosed ? 0 : Math.max(0, it.qtyOrdered - totalAccepted);

                      return (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="p-2.5 font-bold text-slate-900">
                            <div>{it.productName}</div>
                            {it.purchaseUnit && (
                              <div className="text-[10px] text-slate-400 font-normal">
                                ĐVT: {it.purchaseUnit} (Quy đổi: 1 = {it.conversionRate || 1})
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-800">{it.qtyOrdered}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-600">
                            {totalDelivered > 0 ? totalDelivered : it.qtyReceived}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-emerald-600">{totalAccepted}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-rose-600">{totalRejected}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-600">{remaining}</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">
                            {it.unitPrice.toLocaleString('vi-VN')}đ
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-slate-900">
                            {(it.qtyOrdered * it.unitPrice).toLocaleString('vi-VN')}đ
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Danh Sách Các Phiếu Nhập Kho Liên Kết (GRN) */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h4 className="font-bold text-xs text-slate-800">
                Lịch Sử Các Đợt Nhận Hàng (Phiếu GRN Liên Kết)
              </h4>
              {(() => {
                const linkedGrns = goodsReceipts.filter((g) => g.poId === selectedPo.id);
                if (linkedGrns.length === 0) {
                  return (
                    <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                      Chưa có phiếu nhập kho nào được ghi nhận cho đơn đặt hàng này.
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {linkedGrns.map((grn) => {
                      const totalAcc = grn.items.reduce((s, i) => s + (i.qtyAccepted ?? i.qty), 0);
                      const totalRej = grn.items.reduce((s, i) => s + (i.qtyRejected ?? 0), 0);
                      return (
                        <div
                          key={grn.id}
                          className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-emerald-800">{grn.grnNumber}</span>
                              {grn.invoiceNumber && (
                                <span className="text-[10px] text-slate-500">HĐ: {grn.invoiceNumber}</span>
                              )}
                              <span className="text-[10px] text-slate-400">| Ngày: {grn.receivedDate}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              Đạt chuẩn: <strong className="text-emerald-700">{totalAcc} SP</strong> | Từ chối: <strong className="text-rose-600">{totalRej} SP</strong>
                              {grn.notes && ` — ${grn.notes}`}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-900">
                              {grn.totalAmount.toLocaleString('vi-VN')}đ
                            </span>
                            <span className="block text-[10px] font-bold text-emerald-600">Đã nhập kho</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Tổng giá trị đơn đặt hàng:{' '}
                <strong className="text-slate-900 text-sm">{selectedPo.totalAmount.toLocaleString('vi-VN')}đ</strong>
              </span>

              <div className="flex space-x-2">
                {selectedPo.status !== 'received' && selectedPo.status !== 'completed' && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleClosePoDirectly(selectedPo)}
                      className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                      title="Đóng đơn ngay và không tiếp tục nhận hàng"
                    >
                      Đóng Đơn (Hoàn tất)
                    </button>
                    <button
                      onClick={() => {
                        setIsViewPoDetailOpen(false);
                        handleOpenReceiveGrn(selectedPo);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>{selectedPo.status === 'partially_received' ? 'Nhận Hàng Bù' : 'Tiến Hành Nhận Hàng (GRN)'}</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setIsViewPoDetailOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: THANH TOÁN CÔNG NỢ NCC ─── */}
      {isPaySupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Thanh Toán Nợ Nhà Cung Cấp</h3>
                <p className="text-xs text-slate-500">NCC: {selectedSupplier?.name}</p>
              </div>
              <button
                onClick={() => setIsPaySupplierOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPaySupplier} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Tiền Thanh Toán (VND) *</label>
                <input
                  type="number"
                  step={1000}
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-black font-mono text-rose-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phương Thức Thanh Toán</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'transfer' | 'cash')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                >
                  <option value="transfer">Chuyển khoản ngân hàng</option>
                  <option value="cash">Tiền mặt tại quầy</option>
                </select>
              </div>

              {payMethod === 'transfer' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Giao Dịch / Tham Chiếu</label>
                  <input
                    type="text"
                    value={payBankRef}
                    onChange={(e) => setPayBankRef(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono"
                    placeholder="Mã ủy nhiệm chi / SMS ngân hàng"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                  placeholder="Ghi chú thanh toán đợt tiền hàng..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaySupplierOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang Ghi Sổ...' : 'Xác Nhận Chi Trả'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: TẠO CHỨNG TỪ TRẢ TRƯỚC (CỌC NCC) ─── */}
      {isAdvanceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Nộp Tiền Đặt Cọc / Trả Trước NCC</h3>
                <p className="text-xs text-slate-500">
                  Số tiền này sẽ được lưu thành chứng từ khả dụng để cấn trừ khi nhập hàng GRN.
                </p>
              </div>
              <button
                onClick={() => setIsAdvanceOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitCreateAdvance} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Tiền Nộp Cọc (VND) *</label>
                <input
                  type="number"
                  step={1000}
                  value={advAmount}
                  onChange={(e) => setAdvAmount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-black font-mono text-amber-700"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phương Thức Thanh Toán Cọc</label>
                <select
                  value={advMethod}
                  onChange={(e) => setAdvMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                >
                  <option value="transfer">Chuyển khoản ngân hàng</option>
                  <option value="cash">Tiền mặt</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mã Giao Dịch Chuyển Khoản</label>
                <input
                  type="text"
                  value={advBankRef}
                  onChange={(e) => setAdvBankRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono"
                  placeholder="Mã ủy nhiệm chi"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú Đặt Cọc</label>
                <input
                  type="text"
                  value={advNotes}
                  onChange={(e) => setAdvNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                  placeholder="Lý do cọc giữ hàng / thanh toán trước"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdvanceOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang Lưu...' : 'Xác Nhận Nộp Cọc'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: XUẤT TRẢ HÀNG NCC (REVERSAL ENTRY) ─── */}
      {isReturnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Lập Phiếu Xuất Trả Hàng Cho NCC</h3>
                <p className="text-xs text-slate-500">
                  Nhà cung cấp: <strong className="text-slate-800">{selectedSupplier?.name}</strong> (Dư nợ hiện tại:{' '}
                  {(selectedSupplier?.debt || 0).toLocaleString('vi-VN')}đ)
                </p>
              </div>
              <button
                onClick={() => setIsReturnOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitReturnGoods} className="space-y-4">
              {/* Phân Loại Loại Hàng Xuất Trả (Nghiệp Vụ Chuẩn Kế Toán) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Phân Loại Nghiệp Vụ Xuất Trả *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => {
                      setRetIsHoldingRejection(true);
                      setRetIsQuarantine(true);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      retIsHoldingRejection
                        ? 'border-amber-500 bg-amber-50/70 text-amber-950 font-bold ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <input
                        type="radio"
                        checked={retIsHoldingRejection}
                        onChange={() => {
                          setRetIsHoldingRejection(true);
                          setRetIsQuarantine(true);
                        }}
                        className="text-amber-600"
                      />
                      <span className="font-bold">1. Hàng Giữ Hộ (Từ Chối Lúc Nhận)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal leading-relaxed">
                      Bị từ chối tại GRN, lưu tạm kho cách ly. <strong>Chưa từng ghi nợ NCC</strong> → Xuất trả <strong>KHÔNG giảm nợ (0đ)</strong>.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setRetIsHoldingRejection(false);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      !retIsHoldingRejection
                        ? 'border-sky-500 bg-sky-50/70 text-sky-950 font-bold ring-2 ring-sky-500/20'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <input
                        type="radio"
                        checked={!retIsHoldingRejection}
                        onChange={() => {
                          setRetIsHoldingRejection(false);
                        }}
                        className="text-sky-600"
                      />
                      <span className="font-bold">2. Hàng Đã Mua (Phát Hiện Lỗi Sau)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal leading-relaxed">
                      Đã nghiệm thu đạt chuẩn và đã ghi tăng nợ NCC → Xuất trả <strong>CÓ giảm nợ AP</strong> qua bút toán đảo Nợ 331.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sản Phẩm Xuất Trả *</label>
                <select
                  value={retProductId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setRetProductId(pid);
                    const prod = products.find((p) => p.id === pid);
                    setRetUnitCost(prod?.costPrice || 0);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Lượng Trả</label>
                  <input
                    type="number"
                    min={1}
                    value={retQty}
                    onChange={(e) => setRetQty(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Đơn Giá Hoàn Trả (VND)</label>
                  <input
                    type="number"
                    step={1000}
                    value={retUnitCost}
                    onChange={(e) => setRetUnitCost(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Lô (Nếu có)</label>
                <input
                  type="text"
                  value={retLotNumber}
                  onChange={(e) => setRetLotNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono"
                  placeholder="VD: LOT-2026-A1"
                />
              </div>

              <div className="flex items-center space-x-2 pt-0.5">
                <input
                  type="checkbox"
                  id="chkQuarantine"
                  checked={retIsQuarantine || retIsHoldingRejection}
                  disabled={retIsHoldingRejection}
                  onChange={(e) => setRetIsQuarantine(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 disabled:opacity-60"
                />
                <label htmlFor="chkQuarantine" className="text-xs text-slate-700 font-bold cursor-pointer">
                  Xuất trả từ kho cách ly / hàng hỏng (Không trừ tồn bán khả dụng)
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lý Do Xuất Trả *</label>
                <input
                  type="text"
                  value={retReason}
                  onChange={(e) => setRetReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                  placeholder="Lý do lỗi, vỡ hộp, sai quy cách, quá hạn..."
                  required
                />
              </div>

              {/* Tóm Tắt Tác Động Tài Chính */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                <span className="text-slate-600 font-bold">Số tiền giảm nợ NCC:</span>
                <span className={`font-black text-sm ${retIsHoldingRejection ? 'text-slate-500' : 'text-emerald-700'}`}>
                  {retIsHoldingRejection
                    ? '0đ (Hàng giữ hộ, chưa từng ghi nợ)'
                    : `${(retQty * retUnitCost).toLocaleString('vi-VN')}đ (Giảm công nợ AP)`}
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang Lưu...' : 'Xác Nhận Xuất Trả'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 7: TẠO NHANH NHÀ CUNG CẤP MỚI TRỰC TIẾP ─── */}
      {isQuickAddSupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Thêm Nhanh Nhà Cung Cấp Mới</h3>
                <p className="text-xs text-slate-500">
                  Lưu trực tiếp vào danh mục nhà cung cấp và tự động chọn cho đơn này.
                </p>
              </div>
              <button
                onClick={() => setIsQuickAddSupOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateSupplier} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên Nhà Cung Cấp / Đơn Vị Phân Phối *
                </label>
                <input
                  type="text"
                  value={quickSupName}
                  onChange={(e) => setQuickSupName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                  placeholder="VD: Dược Phẩm MediPhar / Thiết Bị Y Tế Á Châu"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Điện Thoại Liên Hệ *</label>
                <input
                  type="text"
                  value={quickSupPhone}
                  onChange={(e) => setQuickSupPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono"
                  placeholder="VD: 0908123456"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Người Đại Diện / Phụ Trách</label>
                <input
                  type="text"
                  value={quickSupContact}
                  onChange={(e) => setQuickSupContact(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                  placeholder="VD: Anh Tuấn (Kinh doanh)"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickAddSupOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSup}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isCreatingSup ? 'Đang Lưu...' : 'Lưu & Chọn Luôn'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 8: TẠO NHANH SẢN PHẨM MỚI VÀO DANH MỤC ─── */}
      {isQuickAddProdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Thêm Nhanh Sản Phẩm Mới</h3>
                  <p className="text-xs text-slate-500">
                    Lưu trực tiếp vào danh mục sản phẩm và tự động gán vào phiếu đặt/nhập.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsQuickAddProdOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên Sản Phẩm / Hàng Hóa *
                </label>
                <input
                  type="text"
                  value={quickProdName}
                  onChange={(e) => setQuickProdName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                  placeholder="VD: Kem Tái Tạo Da Cicaplast B5 40ml / Khẩu Trang Y Tế 4 Lớp"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Sản Phẩm *</label>
                  <input
                    type="text"
                    value={quickProdCode}
                    onChange={(e) => setQuickProdCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold"
                    placeholder="VD: SP-CICA-B5"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Danh Mục Hàng Hóa</label>
                  <select
                    value={quickProdCategory}
                    onChange={(e) => setQuickProdCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold"
                  >
                    <option value="Dược Mỹ Phẩm">Dược Mỹ Phẩm</option>
                    <option value="Chăm Sóc Da">Chăm Sóc Da</option>
                    <option value="Vật Tư Y Tế">Vật Tư Y Tế</option>
                    <option value="Nha Khoa">Nha Khoa</option>
                    <option value="Spa & Thẩm Mỹ">Spa & Thẩm Mỹ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Đơn Vị Mua/Bán</label>
                  <input
                    type="text"
                    value={quickProdUnit}
                    onChange={(e) => setQuickProdUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs"
                    placeholder="hộp / chai / tuýp"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giá Mua Dự Kiến (đ) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={quickProdCostPrice}
                    onChange={(e) => setQuickProdCostPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-emerald-700"
                    placeholder="100000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giá Bán Lẻ (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={quickProdRetailPrice}
                    onChange={(e) => setQuickProdRetailPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono font-bold text-sky-700"
                    placeholder="180000"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickAddProdOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProd}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isCreatingProd ? 'Đang Lưu...' : 'Lưu & Chọn Luôn'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
