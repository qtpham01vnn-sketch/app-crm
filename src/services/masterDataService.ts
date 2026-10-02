import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Customer, Service, Product, PackageCombo, Supplier, Promotion, Staff, Branch, Appointment, PurchaseOrder, GoodsReceiptNote, BranchTransfer, InventoryAudit, SalesCashflowReport, CogsAndProfitReport, StaffAndResourceUtilizationReport, CustomerRetentionAndCohortReport } from '../types';



const isUUID = (val?: string | null): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export const masterDataService = {
  /**
   * Fetch all branches
   */
  async getBranches(): Promise<Branch[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('branches').select('*').order('name');
    if (error) {
      console.error('Error fetching branches:', error);
      return [];
    }
    return (data || []).map((b) => ({
      id: b.id,
      orgId: b.organization_id,
      name: b.name,
      code: b.code,
      phone: b.phone || '',
      address: b.address,
      isMainBranch: b.is_headquarters
    }));
  },

  /**
   * 1. CUSTOMERS CRUD
   */
  async getCustomers(): Promise<Customer[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('customers').select('*').order('full_name');
    if (error) {
      console.error('Error fetching customers:', error);
      return [];
    }
    return (data || []).map((c) => ({
      id: c.id,
      orgId: c.organization_id,
      name: c.full_name,
      phone: c.phone,
      email: c.email || undefined,
      gender: (c.gender || 'other') as Customer['gender'],
      primaryBranchId: c.primary_branch_id || '',
      vipTier: (c.tier || 'standard') as Customer['vipTier'],
      totalSpent: Number(c.total_spent || 0),
      debt: Number(c.debt_balance || 0),
      creditBalance: 0,
      notes: c.medical_notes || undefined,
      createdAt: c.created_at ? c.created_at.split('T')[0] : '2026-09-26'
    }));
  },

  async createCustomer(
    cust: { name: string; phone: string; email?: string; vipTier?: Customer['vipTier']; notes?: string; gender?: Customer['gender'] },
    orgId: string,
    branchId: string
  ): Promise<Customer | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orgId) || !uuidRegex.test(branchId)) {
      throw new Error(`Định dạng ID chi nhánh hoặc tổ chức không hợp lệ (${branchId}). Vui lòng đảm bảo đã kết nối dữ liệu thật.`);
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        organization_id: orgId,
        primary_branch_id: branchId,
        full_name: cust.name.trim(),
        phone: cust.phone.trim(),
        email: cust.email?.trim() || null,
        tier: cust.vipTier || 'standard',
        medical_notes: cust.notes?.trim() || null,
        gender: cust.gender || 'female',
        total_spent: 0,
        debt_balance: 0
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating customer in Supabase:', error);
      throw error;
    }
    return {
      id: data.id,
      orgId: data.organization_id,
      name: data.full_name,
      phone: data.phone,
      email: data.email || undefined,
      gender: (data.gender || 'female') as Customer['gender'],
      primaryBranchId: data.primary_branch_id,
      vipTier: (data.tier || 'standard') as Customer['vipTier'],
      totalSpent: Number(data.total_spent || 0),
      debt: Number(data.debt_balance || 0),
      creditBalance: 0,
      notes: data.medical_notes || undefined,
      createdAt: data.created_at ? data.created_at.split('T')[0] : '2026-09-28'
    };
  },

  /**
   * 2. SERVICES CRUD
   */
  async getServices(): Promise<Service[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('services').select('*').order('name');
    if (error) {
      console.error('Error fetching services:', error);
      return [];
    }
    return (data || []).map((s) => ({
      id: s.id,
      orgId: s.organization_id,
      code: s.code,
      name: s.name,
      category: s.category,
      basePrice: Number(s.base_price),
      durationMinutes: s.duration_minutes,
      commissionPct: Number(s.default_commission_pct),
      description: s.description || undefined,
      imageUrl: s.image_url || undefined,
      bufferMinutesBefore: s.buffer_minutes_before || 0,
      bufferMinutesAfter: s.buffer_minutes_after || 0,
      allowOnlineBooking: s.allow_online_booking !== false,
      isFeatured: Boolean(s.is_featured),
      isActive: s.is_active
    }));
  },

  async createService(
    svc: {
      code: string;
      name: string;
      category: string;
      basePrice: number;
      durationMinutes: number;
      commissionPct: number;
      description?: string;
      imageUrl?: string;
      bufferMinutesBefore?: number;
      bufferMinutesAfter?: number;
      allowOnlineBooking?: boolean;
      isFeatured?: boolean;
    },
    orgId: string
  ): Promise<Service | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('services')
      .insert({
        organization_id: orgId,
        code: svc.code.trim().toUpperCase(),
        name: svc.name.trim(),
        category: svc.category.trim(),
        base_price: svc.basePrice,
        duration_minutes: svc.durationMinutes,
        default_commission_pct: svc.commissionPct,
        description: svc.description?.trim() || null,
        image_url: svc.imageUrl?.trim() || null,
        buffer_minutes_before: svc.bufferMinutesBefore || 0,
        buffer_minutes_after: svc.bufferMinutesAfter || 0,
        allow_online_booking: svc.allowOnlineBooking !== false,
        is_featured: Boolean(svc.isFeatured),
        is_active: true
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating service in Supabase:', error);
      throw error;
    }

    return {
      id: data.id,
      orgId: data.organization_id,
      code: data.code,
      name: data.name,
      category: data.category,
      basePrice: Number(data.base_price),
      durationMinutes: data.duration_minutes,
      commissionPct: Number(data.default_commission_pct),
      description: data.description || undefined,
      imageUrl: data.image_url || undefined,
      bufferMinutesBefore: data.buffer_minutes_before || 0,
      bufferMinutesAfter: data.buffer_minutes_after || 0,
      allowOnlineBooking: data.allow_online_booking !== false,
      isFeatured: Boolean(data.is_featured),
      isActive: data.is_active
    };
  },

  /**
   * 2.1 RESOURCES CRUD (Phòng, Giường, Ghế, Máy móc)
   */
  async getResources(branchId?: string) {
    if (!isSupabaseConfigured || !supabase) return [];
    let query = supabase.from('resources').select('*').order('name');
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching resources:', error);
      return [];
    }
    return (data || []).map((r) => ({
      id: r.id,
      orgId: r.organization_id,
      branchId: r.branch_id,
      code: r.code,
      name: r.name,
      type: r.resource_type as 'room' | 'bed' | 'chair' | 'machine',
      capacity: r.capacity || 1,
      isActive: r.is_active,
      notes: r.notes || undefined
    }));
  },

  async createResource(
    res: { branchId: string; code: string; name: string; type: 'room' | 'bed' | 'chair' | 'machine'; capacity?: number; notes?: string },
    orgId: string
  ) {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('resources')
      .insert({
        organization_id: orgId,
        branch_id: res.branchId,
        code: res.code.trim().toUpperCase(),
        name: res.name.trim(),
        resource_type: res.type,
        capacity: res.capacity || 1,
        notes: res.notes?.trim() || null,
        is_active: true
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating resource in Supabase:', error);
      throw error;
    }
    return {
      id: data.id,
      orgId: data.organization_id,
      branchId: data.branch_id,
      code: data.code,
      name: data.name,
      type: data.resource_type as 'room' | 'bed' | 'chair' | 'machine',
      capacity: data.capacity,
      isActive: data.is_active,
      notes: data.notes || undefined
    };
  },

  /**
   * 2.2 SERVICE STAFF SKILLS
   */
  async getServiceStaffSkills(serviceId?: string) {
    if (!isSupabaseConfigured || !supabase) return [];
    let query = supabase.from('service_staff_skills').select('*');
    if (serviceId) {
      query = query.eq('service_id', serviceId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching service staff skills:', error);
      return [];
    }
    return (data || []).map((s) => ({
      id: s.id,
      orgId: s.organization_id,
      serviceId: s.service_id,
      staffId: s.staff_id,
      proficiencyLevel: s.proficiency_level as 'standard' | 'senior' | 'master',
      customDurationMinutes: s.custom_duration_minutes || undefined,
      isPrimary: Boolean(s.is_primary)
    }));
  },

  /**
   * 3. PRODUCTS & INVENTORY STOCKS
   */
  async getProducts(): Promise<Product[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) {
      console.error('Error fetching products:', error);
      return [];
    }
    return (data || []).map((p) => ({
      id: p.id,
      orgId: p.organization_id,
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      retailPrice: Number(p.retail_price),
      costPrice: Number(p.cost_price),
      commissionPct: 5,
      minStockAlert: p.min_stock_alert,
      isActive: p.is_active
    }));
  },

  async createProduct(
    prod: { code: string; name: string; category: string; unit: string; retailPrice: number; costPrice: number; minStockAlert: number },
    orgId: string
  ): Promise<Product | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('products')
      .insert({
        organization_id: orgId,
        code: prod.code.trim().toUpperCase(),
        name: prod.name.trim(),
        category: prod.category.trim(),
        unit: prod.unit.trim(),
        retail_price: prod.retailPrice,
        cost_price: prod.costPrice,
        min_stock_alert: prod.minStockAlert,
        is_active: true
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating product in Supabase:', error);
      throw error;
    }

    return {
      id: data.id,
      orgId: data.organization_id,
      code: data.code,
      name: data.name,
      category: data.category,
      unit: data.unit,
      retailPrice: Number(data.retail_price),
      costPrice: Number(data.cost_price),
      commissionPct: 5,
      minStockAlert: data.min_stock_alert,
      isActive: data.is_active
    };
  },

  async getInventoryStocks(): Promise<Record<string, Record<string, number>>> {
    if (!isSupabaseConfigured || !supabase) return {};
    const { data, error } = await supabase.from('inventory_stocks').select('*');
    if (error) {
      console.error('Error fetching inventory stocks:', error);
      return {};
    }
    const result: Record<string, Record<string, number>> = {};
    (data || []).forEach((row) => {
      if (!result[row.branch_id]) result[row.branch_id] = {};
      result[row.branch_id][row.product_id] = row.stock_on_hand;
    });
    return result;
  },

  /**
   * 4. PACKAGES CRUD
   */
  async getPackages(): Promise<PackageCombo[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('packages').select('*').order('name');
    if (error) {
      console.error('Error fetching packages:', error);
      return [];
    }
    return (data || []).map((p) => ({
      id: p.id,
      orgId: p.organization_id,
      code: p.code,
      name: p.name,
      serviceId: p.service_id,
      sessions: p.total_sessions,
      price: Number(p.package_price),
      validityDays: p.validity_days,
      isActive: p.is_active
    }));
  },

  async createPackage(
    pkg: { code: string; name: string; serviceId: string; sessions: number; price: number; validityDays: number },
    orgId: string
  ): Promise<PackageCombo | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('packages')
      .insert({
        organization_id: orgId,
        service_id: pkg.serviceId,
        code: pkg.code.trim().toUpperCase(),
        name: pkg.name.trim(),
        total_sessions: pkg.sessions,
        package_price: pkg.price,
        validity_days: pkg.validityDays,
        is_active: true
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating package in Supabase:', error);
      throw error;
    }

    return {
      id: data.id,
      orgId: data.organization_id,
      code: data.code,
      name: data.name,
      serviceId: data.service_id,
      sessions: data.total_sessions,
      price: Number(data.package_price),
      validityDays: data.validity_days,
      isActive: data.is_active
    };
  },

  /**
   * 5. SUPPLIERS CRUD
   */
  async getSuppliers(): Promise<Supplier[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('suppliers').select('*').order('name');
    if (error) {
      console.error('Error fetching suppliers:', error);
      return [];
    }
    return (data || []).map((s) => ({
      id: s.id,
      orgId: s.organization_id,
      name: s.name,
      contactName: s.contact_person || '',
      phone: s.phone,
      debt: Number(s.debt_balance || 0)
    }));
  },

  async createSupplier(
    sup: { name: string; contactPerson?: string; phone: string },
    orgId: string
  ): Promise<Supplier | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        organization_id: orgId,
        name: sup.name.trim(),
        contact_person: sup.contactPerson?.trim() || null,
        phone: sup.phone.trim(),
        debt_balance: 0
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating supplier in Supabase:', error);
      throw error;
    }

    return {
      id: data.id,
      orgId: data.organization_id,
      name: data.name,
      contactName: data.contact_person || '',
      phone: data.phone,
      debt: Number(data.debt_balance || 0)
    };
  },

  /**
   * 6. PROMOTIONS CRUD
   */
  async getPromotions(): Promise<Promotion[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('promotions').select('*').order('code');
    if (error) {
      console.error('Error fetching promotions:', error);
      return [];
    }
    return (data || []).map((p) => ({
      id: p.id,
      orgId: p.organization_id,
      code: p.code,
      title: p.description || p.code,
      discountType: p.discount_type === 'percentage' ? 'pct' : 'fixed',
      discountValue: Number(p.discount_value),
      minOrderValue: Number(p.min_order_value || 0),
      usageLimit: p.usage_limit || 100,
      usedCount: p.used_count || 0,
      startDate: p.start_date || '2026-09-01',
      endDate: p.end_date || '2026-12-31',
      isActive: p.is_active
    }));
  },

  async createPromotion(
    promo: {
      code: string;
      title: string;
      discountType: 'pct' | 'fixed';
      discountValue: number;
      minOrderValue: number;
      usageLimit?: number;
      startDate: string;
      endDate: string;
      applicableBranchIds?: string[];
    },
    orgId: string
  ): Promise<Promotion | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('promotions')
      .insert({
        organization_id: orgId,
        code: promo.code.trim().toUpperCase(),
        description: promo.title.trim(),
        discount_type: promo.discountType === 'pct' ? 'percentage' : 'fixed_amount',
        discount_value: promo.discountValue,
        min_order_value: promo.minOrderValue,
        usage_limit: promo.usageLimit || 100,
        used_count: 0,
        start_date: promo.startDate,
        end_date: promo.endDate,
        is_active: true
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating promotion in Supabase:', error);
      throw error;
    }

    return {
      id: data.id,
      orgId: data.organization_id,
      code: data.code,
      title: data.description || data.code,
      discountType: data.discount_type === 'percentage' ? 'pct' : 'fixed',
      discountValue: data.discount_value,
      minOrderValue: data.min_order_value || 0,
      usageLimit: data.usage_limit,
      usedCount: data.used_count || 0,
      startDate: data.start_date || '2026-09-01',
      endDate: data.end_date || '2026-12-31',
      isActive: data.is_active,
      applicableBranchIds: promo.applicableBranchIds
    };
  },

  /**
   * 7. STAFF PROFILES & MEMBERSHIPS
   */
  async getStaff(branchId?: string): Promise<Staff[]> {
    if (!isSupabaseConfigured || !supabase) return [];

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_staff_directory', {
        p_branch_id: branchId || null
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return rpcData.map((s: any) => ({
          id: s.id,
          orgId: s.org_id,
          name: s.name,
          code: s.code,
          phone: s.phone,
          email: s.email || '',
          title: s.title || '',
          role: (s.role || 'technician_doctor') as Staff['role'],
          branchIds: Array.isArray(s.branch_ids) ? s.branch_ids : [],
          primaryBranchId: s.primary_branch_id || (Array.isArray(s.branch_ids) ? s.branch_ids[0] : ''),
          baseSalary: Number(s.base_salary || 0),
          commissionRate: Number(s.commission_rate || 0),
          status: s.is_active ? 'active' : 'inactive',
          employmentStatus: s.employment_status || 'active',
          assignedBranches: (s.assigned_branches || []).map((ab: any) => ({
            branchId: ab.branch_id,
            branchName: ab.branch_name,
            isPrimary: ab.is_primary,
            effectiveFrom: ab.effective_from,
            effectiveTo: ab.effective_to
          })),
          skills: (s.skills || []).map((sk: any) => ({
            serviceId: sk.service_id,
            serviceName: sk.service_name,
            proficiencyLevel: sk.proficiency_level
          }))
        }));
      }
    } catch {
      // Fallback
    }

    const { data, error } = await supabase
      .from('staff_profiles')
      .select(`
        id,
        organization_id,
        full_name,
        code,
        phone,
        email,
        title,
        base_salary,
        commission_rate,
        employment_status,
        is_active,
        organization_memberships (
          role,
          assigned_branch_ids
        )
      `)
      .order('full_name');

    if (error) {
      console.error('Error fetching staff profiles:', error);
      return [];
    }

    return (data || []).map((s: any) => {
      const membership = s.organization_memberships?.[0];
      const branchIds = membership?.assigned_branch_ids || [];
      return {
        id: s.id,
        orgId: s.organization_id,
        name: s.full_name,
        code: s.code,
        email: s.email || '',
        phone: s.phone,
        title: s.title || '',
        role: (membership?.role || 'technician_doctor') as Staff['role'],
        branchIds: branchIds,
        primaryBranchId: branchIds[0] || '',
        baseSalary: Number(s.base_salary || 8000000),
        commissionRate: Number(s.commission_rate || 10),
        status: s.is_active ? 'active' : 'inactive',
        employmentStatus: s.employment_status || 'active'
      };
    });
  },

  /**
   * 7b. UPSERT STAFF PROFILE VIA RPC (P6.1)
   */
  async upsertStaffProfileRPC(params: {
    orgId: string;
    staffId?: string;
    fullName: string;
    code?: string;
    phone: string;
    email?: string;
    title?: string;
    role: Staff['role'];
    primaryBranchId?: string;
    branchIds: string[];
    baseSalary?: number;
    commissionRate?: number;
    employmentStatus?: 'active' | 'on_leave' | 'terminated';
    pinCode?: string;
    skillIds?: string[];
    effectiveFrom?: string;
  }): Promise<{
    success: boolean;
    staffId?: string;
    code?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }

    const { data, error } = await supabase.rpc('rpc_upsert_staff_profile', {
      p_org_id: params.orgId,
      p_staff_id: params.staffId || null,
      p_full_name: params.fullName,
      p_code: params.code || '',
      p_phone: params.phone,
      p_email: params.email || null,
      p_title: params.title || null,
      p_role: params.role,
      p_primary_branch_id: params.primaryBranchId || null,
      p_branch_ids: params.branchIds,
      p_base_salary: params.baseSalary || 0,
      p_commission_rate: params.commissionRate || 0,
      p_employment_status: params.employmentStatus || 'active',
      p_pin_code: params.pinCode || null,
      p_skill_ids: params.skillIds || [],
      p_effective_from: params.effectiveFrom || new Date().toISOString().split('T')[0]
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_upsert_staff_profile:', error);
      const err = new Error(error.message || error.details || 'Lỗi lưu thông tin nhân sự.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }

    const res = data as any;
    return {
      success: res?.success ?? false,
      staffId: res?.staff_id,
      code: res?.code,
      message: res?.message
    };
  },

  /**
   * ADMIN RESET STAFF PASSWORD
   * Cho phép Chủ cơ sở (Admin) cấp / đổi mật khẩu trực tiếp cho nhân viên
   */
  async adminResetStaffPassword(params: {
    staffId: string;
    newPassword: string;
  }): Promise<{ success: boolean; message: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Đã cập nhật mật khẩu thành công (Mô phỏng offline).' };
    }

    const { data, error } = await supabase.rpc('rpc_admin_reset_staff_password', {
      p_staff_id: params.staffId,
      p_new_password: params.newPassword.trim()
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_admin_reset_staff_password:', error);
      throw new Error(error.message || error.details || 'Không thể đổi mật khẩu nhân viên.');
    }

    const res = data as any;
    return {
      success: res?.success ?? true,
      message: res?.message || 'Đã cập nhật mật khẩu thành công!'
    };
  },


  /**
   * 8. APPOINTMENTS (LỊCH HẸN TIẾP ĐÓN)
   */
  async getAppointments(orgId?: string, branchId?: string): Promise<Appointment[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    let query = supabase
      .from('appointments')
      .select(`
        id,
        organization_id,
        branch_id,
        customer_id,
        staff_id,
        service_id,
        scheduled_at,
        duration_minutes,
        status,
        notes,
        customers (full_name, phone),
        services (name, base_price),
        staff_profiles (full_name)
      `)
      .order('scheduled_at', { ascending: true });

    if (orgId) query = query.eq('organization_id', orgId);
    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching appointments from Supabase:', error);
      return [];
    }

    return (data || []).map((row: any) => {
      const scheduledDateObj = new Date(row.scheduled_at);
      const dateStr = scheduledDateObj.toISOString().slice(0, 10);
      const timeStr = scheduledDateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      let mappedStatus: Appointment['status'] = 'booked';
      if (row.status === 'confirmed') mappedStatus = 'confirmed';
      else if (row.status === 'in_progress') mappedStatus = 'in_progress';
      else if (row.status === 'completed') mappedStatus = 'done';
      else if (row.status === 'cancelled') mappedStatus = 'cancelled';

      return {
        id: row.id,
        branchId: row.branch_id,
        customerId: row.customer_id,
        customerName: row.customers?.full_name || 'Khách hàng',
        customerPhone: row.customers?.phone || '',
        serviceId: row.service_id,
        serviceName: row.services?.name || 'Dịch vụ Spa',
        staffId: row.staff_id || '',
        staffName: row.staff_profiles?.full_name || 'Chưa chỉ định',
        date: dateStr,
        time: timeStr,
        durationMinutes: row.duration_minutes || 60,
        status: mappedStatus,
        priceSnapshot: row.services?.base_price || 0,
        notes: row.notes || ''
      };
    });
  },

  async createAppointment(appt: Omit<Appointment, 'id'>, orgId: string): Promise<Appointment | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    
    // Convert date + time into ISO timestamp
    const scheduledAt = new Date(`${appt.date}T${appt.time}:00`).toISOString();
    let dbStatus = 'booked';
    if (appt.status === 'confirmed') dbStatus = 'confirmed';
    else if (appt.status === 'in_progress') dbStatus = 'in_progress';
    else if (appt.status === 'done') dbStatus = 'completed';
    else if (appt.status === 'cancelled') dbStatus = 'cancelled';

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        organization_id: orgId,
        branch_id: appt.branchId,
        customer_id: appt.customerId,
        staff_id: appt.staffId || null,
        service_id: appt.serviceId,
        scheduled_at: scheduledAt,
        duration_minutes: appt.durationMinutes || 60,
        status: dbStatus,
        notes: appt.notes || null
      })
      .select(`
        id,
        organization_id,
        branch_id,
        customer_id,
        staff_id,
        service_id,
        scheduled_at,
        duration_minutes,
        status,
        notes
      `)
      .single();

    if (error || !data) {
      console.error('Error inserting appointment in Supabase:', error);
      throw error;
    }

    return {
      id: data.id,
      branchId: data.branch_id,
      customerId: data.customer_id,
      customerName: appt.customerName,
      customerPhone: appt.customerPhone,
      serviceId: data.service_id,
      serviceName: appt.serviceName,
      staffId: data.staff_id || '',
      staffName: appt.staffName,
      date: appt.date,
      time: appt.time,
      durationMinutes: data.duration_minutes,
      status: appt.status,
      priceSnapshot: appt.priceSnapshot,
      roomOrBed: appt.roomOrBed,
      notes: data.notes || ''
    };
  },

  async updateAppointmentStatus(apptId: string, status: Appointment['status']): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    let dbStatus = 'booked';
    if (status === 'confirmed') dbStatus = 'confirmed';
    else if (status === 'in_progress') dbStatus = 'in_progress';
    else if (status === 'done') dbStatus = 'completed';
    else if (status === 'cancelled') dbStatus = 'cancelled';

    const { error } = await supabase
      .from('appointments')
      .update({
        status: dbStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', apptId);

    if (error) {
      console.error('Error updating appointment status in Supabase:', error);
      throw error;
    }
    return true;
  },

  /**
   * 10. ATOMIC CONCURRENCY BOOKING VIA RPC
   */
  async bookAppointmentRPC(params: {
    orgId: string;
    branchId: string;
    customerId: string;
    serviceId: string;
    staffId?: string;
    resourceId?: string;
    scheduledAt: string;
    durationMinutes: number;
    notes?: string;
    existingApptId?: string;
  }): Promise<{ success: boolean; appointmentId?: string; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode' };
    }

    const { data, error } = await supabase.rpc('rpc_book_appointment', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_customer_id: params.customerId,
      p_service_id: params.serviceId,
      p_staff_id: params.staffId || null,
      p_resource_id: params.resourceId || null,
      p_scheduled_at: params.scheduledAt,
      p_duration_minutes: params.durationMinutes,
      p_notes: params.notes || null,
      p_existing_appt_id: params.existingApptId || null
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_book_appointment:', error);
      throw error;
    }

    const res = data as { success: boolean; appointment_id?: string; message?: string; conflict_type?: string };
    return {
      success: res?.success ?? false,
      appointmentId: res?.appointment_id,
      message: res?.message
    };
  },

  /**
   * 11. ATOMIC POS CHECKOUT VIA RPC (PHASE P5)
   */
  async checkoutPOSRPC(params: {
    orgId: string;
    branchId: string;
    customerId: string;
    cashierStaffId: string;
    items: Array<{ type: 'service' | 'product' | 'package'; id: string; qty: number; performer_id?: string }>;
    paymentMethod: string;
    paidAmount: number;
    promoCode?: string;
    manualDiscountAmount?: number;
    manualDiscountReason?: string;
    useDepositAmount?: number;
    appointmentId?: string;
    notes?: string;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    saleId?: string;
    invoiceNo?: string;
    subtotal?: number;
    discountAmount?: number;
    totalAmount?: number;
    paidAmount?: number;
    debtAmount?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }

    const { data, error } = await supabase.rpc('rpc_pos_checkout', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_customer_id: params.customerId,
      p_cashier_staff_id: params.cashierStaffId,
      p_items: params.items,
      p_payment_method: params.paymentMethod,
      p_paid_amount: params.paidAmount,
      p_promo_code: params.promoCode || null,
      p_manual_discount_amount: params.manualDiscountAmount || 0,
      p_manual_discount_reason: params.manualDiscountReason || null,
      p_use_deposit_amount: params.useDepositAmount || 0,
      p_appointment_id: params.appointmentId || null,
      p_notes: params.notes || null,
      p_idempotency_key: params.idempotencyKey || null
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_pos_checkout:', error);
      throw error;
    }

    const res = data as {
      success: boolean;
      sale_id?: string;
      invoice_no?: string;
      subtotal?: number;
      discount_amount?: number;
      total_amount?: number;
      paid_amount?: number;
      debt_amount?: number;
      message?: string;
    };

    return {
      success: res?.success ?? false,
      saleId: res?.sale_id,
      invoiceNo: res?.invoice_no,
      subtotal: res?.subtotal ? Number(res.subtotal) : undefined,
      discountAmount: res?.discount_amount ? Number(res.discount_amount) : undefined,
      totalAmount: res?.total_amount ? Number(res.total_amount) : undefined,
      paidAmount: res?.paid_amount ? Number(res.paid_amount) : undefined,
      debtAmount: res?.debt_amount ? Number(res.debt_amount) : undefined,
      message: res?.message
    };
  },

  /**
   * 12. HARDENED REFUND SALE VIA RPC (P5 HARDENING)
   */
  async refundSaleRPC(params: {
    orgId: string;
    branchId: string;
    saleId: string;
    authorizedStaffId: string;
    reason: string;
    returnStock?: boolean;
    refundMethod?: 'cash' | 'transfer' | 'deposit_return';
    returnedItems?: Array<{
      product_id: string;
      refund_qty: number;
      received_back_qty: number;
      restockable_qty: number;
      damaged_qty: number;
      damage_reason?: string;
    }>;
  }): Promise<{
    success: boolean;
    refundId?: string;
    refundNumber?: string;
    refundAmount?: number;
    debtReduced?: number;
    refundMethod?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }

    const { data, error } = await supabase.rpc('rpc_refund_sale', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_sale_id: params.saleId,
      p_authorized_staff_id: params.authorizedStaffId,
      p_reason: params.reason,
      p_return_stock: params.returnStock ?? true,
      p_refund_method: params.refundMethod || 'cash',
      p_returned_items: params.returnedItems || null
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_refund_sale:', error);
      throw error;
    }

    const res = data as {
      success: boolean;
      refund_id?: string;
      refund_number?: string;
      refund_amount?: number;
      debt_reduced?: number;
      refund_method?: string;
      message?: string;
    };

    return {
      success: res?.success ?? false,
      refundId: res?.refund_id,
      refundNumber: res?.refund_number,
      refundAmount: res?.refund_amount,
      debtReduced: res?.debt_reduced,
      refundMethod: res?.refund_method,
      message: res?.message
    };
  },

  /**
   * 13. PROCUREMENT PHASE A — CREATE PURCHASE ORDER (PO)
   */
  async createPurchaseOrderRPC(params: {
    orgId: string;
    branchId: string;
    supplierId: string;
    staffId: string;
    items: Array<{
      product_id: string;
      purchase_unit: string;
      conversion_rate: number;
      quantity: number;
      unit_cost: number;
    }>;
    expectedDate?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    poId?: string;
    poNumber?: string;
    totalAmount?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }

    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_create_purchase_order', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_supplier_id: params.supplierId,
      p_staff_id: validStaffId,
      p_items: params.items,
      p_expected_date: params.expectedDate || null,
      p_notes: params.notes || null
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_create_purchase_order:', error);
      const err = new Error(error.message || error.details || 'Lỗi tạo PO từ server.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }

    const res = data as {
      success: boolean;
      po_id?: string;
      po_number?: string;
      total_amount?: number;
      message?: string;
    };

    return {
      success: res?.success ?? false,
      poId: res?.po_id,
      poNumber: res?.po_number,
      totalAmount: res?.total_amount,
      message: res?.message
    };
  },

  /**
   * 14. PROCUREMENT PHASE A — CONFIRM GOODS RECEIPT (GRN)
   */
  async confirmGoodsReceiptRPC(params: {
    orgId: string;
    branchId: string;
    poId?: string;
    supplierId: string;
    staffId: string;
    items: Array<{
      po_item_id?: string;
      product_id: string;
      lot_number?: string;
      expiry_date?: string;
      purchase_unit?: string;
      conversion_rate?: number;
      qty_received: number;
      qty_accepted: number;
      qty_rejected?: number;
      rejection_reason?: string;
      unit_cost: number;
    }>;
    invoiceNumber?: string;
    advanceId?: string;
    advancePaid?: number;
    notes?: string;
    closePo?: boolean;
  }): Promise<{
    success: boolean;
    grnId?: string;
    grnNumber?: string;
    totalAcceptedValue?: number;
    advancePaid?: number;
    netDebtAdded?: number;
    supplierDebtBalance?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }

    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_confirm_goods_receipt', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_po_id: params.poId || null,
      p_supplier_id: params.supplierId,
      p_staff_id: validStaffId,
      p_items: params.items,
      p_invoice_number: params.invoiceNumber || null,
      p_advance_id: params.advanceId || null,
      p_advance_amount_to_use: params.advancePaid || 0,
      p_notes: params.notes || null
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_confirm_goods_receipt:', error);
      const err = new Error(error.message || error.details || 'Lỗi nhận hàng GRN từ server.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }

    const res = data as {
      success: boolean;
      grn_id?: string;
      grn_number?: string;
      total_accepted_value?: number;
      advance_paid?: number;
      net_debt_added?: number;
      supplier_debt_balance?: number;
      message?: string;
    };

    // Nếu người dùng chọn đóng đơn PO (mặc định TRUE) và RPC thành công -> cập nhật trạng thái PO thành received
    if (res?.success && params.poId && (params.closePo ?? true)) {
      try {
        await supabase
          .from('purchase_orders')
          .update({
            status: 'received',
            updated_at: new Date().toISOString()
          })
          .eq('id', params.poId);
      } catch (updErr) {
        console.warn('Cập nhật trạng thái đóng PO thất bại:', updErr);
      }
    }

    return {
      success: res?.success ?? false,
      grnId: res?.grn_id,
      grnNumber: res?.grn_number,
      totalAcceptedValue: res?.total_accepted_value,
      advancePaid: res?.advance_paid,
      netDebtAdded: res?.net_debt_added,
      supplierDebtBalance: res?.supplier_debt_balance,
      message: res?.message
    };
  },

  /**
   * 14b. CLOSE PURCHASE ORDER DIRECTLY VIA DIRECT UPDATE
   */
  async closePurchaseOrderRPC(poId: string, _reason?: string): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'received',
        updated_at: new Date().toISOString()
      })
      .eq('id', poId);
    if (error) {
      console.error('Lỗi khi đóng đơn PO:', error);
      const err = new Error(error.message || error.details || 'Lỗi đóng đơn PO.');
      (err as any).details = error.details;
      throw err;
    }
    return { success: true, message: 'Đã hoàn tất và đóng đơn đặt hàng thành công.' };
  },

  /**
   * 15. PROCUREMENT PHASE A — PAY SUPPLIER AP VIA RPC
   */
  async paySupplierRPC(params: {
    orgId: string;
    branchId: string;
    supplierId: string;
    staffId: string;
    amount: number;
    paymentMethod?: 'transfer' | 'cash';
    bankRefCode?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    paymentId?: string;
    paymentNumber?: string;
    amountPaid?: number;
    debtBalanceAfter?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }

    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_pay_supplier', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_supplier_id: params.supplierId,
      p_staff_id: validStaffId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod || 'transfer',
      p_bank_ref_code: params.bankRefCode || null,
      p_notes: params.notes || null
    });

    if (error) {
      console.error('Lỗi gọi RPC rpc_pay_supplier:', error);
      const err = new Error(error.message || error.details || 'Lỗi thanh toán NCC từ server.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }

    const res = data as {
      success: boolean;
      payment_id?: string;
      payment_number?: string;
      amount_paid?: number;
      debt_balance_after?: number;
      message?: string;
    };

    return {
      success: res?.success ?? false,
      paymentId: res?.payment_id,
      paymentNumber: res?.payment_number,
      amountPaid: res?.amount_paid,
      debtBalanceAfter: res?.debt_balance_after,
      message: res?.message
    };
  },

  /**
   * 16. PROCUREMENT PHASE A — FETCH SUPPLIER LEDGER
   */
  async getSupplierLedger(supplierId: string): Promise<Array<{
    id: string;
    entryType: string;
    referenceType: string;
    referenceId?: string;
    debitAmount: number;
    creditAmount: number;
    balanceAfter: number;
    notes?: string;
    createdAt: string;
  }>> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase
      .from('supplier_ledger')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching supplier ledger:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      debitAmount: Number(row.debit_amount || 0),
      creditAmount: Number(row.credit_amount || 0),
      balanceAfter: Number(row.balance_after || 0),
      notes: row.notes,
      createdAt: row.created_at
    }));
  },

  /**
   * 17. PROCUREMENT PHASE A — FETCH PURCHASE ORDERS
   */
  async getPurchaseOrders(branchId?: string): Promise<PurchaseOrder[]> {
    if (!isSupabaseConfigured || !supabase) return [];

    // Ưu tiên gọi RPC bảo mật SECURITY DEFINER rpc_get_purchase_orders
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_purchase_orders', {
        p_branch_id: branchId || null
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return rpcData.map((po: any) => ({
          id: po.id as string,
          orgId: po.organization_id as string,
          branchId: po.branch_id as string,
          supplierId: po.supplier_id as string,
          supplierName: (po.supplier_name as string) || 'Nhà cung cấp',
          poNumber: po.po_number as string,
          orderDate: po.order_date || (po.created_at ? (po.created_at as string).split('T')[0] : ''),
          expectedDate: (po.expected_delivery_date as string) || undefined,
          totalAmount: Number(po.total_amount || 0),
          notes: (po.notes as string) || undefined,
          status: po.status as PurchaseOrder['status'],
          items: ((po.items || []) as any[]).map((it) => ({
            id: it.id,
            productId: it.product_id,
            productName: it.product_name || 'Sản phẩm',
            purchaseUnit: it.purchase_unit,
            conversionRate: Number(it.conversion_rate || 1),
            qtyOrdered: Number(it.quantity_ordered || 0),
            qtyReceived: Number(it.quantity_received || 0),
            unitPrice: Number(it.unit_cost || 0),
            lineTotal: Number(it.line_total || 0)
          }))
        }));
      }
    } catch {
      // Fallback xuống truy vấn trực tiếp PostgREST
    }

    let query = supabase
      .from('purchase_orders')
      .select(`
        id, organization_id, branch_id, supplier_id, po_number, total_amount, status, expected_delivery_date, notes, created_at,
        suppliers:supplier_id (name),
        items:purchase_order_items (
          id, product_id, purchase_unit, conversion_rate, quantity_ordered, quantity_received, unit_cost, line_total,
          products:product_id (name)
        )
      `)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching purchase orders:', error);
      return [];
    }
    return (data || []).map((po: Record<string, unknown>) => {
      const suppliers = po.suppliers as { name?: string } | null;
      const items = (po.items || []) as Array<{
        id?: string;
        product_id: string;
        purchase_unit?: string;
        conversion_rate?: number;
        quantity_ordered: number;
        quantity_received: number;
        unit_cost: number;
        line_total: number;
        products?: { name?: string } | null;
      }>;
      return {
        id: po.id as string,
        orgId: po.organization_id as string,
        branchId: po.branch_id as string,
        supplierId: po.supplier_id as string,
        supplierName: suppliers?.name || 'Nhà cung cấp',
        poNumber: po.po_number as string,
        orderDate: po.created_at ? (po.created_at as string).split('T')[0] : '',
        expectedDate: (po.expected_delivery_date as string) || undefined,
        totalAmount: Number(po.total_amount || 0),
        notes: (po.notes as string) || undefined,
        status: po.status as PurchaseOrder['status'],
        items: items.map((it) => ({
          id: it.id,
          productId: it.product_id,
          productName: it.products?.name || 'Sản phẩm',
          purchaseUnit: it.purchase_unit,
          conversionRate: Number(it.conversion_rate || 1),
          qtyOrdered: Number(it.quantity_ordered || 0),
          qtyReceived: Number(it.quantity_received || 0),
          unitPrice: Number(it.unit_cost || 0),
          lineTotal: Number(it.line_total || 0)
        }))
      };
    });
  },

  /**
   * 18. PROCUREMENT PHASE A — FETCH GOODS RECEIPTS
   */
  async getGoodsReceipts(branchId?: string): Promise<GoodsReceiptNote[]> {
    if (!isSupabaseConfigured || !supabase) return [];

    // Ưu tiên gọi RPC bảo mật SECURITY DEFINER rpc_get_goods_receipts
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_goods_receipts', {
        p_branch_id: branchId || null
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return rpcData.map((grn: any) => ({
          id: grn.id as string,
          orgId: grn.organization_id as string,
          branchId: grn.branch_id as string,
          poId: (grn.purchase_order_id as string) || undefined,
          supplierId: grn.supplier_id as string,
          supplierName: (grn.supplier_name as string) || 'Nhà cung cấp',
          grnNumber: grn.grn_number as string,
          invoiceNumber: (grn.invoice_number as string) || undefined,
          receivedDate: grn.received_at ? (grn.received_at as string).split('T')[0] : '',
          receiverStaffId: '',
          totalAmount: Number(grn.total_value || 0),
          paidAmount: 0,
          notes: (grn.notes as string) || undefined,
          status: (grn.status || 'completed') as GoodsReceiptNote['status'],
          items: ((grn.items || []) as any[]).map((it) => ({
            id: it.id,
            poItemId: it.po_item_id,
            productId: it.product_id,
            productName: it.product_name || 'Sản phẩm',
            lotNumber: it.lot_number,
            expiryDate: it.expiry_date,
            purchaseUnit: it.purchase_unit,
            conversionRate: Number(it.conversion_rate || 1),
            qty: Number(it.quantity_received || 0),
            qtyAccepted: Number(it.quantity_accepted || 0),
            qtyRejected: Number(it.quantity_rejected || 0),
            rejectionReason: it.rejection_reason,
            acceptedBaseUnits: Number(it.accepted_base_units || 0),
            unitPrice: Number(it.unit_cost || 0),
            lineTotal: Number(it.line_total || 0)
          }))
        }));
      }
    } catch {
      // Fallback
    }

    let query = supabase
      .from('goods_receipt_notes')
      .select(`
        id, organization_id, branch_id, purchase_order_id, supplier_id, grn_number, invoice_number, status, received_at, total_value, notes,
        suppliers:supplier_id (name),
        items:goods_receipt_items (
          id, po_item_id, product_id, lot_number, expiry_date, purchase_unit, conversion_rate,
          quantity_received, quantity_accepted, quantity_rejected, rejection_reason, accepted_base_units, unit_cost, line_total,
          products:product_id (name)
        )
      `)
      .order('received_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching goods receipts:', error);
      return [];
    }
    return (data || []).map((grn: Record<string, unknown>) => {
      const suppliers = grn.suppliers as { name?: string } | null;
      const items = (grn.items || []) as Array<{
        id?: string;
        po_item_id?: string;
        product_id: string;
        lot_number?: string;
        expiry_date?: string;
        purchase_unit?: string;
        conversion_rate?: number;
        quantity_received: number;
        quantity_accepted: number;
        quantity_rejected: number;
        rejection_reason?: string;
        accepted_base_units: number;
        unit_cost: number;
        line_total: number;
        products?: { name?: string } | null;
      }>;
      return {
        id: grn.id as string,
        orgId: grn.organization_id as string,
        branchId: grn.branch_id as string,
        poId: (grn.purchase_order_id as string) || undefined,
        supplierId: grn.supplier_id as string,
        supplierName: suppliers?.name || 'Nhà cung cấp',
        grnNumber: grn.grn_number as string,
        invoiceNumber: (grn.invoice_number as string) || undefined,
        receivedDate: grn.received_at ? (grn.received_at as string).split('T')[0] : '',
        receiverStaffId: (grn.received_by_staff_id as string) || '',
        totalAmount: Number(grn.total_value || 0),
        paidAmount: 0,
        notes: (grn.notes as string) || undefined,
        status: (grn.status || 'completed') as GoodsReceiptNote['status'],
        items: items.map((it) => ({
          id: it.id,
          poItemId: it.po_item_id,
          productId: it.product_id,
          productName: it.products?.name || 'Sản phẩm',
          lotNumber: it.lot_number,
          expiryDate: it.expiry_date,
          purchaseUnit: it.purchase_unit,
          conversionRate: Number(it.conversion_rate || 1),
          qty: Number(it.quantity_received || 0),
          qtyAccepted: Number(it.quantity_accepted || 0),
          qtyRejected: Number(it.quantity_rejected || 0),
          rejectionReason: it.rejection_reason,
          acceptedBaseUnits: Number(it.accepted_base_units || 0),
          unitPrice: Number(it.unit_cost || 0),
          lineTotal: Number(it.line_total || 0)
        }))
      };
    });
  },

  /**
   * 19. FETCH INVENTORY LOT STOCKS
   */
  async getInventoryLotStocks(branchId?: string): Promise<Array<{
    id: string;
    branchId: string;
    productId: string;
    productName: string;
    lotNumber: string;
    expiryDate?: string;
    quantityOnHand: number;
    costPrice: number;
    status: string;
  }>> {
    if (!isSupabaseConfigured || !supabase) return [];
    let query = supabase
      .from('inventory_lot_stocks')
      .select('*, products:product_id(name)')
      .order('expiry_date', { ascending: true });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching inventory lot stocks:', error);
      return [];
    }
    return (data || []).map((row: Record<string, unknown>) => {
      const prod = row.products as { name?: string } | null;
      return {
        id: row.id as string,
        branchId: row.branch_id as string,
        productId: row.product_id as string,
        productName: prod?.name || 'Sản phẩm',
        lotNumber: row.lot_number as string,
        expiryDate: (row.expiry_date as string) || undefined,
        quantityOnHand: Number(row.quantity_on_hand || 0),
        costPrice: Number(row.cost_price || 0),
        status: (row.status as string) || 'active'
      };
    });
  },

  /**
   * 20. FETCH SUPPLIER ADVANCES
   */
  async getSupplierAdvances(supplierId?: string): Promise<Array<{
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
  }>> {
    if (!isSupabaseConfigured || !supabase) return [];
    let query = supabase
      .from('supplier_advances')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplierId) {
      query = query.eq('supplier_id', supplierId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching supplier advances:', error);
      return [];
    }
    return (data || []).map((adv: Record<string, unknown>) => ({
      id: adv.id as string,
      advanceNumber: adv.advance_number as string,
      supplierId: adv.supplier_id as string,
      totalAmount: Number(adv.total_amount || 0),
      usedAmount: Number(adv.used_amount || 0),
      remainingAmount: Number(adv.total_amount || 0) - Number(adv.used_amount || 0),
      status: adv.status as string,
      paymentMethod: (adv.payment_method as string) || 'transfer',
      bankRefCode: (adv.bank_ref_code as string) || undefined,
      notes: (adv.notes as string) || undefined,
      createdAt: adv.created_at as string
    }));
  },

  /**
   * 21. CREATE SUPPLIER ADVANCE VIA RPC
   */
  async createSupplierAdvanceRPC(params: {
    orgId: string;
    branchId: string;
    supplierId: string;
    staffId: string;
    amount: number;
    paymentMethod?: string;
    bankRefCode?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    advanceId?: string;
    advanceNumber?: string;
    amount?: number;
    supplierDebtBalance?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_create_supplier_advance', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_supplier_id: params.supplierId,
      p_staff_id: validStaffId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod || 'transfer',
      p_bank_ref_code: params.bankRefCode || null,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_create_supplier_advance:', error);
      const err = new Error(error.message || error.details || 'Lỗi tạo cọc NCC từ server.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as {
      success: boolean;
      advance_id?: string;
      advance_number?: string;
      amount?: number;
      supplier_debt_balance?: number;
      message?: string;
    };
    return {
      success: res?.success ?? false,
      advanceId: res?.advance_id,
      advanceNumber: res?.advance_number,
      amount: res?.amount,
      supplierDebtBalance: res?.supplier_debt_balance,
      message: res?.message
    };
  },

  /**
   * 22. RETURN GOODS TO SUPPLIER VIA RPC
   */
  async returnGoodsToSupplierRPC(params: {
    orgId: string;
    branchId: string;
    supplierId: string;
    staffId: string;
    items: Array<{
      product_id: string;
      lot_number?: string;
      quantity: number;
      unit_cost: number;
      is_from_quarantined?: boolean;
      is_holding_rejection?: boolean;
      damaged_item_id?: string;
    }>;
    reason: string;
    grnId?: string;
  }): Promise<{
    success: boolean;
    returnId?: string;
    returnNumber?: string;
    totalAmount?: number;
    totalDebtReduction?: number;
    debtBalanceAfter?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_return_goods_to_supplier', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_supplier_id: params.supplierId,
      p_staff_id: validStaffId,
      p_items: params.items,
      p_reason: params.reason,
      p_grn_id: params.grnId || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_return_goods_to_supplier:', error);
      const err = new Error(error.message || error.details || 'Lỗi trả hàng NCC từ server.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as {
      success: boolean;
      return_id?: string;
      return_number?: string;
      total_amount?: number;
      total_debt_reduction?: number;
      debt_balance_after?: number;
      message?: string;
    };
    return {
      success: res?.success ?? false,
      returnId: res?.return_id,
      returnNumber: res?.return_number,
      totalAmount: res?.total_amount,
      totalDebtReduction: res?.total_debt_reduction,
      debtBalanceAfter: res?.debt_balance_after,
      message: res?.message
    };
  },

  /**
   * 23. INVENTORY PHASE B — FETCH BRANCH TRANSFERS
   */
  async getBranchTransfers(branchId?: string): Promise<BranchTransfer[]> {
    if (!isSupabaseConfigured || !supabase) return [];

    // Ưu tiên gọi RPC bảo mật SECURITY DEFINER rpc_get_branch_transfers
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_branch_transfers', {
        p_branch_id: branchId || null
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return rpcData.map((t: any) => ({
          id: t.id as string,
          orgId: t.organization_id as string,
          fromBranchId: t.from_branch_id as string,
          fromBranchName: t.from_branch_name as string,
          toBranchId: t.to_branch_id as string,
          toBranchName: t.to_branch_name as string,
          transferNumber: t.transfer_number as string,
          status: t.status as BranchTransfer['status'],
          totalItems: Number(t.total_items || 0),
          totalValue: Number(t.total_value || 0),
          dispatchDate: t.dispatch_date ? (t.dispatch_date as string).split('T')[0] : undefined,
          receivedDate: t.received_date ? (t.received_date as string).split('T')[0] : undefined,
          notes: t.notes as string | undefined,
          createdAt: t.created_at ? (t.created_at as string).split('T')[0] : '',
          items: ((t.items || []) as any[]).map((it) => ({
            id: it.id,
            productId: it.product_id,
            productName: it.product_name || 'Sản phẩm',
            productCode: it.product_code,
            productUnit: it.product_unit,
            lotNumber: it.lot_number,
            expiryDate: it.expiry_date,
            unitCost: Number(it.unit_cost || 0),
            quantityRequested: Number(it.quantity_requested || 0),
            quantityDispatched: Number(it.quantity_dispatched || 0),
            quantityReceived: Number(it.quantity_received || 0),
            quantityAccepted: Number(it.quantity_accepted || 0),
            quantityDamaged: Number(it.quantity_damaged || 0),
            quantityMissing: Number(it.quantity_missing || 0),
            quantityReturned: Number(it.quantity_returned || 0),
            notes: it.notes
          })),
          events: ((t.events || []) as any[]).map((ev) => ({
            id: ev.id,
            eventType: ev.event_type,
            actorName: ev.actor_name,
            details: ev.details,
            createdAt: ev.created_at
          }))
        }));
      }
    } catch {
      // Fallback xuống query PostgREST trực tiếp
    }

    let query = supabase
      .from('branch_transfers')
      .select(`
        id, organization_id, from_branch_id, to_branch_id, transfer_number, status, total_items, total_value, dispatch_date, received_date, notes, created_at,
        from_branch:from_branch_id (name),
        to_branch:to_branch_id (name),
        items:branch_transfer_items (
          id, product_id, lot_number, expiry_date, unit_cost, quantity_requested, quantity_dispatched, quantity_received, quantity_accepted, quantity_damaged, quantity_missing, quantity_returned, notes,
          products:product_id (name, code, unit)
        )
      `)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching branch transfers:', error);
      return [];
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      orgId: t.organization_id,
      fromBranchId: t.from_branch_id,
      fromBranchName: t.from_branch?.name || 'Chi nhánh xuất',
      toBranchId: t.to_branch_id,
      toBranchName: t.to_branch?.name || 'Chi nhánh nhận',
      transferNumber: t.transfer_number,
      status: t.status,
      totalItems: Number(t.total_items || 0),
      totalValue: Number(t.total_value || 0),
      dispatchDate: t.dispatch_date ? t.dispatch_date.split('T')[0] : undefined,
      receivedDate: t.received_date ? t.received_date.split('T')[0] : undefined,
      notes: t.notes || undefined,
      createdAt: t.created_at ? t.created_at.split('T')[0] : '',
      items: (t.items || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id,
        productName: it.products?.name || 'Sản phẩm',
        productCode: it.products?.code || '',
        productUnit: it.products?.unit || 'đơn vị',
        lotNumber: it.lot_number,
        expiryDate: it.expiry_date,
        unitCost: Number(it.unit_cost || 0),
        quantityRequested: Number(it.quantity_requested || 0),
        quantityDispatched: Number(it.quantity_dispatched || 0),
        quantityReceived: Number(it.quantity_received || 0),
        quantityAccepted: Number(it.quantity_accepted || 0),
        quantityDamaged: Number(it.quantity_damaged || 0),
        quantityMissing: Number(it.quantity_missing || 0),
        quantityReturned: Number(it.quantity_returned || 0),
        notes: it.notes
      }))
    }));
  },

  /**
   * 24. CREATE DRAFT BRANCH TRANSFER VIA RPC
   */
  async createBranchTransferRPC(params: {
    orgId: string;
    fromBranchId: string;
    toBranchId: string;
    staffId: string;
    items: Array<{
      product_id: string;
      lot_number?: string;
      expiry_date?: string;
      quantity: number;
      unit_cost?: number;
      notes?: string;
    }>;
    notes?: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    transferNumber?: string;
    totalItems?: number;
    totalValue?: number;
    status?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_create_branch_transfer', {
      p_org_id: params.orgId,
      p_from_branch_id: params.fromBranchId,
      p_to_branch_id: params.toBranchId,
      p_staff_id: validStaffId,
      p_items: params.items,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_create_branch_transfer:', error);
      const err = new Error(error.message || error.details || 'Lỗi tạo phiếu chuyển kho.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      transferId: res?.transfer_id,
      transferNumber: res?.transfer_number,
      totalItems: res?.total_items,
      totalValue: res?.total_value,
      status: res?.status,
      message: res?.message
    };
  },

  /**
   * 25. DISPATCH BRANCH TRANSFER (REDUCE ORIGIN STOCK, IN-TRANSIT)
   */
  async dispatchBranchTransferRPC(params: {
    orgId: string;
    transferId: string;
    staffId: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    transferNumber?: string;
    status?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_dispatch_branch_transfer', {
      p_org_id: params.orgId,
      p_transfer_id: params.transferId,
      p_staff_id: validStaffId,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_dispatch_branch_transfer:', error);
      const err = new Error(error.message || error.details || 'Lỗi xuất kho chuyển đi.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      transferId: res?.transfer_id,
      transferNumber: res?.transfer_number,
      status: res?.status,
      message: res?.message
    };
  },

  /**
   * 26. RECEIVE BRANCH TRANSFER AT DESTINATION
   */
  async receiveBranchTransferRPC(params: {
    orgId: string;
    transferId: string;
    staffId: string;
    items: Array<{
      transfer_item_id: string;
      qty_accepted: number;
      qty_damaged: number;
      qty_missing: number;
      damage_reason?: string;
      notes?: string;
    }>;
    notes?: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    transferNumber?: string;
    status?: string;
    allCompleted?: boolean;
    hasDifference?: boolean;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_receive_branch_transfer', {
      p_org_id: params.orgId,
      p_transfer_id: params.transferId,
      p_staff_id: validStaffId,
      p_items: params.items,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_receive_branch_transfer:', error);
      const err = new Error(error.message || error.details || 'Lỗi nhận hàng chuyển kho.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      transferId: res?.transfer_id,
      transferNumber: res?.transfer_number,
      status: res?.status,
      allCompleted: res?.all_completed,
      hasDifference: res?.has_difference,
      message: res?.message
    };
  },

  /**
   * 26b. RESOLVE BRANCH TRANSFER DIFFERENCE (AUTHORIZATION & AUDIT TRAIL)
   */
  async resolveBranchTransferDifferenceRPC(params: {
    orgId: string;
    transferId: string;
    staffId: string;
    resolutionType: 'approved_write_off' | 'return_missing_to_sender' | 'close_with_audit_note';
    notes: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    transferNumber?: string;
    status?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_resolve_transfer_difference', {
      p_org_id: params.orgId,
      p_transfer_id: params.transferId,
      p_staff_id: validStaffId,
      p_resolution_type: params.resolutionType,
      p_notes: params.notes
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_resolve_transfer_difference:', error);
      const err = new Error(error.message || error.details || 'Lỗi duyệt xử lý chênh lệch điều chuyển.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      transferId: res?.transfer_id,
      transferNumber: res?.transfer_number,
      status: res?.status,
      message: res?.message
    };
  },

  /**
   * 27. INVENTORY PHASE C — FETCH INVENTORY AUDITS
   */
  async getInventoryAudits(branchId?: string): Promise<InventoryAudit[]> {
    if (!isSupabaseConfigured || !supabase) return [];

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_inventory_audits', {
        p_branch_id: branchId || null
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return rpcData.map((a: any) => ({
          id: a.id as string,
          orgId: a.organization_id as string,
          branchId: a.branch_id as string,
          branchName: a.branch_name as string,
          auditNumber: a.audit_number as string,
          status: a.status as InventoryAudit['status'],
          snapshotAt: a.snapshot_at ? (a.snapshot_at as string).split('T')[0] : '',
          auditorName: a.auditor_name as string,
          approvedByName: a.approved_by_name as string,
          approvedAt: a.approved_at ? (a.approved_at as string).split('T')[0] : undefined,
          totalItems: Number(a.total_items || 0),
          totalBookQuantity: Number(a.total_book_quantity || 0),
          totalActualQuantity: Number(a.total_actual_quantity || 0),
          totalDifferenceQuantity: Number(a.total_difference_quantity || 0),
          totalDifferenceValue: Number(a.total_difference_value || 0),
          notes: a.notes as string | undefined,
          createdAt: a.created_at ? (a.created_at as string).split('T')[0] : '',
          items: ((a.items || []) as any[]).map((it) => ({
            id: it.id,
            productId: it.product_id,
            productName: it.product_name || 'Sản phẩm',
            productCode: it.product_code,
            productUnit: it.product_unit,
            lotNumber: it.lot_number,
            expiryDate: it.expiry_date,
            unitCost: Number(it.unit_cost || 0),
            systemQuantity: Number(it.system_quantity || 0),
            actualQuantity: Number(it.actual_quantity || 0),
            differenceQuantity: Number(it.difference_quantity || 0),
            differenceValue: Number(it.difference_value || 0),
            reason: it.reason,
            notes: it.notes
          })),
          events: ((a.events || []) as any[]).map((ev) => ({
            id: ev.id,
            eventType: ev.event_type,
            actorName: ev.actor_name,
            details: ev.details,
            createdAt: ev.created_at
          }))
        }));
      }
    } catch {
      // Fallback xuống PostgREST
    }

    let query = supabase
      .from('inventory_audits')
      .select(`
        id, organization_id, branch_id, audit_number, status, snapshot_at, total_items, total_book_quantity, total_actual_quantity, total_difference_quantity, total_difference_value, notes, created_at,
        branches:branch_id (name),
        items:inventory_audit_items (
          id, product_id, lot_number, expiry_date, unit_cost, system_quantity, actual_quantity, difference_quantity, difference_value, reason, notes,
          products:product_id (name, code, unit)
        )
      `)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching inventory audits:', error);
      return [];
    }

    return (data || []).map((a: any) => ({
      id: a.id,
      orgId: a.organization_id,
      branchId: a.branch_id,
      branchName: a.branches?.name || 'Chi nhánh',
      auditNumber: a.audit_number,
      status: a.status,
      snapshotAt: a.snapshot_at ? a.snapshot_at.split('T')[0] : '',
      auditorName: '',
      approvedByName: '',
      totalItems: Number(a.total_items || 0),
      totalBookQuantity: Number(a.total_book_quantity || 0),
      totalActualQuantity: Number(a.total_actual_quantity || 0),
      totalDifferenceQuantity: Number(a.total_difference_quantity || 0),
      totalDifferenceValue: Number(a.total_difference_value || 0),
      notes: a.notes || undefined,
      createdAt: a.created_at ? a.created_at.split('T')[0] : '',
      items: (a.items || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id,
        productName: it.products?.name || 'Sản phẩm',
        productCode: it.products?.code || '',
        productUnit: it.products?.unit || 'đơn vị',
        lotNumber: it.lot_number,
        expiryDate: it.expiry_date,
        unitCost: Number(it.unit_cost || 0),
        systemQuantity: Number(it.system_quantity || 0),
        actualQuantity: Number(it.actual_quantity || 0),
        differenceQuantity: Number(it.difference_quantity || 0),
        differenceValue: Number(it.difference_value || 0),
        reason: it.reason,
        notes: it.notes
      }))
    }));
  },

  /**
   * 28. CREATE INVENTORY AUDIT & SNAPSHOT VIA RPC
   */
  async createInventoryAuditRPC(params: {
    orgId: string;
    branchId: string;
    staffId: string;
    productIds?: string[];
    notes?: string;
  }): Promise<{
    success: boolean;
    auditId?: string;
    auditNumber?: string;
    totalItems?: number;
    totalBookQuantity?: number;
    status?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_create_inventory_audit', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_staff_id: validStaffId,
      p_product_ids: params.productIds || null,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_create_inventory_audit:', error);
      const err = new Error(error.message || error.details || 'Lỗi tạo phiếu kiểm kê kho.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      auditId: res?.audit_id,
      auditNumber: res?.audit_number,
      totalItems: res?.total_items,
      totalBookQuantity: res?.total_book_quantity,
      status: res?.status,
      message: res?.message
    };
  },

  /**
   * 29. SUBMIT INVENTORY AUDIT ACTUAL COUNTS VIA RPC
   */
  async submitInventoryAuditCountsRPC(params: {
    orgId: string;
    auditId: string;
    staffId: string;
    items: Array<{
      item_id: string;
      actual_quantity: number;
      reason?: string;
      notes?: string;
    }>;
    notes?: string;
  }): Promise<{
    success: boolean;
    auditId?: string;
    status?: string;
    totalActualQuantity?: number;
    totalDifferenceQuantity?: number;
    totalDifferenceValue?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_submit_inventory_audit_counts', {
      p_org_id: params.orgId,
      p_audit_id: params.auditId,
      p_staff_id: validStaffId,
      p_items: params.items,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_submit_inventory_audit_counts:', error);
      const err = new Error(error.message || error.details || 'Lỗi lưu số lượng kiểm đếm.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      auditId: res?.audit_id,
      status: res?.status,
      totalActualQuantity: res?.total_actual_quantity,
      totalDifferenceQuantity: res?.total_difference_quantity,
      totalDifferenceValue: res?.total_difference_value,
      message: res?.message
    };
  },

  /**
   * 30. APPROVE INVENTORY AUDIT & ADJUST STOCK VIA RPC
   */
  async approveInventoryAuditRPC(params: {
    orgId: string;
    auditId: string;
    staffId: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    auditId?: string;
    auditNumber?: string;
    status?: string;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;
    const { data, error } = await supabase.rpc('rpc_approve_inventory_audit', {
      p_org_id: params.orgId,
      p_audit_id: params.auditId,
      p_staff_id: validStaffId,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi gọi RPC rpc_approve_inventory_audit:', error);
      const err = new Error(error.message || error.details || 'Lỗi duyệt kiểm kê kho.');
      (err as any).details = error.details;
      (err as any).code = error.code;
      throw err;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      auditId: res?.audit_id,
      auditNumber: res?.audit_number,
      status: res?.status,
      message: res?.message
    };
  },

  /**
   * 31. P6.2 ROSTER & SHIFT MANAGEMENT
   */
  async getRosterMatrix(params: {
    branchId?: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    shifts: any[];
    leaveRequests: any[];
    swapRequests: any[];
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { shifts: [], leaveRequests: [], swapRequests: [] };
    }
    const validBranchId = isUUID(params.branchId) ? params.branchId : null;
    const { data, error } = await supabase.rpc('rpc_get_roster_matrix', {
      p_branch_id: validBranchId,
      p_start_date: params.startDate,
      p_end_date: params.endDate
    });
    if (error) {
      console.error('Lỗi lấy ma trận phân ca:', error);
      return { shifts: [], leaveRequests: [], swapRequests: [] };
    }
    const res = data as any;
    return {
      shifts: (res?.shifts || []).map((s: any) => ({
        id: s.id,
        staffId: s.staff_id,
        staffName: s.staff_name,
        staffCode: s.staff_code,
        branchId: s.branch_id,
        shiftDate: s.shift_date,
        startTime: s.start_time,
        endTime: s.end_time,
        shiftType: s.shift_type,
        breakMinutes: s.break_minutes || 0,
        isOff: s.is_off || false,
        status: s.status,
        notes: s.notes,
        appointmentsCount: s.appointments_count || 0
      })),
      leaveRequests: (res?.leave_requests || []).map((l: any) => ({
        id: l.id,
        staffId: l.staff_id,
        staffName: l.staff_name,
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        reason: l.reason,
        status: l.status,
        createdAt: l.created_at
      })),
      swapRequests: (res?.swap_requests || []).map((sw: any) => ({
        id: sw.id,
        requesterStaffId: sw.requester_staff_id,
        requesterName: sw.requester_name,
        targetStaffId: sw.target_staff_id,
        targetName: sw.target_name,
        reason: sw.reason,
        status: sw.status,
        createdAt: sw.created_at
      }))
    };
  },

  async upsertRosterShiftRPC(params: {
    orgId: string;
    shiftId?: string;
    staffId: string;
    branchId: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    shiftType?: string;
    breakMinutes?: number;
    isOff?: boolean;
    notes?: string;
    force?: boolean;
  }): Promise<{
    success: boolean;
    shiftId?: string;
    code?: string;
    message?: string;
    affectedCount?: number;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_upsert_roster_shift', {
      p_org_id: params.orgId,
      p_shift_id: isUUID(params.shiftId) ? params.shiftId : null,
      p_staff_id: params.staffId,
      p_branch_id: params.branchId,
      p_shift_date: params.shiftDate,
      p_start_time: params.startTime,
      p_end_time: params.endTime,
      p_shift_type: params.shiftType || 'day_shift',
      p_break_minutes: params.breakMinutes || 0,
      p_is_off: params.isOff || false,
      p_notes: params.notes || null,
      p_force: params.force || false
    });
    if (error) {
      console.error('Lỗi RPC rpc_upsert_roster_shift:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      shiftId: res?.shift_id,
      code: res?.code,
      message: res?.message,
      affectedCount: res?.affected_count
    };
  },

  async processLeaveRequestRPC(params: {
    requestId: string;
    action: 'approved' | 'rejected' | 'canceled';
    managerStaffId?: string;
    rejectionReason?: string;
    force?: boolean;
  }): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    appointmentCount?: number;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_process_leave_request', {
      p_request_id: params.requestId,
      p_action: params.action,
      p_manager_staff_id: isUUID(params.managerStaffId) ? params.managerStaffId : null,
      p_rejection_reason: params.rejectionReason || null,
      p_force: params.force || false
    });
    if (error) {
      console.error('Lỗi RPC rpc_process_leave_request:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      code: res?.code,
      message: res?.message,
      appointmentCount: res?.appointment_count
    };
  },

  async processShiftSwapRPC(params: {
    swapId: string;
    action: 'approve' | 'reject';
    managerStaffId?: string;
  }): Promise<{
    success: boolean;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_process_shift_swap', {
      p_swap_id: params.swapId,
      p_action: params.action,
      p_manager_staff_id: isUUID(params.managerStaffId) ? params.managerStaffId : null
    });
    if (error) {
      console.error('Lỗi RPC rpc_process_shift_swap:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      message: res?.message
    };
  },

  async createLeaveRequest(params: {
    orgId: string;
    staffId: string;
    branchId?: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    const { error } = await supabase.from('leave_requests').insert({
      organization_id: params.orgId,
      staff_id: params.staffId,
      branch_id: isUUID(params.branchId) ? params.branchId : null,
      leave_type: params.leaveType,
      start_date: params.startDate,
      end_date: params.endDate,
      reason: params.reason || null,
      status: 'pending'
    });
    if (error) {
      console.error('Lỗi tạo đơn nghỉ phép:', error);
      throw error;
    }
    return true;
  },

  /**
   * 32. P6.3 TIMESHEETS & ATTENDANCE MANAGEMENT
   */
  async getTimesheetsDirectory(params: {
    branchId?: string;
    startDate: string;
    endDate: string;
    staffId?: string;
  }): Promise<{
    records: any[];
    adjustments: any[];
    summary: {
      totalWorking: number;
      totalCompleted: number;
      totalApproved: number;
      totalHours: number;
    };
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        records: [],
        adjustments: [],
        summary: { totalWorking: 0, totalCompleted: 0, totalApproved: 0, totalHours: 0 }
      };
    }
    const validBranchId = isUUID(params.branchId) ? params.branchId : null;
    const validStaffId = isUUID(params.staffId) ? params.staffId : null;

    const { data, error } = await supabase.rpc('rpc_get_timesheets_directory', {
      p_branch_id: validBranchId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_staff_id: validStaffId
    });
    if (error) {
      console.error('Lỗi lấy danh sách bảng công:', error);
      return {
        records: [],
        adjustments: [],
        summary: { totalWorking: 0, totalCompleted: 0, totalApproved: 0, totalHours: 0 }
      };
    }
    const res = data as any;
    return {
      records: (res?.records || []).map((r: any) => ({
        id: r.id,
        staffId: r.staff_id,
        staffName: r.staff_name,
        staffCode: r.staff_code,
        branchId: r.branch_id,
        branchName: r.branch_name,
        workDate: r.work_date,
        checkInAt: r.check_in_at,
        checkOutAt: r.check_out_at,
        isOvernight: r.is_overnight || false,
        actualHours: Number(r.actual_hours) || 0,
        approvedHours: Number(r.approved_hours) || 0,
        status: r.status,
        checkInMethod: r.check_in_method,
        isVerified: r.is_verified,
        notes: r.notes,
        approvedBy: r.approved_by,
        createdAt: r.created_at
      })),
      adjustments: (res?.adjustments || []).map((a: any) => ({
        id: a.id,
        attendanceId: a.attendance_id,
        staffId: a.staff_id,
        staffName: a.staff_name,
        branchId: a.branch_id,
        branchName: a.branch_name,
        workDate: a.work_date,
        originalCheckIn: a.original_check_in,
        originalCheckOut: a.original_check_out,
        requestedCheckIn: a.requested_check_in,
        requestedCheckOut: a.requested_check_out,
        requestedHours: Number(a.requested_hours) || 0,
        reason: a.reason,
        status: a.status,
        createdAt: a.created_at
      })),
      summary: {
        totalWorking: Number(res?.summary?.total_working) || 0,
        totalCompleted: Number(res?.summary?.total_completed) || 0,
        totalApproved: Number(res?.summary?.total_approved) || 0,
        totalHours: Number(res?.summary?.total_hours) || 0
      }
    };
  },

  async checkInAttendanceRPC(params: {
    orgId: string;
    branchId: string;
    staffId: string;
    shiftId?: string;
    method?: string;
    meta?: Record<string, any>;
    notes?: string;
  }): Promise<{
    success: boolean;
    attendanceId?: string;
    checkInAt?: string;
    message?: string;
    isDuplicate?: boolean;
    code?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_check_in_attendance', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_staff_id: params.staffId,
      p_shift_id: isUUID(params.shiftId) ? params.shiftId : null,
      p_method: params.method || 'manual_app',
      p_meta: params.meta || {},
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_check_in_attendance:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      attendanceId: res?.attendance_id,
      checkInAt: res?.check_in_at,
      message: res?.message,
      isDuplicate: res?.is_duplicate,
      code: res?.code
    };
  },

  async checkOutAttendanceRPC(params: {
    attendanceId: string;
    method?: string;
    meta?: Record<string, any>;
    notes?: string;
  }): Promise<{
    success: boolean;
    attendanceId?: string;
    checkOutAt?: string;
    actualHours?: number;
    isOvernight?: boolean;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_check_out_attendance', {
      p_attendance_id: params.attendanceId,
      p_method: params.method || 'manual_app',
      p_meta: params.meta || {},
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_check_out_attendance:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      attendanceId: res?.attendance_id,
      checkOutAt: res?.check_out_at,
      actualHours: Number(res?.actual_hours) || 0,
      isOvernight: res?.is_overnight || false,
      message: res?.message
    };
  },

  async requestAttendanceAdjustmentRPC(params: {
    orgId: string;
    staffId: string;
    branchId: string;
    workDate: string;
    requestedCheckIn: string;
    requestedCheckOut: string;
    reason: string;
    attendanceId?: string;
  }): Promise<{
    success: boolean;
    adjustmentId?: string;
    requestedHours?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_request_attendance_adjustment', {
      p_org_id: params.orgId,
      p_staff_id: params.staffId,
      p_branch_id: params.branchId,
      p_work_date: params.workDate,
      p_requested_check_in: params.requestedCheckIn,
      p_requested_check_out: params.requestedCheckOut,
      p_reason: params.reason,
      p_attendance_id: isUUID(params.attendanceId) ? params.attendanceId : null
    });
    if (error) {
      console.error('Lỗi RPC rpc_request_attendance_adjustment:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      adjustmentId: res?.adjustment_id,
      requestedHours: Number(res?.requested_hours) || 0,
      message: res?.message
    };
  },

  async processAttendanceAdjustmentRPC(params: {
    adjustmentId: string;
    action: 'approved' | 'rejected';
    managerStaffId?: string;
    rejectionReason?: string;
  }): Promise<{
    success: boolean;
    attendanceId?: string;
    approvedHours?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_process_attendance_adjustment', {
      p_adjustment_id: params.adjustmentId,
      p_action: params.action,
      p_manager_staff_id: isUUID(params.managerStaffId) ? params.managerStaffId : null,
      p_rejection_reason: params.rejectionReason || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_process_attendance_adjustment:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      attendanceId: res?.attendance_id,
      approvedHours: Number(res?.approved_hours) || 0,
      message: res?.message
    };
  },

  async approveTimesheetRecordRPC(params: {
    attendanceId: string;
    approvedHours: number;
    managerStaffId?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    attendanceId?: string;
    approvedHours?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_approve_timesheet_record', {
      p_attendance_id: params.attendanceId,
      p_approved_hours: params.approvedHours,
      p_manager_staff_id: isUUID(params.managerStaffId) ? params.managerStaffId : null,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_approve_timesheet_record:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      attendanceId: res?.attendance_id,
      approvedHours: Number(res?.approved_hours) || 0,
      message: res?.message
    };
  },

  /**
   * 33. P6.4 COMMISSIONS & PAYROLL MANAGEMENT
   */
  async getPayrollOverview(params: {
    branchId?: string;
    periodId?: string;
  }): Promise<{
    periods: any[];
    selectedPeriodId?: string;
    records: any[];
    commissions: any[];
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { periods: [], records: [], commissions: [] };
    }
    const validBranchId = isUUID(params.branchId) ? params.branchId : null;
    const validPeriodId = isUUID(params.periodId) ? params.periodId : null;

    const { data, error } = await supabase.rpc('rpc_get_payroll_overview', {
      p_branch_id: validBranchId,
      p_period_id: validPeriodId
    });
    if (error) {
      console.error('Lỗi lấy tổng quan bảng lương:', error);
      return { periods: [], records: [], commissions: [] };
    }
    const res = data as any;
    return {
      periods: (res?.periods || []).map((p: any) => ({
        id: p.id,
        periodName: p.period_name,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
        totalStaff: p.total_staff,
        totalBaseSalary: Number(p.total_base_salary) || 0,
        totalCommission: Number(p.total_commission) || 0,
        totalAllowance: Number(p.total_allowance) || 0,
        totalDeduction: Number(p.total_deduction) || 0,
        totalNetSalary: Number(p.total_net_salary) || 0,
        createdAt: p.created_at
      })),
      selectedPeriodId: res?.selected_period_id,
      records: (res?.records || []).map((r: any) => ({
        id: r.id,
        payrollPeriodId: r.payroll_period_id,
        staffId: r.staff_id,
        staffName: r.staff_name,
        staffCode: r.staff_code,
        branchId: r.branch_id,
        baseSalary: Number(r.base_salary) || 0,
        actualWorkingHours: Number(r.actual_working_hours) || 0,
        salaryByHours: Number(r.salary_by_hours) || 0,
        commissionTotal: Number(r.commission_total) || 0,
        allowance: Number(r.allowance) || 0,
        deduction: Number(r.deduction) || 0,
        netSalary: Number(r.net_salary) || 0,
        status: r.status,
        adjustmentNotes: r.adjustment_notes,
        paymentMethod: r.payment_method,
        paidAt: r.paid_at
      })),
      commissions: (res?.commissions || []).map((c: any) => ({
        id: c.id,
        staffId: c.staff_id,
        staffName: c.staff_name,
        serviceOrProductName: c.service_or_product_name,
        itemType: c.item_type,
        itemRevenue: Number(c.item_revenue) || 0,
        appliedRate: Number(c.applied_rate) || 0,
        finalCommission: Number(c.final_commission) || 0,
        status: c.status,
        occurredAt: c.occurred_at
      }))
    };
  },

  async generatePayrollPeriodRPC(params: {
    orgId: string;
    branchId: string;
    periodName: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    success: boolean;
    payrollPeriodId?: string;
    totalStaff?: number;
    totalNetSalary?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_generate_payroll_period', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_period_name: params.periodName,
      p_start_date: params.startDate,
      p_end_date: params.endDate
    });
    if (error) {
      console.error('Lỗi RPC rpc_generate_payroll_period:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      payrollPeriodId: res?.payroll_period_id,
      totalStaff: res?.total_staff,
      totalNetSalary: Number(res?.total_net_salary) || 0,
      message: res?.message
    };
  },

  async updatePayrollRecordAdjustmentsRPC(params: {
    recordId: string;
    allowance: number;
    deduction: number;
    notes?: string;
  }): Promise<{
    success: boolean;
    newNetSalary?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_update_payroll_record_adjustments', {
      p_record_id: params.recordId,
      p_allowance: params.allowance,
      p_deduction: params.deduction,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_update_payroll_record_adjustments:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      newNetSalary: Number(res?.new_net_salary) || 0,
      message: res?.message
    };
  },

  async processPayrollPeriodStatusRPC(params: {
    periodId: string;
    action: 'lock' | 'approve' | 'pay';
    managerStaffId?: string;
  }): Promise<{
    success: boolean;
    message?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_process_payroll_period_status', {
      p_period_id: params.periodId,
      p_action: params.action,
      p_manager_staff_id: isUUID(params.managerStaffId) ? params.managerStaffId : null
    });
    if (error) {
      console.error('Lỗi RPC rpc_process_payroll_period_status:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      message: res?.message
    };
  },

  /**
   * P7.1 BI ANALYTICS: Báo cáo Bán Hàng & Dòng Tiền Đa Chi Nhánh
   */
  async getSalesAndCashflowReport(params: {
    orgId: string;
    branchId?: string | null;
    startDate?: string;
    endDate?: string;
    paymentMethod?: string | null;
  }): Promise<SalesCashflowReport | null> {
    if (!isSupabaseConfigured || !supabase) {
      return null;
    }
    const { data, error } = await supabase.rpc('rpc_get_sales_and_cashflow_report', {
      p_org_id: params.orgId,
      p_branch_id: isUUID(params.branchId) ? params.branchId : null,
      p_start_date: params.startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      p_end_date: params.endDate || new Date().toISOString().split('T')[0],
      p_payment_method: params.paymentMethod || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_get_sales_and_cashflow_report:', error);
      throw error;
    }
    const res = data as any;
    if (!res) return null;

    return {
      period: {
        startDate: res.period?.start_date,
        endDate: res.period?.end_date,
        timezone: res.period?.timezone || 'Asia/Ho_Chi_Minh (UTC+7)'
      },
      salesSummary: {
        grossSales: Number(res.sales_summary?.gross_sales) || 0,
        totalDiscount: Number(res.sales_summary?.total_discount) || 0,
        netInvoicedSales: Number(res.sales_summary?.net_invoiced_sales) || 0,
        invoiceCount: Number(res.sales_summary?.invoice_count) || 0,
        avgOrderValue: Number(res.sales_summary?.avg_order_value) || 0,
        newCustomerDebt: Number(res.sales_summary?.new_customer_debt) || 0,
        packageCourseSales: Number(res.sales_summary?.package_course_sales) || 0
      },
      cashflowSummary: {
        confirmedCashCollected: Number(res.cashflow_summary?.confirmed_cash_collected) || 0,
        pendingBankTransfers: Number(res.cashflow_summary?.pending_bank_transfers) || 0,
        newDepositsCollected: Number(res.cashflow_summary?.new_deposits_collected) || 0,
        depositRedeemed: Number(res.cashflow_summary?.deposit_redeemed) || 0,
        debtRecovered: Number(res.cashflow_summary?.debt_recovered) || 0,
        totalRefundsPaid: Number(res.cashflow_summary?.total_refunds_paid) || 0,
        netSalesCashflow: Number(res.cashflow_summary?.net_sales_cashflow) || 0
      },
      methodBreakdown: (res.method_breakdown || []).map((m: any) => ({
        paymentMethod: m.payment_method,
        totalAmount: Number(m.total_amount) || 0,
        transactionCount: Number(m.transaction_count) || 0
      })),
      earnedSummary: {
        totalSessionsPerformed: Number(res.earned_summary?.total_sessions_performed) || 0,
        earnedSessionRevenue: Number(res.earned_summary?.earned_session_revenue) || 0
      },
      invoicesDrilldown: (res.invoices_drilldown || []).map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        branchId: inv.branch_id,
        branchName: inv.branch_name,
        customerName: inv.customer_name,
        customerPhone: inv.customer_phone,
        totalAmount: Number(inv.total_amount) || 0,
        paidAmount: Number(inv.paid_amount) || 0,
        debtAmount: Number(inv.debt_amount) || 0,
        status: inv.status,
        createdAt: inv.created_at
      })),
      paymentsDrilldown: (res.payments_drilldown || []).map((pay: any) => ({
        id: pay.id,
        paymentNumber: pay.payment_number,
        branchId: pay.branch_id,
        branchName: pay.branch_name,
        customerName: pay.customer_name,
        amount: Number(pay.amount) || 0,
        paymentMethod: pay.payment_method,
        paymentType: pay.payment_type,
        reconciliationStatus: pay.reconciliation_status,
        note: pay.note,
        createdAt: pay.created_at
      }))
    };
  },

  /**
   * P7.2: Ghi nhận tiêu hao vật tư ca dịch vụ (Trừ kho tức thì, snapshot giá vốn)
   */
  async recordServiceMaterialUsage(params: {
    orgId: string;
    branchId: string;
    serviceId: string;
    staffId?: string | null;
    sessionDeductionId?: string | null;
    saleId?: string | null;
    appointmentId?: string | null;
    items: Array<{
      productId: string;
      actualQuantity: number;
      unitOfMeasure?: string;
      lotNumber?: string;
    }>;
    idempotencyKey?: string;
    notes?: string;
  }): Promise<{ success: boolean; itemsDeducted?: number; totalMaterialCost?: number; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, message: 'Offline mode simulation' };
    }
    const { data, error } = await supabase.rpc('rpc_record_service_material_usage', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_service_id: params.serviceId,
      p_staff_id: isUUID(params.staffId) ? params.staffId : null,
      p_session_deduction_id: isUUID(params.sessionDeductionId) ? params.sessionDeductionId : null,
      p_sale_id: isUUID(params.saleId) ? params.saleId : null,
      p_appointment_id: isUUID(params.appointmentId) ? params.appointmentId : null,
      p_items: params.items.map(i => ({
        product_id: i.productId,
        actual_quantity: i.actualQuantity,
        unit_of_measure: i.unitOfMeasure || 'don_vi',
        lot_number: i.lotNumber || null
      })),
      p_idempotency_key: params.idempotencyKey || null,
      p_notes: params.notes || null
    });
    if (error) {
      console.error('Lỗi RPC rpc_record_service_material_usage:', error);
      throw error;
    }
    const res = data as any;
    return {
      success: res?.success ?? false,
      itemsDeducted: res?.items_deducted,
      totalMaterialCost: res?.total_material_cost,
      message: res?.message
    };
  },

  /**
   * P7.2 BI ANALYTICS: Báo cáo Giá Vốn (COGS), Định Mức Vật Tư & Chênh Lệch Lợi Nhuận Trực Tiếp
   */
  async getCogsAndGrossProfitReport(params: {
    orgId: string;
    branchId?: string | null;
    startDate?: string;
    endDate?: string;
    serviceId?: string | null;
    category?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<CogsAndProfitReport | null> {
    if (!isSupabaseConfigured || !supabase) {
      return null;
    }
    const { data, error } = await supabase.rpc('rpc_get_cogs_and_gross_profit_report', {
      p_org_id: params.orgId,
      p_branch_id: isUUID(params.branchId) ? params.branchId : null,
      p_start_date: params.startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      p_end_date: params.endDate || new Date().toISOString().split('T')[0],
      p_service_id: isUUID(params.serviceId) ? params.serviceId : null,
      p_category: params.category || null,
      p_page: params.page || 1,
      p_page_size: params.pageSize || 50
    });
    if (error) {
      console.error('Lỗi RPC rpc_get_cogs_and_gross_profit_report:', error);
      throw error;
    }
    const res = data as any;
    if (!res) return null;

    return {
      period: {
        startDate: res.period?.start_date,
        endDate: res.period?.end_date,
        timezone: res.period?.timezone || 'Asia/Ho_Chi_Minh (UTC+7)'
      },
      summary: {
        recognizedRevenue: Number(res.summary?.recognized_revenue) || 0,
        cogsProducts: Number(res.summary?.cogs_products) || 0,
        materialCost: Number(res.summary?.material_cost) || 0,
        directCommission: Number(res.summary?.direct_commission) || 0,
        directContribution: Number(res.summary?.direct_contribution) || 0,
        marginPct: res.summary?.margin_pct !== null && res.summary?.margin_pct !== undefined ? Number(res.summary?.margin_pct) : null,
        missingCostWarningCount: Number(res.summary?.missing_cost_warning_count) || 0,
        disclaimer: res.summary?.disclaimer || ''
      },
      serviceBreakdown: (res.service_breakdown || []).map((sb: any) => ({
        serviceId: sb.service_id,
        serviceName: sb.service_name,
        category: sb.category,
        sessionCount: Number(sb.session_count) || 0,
        recognizedRevenue: Number(sb.recognized_revenue) || 0,
        materialCost: Number(sb.material_cost) || 0,
        directContribution: Number(sb.direct_contribution) || 0,
        marginPct: sb.margin_pct !== null && sb.margin_pct !== undefined ? Number(sb.margin_pct) : null
      })),
      varianceBreakdown: {
        bomVariance: Number(res.variance_breakdown?.bom_variance) || 0,
        auditShrinkage: Number(res.variance_breakdown?.audit_shrinkage) || 0,
        damagedExpiredLoss: Number(res.variance_breakdown?.damaged_expired_loss) || 0,
        transferVariance: Number(res.variance_breakdown?.transfer_variance) || 0,
        unassignedUsage: Number(res.variance_breakdown?.unassigned_usage) || 0
      },
      drilldown: {
        totalRecords: Number(res.drilldown?.total_records) || 0,
        page: Number(res.drilldown?.page) || 1,
        pageSize: Number(res.drilldown?.page_size) || 50,
        items: (res.drilldown?.items || []).map((item: any) => ({
          id: item.id,
          usedAt: item.used_at,
          branchName: item.branch_name,
          serviceName: item.service_name,
          productName: item.product_name,
          standardQty: Number(item.standard_qty) || 0,
          actualQty: Number(item.actual_qty) || 0,
          unit: item.unit,
          costPriceSnapshot: Number(item.cost_price_snapshot) || 0,
          totalCost: Number(item.total_cost) || 0,
          isMissingCostSnapshot: Boolean(item.is_missing_cost_snapshot),
          performerName: item.performer_name,
          notes: item.notes
        }))
      }
    };
  },

  async getStaffAndResourceUtilizationReport(params: {
    orgId: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    staffId?: string;
    resourceId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<StaffAndResourceUtilizationReport | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    const { data, error } = await supabase.rpc('rpc_get_staff_and_resource_utilization_report', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId || null,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_staff_id: params.staffId || null,
      p_resource_id: params.resourceId || null,
      p_page: params.page || 1,
      p_page_size: params.pageSize || 50
    });

    if (error) {
      console.error('Lỗi khi lấy báo cáo hiệu suất nhân sự và tài nguyên P7.3:', error);
      throw error;
    }
    const res = data as any;
    if (!res) return null;

    return {
      period: {
        startDate: res.start_date,
        endDate: res.end_date,
        timezone: res.timezone || 'Asia/Ho_Chi_Minh (UTC+7)'
      },
      summary: {
        totalSalesRepRevenue: Number(res.summary?.total_sales_rep_revenue) || 0,
        totalServiceExecRevenue: Number(res.summary?.total_service_exec_revenue) || 0,
        totalSessionsCount: Number(res.summary?.total_sessions_count) || 0,
        totalHandsOnHours: Number(res.summary?.total_hands_on_hours) || 0,
        totalApprovedWorkHours: Number(res.summary?.total_approved_work_hours) || 0,
        overallUtilizationPct: res.summary?.overall_utilization_pct !== null && res.summary?.overall_utilization_pct !== undefined ? Number(res.summary?.overall_utilization_pct) : null,
        disclaimer: res.summary?.disclaimer || ''
      },
      staffMetrics: (res.staff_metrics || []).map((sm: any) => ({
        staffId: sm.staff_id,
        fullName: sm.full_name,
        jobTitle: sm.job_title || 'Nhân viên',
        primaryBranchName: sm.primary_branch_name || 'Chi nhánh chính',
        salesInvoiced: Number(sm.sales_invoiced) || 0,
        serviceExecutionRevenue: Number(sm.service_execution_revenue) || 0,
        sessionsCompletedCount: Number(sm.sessions_completed_count) || 0,
        uniqueClientsServed: Number(sm.unique_clients_served) || 0,
        handsOnHours: Number(sm.hands_on_hours) || 0,
        approvedWorkHours: Number(sm.approved_work_hours) || 0,
        utilizationPct: sm.utilization_pct !== null && sm.utilization_pct !== undefined ? Number(sm.utilization_pct) : null,
        ratingAvg: sm.rating_avg !== null && sm.rating_avg !== undefined ? Number(sm.rating_avg) : null,
        ratingCount: Number(sm.rating_count) || 0,
        ratingStatus: sm.rating_status || 'Chưa triển khai nguồn dữ liệu đánh giá'
      })),
      resourceMetrics: (res.resource_metrics || []).map((rm: any) => ({
        resourceId: rm.resource_id,
        code: rm.code,
        resourceName: rm.resource_name,
        resourceType: rm.resource_type,
        capacity: Number(rm.capacity) || 1,
        branchName: rm.branch_name,
        availableSeatHours: Number(rm.available_seat_hours) || 0,
        maintenanceSeatHours: Number(rm.maintenance_seat_hours) || 0,
        bookedSeatHours: Number(rm.booked_seat_hours) || 0,
        actualUsedSeatHours: Number(rm.actual_used_seat_hours) || 0,
        bookedUtilizationPct: rm.booked_utilization_pct !== null && rm.booked_utilization_pct !== undefined ? Number(rm.booked_utilization_pct) : null,
        actualUtilizationPct: rm.actual_utilization_pct !== null && rm.actual_utilization_pct !== undefined ? Number(rm.actual_utilization_pct) : null
      })),
      drilldown: {
        totalRecords: Number(res.pagination?.total_records) || 0,
        page: Number(res.pagination?.page) || 1,
        pageSize: Number(res.pagination?.page_size) || 50,
        items: (res.drilldown_sessions || []).map((item: any) => ({
          sessionId: item.session_id,
          performedAt: item.performed_at,
          branchName: item.branch_name,
          customerName: item.customer_name,
          customerPhone: item.customer_phone,
          serviceName: item.service_name,
          staffName: item.staff_name,
          sessionSource: item.session_source,
          allocatedRevenue: Number(item.allocated_revenue) || 0,
          durationHours: Number(item.duration_hours) || 0
        }))
      }
    };
  },

  async getCustomerRetentionAndCohortReport(
    orgId: string,
    branchId?: string,
    startDate?: string,
    endDate?: string,
    segmentFilter?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<CustomerRetentionAndCohortReport | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    const { data, error } = await supabase.rpc('rpc_get_customer_retention_and_cohort_report', {
      p_org_id: orgId,
      p_branch_id: branchId || null,
      p_start_date: startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      p_end_date: endDate || new Date().toISOString().split('T')[0],
      p_segment_filter: segmentFilter || 'all',
      p_page: page,
      p_page_size: pageSize
    });

    if (error) {
      console.error('Error fetching P7.4 customer retention report:', error);
      throw error;
    }

    const res = data as any;
    return {
      timezone: res.timezone || 'Asia/Ho_Chi_Minh (UTC+7)',
      startDate: res.start_date,
      endDate: res.end_date,
      summary: {
        totalCustomersInSystem: Number(res.summary?.total_customers_in_system) || 0,
        totalActivePeriodBuyers: Number(res.summary?.total_active_period_buyers) || 0,
        totalActivePeriodServed: Number(res.summary?.total_active_period_served) || 0,
        newOrgCustomers: Number(res.summary?.new_org_customers) || 0,
        newBranchCustomers: Number(res.summary?.new_branch_customers) || 0,
        returningBuyers: Number(res.summary?.returning_buyers) || 0,
        returningServedOnly: Number(res.summary?.returning_served_only) || 0,
        repurchaseRatePct: res.summary?.repurchase_rate_pct !== null && res.summary?.repurchase_rate_pct !== undefined ? Number(res.summary?.repurchase_rate_pct) : null,
        disclaimer: res.summary?.disclaimer || ''
      },
      rfmSegments: (res.rfm_segments || []).map((seg: any) => ({
        segmentKey: seg.segment_key,
        segmentName: seg.segment_name,
        customerCount: Number(seg.customer_count) || 0,
        totalHistoricalSpend: Number(seg.total_historical_spend) || 0,
        avgRecencyDays: seg.avg_recency_days !== null && seg.avg_recency_days !== undefined ? Number(seg.avg_recency_days) : null
      })),
      cohortServiceRetention: (res.cohort_service_retention || []).map((c: any) => ({
        cohortMonth: c.cohort_month,
        totalCohortCustomers: Number(c.total_cohort_customers) || 0,
        retention30d: {
          eligible: Number(c.retention_30d?.eligible) || 0,
          returned: Number(c.retention_30d?.returned) || 0,
          pct: c.retention_30d?.pct !== null && c.retention_30d?.pct !== undefined ? Number(c.retention_30d?.pct) : null,
          status: c.retention_30d?.status || 'ready'
        },
        retention60d: {
          eligible: Number(c.retention_60d?.eligible) || 0,
          returned: Number(c.retention_60d?.returned) || 0,
          pct: c.retention_60d?.pct !== null && c.retention_60d?.pct !== undefined ? Number(c.retention_60d?.pct) : null,
          status: c.retention_60d?.status || 'ready'
        },
        retention90d: {
          eligible: Number(c.retention_90d?.eligible) || 0,
          returned: Number(c.retention_90d?.returned) || 0,
          pct: c.retention_90d?.pct !== null && c.retention_90d?.pct !== undefined ? Number(c.retention_90d?.pct) : null,
          status: c.retention_90d?.status || 'ready'
        }
      })),
      cohortRepurchaseRetention: (res.cohort_repurchase_retention || []).map((c: any) => ({
        cohortMonth: c.cohort_month,
        totalCohortCustomers: Number(c.total_cohort_customers) || 0,
        repurchase30d: {
          eligible: Number(c.repurchase_30d?.eligible) || 0,
          repurchased: Number(c.repurchase_30d?.repurchased) || 0,
          pct: c.repurchase_30d?.pct !== null && c.repurchase_30d?.pct !== undefined ? Number(c.repurchase_30d?.pct) : null,
          status: c.repurchase_30d?.status || 'ready'
        },
        repurchase60d: {
          eligible: Number(c.repurchase_60d?.eligible) || 0,
          repurchased: Number(c.repurchase_60d?.repurchased) || 0,
          pct: c.repurchase_60d?.pct !== null && c.repurchase_60d?.pct !== undefined ? Number(c.repurchase_60d?.pct) : null,
          status: c.repurchase_60d?.status || 'ready'
        },
        repurchase90d: {
          eligible: Number(c.repurchase_90d?.eligible) || 0,
          repurchased: Number(c.repurchase_90d?.repurchased) || 0,
          pct: c.repurchase_90d?.pct !== null && c.repurchase_90d?.pct !== undefined ? Number(c.repurchase_90d?.pct) : null,
          status: c.repurchase_90d?.status || 'ready'
        }
      })),
      drilldown: {
        totalRecords: Number(res.pagination?.total_records) || 0,
        page: Number(res.pagination?.page) || 1,
        pageSize: Number(res.pagination?.page_size) || 50,
        items: (res.customer_drilldown || []).map((item: any) => ({
          customerId: item.customer_id,
          fullName: item.full_name,
          phone: item.phone,
          tier: item.tier || 'standard',
          registeredAt: item.registered_at,
          firstPurchaseOrgAt: item.first_purchase_org_at,
          firstServiceAt: item.first_service_at,
          lastPurchaseAt: item.last_purchase_at,
          lastServiceAt: item.last_service_at,
          recencyDays: item.recency_days !== null && item.recency_days !== undefined ? Number(item.recency_days) : null,
          periodPurchaseCount: Number(item.period_purchase_count) || 0,
          periodServiceCount: Number(item.period_service_count) || 0,
          historicalNetSpend: Number(item.historical_net_spend) || 0,
          activeRemainingSessions: Number(item.active_remaining_sessions) || 0,
          hasUpcomingAppointment: Boolean(item.has_upcoming_appointment),
          periodCustomerType: item.period_customer_type,
          rfmSegment: item.rfm_segment,
          careRecommendation: item.care_recommendation || 'Bình thường'
        }))
      }
    };
  }
};







