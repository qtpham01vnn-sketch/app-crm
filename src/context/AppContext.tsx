import React, { createContext, useState, useEffect, useCallback } from 'react';

import type {
  Branch,
  Staff,
  UserRole,
  Customer,
  Service,
  Product,
  PackageCombo,
  CustomerCourse,
  SessionDeduction,
  Appointment,
  Sale,
  Payment,
  CartItem,
  Supplier,
  PurchaseOrder,
  GoodsReceiptNote,
  Expense,
  Promotion,
  ShiftRoster,
  Timesheet,
  CommissionRecord,
  PayrollRecord
} from '../types';
import { APP_THEMES } from '../mock/themes';
import type { FullThemeConfig } from '../mock/themes';
import { masterDataService } from '../services/masterDataService';
import { authService } from '../services/authService';
import type { AuthSessionInfo } from '../services/authService';
import { isSupabaseConfigured } from '../lib/supabase';

import {
  mockOrg,
  mockBranches,
  mockStaff,
  mockCustomers,
  mockServices,
  mockProducts,
  mockBranchStocks,
  mockPackages,
  mockCustomerCourses,
  mockSessionDeductions,
  mockAppointments,
  mockSales,
  mockPayments,
  mockSuppliers,
  mockPurchaseOrders,
  mockGoodsReceipts,
  mockExpenses,
  mockPromotions,
  mockShifts,
  mockTimesheets,
  mockCommissions,
  mockPayrolls
} from '../mock/mockData';

export type NavTab =
  | 'home'
  | 'pos'
  | 'appts'
  | 'book'
  | 'wait'
  | 'cust'
  | 'courses'
  | 'staff'
  | 'roster'
  | 'times'
  | 'comm'
  | 'payroll'
  | 'prod'
  | 'svc'
  | 'pkg'
  | 'inv'
  | 'supp'
  | 'po'
  | 'exp'
  | 'promos'
  | 'reports';

interface CartState {
  customerId: string;
  staffId: string;
  items: CartItem[];
  discountPct: number;
  promoCode: string;
  taxPct: number;
  tipAmount: number;
  paidAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'debt' | 'split' | 'deposit';
  notes: string;
}

interface Toast {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

/**
 * Auth loading states:
 * - 'loading': Initial auth check in progress
 * - 'authenticated': User has valid session + membership
 * - 'unauthenticated': No session
 * - 'no_membership': Authenticated but no valid membership
 * - 'error': Auth check failed
 */
type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'no_membership' | 'error';

/** Whether the app is running in live mode (Supabase configured) or demo mode */
const isLiveMode = isSupabaseConfigured;

interface AppContextType {
  // Auth state
  authState: AuthState;
  authSession: AuthSessionInfo | null;
  authErrorMessage: string | null;
  handleLoginSuccess: () => Promise<void>;
  handleLogout: () => Promise<void>;
  isLiveMode: boolean;

  org: typeof mockOrg;
  branches: Branch[];
  currentBranch: Branch;
  setCurrentBranch: (branch: Branch) => void;
  staffList: Staff[];
  currentUser: Staff;
  currentRole: UserRole;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Data states
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  services: Service[];
  setServices: React.Dispatch<React.SetStateAction<Service[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  packages: PackageCombo[];
  setPackages: React.Dispatch<React.SetStateAction<PackageCombo[]>>;
  courses: CustomerCourse[];
  sessionDeductions: SessionDeduction[];
  appointments: Appointment[];
  sales: Sale[];
  payments: Payment[];
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceiptNote[];
  expenses: Expense[];
  promotions: Promotion[];
  setPromotions: React.Dispatch<React.SetStateAction<Promotion[]>>;
  shifts: ShiftRoster[];
  timesheets: Timesheet[];
  commissions: CommissionRecord[];
  payrolls: PayrollRecord[];
  branchStocks: typeof mockBranchStocks;

  // Actions
  cart: CartState;
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  removeFromCart: (index: number) => void;
  updateCartQty: (index: number, qty: number) => void;
  setCartCustomer: (customerId: string) => void;
  setCartStaff: (staffId: string) => void;
  setCartDiscountPct: (pct: number) => void;
  setCartPromoCode: (code: string) => void;
  setCartTaxPct: (pct: number) => void;
  setCartTipAmount: (amount: number) => void;
  setCartPaidAmount: (amount: number) => void;
  setCartPaymentMethod: (method: CartState['paymentMethod']) => void;
  setCartNotes: (notes: string) => void;
  clearCart: () => void;
  checkoutCart: () => { success: boolean; saleId?: string; message?: string };

  // Treatments
  deductSession: (courseId: string, staffId: string, notes: string) => void;

  // Appointments — React State only (P4 will move to Supabase)
  addAppointment: (appt: Omit<Appointment, 'id'>) => void;
  updateApptStatus: (id: string, status: Appointment['status']) => void;

  // Toasts
  toasts: Toast[];
  showToast: (message: string, type?: Toast['type']) => void;

  // Theme state
  currentTheme: FullThemeConfig;
  setCurrentTheme: (theme: FullThemeConfig) => void;
  isThemeModalOpen: boolean;
  setIsThemeModalOpen: (open: boolean) => void;

  // Invoice Modal
  activeInvoiceSaleId: string | null;
  setActiveInvoiceSaleId: (id: string | null) => void;
}

const emptyCart: CartState = {
  customerId: '',
  staffId: '',
  items: [],
  discountPct: 0,
  promoCode: '',
  taxPct: 0,
  tipAmount: 0,
  paidAmount: 0,
  paymentMethod: 'cash',
  notes: ''
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ─── Auth State ───
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authSession, setAuthSession] = useState<AuthSessionInfo | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

  // ─── Data states ───
  // Default to mock data to ensure all views, forms, and modules are immediately usable.
  // When live data is loaded from Supabase, it will smoothly replace/overlay.
  const [branches, setBranches] = useState<Branch[]>(mockBranches);
  const [currentBranch, setCurrentBranch] = useState<Branch>(mockBranches[0]);
  const [staffList, setStaffList] = useState<Staff[]>(mockStaff);
  const [currentUser, setCurrentUser] = useState<Staff>(mockStaff[0]);
  const [currentRole, setCurrentRole] = useState<UserRole>('owner_admin');
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [searchQuery, setSearchQuery] = useState('');

  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [services, setServices] = useState<Service[]>(mockServices);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [branchStocks, setBranchStocks] = useState(mockBranchStocks);
  const [packages, setPackages] = useState<PackageCombo[]>(mockPackages);
  const [courses, setCourses] = useState<CustomerCourse[]>(mockCustomerCourses);
  const [sessionDeductions, setSessionDeductions] = useState<SessionDeduction[]>(mockSessionDeductions);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [sales, setSales] = useState<Sale[]>(mockSales);
  const [payments, setPayments] = useState<Payment[]>(mockPayments);
  const [suppliers, setSuppliers] = useState<Supplier[]>(mockSuppliers);
  const [purchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);
  const [goodsReceipts] = useState<GoodsReceiptNote[]>(mockGoodsReceipts);
  const [expenses] = useState<Expense[]>(mockExpenses);
  const [promotions, setPromotions] = useState<Promotion[]>(mockPromotions);
  const [shifts] = useState<ShiftRoster[]>(mockShifts);
  const [timesheets] = useState<Timesheet[]>(mockTimesheets);
  const [commissions] = useState<CommissionRecord[]>(mockCommissions);
  const [payrolls] = useState<PayrollRecord[]>(mockPayrolls);

  // ─── Toast, Cart, Theme ───
  const [cart, setCart] = useState<CartState>(emptyCart);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeInvoiceSaleId, setActiveInvoiceSaleId] = useState<string | null>(null);

  const [currentTheme, setCurrentThemeState] = useState<FullThemeConfig>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_theme') : null;
    const found = APP_THEMES.find((t) => t.id === saved);
    return found || APP_THEMES[0];
  });
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ─── Theme Application ───
  const applyThemeToDOM = (theme: FullThemeConfig) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--primary', theme.primaryColor);
      root.style.setProperty('--primary-hover', theme.secondaryColor);
      root.style.setProperty('--theme-hero-gradient', theme.heroGradient);
      root.style.setProperty('--theme-button-bg', theme.buttonBg);
      root.style.setProperty('--theme-button-hover', theme.buttonHover);
      root.style.setProperty('--theme-active-sidebar', theme.activeSidebarBg);
      root.style.setProperty('--theme-badge-bg', theme.badgeBg);
      root.style.setProperty('--theme-badge-text', theme.badgeText);
      root.style.setProperty('--theme-ring', theme.ringColor);
      root.style.setProperty('--theme-icon-bg', theme.iconBg);
    }
  };

  useEffect(() => {
    applyThemeToDOM(currentTheme);
  }, [currentTheme]);

  const setCurrentTheme = (theme: FullThemeConfig) => {
    setCurrentThemeState(theme);
    applyThemeToDOM(theme);
    try { localStorage.setItem('vua_app_theme', theme.id); } catch { /* ignore */ }
  };

  // ─── Load live data from Supabase (only in live mode, after auth) ───
  const reloadMasterData = useCallback(async () => {
    if (!isLiveMode) return;
    try {
      const [
        liveBranches,
        liveServices,
        liveProducts,
        livePackages,
        liveSuppliers,
        livePromotions,
        liveStaff,
        liveCustomers,
        liveStocks
      ] = await Promise.all([
        masterDataService.getBranches(),
        masterDataService.getServices(),
        masterDataService.getProducts(),
        masterDataService.getPackages(),
        masterDataService.getSuppliers(),
        masterDataService.getPromotions(),
        masterDataService.getStaff(),
        masterDataService.getCustomers(),
        masterDataService.getInventoryStocks()
      ]);

      if (liveBranches.length > 0) {
        setBranches(liveBranches);
        setCurrentBranch((prev) => liveBranches.find((b) => b.id === prev?.id) || liveBranches[0]);
      }
      if (liveServices.length > 0) setServices(liveServices);
      if (liveProducts.length > 0) setProducts(liveProducts);
      if (livePackages.length > 0) setPackages(livePackages);
      if (liveSuppliers.length > 0) setSuppliers(liveSuppliers);
      if (livePromotions.length > 0) setPromotions(livePromotions);
      if (liveStaff.length > 0) {
        setStaffList(liveStaff);
        setCurrentUser((prev) => liveStaff.find((s) => s.id === prev?.id) || liveStaff[0]);
      }
      if (liveCustomers.length > 0) setCustomers(liveCustomers);
      if (Object.keys(liveStocks).length > 0) {
        const stockArray = Object.entries(liveStocks).flatMap(([branchId, products]) =>
          Object.entries(products).map(([productId, qty]) => ({
            branchId,
            productId,
            stockOnHand: qty
          }))
        );
        setBranchStocks(stockArray as typeof mockBranchStocks);
      }
    } catch (err) {
      console.error('Lỗi nạp dữ liệu từ Supabase:', err);
    }
  }, []);

  // ─── Auth initialization ───
  useEffect(() => {
    const initAuth = async () => {
      if (!isLiveMode) {
        // Demo mode: no auth needed, use mock data
        setAuthState('authenticated');
        setCurrentRole('owner_admin');
        return;
      }

      try {
        const session = await authService.getCurrentSession();
        setAuthSession(session);

        if (!session.isAuthenticated) {
          setAuthState('unauthenticated');
          return;
        }

        if (session.noMembership) {
          setAuthState('no_membership');
          setAuthErrorMessage(session.errorMessage || 'Không có quyền truy cập.');
          return;
        }

        // Valid session with membership
        if (session.role) {
          setCurrentRole(session.role);
        }
        setAuthState('authenticated');
        // Load data after successful auth
        await reloadMasterData();
      } catch (err) {
        console.error('Lỗi khởi tạo Auth:', err);
        setAuthState('error');
        setAuthErrorMessage('Không thể kết nối máy chủ xác thực.');
      }
    };

    initAuth();
  }, [reloadMasterData]);

  // ─── Auth handlers ───
  const handleLoginSuccess = async () => {
    setAuthState('loading');
    const session = await authService.getCurrentSession();
    setAuthSession(session);

    if (session.isAuthenticated && !session.noMembership && session.role) {
      setCurrentRole(session.role);
      setAuthState('authenticated');
      await reloadMasterData();
      showToast(`Đăng nhập thành công: ${session.staffName || session.email}`, 'success');
    } else {
      setAuthState('no_membership');
      setAuthErrorMessage(session.errorMessage || 'Tài khoản không có quyền truy cập.');
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    setAuthSession(null);
    setAuthState('unauthenticated');
    setAuthErrorMessage(null);
    // Clear data in live mode
    if (isLiveMode) {
      setBranches([]);
      setStaffList([]);
      setCustomers([]);
      setServices([]);
      setProducts([]);
      setPackages([]);
      setSuppliers([]);
      setPromotions([]);
      setAppointments([]);
      setSales([]);
      setPayments([]);
    }
    showToast('Đã đăng xuất.', 'info');
  };

  // ─── Cart Actions ───
  const addToCart = (item: Omit<CartItem, 'id'>) => {
    setCart((prev) => {
      const existingIndex = prev.items.findIndex((i) => i.type === item.type && i.refId === item.refId);
      if (existingIndex > -1) {
        const nextItems = [...prev.items];
        nextItems[existingIndex] = {
          ...nextItems[existingIndex],
          qty: nextItems[existingIndex].qty + item.qty
        };
        return { ...prev, items: nextItems };
      }
      const newItem: CartItem = {
        ...item,
        id: 'ci-' + Math.random().toString(36).substring(2, 8)
      };
      return { ...prev, items: [...prev.items, newItem] };
    });
    showToast(`Đã thêm ${item.name} vào giỏ`, 'success');
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const updateCartQty = (index: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = { ...nextItems[index], qty };
      return { ...prev, items: nextItems };
    });
  };

  const setCartCustomer = (customerId: string) => setCart((prev) => ({ ...prev, customerId }));
  const setCartStaff = (staffId: string) => setCart((prev) => ({ ...prev, staffId }));
  const setCartDiscountPct = (pct: number) => setCart((prev) => ({ ...prev, discountPct: pct }));
  const setCartPromoCode = (code: string) => setCart((prev) => ({ ...prev, promoCode: code }));
  const setCartTaxPct = (pct: number) => setCart((prev) => ({ ...prev, taxPct: pct }));
  const setCartTipAmount = (amount: number) => setCart((prev) => ({ ...prev, tipAmount: amount }));
  const setCartPaidAmount = (amount: number) => setCart((prev) => ({ ...prev, paidAmount: amount }));
  const setCartPaymentMethod = (method: CartState['paymentMethod']) => setCart((prev) => ({ ...prev, paymentMethod: method }));
  const setCartNotes = (notes: string) => setCart((prev) => ({ ...prev, notes }));

  const clearCart = () => {
    setCart({
      customerId: '',
      staffId: currentUser?.id || '',
      items: [],
      discountPct: 0,
      promoCode: '',
      taxPct: 0,
      tipAmount: 0,
      paidAmount: 0,
      paymentMethod: 'cash',
      notes: ''
    });
  };

  /**
   * Checkout — currently React State only.
   * ⚠️ P5 will replace this with ACID RPC transaction on Supabase.
   */
  const checkoutCart = () => {
    if (isLiveMode) {
      showToast('⚠️ Chức năng thanh toán chưa kết nối backend (P5). Dữ liệu chỉ lưu tạm trên trình duyệt.', 'warning');
    }

    if (!cart.items.length) {
      showToast('Giỏ hàng đang trống!', 'warning');
      return { success: false, message: 'Giỏ hàng trống' };
    }

    const subtotal = cart.items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const discountAmount = Math.round((subtotal * cart.discountPct) / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = Math.round((afterDiscount * cart.taxPct) / 100);
    const total = afterDiscount + taxAmount + cart.tipAmount;
    const debtAmount = Math.max(0, total - cart.paidAmount);

    const saleId = 'sale-' + Date.now().toString().slice(-6);
    const invoiceNo = `HĐ${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${(sales.length + 1).toString().padStart(3, '0')}`;
    const targetCustomer = customers.find((c) => c.id === cart.customerId);

    const newSale: Sale = {
      id: saleId,
      orgId: mockOrg.id,
      branchId: currentBranch?.id || '',
      customerId: cart.customerId || 'c-walkin',
      customerName: targetCustomer ? targetCustomer.name : 'Khách Vãng Lai',
      invoiceNo,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      staffId: cart.staffId || currentUser?.id || '',
      staffName: staffList.find((s) => s.id === (cart.staffId || currentUser?.id))?.name || 'Thu Ngân',
      items: [...cart.items],
      subtotal,
      discountPct: cart.discountPct,
      discountAmount,
      promoCode: cart.promoCode,
      taxPct: cart.taxPct,
      taxAmount,
      tipAmount: cart.tipAmount,
      total,
      paidAmount: cart.paidAmount,
      debtAmount,
      paymentMethod: cart.paymentMethod,
      status: debtAmount === 0 ? 'completed' : 'partial',
      notes: cart.notes,
      createdAt: new Date().toISOString()
    };

    setSales((prev) => [newSale, ...prev]);

    if (cart.paidAmount > 0) {
      const paymentId = 'pay-' + Date.now().toString().slice(-6);
      const newPayment: Payment = {
        id: paymentId,
        orgId: mockOrg.id,
        branchId: currentBranch?.id || '',
        customerId: cart.customerId,
        amount: cart.paidAmount,
        paymentMethod: cart.paymentMethod === 'debt' ? 'cash' : (cart.paymentMethod as any),
        paymentType: 'sale',
        receivedByStaffId: currentUser?.id || '',
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };
      setPayments((prev) => [newPayment, ...prev]);
    }

    if (targetCustomer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === targetCustomer.id
            ? {
                ...c,
                totalSpent: c.totalSpent + cart.paidAmount,
                debt: c.debt + debtAmount
              }
            : c
        )
      );
    }

    clearCart();
    setActiveInvoiceSaleId(saleId);

    const prefix = isLiveMode ? '⚠️ [Tạm] ' : '';
    showToast(`${prefix}Thanh toán hóa đơn ${invoiceNo}`, isLiveMode ? 'warning' : 'success');
    return { success: true, saleId };
  };

  /**
   * ⚠️ React State only — P5 will migrate to Supabase RPC
   */
  const deductSession = (courseId: string, staffId: string, notes: string) => {
    if (isLiveMode) {
      showToast('⚠️ Trừ buổi chưa kết nối backend (P5). Dữ liệu chỉ lưu tạm.', 'warning');
    }

    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    if (course.usedSessions >= course.totalSessions) {
      showToast('Gói liệu trình đã hết số buổi!', 'error');
      return;
    }

    const newUsed = course.usedSessions + 1;
    const isCompleted = newUsed >= course.totalSessions;

    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              usedSessions: newUsed,
              status: isCompleted ? 'completed' : 'active'
            }
          : c
      )
    );

    const deductionId = 'ded-' + Date.now().toString().slice(-6);
    const targetCust = customers.find((c) => c.id === course.customerId);
    const newDed: SessionDeduction = {
      id: deductionId,
      courseId,
      branchId: currentBranch?.id || '',
      staffId,
      sessionsDeducted: 1,
      performedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      notes: notes || 'Trừ 1 buổi liệu trình theo phác đồ',
      customerSignature: targetCust ? targetCust.name : 'Khách xác nhận'
    };

    setSessionDeductions((prev) => [newDed, ...prev]);
    showToast(`Đã trừ 1 buổi của gói "${course.name}" (Còn ${course.totalSessions - newUsed} buổi)`, 'success');
  };

  /**
   * ⚠️ React State only — P4 will migrate to Supabase
   */
  const addAppointment = (appt: Omit<Appointment, 'id'>) => {
    if (isLiveMode) {
      showToast('⚠️ Lịch hẹn chưa kết nối backend (P4). Dữ liệu chỉ lưu tạm trên trình duyệt.', 'warning');
    }

    const newId = 'apt-' + Date.now().toString().slice(-6);
    const targetCust = customers.find((c) => c.id === appt.customerId);
    const targetSvc = services.find((s) => s.id === appt.serviceId);
    const targetStaff = staffList.find((s) => s.id === appt.staffId);

    const newAppt: Appointment = {
      ...appt,
      id: newId,
      customerName: targetCust?.name || appt.customerName,
      customerPhone: targetCust?.phone || appt.customerPhone,
      serviceName: targetSvc?.name || appt.serviceName,
      staffName: targetStaff?.name || appt.staffName
    };

    setAppointments((prev) => [newAppt, ...prev]);
    showToast(`Đã đặt lịch hẹn cho ${newAppt.customerName}`, isLiveMode ? 'warning' : 'success');
  };

  const updateApptStatus = (id: string, status: Appointment['status']) => {
    if (isLiveMode) {
      showToast('⚠️ Cập nhật trạng thái chưa kết nối backend (P4).', 'warning');
    }
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  return (
    <AppContext.Provider
      value={{
        authState,
        authSession,
        authErrorMessage,
        handleLoginSuccess,
        handleLogout,
        isLiveMode,

        org: mockOrg,
        branches,
        currentBranch,
        setCurrentBranch,
        staffList,
        currentUser,
        currentRole,
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        customers,
        setCustomers,
        services,
        setServices,
        products,
        setProducts,
        packages,
        setPackages,
        courses,
        sessionDeductions,
        appointments,
        sales,
        payments,
        suppliers,
        setSuppliers,
        purchaseOrders,
        goodsReceipts,
        expenses,
        promotions,
        setPromotions,
        shifts,
        timesheets,
        commissions,
        payrolls,
        branchStocks,
        cart,
        addToCart,
        removeFromCart,
        updateCartQty,
        setCartCustomer,
        setCartStaff,
        setCartDiscountPct,
        setCartPromoCode,
        setCartTaxPct,
        setCartTipAmount,
        setCartPaidAmount,
        setCartPaymentMethod,
        setCartNotes,
        clearCart,
        checkoutCart,
        deductSession,
        addAppointment,
        updateApptStatus,
        toasts,
        showToast,
        currentTheme,
        setCurrentTheme,
        isThemeModalOpen,
        setIsThemeModalOpen,
        activeInvoiceSaleId,
        setActiveInvoiceSaleId
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export { AppContext };
// oxlint-disable-next-line react/only-export-components
export { useApp } from './useApp';
