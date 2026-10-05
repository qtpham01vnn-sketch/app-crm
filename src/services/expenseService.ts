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
  account_id?: string;
  payment_method: 'cash' | 'bank_transfer';
  paid_to?: string;
  expense_date: string;
  status: 'draft' | 'approved' | 'rejected' | 'cancelled';
  attachment_urls?: string[];
  notes?: string;
  created_by_staff_id?: string;
  approved_by_staff_id?: string;
  approved_at?: string;
  created_at: string;
}

export interface CashflowEntry {
  id: string;
  branch_id: string;
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

export interface PnLSummary {
  period: { start_date: string; end_date: string };
  pnl: {
    total_revenue: number;
    total_cogs: number;
    gross_profit: number;
    gross_profit_margin: number;
    total_expenses: number;
    net_operating_profit: number;
    net_profit_margin: number;
  };
  cashflow: {
    cash_inflow: number;
    cash_outflow: number;
    net_cashflow: number;
  };
  expense_categories: Array<{
    category_name: string;
    total_amount: number;
    voucher_count: number;
  }>;
}

export const expenseService = {
  // 1. Lấy danh mục chi phí
  async getCategories(orgId: string): Promise<ExpenseCategory[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [
        { id: '1', organization_id: orgId, code: 'rent', name: 'Mặt Bằng & Cơ Sở', group_type: 'operating', is_active: true },
        { id: '2', organization_id: orgId, code: 'utilities', name: 'Điện, Nước & Internet', group_type: 'operating', is_active: true },
        { id: '3', organization_id: orgId, code: 'marketing', name: 'Marketing & Quảng Cáo', group_type: 'marketing', is_active: true },
        { id: '4', organization_id: orgId, code: 'supplies', name: 'Vật Tư Tiêu Hao', group_type: 'operating', is_active: true },
        { id: '5', organization_id: orgId, code: 'equipment', name: 'Bảo Trì Thiết Bị', group_type: 'operating', is_active: true },
        { id: '6', organization_id: orgId, code: 'other', name: 'Chi Phí Khác', group_type: 'operating', is_active: true }
      ];
    }
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    } catch {
      return [
        { id: '1', organization_id: orgId, code: 'rent', name: 'Mặt Bằng & Cơ Sở', group_type: 'operating', is_active: true },
        { id: '2', organization_id: orgId, code: 'utilities', name: 'Điện, Nước & Internet', group_type: 'operating', is_active: true },
        { id: '3', organization_id: orgId, code: 'marketing', name: 'Marketing & Quảng Cáo', group_type: 'marketing', is_active: true },
        { id: '4', organization_id: orgId, code: 'supplies', name: 'Vật Tư Tiêu Hao', group_type: 'operating', is_active: true },
        { id: '5', organization_id: orgId, code: 'equipment', name: 'Bảo Trì Thiết Bị', group_type: 'operating', is_active: true },
        { id: '6', organization_id: orgId, code: 'other', name: 'Chi Phí Khác', group_type: 'operating', is_active: true }
      ];
    }
  },

  // 2. Lấy danh sách tài khoản quỹ
  async getAccounts(orgId: string, branchId?: string): Promise<FinancialAccount[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      let query = supabase
        .from('financial_accounts')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true);
      
      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data, error } = await query.order('account_type');
      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  },

  // 3. Lấy danh sách phiếu chi
  async getVouchers(orgId: string, branchId?: string, startDate?: string, endDate?: string): Promise<ExpenseVoucher[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
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
      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  },

  // 4. Tạo phiếu chi qua RPC
  async createVoucher(params: {
    orgId: string;
    branchId: string;
    categoryCode: string;
    title: string;
    amount: number;
    paymentMethod: 'cash' | 'bank_transfer';
    paidTo?: string;
    expenseDate: string;
    notes?: string;
    attachmentUrls?: string[];
    autoApprove?: boolean;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; voucher_id?: string; voucher_number?: string; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: true, voucher_number: `PC-${Date.now()}`, message: 'Tạo phiếu chi mô phỏng (Demo mode)' };
    }
    try {
      const { data, error } = await supabase.rpc('rpc_create_expense_voucher', {
        p_org_id: params.orgId,
        p_branch_id: params.branchId,
        p_category_code: params.categoryCode,
        p_title: params.title,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod,
        p_paid_to: params.paidTo || null,
        p_expense_date: params.expenseDate,
        p_notes: params.notes || null,
        p_attachment_urls: params.attachmentUrls || [],
        p_auto_approve: params.autoApprove ?? true,
        p_idempotency_key: params.idempotencyKey || `exp_${Date.now()}`
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi tạo phiếu chi' };
    }
  },

  // 5. Lấy Báo cáo P&L Vận hành
  async getPnLReport(orgId: string, branchId?: string, startDate?: string, endDate?: string): Promise<PnLSummary | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase.rpc('rpc_get_operating_pnl_report', {
        p_org_id: orgId,
        p_branch_id: branchId || null,
        p_start_date: startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        p_end_date: endDate || new Date().toISOString().slice(0, 10)
      });
      if (error) throw error;
      return data;
    } catch {
      return null;
    }
  },

  // 6. Lấy Sổ cái dòng tiền
  async getCashflowLedger(orgId: string, branchId?: string, limit = 50): Promise<CashflowEntry[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      let query = supabase
        .from('cashflow_ledger')
        .select('*')
        .eq('organization_id', orgId);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query.order('occurred_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  }
};
