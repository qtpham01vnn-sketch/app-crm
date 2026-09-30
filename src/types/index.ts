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
  title?: string;
  role: UserRole;
  branchIds: string[];
  primaryBranchId: string;
  baseSalary: number;
  commissionRate: number;
  avatar?: string;
  status: 'active' | 'inactive';
  employmentStatus?: 'active' | 'on_leave' | 'terminated';
  assignedBranches?: Array<{
    branchId: string;
    branchName: string;
    isPrimary: boolean;
    effectiveFrom: string;
    effectiveTo?: string;
  }>;
  skills?: Array<{
    serviceId: string;
    serviceName: string;
    proficiencyLevel: string;
  }>;
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

export interface BranchTransferItem {
  id: string;
  transferId?: string;
  productId: string;
  productName: string;
  productCode?: string;
  productUnit?: string;
  lotNumber?: string;
  expiryDate?: string;
  unitCost: number;
  quantityRequested: number;
  quantityDispatched: number;
  quantityReceived: number;
  quantityAccepted: number;
  quantityDamaged: number;
  quantityMissing: number;
  quantityReturned: number;
  notes?: string;
}

export interface BranchTransferEvent {
  id: string;
  transferId?: string;
  eventType: string;
  actorName: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface BranchTransfer {
  id: string;
  orgId: string;
  fromBranchId: string;
  fromBranchName?: string;
  toBranchId: string;
  toBranchName?: string;
  transferNumber: string;
  status: 'draft' | 'dispatched' | 'partially_received' | 'difference_pending' | 'completed' | 'difference_resolved' | 'cancelled';
  totalItems: number;
  totalValue: number;
  dispatchDate?: string;
  receivedDate?: string;
  notes?: string;
  createdAt: string;
  items: BranchTransferItem[];
  events?: BranchTransferEvent[];
}

export interface InventoryAuditItem {
  id: string;
  auditId?: string;
  productId: string;
  productName: string;
  productCode?: string;
  productUnit?: string;
  lotNumber?: string;
  expiryDate?: string;
  unitCost: number;
  systemQuantity: number;
  actualQuantity: number;
  differenceQuantity: number;
  differenceValue: number;
  reason?: string;
  notes?: string;
}

export interface InventoryAuditEvent {
  id: string;
  auditId?: string;
  eventType: string;
  actorName: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface InventoryAudit {
  id: string;
  orgId: string;
  branchId: string;
  branchName?: string;
  auditNumber: string;
  status: 'draft' | 'counting' | 'completed' | 'cancelled';
  snapshotAt: string;
  auditorName?: string;
  approvedByName?: string;
  approvedAt?: string;
  totalItems: number;
  totalBookQuantity: number;
  totalActualQuantity: number;
  totalDifferenceQuantity: number;
  totalDifferenceValue: number;
  notes?: string;
  createdAt: string;
  items: InventoryAuditItem[];
  events?: InventoryAuditEvent[];
}

export interface RosterShift {
  id: string;
  orgId?: string;
  branchId: string;
  staffId: string;
  staffName?: string;
  staffCode?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: 'morning' | 'afternoon' | 'day_shift' | 'night' | 'custom';
  breakMinutes?: number;
  isOff: boolean;
  status: 'scheduled' | 'completed' | 'canceled' | 'leave';
  isLocked?: boolean;
  notes?: string;
  appointmentsCount?: number;
}

export interface LeaveRequest {
  id: string;
  orgId?: string;
  staffId: string;
  staffName?: string;
  branchId?: string;
  leaveType: 'annual_leave' | 'unpaid' | 'sick' | 'personal';
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface ShiftSwapRequest {
  id: string;
  orgId?: string;
  requesterStaffId: string;
  requesterName?: string;
  requesterShiftId: string;
  targetStaffId?: string;
  targetName?: string;
  targetShiftId?: string;
  reason?: string;
  status: 'pending_peer' | 'pending_manager' | 'approved' | 'rejected' | 'canceled';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  orgId?: string;
  branchId: string;
  branchName?: string;
  staffId: string;
  staffName?: string;
  staffCode?: string;
  shiftId?: string;
  workDate: string;
  checkInAt: string;
  checkOutAt?: string;
  isOvernight: boolean;
  actualHours: number;
  approvedHours: number;
  status: 'working' | 'completed' | 'pending_approval' | 'approved' | 'rejected';
  checkInMethod: 'gps' | 'wifi' | 'pin' | 'manual_app' | 'manager_override';
  checkInMeta?: Record<string, any>;
  checkOutMeta?: Record<string, any>;
  isVerified: boolean;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface AttendanceAdjustment {
  id: string;
  orgId?: string;
  attendanceId?: string;
  staffId: string;
  staffName?: string;
  branchId: string;
  branchName?: string;
  workDate: string;
  originalCheckIn?: string;
  originalCheckOut?: string;
  requestedCheckIn: string;
  requestedCheckOut: string;
  requestedHours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}



