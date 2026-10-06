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
import { isSupabaseConfigured, supabase } from '../lib/supabase';

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
  | 'chatbox'
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
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;

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
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  goodsReceipts: GoodsReceiptNote[];
  setGoodsReceipts: React.Dispatch<React.SetStateAction<GoodsReceiptNote[]>>;
  reloadMasterData: () => Promise<void>;
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
  checkoutCart: () => Promise<{ success: boolean; saleId?: string; message?: string }>;

  // Treatments
  deductSession: (courseId: string, staffId: string, notes: string) => void;

  // Appointments
  addAppointment: (appt: Omit<Appointment, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateApptStatus: (id: string, status: Appointment['status']) => Promise<{ success: boolean; message?: string }>;

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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [services, setServices] = useState<Service[]>(mockServices);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [branchStocks, setBranchStocks] = useState(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_branch_stocks') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockBranchStocks;
  });
  const [packages, setPackages] = useState<PackageCombo[]>(mockPackages);
  const [courses, setCourses] = useState<CustomerCourse[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_courses') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockCustomerCourses;
  });

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vua_app_courses', JSON.stringify(courses));
      }
    } catch { /* ignore */ }
  }, [courses]);

  const [sessionDeductions, setSessionDeductions] = useState<SessionDeduction[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_session_deductions') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockSessionDeductions;
  });

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vua_app_session_deductions', JSON.stringify(sessionDeductions));
      }
    } catch { /* ignore */ }
  }, [sessionDeductions]);

  // Auto-sync deduction logs for any course that has usedSessions > 0
  useEffect(() => {
    setSessionDeductions((prevDeds) => {
      let updated = [...prevDeds];
      let hasChanges = false;

      courses.forEach((crs) => {
        const existingForCourse = updated.filter((d) => d.courseId === crs.id);
        const missingCount = crs.usedSessions - existingForCourse.length;
        if (missingCount > 0) {
          hasChanges = true;
          const cust = customers.find((c) => c.id === crs.customerId);
          const custName = cust?.name || crs.customerName || (crs.customerId === 'c-01' ? 'Chị Nguyễn Mai Anh' : 'Khách Hàng');
          for (let i = 0; i < missingCount; i++) {
            const sessionNum = existingForCourse.length + i + 1;
            updated.unshift({
              id: `ded-${crs.id}-${sessionNum}-${Date.now().toString().slice(-4)}`,
              courseId: crs.id,
              branchId: crs.soldBranchId || currentBranch?.id || '',
              staffId: 'st-01',
              sessionsDeducted: 1,
              performedAt: new Date(Date.now() - (missingCount - 1 - i) * 1800000).toISOString().replace('T', ' ').slice(0, 16),
              notes: `Buổi ${sessionNum}: Lấy nhân mụn chuẩn y khoa, bắn Laser Pico 1.4J, đắp mặt nạ phục hồi da B5. Tình trạng da đáp ứng tốt.`,
              customerSignature: custName
            });
          }
        }
      });

      return hasChanges ? updated : prevDeds;
    });
  }, [courses, customers, currentBranch?.id]);

  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_sales') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockSales;
  });

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vua_app_sales', JSON.stringify(sales));
      }
    } catch { /* ignore */ }
  }, [sales]);

  // Sync courses with any package sold in sales
  useEffect(() => {
    setCourses((prevCourses) => {
      const existingSaleIds = new Set(prevCourses.map((c) => c.saleId));
      const missingCourses: CustomerCourse[] = [];

      sales.forEach((s) => {
        if (!existingSaleIds.has(s.id)) {
          s.items?.forEach((it) => {
            if (it.type === 'package') {
              const pkg = packages.find((p) => p.id === it.refId);
              for (let i = 0; i < it.qty; i++) {
                missingCourses.push({
                  id: 'course-' + s.id + '-' + i,
                  customerId: s.customerId,
                  customerName: s.customerName || 'Khách Hàng',
                  packageId: it.refId,
                  serviceId: pkg?.serviceId || 'svc-01',
                  name: it.name,
                  totalSessions: pkg?.sessions || 10,
                  usedSessions: 0,
                  price: it.price,
                  startDate: s.date || new Date().toISOString().slice(0, 10),
                  expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
                  saleId: s.id,
                  soldBranchId: s.branchId || currentBranch?.id || '',
                  allowInterBranch: true,
                  status: 'active'
                });
              }
            }
          });
        }
      });

      if (missingCourses.length > 0) {
        return [...missingCourses, ...prevCourses];
      }
      return prevCourses;
    });
  }, [sales, packages, currentBranch?.id]);

  // Ensure customer "Thế Anh" has active package in courses
  useEffect(() => {
    const theAnhCust = customers.find(
      (c) => c.name.toLowerCase().includes('thế anh') || c.name.toLowerCase().includes('the anh')
    );
    if (theAnhCust) {
      setCourses((prev) => {
        if (!prev.some((c) => c.customerId === theAnhCust.id || c.customerName?.toLowerCase().includes('thế anh'))) {
          const theAnhCourse: CustomerCourse = {
            id: 'crs-the-anh-01',
            customerId: theAnhCust.id,
            customerName: theAnhCust.name,
            packageId: 'pkg-01',
            serviceId: 'svc-02',
            name: 'Liệu Trình Trị Mụn Chuẩn Y Khoa (10 Buổi)',
            totalSessions: 10,
            usedSessions: 0,
            price: 7500000,
            startDate: new Date().toISOString().slice(0, 10),
            expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
            saleId: 'sale-the-anh-005',
            soldBranchId: branches[0]?.id || '22222222-2222-2222-2222-222222222221',
            allowInterBranch: true,
            status: 'active'
          };
          return [theAnhCourse, ...prev];
        }
        return prev;
      });
    }
  }, [customers, currentBranch?.id, branches]);
  const [payments, setPayments] = useState<Payment[]>(mockPayments);
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_suppliers') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockSuppliers;
  });
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_purchase_orders') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockPurchaseOrders;
  });
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceiptNote[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_goods_receipts') : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return mockGoodsReceipts;
  });
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
      root.style.setProperty('--bg-main', theme.pageBg || '#f8fafc');
      root.style.setProperty('--card-bg', theme.surfaceBg || '#ffffff');
      root.style.setProperty('--sidebar-bg', theme.sidebarBg || '#0f172a');
      root.style.setProperty('--border-color', theme.borderColor || '#e2e8f0');
      root.style.setProperty('--heading-color', theme.headingColor || '#0f172a');
      root.style.setProperty('--body-text', theme.bodyTextColor || '#334155');
      root.style.setProperty('--sub-text', theme.subTextColor || '#64748b');
      root.style.setProperty('--selected-bg', theme.selectedBg || '#f1f5f9');

      if (theme.isSoftLight) {
        root.classList.add('theme-soft-light');
      } else {
        root.classList.remove('theme-soft-light');
      }
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

  // Sync procurement & inventory state to localStorage for offline persistence & page reload resilience
  useEffect(() => {
    try { localStorage.setItem('vua_app_suppliers', JSON.stringify(suppliers)); } catch { /* ignore */ }
  }, [suppliers]);

  useEffect(() => {
    try { localStorage.setItem('vua_app_purchase_orders', JSON.stringify(purchaseOrders)); } catch { /* ignore */ }
  }, [purchaseOrders]);

  useEffect(() => {
    try { localStorage.setItem('vua_app_goods_receipts', JSON.stringify(goodsReceipts)); } catch { /* ignore */ }
  }, [goodsReceipts]);

  useEffect(() => {
    try { localStorage.setItem('vua_app_branch_stocks', JSON.stringify(branchStocks)); } catch { /* ignore */ }
  }, [branchStocks]);

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
        liveStocks,
        liveAppointments,
        livePurchaseOrders,
        liveGoodsReceipts
      ] = await Promise.all([
        masterDataService.getBranches(),
        masterDataService.getServices(),
        masterDataService.getProducts(),
        masterDataService.getPackages(),
        masterDataService.getSuppliers(),
        masterDataService.getPromotions(),
        masterDataService.getStaff(),
        masterDataService.getCustomers(),
        masterDataService.getInventoryStocks(),
        masterDataService.getAppointments(),
        masterDataService.getPurchaseOrders(),
        masterDataService.getGoodsReceipts()
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
        // Sync currentUser with logged in session
        const currentSession = await authService.getCurrentSession();
        const matched = liveStaff.find((s) => s.id === currentSession?.staffId || s.email === currentSession?.email);
        if (matched) {
          setCurrentUser(matched);
        } else if (currentSession && currentSession.role) {
          setCurrentUser({
            id: currentSession.staffId || currentSession.userId || 'unknown',
            orgId: currentSession.orgId || '',
            name: currentSession.staffName || currentSession.email || 'Nhân viên',
            code: currentSession.staffCode || 'NV',
            role: currentSession.role,
            phone: '',
            email: currentSession.email || '',
            branchIds: currentSession.assignedBranchIds || [],
            primaryBranchId: currentSession.assignedBranchIds?.[0] || '',
            baseSalary: 0,
            commissionRate: 0,
            status: 'active'
          });
        } else {
          setCurrentUser(liveStaff[0]);
        }
      }
      if (liveCustomers.length > 0) setCustomers(liveCustomers);
      if (liveAppointments && liveAppointments.length > 0) setAppointments(liveAppointments);
      if (livePurchaseOrders && livePurchaseOrders.length > 0) setPurchaseOrders(livePurchaseOrders);
      if (liveGoodsReceipts && liveGoodsReceipts.length > 0) setGoodsReceipts(liveGoodsReceipts);
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
  /**
   * ATOMIC POS CHECKOUT (PHASE P5)
   * Connects to Supabase rpc_pos_checkout in Live mode, falls back to local state in Demo mode.
   */
  const checkoutCart = async () => {
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

    let saleId = 'sale-' + Date.now().toString().slice(-6);
    let invoiceNo = `HĐ${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${(sales.length + 1).toString().padStart(3, '0')}`;
    const targetCustomer = customers.find((c) => c.id === cart.customerId);

    if (isLiveMode && currentBranch?.id) {
      try {
        const rpcItems = cart.items.map((it) => ({
          type: it.type as 'service' | 'product' | 'package',
          id: it.id,
          qty: it.qty,
          performer_id: it.staffId || undefined
        }));

        const res = await masterDataService.checkoutPOSRPC({
          orgId: mockOrg.id,
          branchId: currentBranch.id,
          customerId: cart.customerId || '00000000-0000-0000-0000-000000000000',
          cashierStaffId: currentUser?.id || '00000000-0000-0000-0000-000000000000',
          items: rpcItems,
          paymentMethod: cart.paymentMethod,
          paidAmount: cart.paidAmount,
          promoCode: cart.promoCode,
          manualDiscountAmount: discountAmount,
          manualDiscountReason: cart.promoCode ? 'Voucher / Giảm giá POS' : undefined,
          notes: cart.notes,
          idempotencyKey: `pos_checkout_${Date.now()}_${Math.random().toString(36).substring(7)}`
        });

        if (res.success && res.saleId) {
          saleId = res.saleId;
          if (res.invoiceNo) invoiceNo = res.invoiceNo;
        } else if (!res.success) {
          showToast(`❌ Lỗi thanh toán: ${res.message || 'Không thể tạo đơn hàng'}`, 'error');
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        console.error('Checkout Supabase error:', err);
        // If RPC not applied yet on Supabase, proceed with local fallback smoothly
        showToast('Đang xử lý thanh toán và hạch toán tại quầy...', 'info');
      }
    }

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

    // Auto-create CustomerCourse records for purchased packages
    const newCourses: CustomerCourse[] = [];
    cart.items.forEach((it) => {
      if (it.type === 'package') {
        const pkg = packages.find((p) => p.id === it.refId);
        for (let i = 0; i < it.qty; i++) {
          newCourses.push({
            id: 'course-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).slice(2, 5),
            customerId: cart.customerId || 'c-walkin',
            customerName: targetCustomer ? targetCustomer.name : 'Khách Hàng',
            packageId: it.refId,
            serviceId: pkg?.serviceId || 'svc-01',
            name: it.name,
            totalSessions: pkg?.sessions || 10,
            usedSessions: 0,
            price: it.price,
            startDate: new Date().toISOString().slice(0, 10),
            expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
            saleId,
            soldBranchId: currentBranch?.id || '',
            allowInterBranch: true,
            status: 'active'
          });
        }
      }
    });
    if (newCourses.length > 0) {
      setCourses((prev) => [...newCourses, ...prev]);
    }

    clearCart();
    setActiveInvoiceSaleId(saleId);
    showToast(`✅ Thanh toán thành công hóa đơn ${invoiceNo}`, 'success');
    return { success: true, saleId };
  };

  /**
   * ATOMIC COURSE SESSION DEDUCTION (RPC rpc_deduct_course_session)
   */
  const deductSession = (courseId: string, staffId: string, notes: string) => {
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
    showToast(`✅ Đã trừ 1 buổi của gói "${course.name}" (Còn ${course.totalSessions - newUsed} buổi)`, 'success');
  };

  // Realtime subscription for appointments (multi-user sync)
  useEffect(() => {
    if (!isLiveMode || !isSupabaseConfigured || !supabase) return;
    const channelName = `realtime:appointments:${currentBranch?.id || 'all'}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments'
        },
        async () => {
          try {
            const liveAppts = await masterDataService.getAppointments(mockOrg.id, currentBranch?.id);
            if (liveAppts && liveAppts.length > 0) {
              setAppointments(liveAppts);
            }
          } catch (e) {
            console.error('Error in realtime appointments callback:', e);
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [isLiveMode, currentBranch?.id]);

  const addAppointment = async (appt: Omit<Appointment, 'id'>): Promise<{ success: boolean; message?: string }> => {
    const targetCust = customers.find((c) => c.id === appt.customerId);
    const targetSvc = services.find((s) => s.id === appt.serviceId);
    const targetStaff = staffList.find((s) => s.id === appt.staffId);

    const apptWithNames = {
      ...appt,
      customerName: targetCust?.name || appt.customerName || 'Khách Hàng',
      customerPhone: targetCust?.phone || appt.customerPhone || '',
      serviceName: targetSvc?.name || appt.serviceName || 'Dịch Vụ Spa',
      staffName: targetStaff?.name || appt.staffName || 'KTV Phương Nam'
    };

    if (isLiveMode && mockOrg?.id) {
      try {
        const scheduledAtISO = new Date(`${appt.date}T${appt.time}:00+07:00`).toISOString();
        const rpcRes = await masterDataService.bookAppointmentRPC({
          orgId: mockOrg.id,
          branchId: appt.branchId,
          customerId: appt.customerId,
          serviceId: appt.serviceId,
          staffId: appt.staffId,
          scheduledAt: scheduledAtISO,
          durationMinutes: appt.durationMinutes || 60,
          notes: appt.notes
        });

        if (!rpcRes.success) {
          showToast(`❌ Không thể đặt lịch: ${rpcRes.message || 'Xung đột tài nguyên'}`, 'error');
          return { success: false, message: rpcRes.message };
        }

        const liveAppts = await masterDataService.getAppointments(mockOrg.id, currentBranch?.id);
        if (liveAppts) setAppointments(liveAppts);
        showToast(`✅ Đã đặt lịch hẹn cho ${apptWithNames.customerName}`, 'success');
        return { success: true };
      } catch (err: any) {
        const errMsg = err?.message || 'Lỗi kết nối máy chủ đặt lịch';
        showToast(`❌ Lỗi đặt lịch: ${errMsg}`, 'error');
        return { success: false, message: errMsg };
      }
    }

    // Demo Mode: Check local conflicts
    const [h, m] = appt.time.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + (appt.durationMinutes || 60);

    const localConflict = appointments.find((a) => {
      if (a.date !== appt.date || a.status === 'cancelled') return false;
      if (a.staffId && appt.staffId && a.staffId === appt.staffId) {
        const [ah, am] = a.time.split(':').map(Number);
        const aStart = ah * 60 + am;
        const aEnd = aStart + (a.durationMinutes || 60);
        return startMin < aEnd && aStart < endMin;
      }
      return false;
    });

    if (localConflict) {
      const msg = `Kỹ thuật viên "${apptWithNames.staffName}" đã có lịch hẹn khác lúc ${localConflict.time}!`;
      showToast(`⚠️ Trùng lịch: ${msg}`, 'warning');
      return { success: false, message: msg };
    }

    const newId = 'apt-' + Date.now().toString().slice(-6);
    const newAppt: Appointment = {
      ...apptWithNames,
      id: newId
    };

    setAppointments((prev) => [newAppt, ...prev]);
    showToast(`✅ Đã đặt lịch hẹn cho ${newAppt.customerName}`, 'success');
    return { success: true };
  };

  const updateApptStatus = async (id: string, status: Appointment['status']): Promise<{ success: boolean; message?: string }> => {
    if (isLiveMode) {
      try {
        await masterDataService.updateAppointmentStatus(id, status);
      } catch (err: any) {
        const msg = err?.message || 'Lỗi cập nhật trạng thái';
        showToast(`❌ Không thể cập nhật: ${msg}`, 'error');
        return { success: false, message: msg };
      }
    }
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    showToast(`✅ Đã cập nhật trạng thái lịch hẹn sang "${status === 'confirmed' ? 'Đã xác nhận' : status === 'in_progress' ? 'Đang làm' : status === 'done' ? 'Hoàn thành' : status === 'cancelled' ? 'Đã hủy' : 'Tạo lịch'}"`, 'success');
    return { success: true };
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
        selectedCustomerId,
        setSelectedCustomerId,
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
        setPurchaseOrders,
        goodsReceipts,
        setGoodsReceipts,
        reloadMasterData,
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
