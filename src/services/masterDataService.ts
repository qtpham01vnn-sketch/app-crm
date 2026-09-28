import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Customer, Service, Product, PackageCombo, Supplier, Promotion, Staff, Branch } from '../types';

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
    promo: { code: string; title: string; discountType: 'pct' | 'fixed'; discountValue: number; minOrderValue: number; usageLimit?: number; startDate: string; endDate: string },
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
      discountValue: Number(data.discount_value),
      minOrderValue: Number(data.min_order_value || 0),
      usageLimit: data.usage_limit || 100,
      usedCount: data.used_count || 0,
      startDate: data.start_date || promo.startDate,
      endDate: data.end_date || promo.endDate,
      isActive: data.is_active
    };
  },

  /**
   * 7. STAFF PROFILES & MEMBERSHIPS
   */
  async getStaff(): Promise<Staff[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase
      .from('staff_profiles')
      .select(`
        id,
        organization_id,
        full_name,
        code,
        phone,
        email,
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

    return (data || []).map((s) => {
      const membership = (s as unknown as { organization_memberships: Array<{ role: string; assigned_branch_ids: string[] }> }).organization_memberships?.[0];
      const branchIds = membership?.assigned_branch_ids || [];
      return {
        id: s.id,
        orgId: s.organization_id,
        name: s.full_name,
        code: s.code,
        email: s.email || '',
        role: (membership?.role || 'technician_doctor') as Staff['role'],
        branchIds: branchIds,
        primaryBranchId: branchIds[0] || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        baseSalary: 8000000,
        commissionRate: 10,
        status: 'active',
        phone: s.phone
      };
    });
  }
};
