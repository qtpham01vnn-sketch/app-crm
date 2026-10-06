import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface ExpenseCategory {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  group_type: string;
  description?: string;
  is_active: boolean;
}

export interface FinancialAccount {
  id: string;
  organization_id: string;
  branch_id?: string;
  account_code: string;
  account_name: string;
  account_type: 'cash' | 'bank' | 'e_wallet';
  bank_name?: string;
  bank_account_number?: string;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface ExpenseVoucher {
  id: string;
  organization_id: string;
  branch_id: string;
  voucher_number: string;
  category_id?: string;
  category_name: string;
  title: string;
  amount: number;
  account_id: string;
  payment_method: 'cash' | 'bank_transfer';
  paid_to?: string;
  expense_date: string;
  status: 'draft' | 'approved' | 'disbursed' | 'rejected' | 'cancelled' | 'reversed';
  attachment_urls?: string[];
  notes?: string;
  created_by_staff_id?: string;
  approved_by_staff_id?: string;
  approved_at?: string;
  disbursed_by_staff_id?: string;
  disbursed_at?: string;
  created_at: string;
}

export interface CashflowEntry {
  id: string;
  branch_id: string;
  account_id: string;
  flow_type: 'inflow' | 'outflow';
  transaction_category: string;
  reference_type: string;
  reference_code?: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  payment_method: string;
  occurred_at: string;
  notes?: string;
}

export interface OperatingPnLReport {
  period: { start_date: string; end_date: string };
  invoicing_and_cashflow_kpi?: {
    gross_sales: number;
    total_discounts: number;
    net_invoiced_sales: number;
    cash_collected: number;
    cash_refunded: number;
    net_cash_collected: number;
  };
  recognized_revenue_kpi?: {
    recognized_product_sales: number;
    recognized_single_services: number;
    earned_treatment_revenue: number;
    total_recognized_revenue: number;
  };
  sales_and_revenue?: {
    gross_sales: number;
    net_invoiced_sales: number;
    cash_collected: number;
  };
  cogs_and_gross_profit: {
    cogs_products?: number;
    material_cost?: number;
    total_cogs: number;
    gross_profit_after_cogs: number;
    gross_profit_margin_pct: number;
  };
  operating_deductions: {
    staff_commissions: number;
    operating_expenses_gross?: number;
    expense_reversals?: number;
    net_operating_expenses?: number;
    operating_expenses_opex?: number;
  };
  operating_surplus_preliminary: {
    amount: number;
    operating_margin_pct: number;
  };
  expense_categories: Array<{
    category_name: string;
    total_amount: number;
    voucher_count: number;
  }>;
}

export const expenseService = {
  /** Lấy danh mục chi phí (Bắt buộc ném lỗi nếu truy vấn thất bại trong live mode) */
  async getCategories(orgId: string): Promise<ExpenseCategory[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase chưa được cấu hình. Vui lòng kiểm tra kết nối.');
    }
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');
    if (error) {
      console.error('Lỗi truy vấn expense_categories:', error);
      throw new Error(`Không thể tải danh mục chi phí: ${error.message}`);
    }
    return data || [];
  },

  /** Lấy danh sách tài khoản quỹ */
  async getAccounts(orgId: string, branchId?: string): Promise<FinancialAccount[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase chưa được cấu hình.');
    }
    let query = supabase
      .from('financial_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    
    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data, error } = await query.order('account_type');
    if (error) {
      console.error('Lỗi truy vấn financial_accounts:', error);
      throw new Error(`Không thể tải danh sách tài khoản quỹ: ${error.message}`);
    }
    return data || [];
  },

  /** Lấy danh sách phiếu chi */
  async getVouchers(orgId: string, branchId?: string, startDate?: string, endDate?: string): Promise<ExpenseVoucher[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase chưa được cấu hình.');
    }
    let query = supabase
      .from('expense_vouchers')
      .select('*')
      .eq('organization_id', orgId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    if (startDate) {
      query = query.gte('expense_date', startDate);
    }
    if (endDate) {
      query = query.lte('expense_date', endDate);
    }

    const { data, error } = await query.order('expense_date', { ascending: false });
    if (error) {
      console.error('Lỗi truy vấn expense_vouchers:', error);
      throw new Error(`Không thể tải danh sách phiếu chi: ${error.message}`);
    }
    return data || [];
  },

  /** Tạo phiếu chi qua RPC */
  async createVoucher(params: {
    orgId: string;
    branchId: string;
    categoryId: string;
    accountId: string;
    title: string;
    amount: number;
    paymentMethod: 'cash' | 'bank_transfer';
    paidTo?: string;
    expenseDate: string;
    notes?: string;
    attachmentUrls?: string[];
    idempotencyKey?: string;
  }): Promise<{ success: boolean; voucher_id?: string; voucher_number?: string; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Chưa cấu hình Supabase.');
    }
    const { data, error } = await supabase.rpc('rpc_create_expense_voucher', {
      p_org_id: params.orgId,
      p_branch_id: params.branchId,
      p_category_id: params.categoryId,
      p_account_id: params.accountId,
      p_title: params.title,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_paid_to: params.paidTo || null,
      p_expense_date: params.expenseDate,
      p_notes: params.notes || null,
      p_attachment_urls: params.attachmentUrls || [],
      p_idempotency_key: params.idempotencyKey || `exp_${Date.now()}`
    });

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  /** Phê duyệt và thực chi tiền (ACID Locking) */
  async disburseVoucher(voucherId: string, idempotencyKey?: string): Promise<{ success: boolean; voucher_number?: string; balance_before?: number; balance_after?: number; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Chưa cấu hình Supabase.');
    }
    const { data, error } = await supabase.rpc('rpc_disburse_expense_voucher', {
      p_voucher_id: voucherId,
      p_idempotency_key: idempotencyKey || `disb_${voucherId}_${Date.now()}`
    });
    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  /** Hủy hoặc hoàn phiếu chi bằng bút toán đảo */
  async cancelOrReverseVoucher(voucherId: string, reason: string): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Chưa cấu hình Supabase.');
    }
    const { data, error } = await supabase.rpc('rpc_cancel_or_reverse_expense_voucher', {
      p_voucher_id: voucherId,
      p_reason: reason
    });
    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  /** Lấy Báo cáo Kết quả Kinh doanh Vận hành P&L */
  async getOperatingPnLReport(orgId: string, branchId?: string, startDate?: string, endDate?: string): Promise<OperatingPnLReport> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Chưa cấu hình Supabase.');
    }
    const { data, error } = await supabase.rpc('rpc_get_operating_pnl_report', {
      p_org_id: orgId,
      p_branch_id: branchId || null,
      p_start_date: startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      p_end_date: endDate || new Date().toISOString().slice(0, 10)
    });
    if (error) {
      throw new Error(`Lỗi báo cáo P&L: ${error.message}`);
    }
    return data;
  },

  /** Lấy Sổ cái dòng tiền */
  async getCashflowLedger(orgId: string, branchId?: string, limit = 50): Promise<CashflowEntry[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Chưa cấu hình Supabase.');
    }
    let query = supabase
      .from('cashflow_ledger')
      .select('*')
      .eq('organization_id', orgId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query.order('occurred_at', { ascending: false }).limit(limit);
    if (error) {
      throw new Error(`Không thể tải sổ cái dòng tiền: ${error.message}`);
    }
    return data || [];
  }
};
