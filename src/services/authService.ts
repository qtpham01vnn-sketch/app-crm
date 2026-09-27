import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { UserRole, Staff } from '../types';

export interface AuthSessionData {
  user: {
    id: string;
    email?: string;
  } | null;
  staffProfile: Staff | null;
  membership: {
    role: UserRole;
    assignedBranchIds: string[];
  } | null;
  isDemoMode: boolean;
}

export const authService = {
  /**
   * Check if running in live Supabase mode vs local Mock Demo mode
   */
  isConfigured(): boolean {
    return isSupabaseConfigured;
  },

  /**
   * Sign in with Email and Password
   */
  async signInWithEmail(email: string, password: string): Promise<{ error: Error | null; session: unknown }> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        error: new Error('Supabase chưa được cấu hình. Đang chạy ở chế độ Demo Mock Data.'),
        session: null
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { error, session: null };
    }

    return { error: null, session: data.session };
  },

  /**
   * Sign out and purge all local storage / cached tokens
   */
  async signOut(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    // Purge local storage cache for clean state switch
    localStorage.removeItem('app_crm_branch_id');
    localStorage.removeItem('app_crm_role');
  },

  /**
   * Fetch current staff profile and membership from PostgreSQL
   */
  async fetchCurrentMembership(): Promise<{ role: UserRole; assignedBranchIds: string[] } | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('staff_profiles')
        .select(`
          id,
          full_name,
          organization_memberships (
            role,
            assigned_branch_ids,
            is_active
          )
        `)
        .eq('auth_user_id', user.id)
        .single();

      if (error || !data) return null;

      const membership = (data as unknown as { organization_memberships: Array<{ role: UserRole; assigned_branch_ids: string[]; is_active: boolean }> }).organization_memberships?.[0];
      if (!membership || !membership.is_active) return null;

      return {
        role: membership.role,
        assignedBranchIds: membership.assigned_branch_ids || []
      };
    } catch {
      return null;
    }
  }
};
