import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { UserRole } from '../types';

export interface AuthSessionInfo {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
  staffId?: string;
  staffName?: string;
  staffCode?: string;
  orgId?: string;
  role: UserRole;
  assignedBranchIds: string[];
}

export const TEST_ROLE_CREDENTIALS: Record<UserRole, { email: string; pass: string; name: string; title: string }> = {
  owner_admin: {
    email: 'admin@phuongnam.vn',
    pass: 'Admin@123456!',
    name: 'Trần Phương Nam',
    title: 'Chủ Cơ Sở (Admin)'
  },
  branch_manager: {
    email: 'huong.nguyen@phuongnam.vn',
    pass: 'Manager@123456!',
    name: 'Nguyễn Thị Hương',
    title: 'Quản Lý Chi Nhánh Q1'
  },
  cashier_receptionist: {
    email: 'thao.le@phuongnam.vn',
    pass: 'Cashier@123456!',
    name: 'Lê Thu Thảo',
    title: 'Lễ Tân & Thu Ngân'
  },
  technician_doctor: {
    email: 'tuan.pham@phuongnam.vn',
    pass: 'Doctor@123456!',
    name: 'BS. Phạm Minh Tuấn',
    title: 'Bác Sĩ Trưởng Khoa Da Liễu'
  }
};

export const authService = {
  /**
   * Get current Supabase Auth User & Profile
   */
  async getCurrentSession(): Promise<AuthSessionInfo> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        isAuthenticated: false,
        role: 'owner_admin',
        assignedBranchIds: []
      };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        return {
          isAuthenticated: false,
          role: 'owner_admin',
          assignedBranchIds: []
        };
      }

      // Claim or Sync staff session in Database
      const { data: syncData, error: syncError } = await supabase.rpc('claim_or_sync_staff_session');
      if (syncError || !syncData || !syncData.success) {
        return {
          isAuthenticated: true,
          userId: session.user.id,
          email: session.user.email,
          role: 'owner_admin',
          assignedBranchIds: []
        };
      }

      return {
        isAuthenticated: true,
        userId: session.user.id,
        email: session.user.email,
        staffId: syncData.staff_id,
        staffName: syncData.staff_name,
        staffCode: syncData.staff_code,
        orgId: syncData.organization_id,
        role: (syncData.role || 'owner_admin') as UserRole,
        assignedBranchIds: syncData.assigned_branch_ids || []
      };
    } catch (err) {
      console.error('Error fetching current session:', err);
      return {
        isAuthenticated: false,
        role: 'owner_admin',
        assignedBranchIds: []
      };
    }
  },

  /**
   * Login with email & password
   */
  async loginWithPassword(email: string, pass: string): Promise<{ success: boolean; message?: string; sessionInfo?: AuthSessionInfo }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase chưa được cấu hình' };
    }

    try {
      let { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass
      });

      // If user not found in Auth, try sign-up once automatically
      if (error && (error.message.includes('Invalid login') || error.message.includes('not found'))) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass
        });
        if (!signUpError) {
          const retry = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: pass
          });
          error = retry.error;
        }
      }

      if (error) {
        return { success: false, message: error.message };
      }

      const sessionInfo = await this.getCurrentSession();
      return { success: true, sessionInfo };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  },

  /**
   * Switch role by signing in with test credentials
   */
  async switchRole(role: UserRole): Promise<{ success: boolean; message?: string; sessionInfo?: AuthSessionInfo }> {
    const creds = TEST_ROLE_CREDENTIALS[role];
    if (!creds) {
      return { success: false, message: 'Vai trò không hợp lệ' };
    }
    return this.loginWithPassword(creds.email, creds.pass);
  },

  /**
   * Sign out and clear local state
   */
  async signOut(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }
};
