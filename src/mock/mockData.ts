import type {
  Organization,
  Branch,
  Staff,
  Customer,
  Service,
  BranchServicePrice,
  Product,
  BranchInventoryStock,
  PackageCombo,
  CustomerCourse,
  SessionDeduction,
  Appointment,
  Sale,
  Payment,
  PaymentAllocation,
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

export const mockOrg: Organization = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Hệ Thống Thẩm Mỹ & Nha Khoa Quốc Tế Phương Nam',
  code: 'PHUONGNAM-MED',
  phone: '1900 8899',
  address: 'Hà Nội & TP. Hồ Chí Minh'
};

export const mockBranches: Branch[] = [
  {
    id: '22222222-2222-2222-2222-222222222221',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Quận 1 - Hồ Chí Minh',
    code: 'HCM-Q1',
    phone: '028 3822 9999',
    address: '120 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM',
    isMainBranch: true
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Quận 7 - Phú Mỹ Hưng',
    code: 'HCM-Q7',
    phone: '028 5411 2222',
    address: '456 Nguyễn Văn Linh, Tân Phong, Quận 7, TP.HCM'
  },
  {
    id: '22222222-2222-2222-2222-222222222223',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'TP. Thủ Đức',
    code: 'HCM-TD',
    phone: '028 7300 3333',
    address: '789 Võ Văn Ngân, TP. Thủ Đức, TP.HCM'
  }
];

export const mockStaff: Staff[] = [
  {
    id: 'st-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Nguyễn Phương Nam',
    code: 'NV-ADM01',
    phone: '0901234567',
    email: 'admin@phuongnam.vn',
    role: 'owner_admin',
    branchIds: ['22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222223'],
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    baseSalary: 35000000,
    commissionRate: 5,
    status: 'active'
  },
  {
    id: 'st-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Trần Thị Mai (Quản lý Q1)',
    code: 'NV-QL01',
    phone: '0912345678',
    email: 'mai.tran@phuongnam.vn',
    role: 'branch_manager',
    branchIds: ['22222222-2222-2222-2222-222222222221'],
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    baseSalary: 18000000,
    commissionRate: 8,
    status: 'active'
  },
  {
    id: 'st-03',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'BS. Lê Hoàng Long (Bác Sĩ CKI)',
    code: 'NV-BS01',
    phone: '0923456789',
    email: 'bs.long@phuongnam.vn',
    role: 'technician_doctor',
    branchIds: ['22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222'],
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    baseSalary: 25000000,
    commissionRate: 15,
    status: 'active'
  },
  {
    id: 'st-04',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Phạm Thu Hà (Lễ Tân & Thu Ngân)',
    code: 'NV-TN01',
    phone: '0934567890',
    email: 'ha.pham@phuongnam.vn',
    role: 'cashier_receptionist',
    branchIds: ['22222222-2222-2222-2222-222222222221'],
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    baseSalary: 9000000,
    commissionRate: 3,
    status: 'active'
  },
  {
    id: 'st-05',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Vũ Ngọc Lan (Kỹ Thuật Viên Spa)',
    code: 'NV-KTV01',
    phone: '0945678901',
    email: 'lan.vu@phuongnam.vn',
    role: 'technician_doctor',
    branchIds: ['22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222223'],
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    baseSalary: 8500000,
    commissionRate: 10,
    status: 'active'
  },
  {
    id: 'st-06',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'BS. Hoàng Văn Đức (Nha Khoa Q7)',
    code: 'NV-BS02',
    phone: '0956789012',
    email: 'duc.hoang@phuongnam.vn',
    role: 'technician_doctor',
    branchIds: ['22222222-2222-2222-2222-222222222222'],
    primaryBranchId: '22222222-2222-2222-2222-222222222222',
    baseSalary: 26000000,
    commissionRate: 15,
    status: 'active'
  },
  {
    id: 'st-07',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Đặng Kim Chi (Quản lý Thủ Đức)',
    code: 'NV-QL02',
    phone: '0967890123',
    email: 'chi.dang@phuongnam.vn',
    role: 'branch_manager',
    branchIds: ['22222222-2222-2222-2222-222222222223'],
    primaryBranchId: '22222222-2222-2222-2222-222222222223',
    baseSalary: 18000000,
    commissionRate: 8,
    status: 'active'
  }
];

export const mockCustomers: Customer[] = [
  {
    id: 'c-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Chị Đặng Thu Thảo',
    phone: '0988112233',
    email: 'thuthao.dang@gmail.com',
    gender: 'female',
    birthday: '1992-05-18',
    address: 'Vinhomes Central Park, Bình Thạnh',
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    vipTier: 'diamond',
    totalSpent: 45000000,
    debt: 0,
    creditBalance: 2500000,
    notes: 'Khách VIP toàn chuỗi, da nhạy cảm dị ứng cồn',
    createdAt: '2025-10-12'
  },
  {
    id: 'c-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Anh Trần Tuấn Anh',
    phone: '0977223344',
    email: 'tuananh.tran@gmail.com',
    gender: 'male',
    birthday: '1988-11-24',
    address: 'Quận 2, TP.HCM',
    primaryBranchId: '22222222-2222-2222-2222-222222222221',
    vipTier: 'gold',
    totalSpent: 18500000,
    debt: 1500000,
    creditBalance: 0,
    notes: 'Đang làm gói cấy Implant răng hàm tại Q1',
    createdAt: '2025-12-05'
  },
  {
    id: 'c-03',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Chị Hoàng Bảo Ngọc',
    phone: '0966334455',
    gender: 'female',
    birthday: '1996-03-08',
    address: 'Quận 7, TP.HCM',
    primaryBranchId: '22222222-2222-2222-2222-222222222222',
    vipTier: 'silver',
    totalSpent: 8200000,
    debt: 0,
    creditBalance: 0,
    notes: 'Đang theo liệu trình trị mụn chuẩn y khoa tại Q7',
    createdAt: '2026-01-15'
  },
  {
    id: 'c-04',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Cô Nguyễn Thị Hoa',
    phone: '0911445566',
    gender: 'female',
    birthday: '1975-08-20',
    address: 'Võ Văn Ngân, Thủ Đức',
    primaryBranchId: '22222222-2222-2222-2222-222222222223',
    vipTier: 'standard',
    totalSpent: 3500000,
    debt: 500000,
    creditBalance: 0,
    notes: 'Khách hàng thân thiết cơ sở Thủ Đức',
    createdAt: '2026-02-10'
  },
  {
    id: 'c-05',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Chị Lê Khánh Chi',
    phone: '0933778899',
    email: 'khanhchi.le@gmail.com',
    gender: 'female',
    birthday: '1994-07-12',
    address: 'Phú Mỹ Hưng, Quận 7',
    primaryBranchId: '22222222-2222-2222-2222-222222222222',
    vipTier: 'gold',
    totalSpent: 12400000,
    debt: 0,
    creditBalance: 1200000,
    notes: 'Khách hàng VIP Quận 7',
    createdAt: '2026-03-01'
  }
];

export const mockServices: Service[] = [
  {
    id: 'svc-01',
    orgId: 'org-01',
    name: 'Chăm Sóc & Trẻ Hóa Da Chuyên Sâu Oxy Jet',
    code: 'DV-OXY',
    category: 'Chăm Sóc Da',
    durationMinutes: 75,
    basePrice: 650000,
    commissionPct: 10,
    description: 'Thải độc da, đẩy tinh chất HA căng bóng',
    isActive: true
  },
  {
    id: 'svc-02',
    orgId: 'org-01',
    name: 'Cấy Tinh Chất Trị Mụn & Phục Hồi Y Khoa',
    code: 'DV-ACNE',
    category: 'Điều Trị Y Khoa',
    durationMinutes: 90,
    basePrice: 950000,
    commissionPct: 12,
    description: 'Quy trình vô khuẩn, sát khuẩn plasma lạnh',
    isActive: true
  },
  {
    id: 'svc-03',
    orgId: 'org-01',
    name: 'Tẩy Trắng Răng Công Nghệ Laser Whitening',
    code: 'DV-DENT-W',
    category: 'Nha Khoa Thẩm Mỹ',
    durationMinutes: 60,
    basePrice: 1800000,
    commissionPct: 15,
    description: 'Bật 3-5 tone không ê buốt',
    isActive: true
  },
  {
    id: 'svc-04',
    orgId: 'org-01',
    name: 'Cạo Vôi & Đánh Bóng Răng Siêu Âm',
    code: 'DV-DENT-C',
    category: 'Nha Khoa Tổng Quát',
    durationMinutes: 45,
    basePrice: 350000,
    commissionPct: 10,
    description: 'Làm sạch mảng bám dưới nướu',
    isActive: true
  },
  {
    id: 'svc-05',
    orgId: 'org-01',
    name: 'Laser Pico Toning Trị Nám & Tàn Nhang',
    code: 'DV-PICO',
    category: 'Laser Thẩm Mỹ',
    durationMinutes: 60,
    basePrice: 1500000,
    commissionPct: 15,
    description: 'Xóa sắc tố melanin tầng sâu',
    isActive: true
  }
];

export const mockBranchServicePrices: BranchServicePrice[] = [
  { id: 'bsp-01', branchId: 'br-01', serviceId: 'svc-01', price: 650000, durationMinutes: 75, isActive: true },
  { id: 'bsp-02', branchId: 'br-01', serviceId: 'svc-02', price: 950000, durationMinutes: 90, isActive: true },
  { id: 'bsp-03', branchId: 'br-01', serviceId: 'svc-03', price: 1800000, durationMinutes: 60, isActive: true },
  { id: 'bsp-04', branchId: 'br-02', serviceId: 'svc-01', price: 600000, durationMinutes: 75, isActive: true },
  { id: 'bsp-05', branchId: 'br-02', serviceId: 'svc-03', price: 1700000, durationMinutes: 60, isActive: true }
];

export const mockProducts: Product[] = [
  {
    id: '44444444-4444-4444-4444-444444444441',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Serum Phục Hồi B5 + HA Hyaluronic Booster 50ml',
    code: 'SP-B5-50',
    category: 'Dược Mỹ Phẩm',
    unit: 'Chai',
    costPrice: 320000,
    retailPrice: 680000,
    commissionPct: 5,
    minStockAlert: 10,
    isActive: true
  },
  {
    id: '44444444-4444-4444-4444-444444444442',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Kem Chống Nắng Phổ Rộng Broad Spectrum SPF50+',
    code: 'SP-SUN-50',
    category: 'Dược Mỹ Phẩm',
    unit: 'Tuýp',
    costPrice: 240000,
    retailPrice: 520000,
    commissionPct: 5,
    minStockAlert: 8,
    isActive: true
  },
  {
    id: '44444444-4444-4444-4444-444444444443',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Kem Đánh Răng Chống Ê Buốt Nha Khoa Sensodyne Pro',
    code: 'SP-DENT-PASTE',
    category: 'Chăm Sóc Răng Miệng',
    unit: 'Hộp',
    costPrice: 850000,
    retailPrice: 160000,
    commissionPct: 4,
    minStockAlert: 15,
    isActive: true
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Mặt Nạ Sinh Học Bio-Cellulose Cấp Ẩm Tức Thì',
    code: 'SP-MASK-BIO',
    category: 'Mặt Nạ Spa',
    unit: 'Miếng',
    costPrice: 35000,
    retailPrice: 85000,
    commissionPct: 5,
    minStockAlert: 20,
    isActive: true
  }
];

export const mockBranchStocks: BranchInventoryStock[] = [
  // Chi Nhánh Quận 1 (HCM-Q1)
  { id: 'bs-01', branchId: '22222222-2222-2222-2222-222222222221', productId: '44444444-4444-4444-4444-444444444441', stockOnHand: 48, minStock: 10 },
  { id: 'bs-02', branchId: '22222222-2222-2222-2222-222222222221', productId: '44444444-4444-4444-4444-444444444442', stockOnHand: 35, minStock: 8 },
  { id: 'bs-03', branchId: '22222222-2222-2222-2222-222222222221', productId: '44444444-4444-4444-4444-444444444443', stockOnHand: 22, minStock: 15 },
  { id: 'bs-04', branchId: '22222222-2222-2222-2222-222222222221', productId: '44444444-4444-4444-4444-444444444444', stockOnHand: 60, minStock: 20 },

  // Chi Nhánh Quận 7 - Phú Mỹ Hưng (HCM-Q7)
  { id: 'bs-05', branchId: '22222222-2222-2222-2222-222222222222', productId: '44444444-4444-4444-4444-444444444441', stockOnHand: 15, minStock: 10 },
  { id: 'bs-06', branchId: '22222222-2222-2222-2222-222222222222', productId: '44444444-4444-4444-4444-444444444442', stockOnHand: 6, minStock: 8 },
  { id: 'bs-07', branchId: '22222222-2222-2222-2222-222222222222', productId: '44444444-4444-4444-4444-444444444443', stockOnHand: 18, minStock: 15 },
  { id: 'bs-08', branchId: '22222222-2222-2222-2222-222222222222', productId: '44444444-4444-4444-4444-444444444444', stockOnHand: 25, minStock: 20 },

  // Chi Nhánh TP. Thủ Đức (HCM-TD)
  { id: 'bs-09', branchId: '22222222-2222-2222-2222-222222222223', productId: '44444444-4444-4444-4444-444444444441', stockOnHand: 5, minStock: 10 },
  { id: 'bs-10', branchId: '22222222-2222-2222-2222-222222222223', productId: '44444444-4444-4444-4444-444444444442', stockOnHand: 28, minStock: 8 },
  { id: 'bs-11', branchId: '22222222-2222-2222-2222-222222222223', productId: '44444444-4444-4444-4444-444444444443', stockOnHand: 4, minStock: 15 },
  { id: 'bs-12', branchId: '22222222-2222-2222-2222-222222222223', productId: '44444444-4444-4444-4444-444444444444', stockOnHand: 8, minStock: 20 }
];

export const mockPackages: PackageCombo[] = [
  {
    id: 'pkg-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Liệu Trình Trị Mụn Chuẩn Y Khoa (10 Buổi)',
    code: 'GOI-ACNE-10',
    serviceId: 'svc-02',
    sessions: 10,
    price: 7500000,
    validityDays: 180,
    description: 'Tiết kiệm 2.000.000đ so với mua lẻ từng buổi',
    isActive: true
  },
  {
    id: 'pkg-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Combo Laser Trẻ Hóa Pico Toning (6 Buổi)',
    code: 'GOI-PICO-6',
    serviceId: 'svc-05',
    sessions: 6,
    price: 7200000,
    validityDays: 120,
    description: 'Cam kết mờ nám 70-85% sau phác đồ',
    isActive: true
  }
];

export const mockCustomerCourses: CustomerCourse[] = [
  {
    id: 'crs-01',
    customerId: 'c-01',
    packageId: 'pkg-02',
    serviceId: 'svc-05',
    name: 'Combo Laser Trẻ Hóa Pico Toning (6 Buổi)',
    totalSessions: 6,
    usedSessions: 2,
    price: 7200000,
    startDate: '2026-02-01',
    expiryDate: '2026-06-01',
    saleId: 'sale-001',
    soldBranchId: '22222222-2222-2222-2222-222222222221',
    allowInterBranch: true,
    status: 'active'
  },
  {
    id: 'crs-02',
    customerId: 'c-03',
    packageId: 'pkg-01',
    serviceId: 'svc-02',
    name: 'Liệu Trình Trị Mụn Chuẩn Y Khoa (10 Buổi)',
    totalSessions: 10,
    usedSessions: 4,
    price: 7500000,
    startDate: '2026-01-20',
    expiryDate: '2026-07-20',
    saleId: 'sale-002',
    soldBranchId: '22222222-2222-2222-2222-222222222222',
    allowInterBranch: false,
    status: 'active'
  },
  {
    id: 'crs-03',
    customerId: 'c-04',
    packageId: 'pkg-01',
    serviceId: 'svc-02',
    name: 'Phác Đồ Phục Hồi Da Cơ Bản (5 Buổi)',
    totalSessions: 5,
    usedSessions: 1,
    price: 3500000,
    startDate: '2026-02-15',
    expiryDate: '2026-08-15',
    saleId: 'sale-004',
    soldBranchId: '22222222-2222-2222-2222-222222222223',
    allowInterBranch: true,
    status: 'active'
  }
];

export const mockSessionDeductions: SessionDeduction[] = [
  {
    id: 'ded-01',
    courseId: 'crs-01',
    branchId: '22222222-2222-2222-2222-222222222221',
    staffId: 'st-03',
    sessionsDeducted: 1,
    performedAt: '2026-02-01 14:30',
    notes: 'Buổi 1: Bắn Laser Toning mức năng lượng 1.2J tại Q1. Da ửng nhẹ, đã đắp mask B5.',
    customerSignature: 'Đặng Thu Thảo'
  },
  {
    id: 'ded-02',
    courseId: 'crs-01',
    branchId: '22222222-2222-2222-2222-222222222222',
    staffId: 'st-06',
    sessionsDeducted: 1,
    performedAt: '2026-02-18 15:00',
    notes: 'Buổi 2: Làm liên chi nhánh tại Quận 7 (BS. Đức). Tăng năng lượng lên 1.4J. Da đáp ứng rất tốt.',
    customerSignature: 'Đặng Thu Thảo'
  },
  {
    id: 'ded-03',
    courseId: 'crs-02',
    branchId: '22222222-2222-2222-2222-222222222222',
    staffId: 'st-06',
    sessionsDeducted: 1,
    performedAt: '2026-01-20 10:30',
    notes: 'Buổi 1: Lấy nhân mụn chuẩn y khoa & chiếu đèn sinh học tại Q7.',
    customerSignature: 'Hoàng Bảo Ngọc'
  }
];

export const mockAppointments: Appointment[] = [
  // ─── Chi nhánh Quận 1 (HCM-Q1) ───
  {
    id: 'apt-01',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-01',
    customerName: 'Chị Đặng Thu Thảo',
    customerPhone: '0988112233',
    serviceId: 'svc-05',
    serviceName: 'Laser Pico Toning Trị Nám (Buổi 3)',
    staffId: 'st-03',
    staffName: 'BS. Lê Hoàng Long',
    date: '2026-09-27',
    time: '14:00',
    durationMinutes: 60,
    status: 'in_progress',
    priceSnapshot: 1500000,
    commissionSnapshot: 225000,
    roomOrBed: 'Phòng Laser VIP 1',
    notes: 'Đã check-in lúc 13:55'
  },
  {
    id: 'apt-02',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-02',
    customerName: 'Anh Trần Tuấn Anh',
    customerPhone: '0977223344',
    serviceId: 'svc-03',
    serviceName: 'Tẩy Trắng Răng Laser Whitening',
    staffId: 'st-03',
    staffName: 'BS. Lê Hoàng Long',
    date: '2026-09-27',
    time: '15:30',
    durationMinutes: 60,
    status: 'confirmed',
    priceSnapshot: 1800000,
    roomOrBed: 'Ghế Nha Khoa 02'
  },
  {
    id: 'apt-03',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-03',
    customerName: 'Chị Hoàng Bảo Ngọc',
    customerPhone: '0966334455',
    serviceId: 'svc-01',
    serviceName: 'Chăm Sóc & Trẻ Hóa Da Oxy Jet',
    staffId: 'st-05',
    staffName: 'Vũ Ngọc Lan',
    date: '2026-09-27',
    time: '16:00',
    durationMinutes: 75,
    status: 'booked',
    priceSnapshot: 650000,
    roomOrBed: 'Giường Spa 03'
  },

  // ─── Chi nhánh Quận 7 - Phú Mỹ Hưng (HCM-Q7) ───
  {
    id: 'apt-04',
    branchId: '22222222-2222-2222-2222-222222222222',
    customerId: 'c-04',
    customerName: 'Cô Nguyễn Thị Hoa',
    customerPhone: '0911445566',
    serviceId: 'svc-04',
    serviceName: 'Cạo Vôi Răng Siêu Âm',
    staffId: 'st-06',
    staffName: 'BS. Hoàng Văn Đức',
    date: '2026-09-27',
    time: '10:00',
    durationMinutes: 45,
    status: 'done',
    priceSnapshot: 350000,
    roomOrBed: 'Ghế Nha Khoa 01'
  },
  {
    id: 'apt-05',
    branchId: '22222222-2222-2222-2222-222222222222',
    customerId: 'c-01',
    customerName: 'Chị Đặng Thu Thảo',
    customerPhone: '0988112233',
    serviceId: 'svc-02',
    serviceName: 'Cấy Tinh Chất Phục Hồi Y Khoa',
    staffId: 'st-06',
    staffName: 'BS. Hoàng Văn Đức',
    date: '2026-09-27',
    time: '16:30',
    durationMinutes: 60,
    status: 'confirmed',
    priceSnapshot: 950000,
    roomOrBed: 'Phòng Điều Trị 02'
  },

  // ─── Chi nhánh TP. Thủ Đức (HCM-TD) ───
  {
    id: 'apt-06',
    branchId: '22222222-2222-2222-2222-222222222223',
    customerId: 'c-02',
    customerName: 'Anh Trần Tuấn Anh',
    customerPhone: '0977223344',
    serviceId: 'svc-03',
    serviceName: 'Tẩy Trắng Răng Laser Whitening',
    staffId: 'st-03',
    staffName: 'BS. Lê Hoàng Long',
    date: '2026-09-27',
    time: '11:00',
    durationMinutes: 60,
    status: 'in_progress',
    priceSnapshot: 1800000,
    roomOrBed: 'Ghế Nha Khoa VIP'
  },
  {
    id: 'apt-07',
    branchId: '22222222-2222-2222-2222-222222222223',
    customerId: 'c-03',
    customerName: 'Chị Hoàng Bảo Ngọc',
    customerPhone: '0966334455',
    serviceId: 'svc-05',
    serviceName: 'Laser Pico Toning Trị Nám',
    staffId: 'st-05',
    staffName: 'Vũ Ngọc Lan',
    date: '2026-09-27',
    time: '15:00',
    durationMinutes: 60,
    status: 'booked',
    priceSnapshot: 1500000,
    roomOrBed: 'Phòng Laser 01'
  }
];

export const mockSales: Sale[] = [
  // ─── Chi nhánh Quận 1 (HCM-Q1) ───
  {
    id: 'sale-001',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-01',
    customerName: 'Chị Đặng Thu Thảo',
    invoiceNo: 'HĐ260926-001',
    date: '2026-09-27',
    time: '11:15',
    staffId: 'st-04',
    staffName: 'Phạm Thu Hà',
    items: [
      { id: 'it-1', type: 'service', refId: 'svc-04', name: 'Cạo Vôi Răng Siêu Âm', price: 350000, qty: 1, staffId: 'st-03' },
      { id: 'it-2', type: 'product', refId: '44444444-4444-4444-4444-444444444441', name: 'Serum Phục Hồi B5 + HA Booster', price: 680000, qty: 1 }
    ],
    subtotal: 1030000,
    discountPct: 0,
    discountAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    tipAmount: 50000,
    total: 1080000,
    paidAmount: 1080000,
    debtAmount: 0,
    paymentMethod: 'bank_transfer',
    status: 'completed',
    notes: 'Khách thanh toán chuyển khoản qua VietQR',
    createdAt: '2026-09-27 11:15:20'
  },
  {
    id: 'sale-002',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-02',
    customerName: 'Anh Trần Tuấn Anh',
    invoiceNo: 'HĐ260925-004',
    date: '2026-09-26',
    time: '17:30',
    staffId: 'st-04',
    staffName: 'Phạm Thu Hà',
    items: [
      { id: 'it-3', type: 'service', refId: 'svc-03', name: 'Tẩy Trắng Răng Laser Whitening', price: 1800000, qty: 1, staffId: 'st-03' }
    ],
    subtotal: 1800000,
    discountPct: 0,
    discountAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    tipAmount: 0,
    total: 1800000,
    paidAmount: 300000,
    debtAmount: 1500000,
    paymentMethod: 'split',
    status: 'partial',
    notes: 'Cọc 300k tiền mặt, còn nợ 1.500k',
    createdAt: '2026-09-26 17:30:00'
  },

  // ─── Chi nhánh Quận 7 (HCM-Q7) ───
  {
    id: 'sale-003',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222222',
    customerId: 'c-03',
    customerName: 'Chị Hoàng Bảo Ngọc',
    invoiceNo: 'HĐ260927-002',
    date: '2026-09-27',
    time: '14:20',
    staffId: 'st-06',
    staffName: 'BS. Hoàng Văn Đức',
    items: [
      { id: 'it-4', type: 'package', refId: 'pkg-01', name: 'Liệu Trình Trị Mụn Chuẩn Y Khoa (10 Buổi)', price: 7500000, qty: 1 }
    ],
    subtotal: 7500000,
    discountPct: 10,
    discountAmount: 750000,
    taxPct: 0,
    taxAmount: 0,
    tipAmount: 0,
    total: 6750000,
    paidAmount: 6750000,
    debtAmount: 0,
    paymentMethod: 'card',
    status: 'completed',
    notes: 'Quẹt thẻ POS Vietcombank',
    createdAt: '2026-09-27 14:20:00'
  },

  // ─── Chi nhánh TP. Thủ Đức (HCM-TD) ───
  {
    id: 'sale-004',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222223',
    customerId: 'c-04',
    customerName: 'Cô Nguyễn Thị Hoa',
    invoiceNo: 'HĐ260927-003',
    date: '2026-09-27',
    time: '10:45',
    staffId: 'st-07',
    staffName: 'Đặng Kim Chi',
    items: [
      { id: 'it-5', type: 'service', refId: 'svc-04', name: 'Cạo Vôi Răng Siêu Âm', price: 350000, qty: 1, staffId: 'st-03' },
      { id: 'it-6', type: 'product', refId: '44444444-4444-4444-4444-444444444442', name: 'Kem Chống Nắng Broad Spectrum', price: 520000, qty: 1 }
    ],
    subtotal: 870000,
    discountPct: 0,
    discountAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    tipAmount: 30000,
    total: 900000,
    paidAmount: 900000,
    debtAmount: 0,
    paymentMethod: 'cash',
    status: 'completed',
    notes: 'Thu tiền mặt tại quầy',
    createdAt: '2026-09-27 10:45:00'
  }
];

export const mockPayments: Payment[] = [
  {
    id: 'pay-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-01',
    amount: 1080000,
    paymentMethod: 'bank_transfer',
    paymentType: 'sale',
    receivedByStaffId: 'st-04',
    date: '2026-09-27',
    referenceNo: 'MBBANK-883921',
    createdAt: '2026-09-27 11:15:20'
  },
  {
    id: 'pay-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    customerId: 'c-02',
    amount: 300000,
    paymentMethod: 'cash',
    paymentType: 'sale',
    receivedByStaffId: 'st-04',
    date: '2026-09-26',
    createdAt: '2026-09-26 17:30:00'
  },
  {
    id: 'pay-03',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222222',
    customerId: 'c-03',
    amount: 6750000,
    paymentMethod: 'card',
    paymentType: 'sale',
    receivedByStaffId: 'st-06',
    date: '2026-09-27',
    createdAt: '2026-09-27 14:20:00'
  },
  {
    id: 'pay-04',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222223',
    customerId: 'c-04',
    amount: 900000,
    paymentMethod: 'cash',
    paymentType: 'sale',
    receivedByStaffId: 'st-07',
    date: '2026-09-27',
    createdAt: '2026-09-27 10:45:00'
  }
];

export const mockPaymentAllocations: PaymentAllocation[] = [
  {
    id: 'alloc-01',
    paymentId: 'pay-01',
    saleId: 'sale-001',
    amountAllocated: 1080000,
    createdAt: '2026-09-27 11:15:20'
  },
  {
    id: 'alloc-02',
    paymentId: 'pay-02',
    saleId: 'sale-002',
    amountAllocated: 300000,
    createdAt: '2026-09-26 17:30:00'
  }
];

export const mockSuppliers: Supplier[] = [
  {
    id: 'sup-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Công Ty Dược Mỹ Phẩm Y Khoa MedSkin VN',
    contactName: 'Anh Minh (Trưởng đại diện)',
    phone: '0903888777',
    email: 'minh.medskin@gmail.com',
    address: 'Khu công nghiệp Tân Bình, TP.HCM',
    debt: 12500000
  },
  {
    id: 'sup-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    name: 'Vật Tư Y Tế & Nha Khoa DentalPro',
    contactName: 'Chị Lan Anh',
    phone: '0918555666',
    email: 'sales@dentalpro.com.vn',
    address: 'Đống Đa, Hà Nội',
    debt: 0
  }
];

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    supplierId: 'sup-01',
    supplierName: 'MedSkin VN',
    poNumber: 'PO-202609-01',
    orderDate: '2026-09-20',
    expectedDate: '2026-09-24',
    totalAmount: 18500000,
    status: 'completed',
    items: [
      { productId: '44444444-4444-4444-4444-444444444441', productName: 'Serum B5 Booster', qtyOrdered: 30, qtyReceived: 30, unitPrice: 320000 },
      { productId: '44444444-4444-4444-4444-444444444442', productName: 'Kem Chống Nắng Broad Spectrum', qtyOrdered: 25, qtyReceived: 25, unitPrice: 240000 }
    ]
  },
  {
    id: 'po-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222222',
    supplierId: '33333333-3333-3333-3333-333333333331',
    supplierName: 'MedSkin VN',
    poNumber: 'PO-202609-02',
    orderDate: '2026-09-25',
    expectedDate: '2026-09-28',
    totalAmount: 8500000,
    status: 'ordered',
    items: [
      { productId: '44444444-4444-4444-4444-444444444444', productName: 'Mặt Nạ Bio-Cellulose', qtyOrdered: 100, qtyReceived: 0, unitPrice: 35000 }
    ]
  }
];

export const mockGoodsReceipts: GoodsReceiptNote[] = [
  {
    id: 'grn-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    poId: 'po-01',
    supplierId: '33333333-3333-3333-3333-333333333331',
    supplierName: 'MedSkin VN',
    grnNumber: 'PNK-202609-01',
    receivedDate: '2026-09-24',
    receiverStaffId: 'st-02',
    totalAmount: 18500000,
    paidAmount: 6000000,
    status: 'completed',
    items: [
      { productId: '44444444-4444-4444-4444-444444444441', productName: 'Serum B5 Booster', qty: 30, unitPrice: 320000 },
      { productId: '44444444-4444-4444-4444-444444444442', productName: 'Kem Chống Nắng Broad Spectrum', qty: 25, unitPrice: 240000 }
    ]
  }
];

export const mockExpenses: Expense[] = [
  // ─── Chi nhánh Quận 1 (HCM-Q1) ───
  {
    id: 'exp-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    category: 'rent',
    title: 'Tiền thuê mặt bằng Lê Thánh Tôn, Quận 1',
    amount: 35000000,
    date: '2026-09-05',
    paymentMethod: 'bank_transfer',
    staffId: 'st-01',
    notes: 'Thanh toán đợt 1'
  },
  {
    id: 'exp-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    category: 'utilities',
    title: 'Hóa đơn Điện lực EVN & Nước sinh hoạt Q1',
    amount: 4850000,
    date: '2026-09-15',
    paymentMethod: 'bank_transfer',
    staffId: 'st-02'
  },
  {
    id: 'exp-03',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    category: 'marketing',
    title: 'Chi phí quảng cáo Facebook Ads & TikTok Ads Q1',
    amount: 12000000,
    date: '2026-09-20',
    paymentMethod: 'bank_transfer',
    staffId: 'st-01'
  },

  // ─── Chi nhánh Quận 7 (HCM-Q7) ───
  {
    id: 'exp-04',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222222',
    category: 'rent',
    title: 'Tiền thuê mặt bằng Nguyễn Văn Linh, Phú Mỹ Hưng',
    amount: 28000000,
    date: '2026-09-05',
    paymentMethod: 'bank_transfer',
    staffId: 'st-06'
  },
  {
    id: 'exp-05',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222222',
    category: 'supplies',
    title: 'Vật tư tiêu hao găng tay, cồn sát khuẩn nha khoa',
    amount: 5600000,
    date: '2026-09-18',
    paymentMethod: 'cash',
    staffId: 'st-06'
  },

  // ─── Chi nhánh TP. Thủ Đức (HCM-TD) ───
  {
    id: 'exp-06',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222223',
    category: 'rent',
    title: 'Tiền thuê mặt bằng Võ Văn Ngân, Thủ Đức',
    amount: 22000000,
    date: '2026-09-05',
    paymentMethod: 'bank_transfer',
    staffId: 'st-07'
  },
  {
    id: 'exp-07',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222223',
    category: 'marketing',
    title: 'Treo băng rôn & phát tờ rơi khai trương Thủ Đức',
    amount: 8500000,
    date: '2026-09-12',
    paymentMethod: 'bank_transfer',
    staffId: 'st-07'
  }
];

export const mockPromotions: Promotion[] = [
  {
    id: 'prm-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    code: 'VIPDIAMOND',
    title: 'Giảm 15% Dành Riêng Cho Khách Hàng VIP Diamond (Toàn Chuỗi)',
    discountType: 'pct',
    discountValue: 15,
    minOrderValue: 1000000,
    usageLimit: 50,
    usedCount: 14,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    applicableBranchIds: [
      '22222222-2222-2222-2222-222222222221',
      '22222222-2222-2222-2222-222222222222',
      '22222222-2222-2222-2222-222222222223'
    ],
    isActive: true
  },
  {
    id: 'prm-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    code: 'WELCOME50K',
    title: 'Tặng 50.000đ Cho Khách Trải Nghiệm Cơ Sở Thủ Đức',
    discountType: 'fixed',
    discountValue: 50000,
    minOrderValue: 300000,
    usageLimit: 200,
    usedCount: 88,
    startDate: '2026-09-01',
    endDate: '2026-10-31',
    applicableBranchIds: ['22222222-2222-2222-2222-222222222223'],
    isActive: true
  }
];

export const mockShifts: ShiftRoster[] = [
  // HCM-Q1
  { id: 'sh-01', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-02', staffName: 'Trần Thị Mai', date: '2026-09-27', shiftType: 'full' },
  { id: 'sh-02', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-03', staffName: 'BS. Lê Hoàng Long', date: '2026-09-27', shiftType: 'morning' },
  { id: 'sh-03', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-04', staffName: 'Phạm Thu Hà', date: '2026-09-27', shiftType: 'full' },
  { id: 'sh-04', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-05', staffName: 'Vũ Ngọc Lan', date: '2026-09-27', shiftType: 'afternoon' },

  // HCM-Q7
  { id: 'sh-05', branchId: '22222222-2222-2222-2222-222222222222', staffId: 'st-06', staffName: 'BS. Hoàng Văn Đức', date: '2026-09-27', shiftType: 'full' },

  // HCM-TD
  { id: 'sh-06', branchId: '22222222-2222-2222-2222-222222222223', staffId: 'st-07', staffName: 'Đặng Kim Chi', date: '2026-09-27', shiftType: 'full' }
];

export const mockTimesheets: Timesheet[] = [
  { id: 'ts-01', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-02', staffName: 'Trần Thị Mai', date: '2026-09-27', checkIn: '08:00', checkOut: '17:30', workingHours: 8.5, isApproved: true },
  { id: 'ts-02', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-03', staffName: 'BS. Lê Hoàng Long', date: '2026-09-27', checkIn: '08:15', workingHours: 6.0, isApproved: false },
  { id: 'ts-03', branchId: '22222222-2222-2222-2222-222222222221', staffId: 'st-04', staffName: 'Phạm Thu Hà', date: '2026-09-27', checkIn: '07:55', workingHours: 8.0, isApproved: true },
  { id: 'ts-04', branchId: '22222222-2222-2222-2222-222222222222', staffId: 'st-06', staffName: 'BS. Hoàng Văn Đức', date: '2026-09-27', checkIn: '08:00', checkOut: '17:00', workingHours: 8.0, isApproved: true },
  { id: 'ts-05', branchId: '22222222-2222-2222-2222-222222222223', staffId: 'st-07', staffName: 'Đặng Kim Chi', date: '2026-09-27', checkIn: '07:50', checkOut: '17:30', workingHours: 8.5, isApproved: true }
];

export const mockCommissions: CommissionRecord[] = [
  {
    id: 'cm-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    staffId: 'st-03',
    staffName: 'BS. Lê Hoàng Long',
    saleId: 'sale-001',
    serviceOrProductName: 'Cạo Vôi Răng Siêu Âm',
    itemValue: 350000,
    commissionPct: 15,
    commissionAmount: 52500,
    date: '2026-09-27'
  },
  {
    id: 'cm-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    staffId: 'st-03',
    staffName: 'BS. Lê Hoàng Long',
    saleId: 'sale-002',
    serviceOrProductName: 'Tẩy Trắng Răng Laser Whitening',
    itemValue: 1800000,
    commissionPct: 15,
    commissionAmount: 270000,
    date: '2026-09-26'
  }
];

export const mockPayrolls: PayrollRecord[] = [
  {
    id: 'pr-01',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    staffId: 'st-03',
    staffName: 'BS. Lê Hoàng Long',
    month: '2026-08',
    baseSalary: 25000000,
    commissionTotal: 9450000,
    allowance: 2000000,
    deduction: 0,
    netSalary: 36450000,
    status: 'paid'
  },
  {
    id: 'pr-02',
    orgId: '11111111-1111-1111-1111-111111111111',
    branchId: '22222222-2222-2222-2222-222222222221',
    staffId: 'st-04',
    staffName: 'Phạm Thu Hà',
    month: '2026-08',
    baseSalary: 9000000,
    commissionTotal: 1200000,
    allowance: 1000000,
    deduction: 0,
    netSalary: 11200000,
    status: 'paid'
  }
];
