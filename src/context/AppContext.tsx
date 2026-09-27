import React, { createContext, useState, useEffect } from 'react';

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

interface AppContextType {
  org: typeof mockOrg;
  branches: Branch[];
  currentBranch: Branch;
  setCurrentBranch: (branch: Branch) => void;
  staffList: Staff[];
  currentUser: Staff;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Data states
  customers: Customer[];
  services: Service[];
  products: Product[];
  packages: PackageCombo[];
  courses: CustomerCourse[];
  sessionDeductions: SessionDeduction[];
  appointments: Appointment[];
  sales: Sale[];
  payments: Payment[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceiptNote[];
  expenses: Expense[];
  promotions: Promotion[];
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

  // Appointments
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

const initialCart: CartState = {
  customerId: 'c-01',
  staffId: 'st-04',
  items: [
    { id: 'cart-1', type: 'service', refId: 'svc-01', name: 'Chăm Sóc & Trẻ Hóa Da Oxy Jet', price: 650000, qty: 1, staffId: 'st-05' },
    { id: 'cart-2', type: 'product', refId: 'prd-01', name: 'Serum Phục Hồi B5 Booster 50ml', price: 680000, qty: 1 }
  ],
  discountPct: 0,
  promoCode: '',
  taxPct: 0,
  tipAmount: 0,
  paidAmount: 1330000,
  paymentMethod: 'bank_transfer',
  notes: ''
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branches] = useState<Branch[]>(mockBranches);
  const [currentBranch, setCurrentBranch] = useState<Branch>(mockBranches[0]);
  const [staffList] = useState<Staff[]>(mockStaff);
  const [currentUser, setCurrentUser] = useState<Staff>(mockStaff[0]);
  const [currentRole, setCurrentRoleState] = useState<UserRole>('owner_admin');
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [services] = useState<Service[]>(mockServices);
  const [products] = useState<Product[]>(mockProducts);
  const [branchStocks, setBranchStocks] = useState(mockBranchStocks);
  const [packages] = useState<PackageCombo[]>(mockPackages);
  const [courses, setCourses] = useState<CustomerCourse[]>(mockCustomerCourses);
  const [sessionDeductions, setSessionDeductions] = useState<SessionDeduction[]>(mockSessionDeductions);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [sales, setSales] = useState<Sale[]>(mockSales);
  const [payments, setPayments] = useState<Payment[]>(mockPayments);
  const [suppliers] = useState<Supplier[]>(mockSuppliers);
  const [purchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);
  const [goodsReceipts] = useState<GoodsReceiptNote[]>(mockGoodsReceipts);
  const [expenses] = useState<Expense[]>(mockExpenses);
  const [promotions] = useState<Promotion[]>(mockPromotions);
  const [shifts] = useState<ShiftRoster[]>(mockShifts);
  const [timesheets] = useState<Timesheet[]>(mockTimesheets);
  const [commissions] = useState<CommissionRecord[]>(mockCommissions);
  const [payrolls] = useState<PayrollRecord[]>(mockPayrolls);

  // Theme & Modals
  const [currentTheme, setCurrentThemeState] = useState<FullThemeConfig>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('vua_app_theme') : null;
    const found = APP_THEMES.find((t) => t.id === saved);
    return found || APP_THEMES[0];
  });
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

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
    try {
      localStorage.setItem('vua_app_theme', theme.id);
    } catch {
      // ignore
    }
  };


  // Cart
  const [cart, setCart] = useState<CartState>(initialCart);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeInvoiceSaleId, setActiveInvoiceSaleId] = useState<string | null>(null);


  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    const matchedStaff = staffList.find((s) => s.role === role) || staffList[0];
    setCurrentUser(matchedStaff);
    showToast(`Đã chuyển sang vai trò: ${role}`, 'info');
  };

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
      staffId: currentUser.id,
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

  const checkoutCart = () => {
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
      branchId: currentBranch.id,
      customerId: cart.customerId || 'c-walkin',
      customerName: targetCustomer ? targetCustomer.name : 'Khách Vãng Lai',
      invoiceNo,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      staffId: cart.staffId || currentUser.id,
      staffName: staffList.find((s) => s.id === (cart.staffId || currentUser.id))?.name || 'Thu Ngân',
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

    // Handle payment allocation
    if (cart.paidAmount > 0) {
      const paymentId = 'pay-' + Date.now().toString().slice(-6);
      const newPayment: Payment = {
        id: paymentId,
        orgId: mockOrg.id,
        branchId: currentBranch.id,
        customerId: cart.customerId,
        amount: cart.paidAmount,
        paymentMethod: cart.paymentMethod === 'debt' ? 'cash' : (cart.paymentMethod as any),
        paymentType: 'sale',
        receivedByStaffId: currentUser.id,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };
      setPayments((prev) => [newPayment, ...prev]);
    }

    // Update customer debt and spent
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

    // Deduct stock for products
    cart.items.forEach((it) => {
      if (it.type === 'product') {
        setBranchStocks((prev) =>
          prev.map((stk) =>
            stk.branchId === currentBranch.id && stk.productId === it.refId
              ? { ...stk, stockOnHand: Math.max(0, stk.stockOnHand - it.qty) }
              : stk
          )
        );
      }
    });

    clearCart();
    setActiveInvoiceSaleId(saleId);
    showToast(`Thanh toán thành công hóa đơn ${invoiceNo}`, 'success');
    return { success: true, saleId };
  };

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
      branchId: currentBranch.id,
      staffId,
      sessionsDeducted: 1,
      performedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      notes: notes || 'Trừ 1 buổi liệu trình theo phác đồ',
      customerSignature: targetCust ? targetCust.name : 'Khách xác nhận'
    };

    setSessionDeductions((prev) => [newDed, ...prev]);
    showToast(`Đã trừ 1 buổi của gói "${course.name}" (Còn ${course.totalSessions - newUsed} buổi)`, 'success');
  };

  const addAppointment = (appt: Omit<Appointment, 'id'>) => {
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
    showToast(`Đã đặt lịch hẹn thành công cho ${newAppt.customerName}`, 'success');
  };

  const updateApptStatus = (id: string, status: Appointment['status']) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    showToast(`Đã cập nhật trạng thái lịch hẹn`, 'info');
  };

  return (
    <AppContext.Provider
      value={{
        org: mockOrg,
        branches,
        currentBranch,
        setCurrentBranch,
        staffList,
        currentUser,
        currentRole,
        setCurrentRole,
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        customers,
        services,
        products,
        packages,
        courses,
        sessionDeductions,
        appointments,
        sales,
        payments,
        suppliers,
        purchaseOrders,
        goodsReceipts,
        expenses,
        promotions,
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

