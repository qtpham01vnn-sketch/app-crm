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
  staffName?: string;
  saleId?: string;
  customerId?: string;
  serviceOrProductName: string;
  itemType?: 'service' | 'product' | 'package' | 'course_deduct';
  itemRevenue?: number;
  itemValue?: number;
  appliedRate?: number;
  commissionPct?: number;
  appliedFixedAmount?: number;
  calculatedAmount?: number;
  commissionAmount?: number;
  splitRatio?: number;
  finalCommission?: number;
  status?: 'expected' | 'eligible' | 'approved' | 'paid' | 'reversed';
  reversalReason?: string;
  payrollPeriodId?: string;
  occurredAt?: string;
  date?: string;
  createdAt?: string;
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

export interface PayrollPeriod {
  id: string;
  orgId?: string;
  branchId?: string;
  periodName: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'locked' | 'approved' | 'paid';
  totalStaff: number;
  totalBaseSalary: number;
  totalCommission: number;
  totalAllowance: number;
  totalDeduction: number;
  totalNetSalary: number;
  lockedAt?: string;
  lockedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PayrollRecordDetail {
  id: string;
  orgId?: string;
  payrollPeriodId: string;
  branchId: string;
  staffId: string;
  staffName?: string;
  staffCode?: string;
  baseSalary: number;
  actualWorkingHours: number;
  salaryByHours: number;
  commissionTotal: number;
  allowance: number;
  deduction: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  adjustmentNotes?: string;
  paidAt?: string;
  paymentMethod?: string;
}

export interface SalesCashflowReport {
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  salesSummary: {
    grossSales: number;
    totalDiscount: number;
    netInvoicedSales: number;
    invoiceCount: number;
    avgOrderValue: number;
    newCustomerDebt: number;
    packageCourseSales: number;
  };
  cashflowSummary: {
    confirmedCashCollected: number;
    pendingBankTransfers: number;
    newDepositsCollected: number;
    depositRedeemed: number;
    debtRecovered: number;
    totalRefundsPaid: number;
    netSalesCashflow: number;
  };
  methodBreakdown: Array<{
    paymentMethod: string;
    totalAmount: number;
    transactionCount: number;
  }>;
  earnedSummary: {
    totalSessionsPerformed: number;
    earnedSessionRevenue: number;
  };
  invoicesDrilldown: Array<{
    id: string;
    invoiceNumber: string;
    branchId: string;
    branchName: string;
    customerName: string;
    customerPhone: string;
    totalAmount: number;
    paidAmount: number;
    debtAmount: number;
    status: string;
    createdAt: string;
  }>;
  paymentsDrilldown: Array<{
    id: string;
    paymentNumber: string;
    branchId: string;
    branchName: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    paymentType: string;
    reconciliationStatus: string;
    note?: string;
    createdAt: string;
  }>;
}

export interface ServiceBom {
  id: string;
  orgId: string;
  serviceId: string;
  productId: string;
  productName?: string;
  standardQuantity: number;
  unitOfMeasure: string;
  conversionRate: number;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  notes?: string;
}

export interface SessionMaterialUsage {
  id: string;
  orgId: string;
  branchId: string;
  serviceId: string;
  serviceName?: string;
  sessionDeductionId?: string;
  saleId?: string;
  appointmentId?: string;
  productId: string;
  productName?: string;
  lotNumber?: string;
  standardQuantity: number;
  actualQuantity: number;
  unitOfMeasure: string;
  baseQuantityDeducted: number;
  costPriceSnapshot: number;
  totalCost: number;
  isMissingCostSnapshot: boolean;
  performerStaffId?: string;
  performerName?: string;
  notes?: string;
  usedAt: string;
}

export interface CogsAndProfitReport {
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  summary: {
    recognizedRevenue: number;
    cogsProducts: number;
    materialCost: number;
    directCommission: number;
    directContribution: number;
    marginPct: number | null;
    missingCostWarningCount: number;
    disclaimer: string;
  };
  serviceBreakdown: Array<{
    serviceId: string;
    serviceName: string;
    category: string;
    sessionCount: number;
    recognizedRevenue: number;
    materialCost: number;
    directContribution: number;
    marginPct: number | null;
  }>;
  varianceBreakdown: {
    bomVariance: number;
    auditShrinkage: number;
    damagedExpiredLoss: number;
    transferVariance: number;
    unassignedUsage: number;
  };
  drilldown: {
    totalRecords: number;
    page: number;
    pageSize: number;
    items: Array<{
      id: string;
      usedAt: string;
      branchName: string;
      serviceName: string;
      productName: string;
      standardQty: number;
      actualQty: number;
      unit: string;
      costPriceSnapshot: number;
      totalCost: number;
      isMissingCostSnapshot: boolean;
      performerName?: string;
      notes?: string;
    }>;
  };
}

export interface StaffAndResourceUtilizationReport {
  period: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  summary: {
    totalSalesRepRevenue: number;
    totalServiceExecRevenue: number;
    totalSessionsCount: number;
    totalHandsOnHours: number;
    totalApprovedWorkHours: number;
    overallUtilizationPct: number | null;
    disclaimer: string;
  };
  staffMetrics: Array<{
    staffId: string;
    fullName: string;
    jobTitle: string;
    primaryBranchName: string;
    salesInvoiced: number;
    serviceExecutionRevenue: number;
    sessionsCompletedCount: number;
    uniqueClientsServed: number;
    handsOnHours: number;
    approvedWorkHours: number;
    utilizationPct: number | null;
    ratingAvg: number | null;
    ratingCount: number;
    ratingStatus: string;
  }>;
  resourceMetrics: Array<{
    resourceId: string;
    code: string;
    resourceName: string;
    resourceType: string;
    capacity: number;
    branchName: string;
    availableSeatHours: number;
    maintenanceSeatHours: number;
    bookedSeatHours: number;
    actualUsedSeatHours: number;
    bookedUtilizationPct: number | null;
    actualUtilizationPct: number | null;
  }>;
  drilldown: {
    totalRecords: number;
    page: number;
    pageSize: number;
    items: Array<{
      sessionId: string;
      performedAt: string;
      branchName: string;
      customerName: string;
      customerPhone: string;
      serviceName: string;
      staffName: string;
      sessionSource: string;
      allocatedRevenue: number;
      durationHours: number;
    }>;
  };
}

export interface CustomerRetentionAndCohortReport {
  timezone: string;
  startDate: string;
  endDate: string;
  summary: {
    totalCustomersInSystem: number;
    totalActivePeriodBuyers: number;
    totalActivePeriodServed: number;
    newOrgCustomers: number;
    newBranchCustomers: number;
    returningBuyers: number;
    returningServedOnly: number;
    repurchaseRatePct: number | null;
    disclaimer: string;
  };
  rfmSegments: Array<{
    segmentKey: string;
    segmentName: string;
    customerCount: number;
    totalHistoricalSpend: number;
    avgRecencyDays: number | null;
  }>;
  cohortServiceRetention: Array<{
    cohortMonth: string;
    totalCohortCustomers: number;
    retention30d: { eligible: number; returned: number; pct: number | null; status: string };
    retention60d: { eligible: number; returned: number; pct: number | null; status: string };
    retention90d: { eligible: number; returned: number; pct: number | null; status: string };
  }>;
  cohortRepurchaseRetention: Array<{
    cohortMonth: string;
    totalCohortCustomers: number;
    repurchase30d: { eligible: number; repurchased: number; pct: number | null; status: string };
    repurchase60d: { eligible: number; repurchased: number; pct: number | null; status: string };
    repurchase90d: { eligible: number; repurchased: number; pct: number | null; status: string };
  }>;
  drilldown: {
    totalRecords: number;
    page: number;
    pageSize: number;
    items: Array<{
      customerId: string;
      fullName: string;
      phone: string;
      tier: string;
      registeredAt: string;
      firstPurchaseOrgAt: string | null;
      firstServiceAt: string | null;
      lastPurchaseAt: string | null;
      lastServiceAt: string | null;
      recencyDays: number | null;
      periodPurchaseCount: number;
      periodServiceCount: number;
      historicalNetSpend: number;
      activeRemainingSessions: number;
      hasUpcomingAppointment: boolean;
      periodCustomerType: string;
      rfmSegment: string;
      careRecommendation: string;
    }>;
  };
}

export interface TreatmentPlan {
  id: string;
  orgId: string;
  branchId: string;
  customerId: string;
  planCode: string;
  title: string;
  diagnosisNotes?: string;
  targetOutcome?: string;
  totalSessionsPlanned: number;
  leadDoctorId?: string;
  leadDoctorName?: string;
  status: 'draft' | 'active' | 'completed' | 'paused' | 'cancelled';
  startDate: string;
  expectedEndDate?: string;
  courseId?: string;
  branchName?: string;
  createdAt: string;
}

export interface TreatmentSession {
  id: string;
  orgId: string;
  branchId: string;
  customerId: string;
  treatmentPlanId?: string;
  appointmentId?: string;
  courseUsageId?: string;
  sessionCode: string;
  sessionNumber: number;
  performedBy: string;
  performedByName?: string;
  assistantId?: string;
  assistantName?: string;
  performedAt: string;
  treatmentArea: string;
  preTreatmentNotes?: string;
  protocolPerformed: string;
  postTreatmentNotes?: string;
  clinicalReactions: string;
  homecareInstructions?: string;
  nextAppointmentDate?: string;
  status: 'draft' | 'confirmed';
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  branchName?: string;
}

export interface TreatmentSessionAudit {
  id: string;
  sessionId: string;
  modifiedBy: string;
  actionType: 'create' | 'update' | 'confirm' | 'add_note';
  reasonForChange: string;
  previousData: Record<string, any>;
  newData: Record<string, any>;
  createdAt: string;
}

export interface TreatmentPhoto {
  id: string;
  orgId: string;
  branchId: string;
  customerId: string;
  sessionId?: string;
  photoType: 'before' | 'after' | 'follow_up' | 'progress';
  treatmentArea: string;
  angle: 'front' | 'left_45' | 'right_45' | 'left_90' | 'right_90' | 'close_up';
  storagePath: string;
  thumbnailPath?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  watermarkApplied: boolean;
  capturedAt: string;
  uploadedBy: string;
  uploadedByName?: string;
  notes?: string;
  isConsentMarketing: boolean;
  signedUrl?: string;
}

export interface TreatmentConsent {
  id: string;
  orgId: string;
  customerId: string;
  treatmentPlanId?: string;
  sessionId?: string;
  templateCode: string;
  templateVersion: string;
  consentTitle: string;
  consentContentSnapshot: string;
  agreeTreatment: boolean;
  agreePhotoRecords: boolean;
  agreeMarketingUsage: boolean;
  signatureSvg?: string;
  signedAt: string;
  witnessStaffId: string;
  witnessStaffName?: string;
  signerName: string;
  signerPhone?: string;
  status: 'draft' | 'signed' | 'revoked';
}

export interface CustomerTreatmentHistory {
  customerId: string;
  treatmentPlans: TreatmentPlan[];
  treatmentSessions: TreatmentSession[];
  treatmentPhotos: TreatmentPhoto[];
  treatmentConsents: TreatmentConsent[];
}

// ---------------------------------------------------------------------------
// Phase 9: Loyalty, Membership Tiers & Points Ledger
// ---------------------------------------------------------------------------

export interface LoyaltyPolicy {
  id: string;
  orgId: string;
  policyCode: string;
  policyName: string;
  isActive: boolean;
  earnEvent: 'invoice_paid' | 'service_completed';
  earnSpendRatio: number; // e.g. 10000 VND = 1 Point
  pointsToCurrencyRatio: number; // e.g. 1 Point = 100 VND
  maxRedeemPercentage: number; // e.g. 50%
  pointsExpiryDays: number; // e.g. 365
  allowCombineWithVoucher: boolean;
  excludeDepositPayments: boolean;
  roundRule: 'floor' | 'round' | 'ceil';
}

export interface LoyaltyTierPolicy {
  id: string;
  orgId: string;
  tierCode: 'standard' | 'silver' | 'gold' | 'platinum' | 'vip';
  tierName: string;
  minSpendThreshold: number;
  discountPercentage: number;
  pointsMultiplier: number;
  evaluationPeriodMonths: number;
  benefitsDescription?: string;
  isActive: boolean;
}

export interface LoyaltyPointsLedger {
  id: string;
  orgId: string;
  customerId: string;
  transactionType: 'earn' | 'redeem' | 'expire' | 'refund' | 'adjust';
  pointsDelta: number;
  balanceAfter: number;
  sourceReferenceType: 'sale' | 'refund' | 'appointment' | 'manual_adjustment';
  sourceReferenceId?: string;
  idempotencyKey?: string;
  reasonForChange: string;
  policyVersion: string;
  staffId?: string;
  staffName?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface CustomerTierHistory {
  id: string;
  customerId: string;
  orgId: string;
  previousTier: string;
  newTier: string;
  qualifyingSpendSnapshot: number;
  reason: string;
  changedBy?: string;
  createdAt: string;
}

export interface CustomerLoyaltyOverview {
  customerId: string;
  currentTier: string;
  tierName: string;
  tierDiscountPct: number;
  tierQualifyingSpend: number;
  availablePoints: number;
  expiringPoints30d: number;
  totalEarnedPoints: number;
  totalRedeemedPoints: number;
  policyActive: boolean;
  earnSpendRatio: number;
  pointsToCurrencyRatio: number;
  maxRedeemPercentage: number;
  ledgerHistory: LoyaltyPointsLedger[];
}

// ---------------------------------------------------------------------------
// Phase 10: Omnichannel Chatbox & CSKH Inbox
// ---------------------------------------------------------------------------

export interface ChannelIntegration {
  id: string;
  orgId: string;
  branchId?: string;
  channelType: 'telegram_bot' | 'facebook_messenger' | 'web_widget' | 'zalo_oa' | 'hotline_note';
  channelName: string;
  accountId?: string;
  appId?: string;
  accessTokenEnc?: string;
  isConnected: boolean;
  isActive: boolean;
  tokenExpiresAt?: string;
}

export interface ConversationThread {
  id: string;
  orgId: string;
  branchId?: string;
  branchName?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  channelId?: string;
  channelType: 'telegram_bot' | 'facebook_messenger' | 'web_widget' | 'zalo_oa' | 'hotline_note';
  externalUserId: string;
  externalUserName: string;
  externalUserAvatar?: string;
  externalUserPhone?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  lastMessagePreview?: string;
  lastMessageAt: string;
  unreadCount: number;
  tags: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderType: 'customer' | 'staff' | 'system' | 'internal_note';
  senderStaffId?: string;
  senderName: string;
  isInternalNote: boolean;
  messageType: 'text' | 'image' | 'attachment' | 'appointment_card';
  content: string;
  attachmentUrls: string[];
  metadata?: Record<string, any>;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  orgId: string;
  templateCode: string;
  templateName: string;
  category: 'appointment_reminder' | 'post_treatment_care' | 'birthday_greeting' | 'loyalty_tier_up';
  channelSupported: string[];
  contentTemplate: string;
  variables: string[];
  isActive: boolean;
}

export interface ScheduledNotification {
  id: string;
  orgId: string;
  branchId?: string;
  customerId: string;
  appointmentId?: string;
  treatmentSessionId?: string;
  templateId?: string;
  channelType: string;
  scheduledFor: string;
  renderedContent: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  sentAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}
