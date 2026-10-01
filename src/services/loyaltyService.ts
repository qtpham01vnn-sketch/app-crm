import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { CustomerLoyaltyOverview } from '../types';

export const loyaltyService = {
  /**
   * Fetch customer loyalty overview, available points, tier and ledger history
   */
  async getCustomerLoyaltyOverview(orgId: string, customerId: string): Promise<CustomerLoyaltyOverview> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        customerId,
        currentTier: 'standard',
        tierName: 'STANDARD',
        tierDiscountPct: 0,
        tierQualifyingSpend: 0,
        availablePoints: 0,
        expiringPoints30d: 0,
        totalEarnedPoints: 0,
        totalRedeemedPoints: 0,
        policyActive: false,
        earnSpendRatio: 10000,
        pointsToCurrencyRatio: 100,
        maxRedeemPercentage: 50,
        ledgerHistory: []
      };
    }

    try {
      const { data, error } = await supabase.rpc('rpc_get_customer_loyalty_overview', {
        p_org_id: orgId,
        p_customer_id: customerId
      });

      if (error) {
        console.error('Error fetching customer loyalty overview:', error);
        throw error;
      }

      const res = data || {};
      return {
        customerId,
        currentTier: res.current_tier || 'standard',
        tierName: res.tier_name || 'STANDARD',
        tierDiscountPct: Number(res.tier_discount_pct) || 0,
        tierQualifyingSpend: Number(res.tier_qualifying_spend) || 0,
        availablePoints: Number(res.available_points) || 0,
        expiringPoints30d: Number(res.expiring_points_30d) || 0,
        totalEarnedPoints: Number(res.total_earned_points) || 0,
        totalRedeemedPoints: Number(res.total_redeemed_points) || 0,
        policyActive: Boolean(res.policy_active),
        earnSpendRatio: Number(res.earn_spend_ratio) || 10000,
        pointsToCurrencyRatio: Number(res.points_to_currency_ratio) || 100,
        maxRedeemPercentage: Number(res.max_redeem_percentage) || 50,
        ledgerHistory: (res.ledger_history || []).map((l: any) => ({
          id: l.id,
          orgId,
          customerId,
          transactionType: l.transaction_type,
          pointsDelta: Number(l.points_delta) || 0,
          balanceAfter: Number(l.balance_after) || 0,
          sourceReferenceType: l.source_reference_type,
          sourceReferenceId: l.source_reference_id,
          reasonForChange: l.reason_for_change,
          staffName: l.staff_name,
          expiresAt: l.expires_at,
          createdAt: l.created_at,
          policyVersion: 'v1.0'
        }))
      };
    } catch (err) {
      console.error('Lỗi khi tải thông tin loyalty khách hàng:', err);
      throw err;
    }
  },

  /**
   * Earn loyalty points from invoice payment
   */
  async earnPoints(params: {
    orgId: string;
    customerId: string;
    saleId: string;
    eligibleAmount: number;
    idempotencyKey?: string;
    staffId?: string;
  }): Promise<{ success: boolean; pointsEarned?: number; balanceAfter?: number; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase chưa kết nối' };
    }

    const { data, error } = await supabase.rpc('rpc_earn_loyalty_points', {
      p_org_id: params.orgId,
      p_customer_id: params.customerId,
      p_sale_id: params.saleId,
      p_eligible_amount: params.eligibleAmount,
      p_idempotency_key: params.idempotencyKey || `earn-${params.saleId}-${Date.now()}`,
      p_staff_id: params.staffId || null
    });

    if (error) throw error;
    return data;
  },

  /**
   * Redeem loyalty points for POS bill discount
   */
  async redeemPoints(params: {
    orgId: string;
    customerId: string;
    saleId: string;
    pointsToRedeem: number;
    billTotalAmount: number;
    idempotencyKey?: string;
    staffId?: string;
  }): Promise<{ success: boolean; discountAmount?: number; balanceAfter?: number; message?: string; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase chưa kết nối' };
    }

    const { data, error } = await supabase.rpc('rpc_redeem_loyalty_points', {
      p_org_id: params.orgId,
      p_customer_id: params.customerId,
      p_sale_id: params.saleId,
      p_points_to_redeem: params.pointsToRedeem,
      p_bill_total_amount: params.billTotalAmount,
      p_idempotency_key: params.idempotencyKey || `redeem-${params.saleId}-${Date.now()}`,
      p_staff_id: params.staffId || null
    });

    if (error) throw error;
    return data;
  },

  /**
   * Manually adjust points with mandatory audit reason
   */
  async adjustPoints(params: {
    orgId: string;
    customerId: string;
    pointsDelta: number;
    reason: string;
    staffId: string;
  }): Promise<{ success: boolean; pointsDelta?: number; balanceAfter?: number; message?: string; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase chưa kết nối' };
    }

    const { data, error } = await supabase.rpc('rpc_adjust_loyalty_points', {
      p_org_id: params.orgId,
      p_customer_id: params.customerId,
      p_points_delta: params.pointsDelta,
      p_reason: params.reason,
      p_staff_id: params.staffId
    });

    if (error) throw error;
    return data;
  },

  /**
   * Evaluate customer tier eligibility based on qualifying spend
   */
  async evaluateTier(params: {
    orgId: string;
    customerId: string;
    staffId?: string;
  }): Promise<{ success: boolean; tierChanged?: boolean; previousTier?: string; newTier?: string; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase chưa kết nối' };
    }

    const { data, error } = await supabase.rpc('rpc_evaluate_customer_tier', {
      p_org_id: params.orgId,
      p_customer_id: params.customerId,
      p_staff_id: params.staffId || null
    });

    if (error) throw error;
    return data;
  }
};
