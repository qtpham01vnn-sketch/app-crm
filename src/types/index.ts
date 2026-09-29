export type UserRole = 'owner_admin' | 'branch_manager' | 'cashier_receptionist' | 'technician_doctor';

export interface ThemeConfig {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradient: string;
  badgeBg: string;
  badgeText: string;
  previewColor: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  phone: string;
  address: string;
}

export interface Branch {
  id: string;
  orgId: string;
  name: string;
  code: string;
  phone: string;
  address: string;
  isMainBranch?: boolean;
}

export interface Staff {
  id: string;
  orgId: string;
  name: string;
  code: string;
  phone: string;
  email: string;
  role: UserRole;
  branchIds: string[];
  primaryBranchId: string;
  baseSalary: number;
  commissionRate: number;
  avatar?: string;
  status: 'active' | 'inactive';
}

export interface Customer {
  id: string;
  orgId: string;
  name: string;
  phone: string;
  email?: string;
  gender: 'female' | 'male' | 'other';
  birthday?: string;
  address?: string;
  primaryBranchId: string;
  vipTier: 'standard' | 'silver' | 'gold' | 'diamond';
  totalSpent: number;
  debt: number;
  creditBalance: number;
  notes?: string;
  createdAt: string;
}

export interface Service {
  id: string;
  orgId: string;
  name: string;
  code: string;
  category: string;
  durationMinutes: number;
  basePrice: number;
  promoPrice?: number;
  promoStartDate?: string;
  promoEndDate?: string;
  promoCondition?: string;
  commissionPct: number;
  description?: string;
  imageUrl?: string;
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
  allowOnlineBooking?: boolean;
  isFeatured?: boolean;
  assignedStaffIds?: string[];
  requiredResourceType?: 'room' | 'bed' | 'chair' | 'machine';
  monthlyBookingCount?: number;
  isActive: boolean;
}

export interface Resource {
  id: string;
  orgId: string;
  branchId: string;
  code: string;
  name: string;
  type: 'room' | 'bed' | 'chair' | 'machine';
  capacity: number;
  isActive: boolean;
  notes?: string;
}

export interface ServiceStaffSkill {
  id: string;
  orgId: string;
  serviceId: string;
  staffId: string;
  proficiencyLevel: 'standard' | 'senior' | 'master';
  customDurationMinutes?: number;
  isPrimary: boolean;
}

export interface ServicePriceVersion {
  id: string;
  orgId: string;
  branchId: string;
  serviceId: string;
  price: number;
  promoPrice?: number;
  promoStartDate?: string;
  promoEndDate?: string;
  promoCondition?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
}

export interface BranchServicePrice {
  id: string;
  branchId: string;
  serviceId: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  orgId: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  costPrice: number;
  retailPrice: number;
  commissionPct: number;
  minStockAlert: number;
  isActive: boolean;
}

export interface BranchInventoryStock {
  id: string;
  branchId: string;
  productId: string;
  stockOnHand: number;
  minStock: number;
}

export interface PackageCombo {
  id: string;
  orgId: string;
  name: string;
  code: string;
  serviceId: string;
  sessions: number;
  price: number;
  validityDays: number;
  description?: string;
  isActive: boolean;
}

export interface CustomerCourse {
  id: string;
  customerId: string;
  packageId?: string;
  serviceId: string;
  name: string;
  totalSessions: number;
  usedSessions: number;
  price: number;
  startDate: string;
  expiryDate?: string;
  saleId: string;
  soldBranchId?: string;
  allowInterBranch?: boolean;
  status: 'active' | 'completed' | 'expired';
}

export interface SessionDeduction {
  id: string;
  courseId: string;
  appointmentId?: string;
  branchId: string;
  staffId: string;
  sessionsDeducted: number;
  performedAt: string;
  notes?: string;
  customerSignature?: string;
}

export interface Appointment {
  id: string;
  branchId: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  serviceId: string;
  serviceName?: string;
  staffId: string;
  staffName?: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: 'booked' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  priceSnapshot: number;
  commissionSnapshot?: number;
  roomOrBed?: string;
  notes?: string;
  saleId?: string;
}

export interface CartItem {
  id: string;
  type: 'service' | 'product' | 'package' | 'course_deduct';
  refId: string;
  name: string;
  price: number;
  qty: number;
  staffId?: string;
  discountPct?: number;
  notes?: string;
}

export interface Sale {
  id: string;
  orgId: string;
  branchId: string;
  customerId: string;
  customerName?: string;
  invoiceNo: string;
  date: string;
  time: string;
  staffId: string;
  staffName?: string;
  items: CartItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  promoCode?: string;
  taxPct: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paidAmount: number;
  debtAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'debt' | 'split' | 'deposit';
  status: 'completed' | 'partial' | 'debt' | 'refunded' | 'void';
  notes?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  orgId: string;
  branchId: string;
  customerId: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'deposit';
  paymentType: 'sale' | 'debt_collection' | 'deposit' | 'refund';
  receivedByStaffId: string;
  date: string;
  referenceNo?: string;
  notes?: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  saleId: string;
  amountAllocated: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  contactName?: string;
  phone: string;
  email?: string;
  address?: string;
  debt: number;
}

export interface PurchaseOrderItem {
  id?: string;
  productId: string;
  productName: string;
  purchaseUnit?: string;
  conversionRate?: number;
  qtyOrdered: number;
  qtyReceived: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface PurchaseOrder {
  id: string;
  orgId: string;
  branchId: string;
  supplierId: string;
  supplierName?: string;
  poNumber: string;
  orderDate: string;
  expectedDate?: string;
  totalAmount: number;
  notes?: string;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'completed' | 'cancelled';
  items: PurchaseOrderItem[];
}

export interface GoodsReceiptItem {
  id?: string;
  poItemId?: string;
  productId: string;
  productName: string;
  lotNumber?: string;
  expiryDate?: string;
  purchaseUnit?: string;
  conversionRate?: number;
  qty: number;
  qtyAccepted?: number;
  qtyRejected?: number;
  rejectionReason?: string;
  acceptedBaseUnits?: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface GoodsReceiptNote {
  id: string;
  orgId: string;
  branchId: string;
  poId?: string;
  supplierId: string;
  supplierName?: string;
  grnNumber: string;
  invoiceNumber?: string;
  receivedDate: string;
  receiverStaffId: string;
  totalAmount: number;
  paidAmount: number;
  notes?: string;
  status: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  items: GoodsReceiptItem[];
}

export interface Expense {
  id: string;
  orgId: string;
  branchId: string;
  category: 'rent' | 'utilities' | 'marketing' | 'salary' | 'supplies' | 'other';
  title: string;
  amount: number;
  date: string;
  paymentMethod: 'cash' | 'bank_transfer';
  staffId: string;
  notes?: string;
}

export interface Promotion {
  id: string;
  orgId: string;
  code: string;
  title: string;
  discountType: 'pct' | 'fixed';
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  applicableBranchIds?: string[];
  isActive: boolean;
}

export interface ShiftRoster {
  id: string;
  branchId: string;
  staffId: string;
  staffName?: string;
  date: string;
  shiftType: 'morning' | 'afternoon' | 'evening' | 'full';
  notes?: string;
}

export interface Timesheet {
  id: string;
  branchId: string;
  staffId: string;
  staffName?: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  workingHours: number;
  isApproved: boolean;
}

export interface CommissionRecord {
  id: string;
  orgId: string;
  branchId: string;
  staffId: string;
  staffName: string;
  saleId: string;
  serviceOrProductName: string;
  itemValue: number;
  commissionPct: number;
  commissionAmount: number;
  date: string;
}

export interface PayrollRecord {
  id: string;
  orgId: string;
  branchId: string;
  staffId: string;
  staffName: string;
  month: string;
  baseSalary: number;
  commissionTotal: number;
  allowance: number;
  deduction: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
}
