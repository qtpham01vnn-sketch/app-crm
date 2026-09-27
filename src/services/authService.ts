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
  role?: UserRole;
  assignedBranchIds: string[];
  /** When true, user is authenticated but has no valid membership */
  noMembership?: boolean;
  /** Human-readable error for display */
  errorMessage?: string;
}

const UNAUTHENTICATED_SESSION: AuthSessionInfo = {
  isAuthenticated: false,
  assignedBranchIds: [],
};

export const authService = {
  /**
   * Get current Supabase Auth User & linked staff profile/membership.
   * Returns session info with role from database membership.
   * NEVER falls back to owner_admin or any privileged role.
   */
  async getCurrentSession(): Promise<AuthSessionInfo> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        ...UNAUTHENTICATED_SESSION,
        errorMessage: 'Supabase chưa được cấu hình. Vui lòng kiểm tra biến môi trường.',
      };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        return UNAUTHENTICATED_SESSION;
      }

      // Fetch staff session from database RPC (read-only, no auto-link)
      const { data: syncData, error: syncError } = await supabase.rpc('get_staff_session');
      
      if (syncError) {
        console.error('Lỗi đồng bộ phiên nhân sự:', syncError.message);
        return {
          isAuthenticated: true,
          userId: session.user.id,
          email: session.user.email,
          assignedBranchIds: [],
          noMembership: true,
          errorMessage: `Lỗi truy vấn phiên: ${syncError.message}`,
        };
      }

      if (!syncData || !syncData.success) {
        return {
          isAuthenticated: true,
          userId: session.user.id,
          email: session.user.email,
          assignedBranchIds: [],
          noMembership: true,
          errorMessage: syncData?.message || 'Tài khoản chưa được liên kết hồ sơ nhân sự hoặc chưa có quyền truy cập.',
        };
      }

      // Validate that we actually got a role from membership
      if (!syncData.role) {
        return {
          isAuthenticated: true,
          userId: session.user.id,
          email: session.user.email,
          staffId: syncData.staff_id,
          staffName: syncData.staff_name,
          staffCode: syncData.staff_code,
          orgId: syncData.organization_id,
          assignedBranchIds: syncData.assigned_branch_ids || [],
          noMembership: true,
          errorMessage: 'Tài khoản có hồ sơ nhân sự nhưng chưa có membership hoạt động.',
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
        role: syncData.role as UserRole,
        assignedBranchIds: syncData.assigned_branch_ids || [],
      };
    } catch (err) {
      console.error('Lỗi lấy phiên hiện tại:', err);
      return {
        ...UNAUTHENTICATED_SESSION,
        errorMessage: 'Không thể kết nối máy chủ xác thực.',
      };
    }
  },

  /**
   * Login with email & password.
   * Does NOT auto-register if login fails.
   */
  async loginWithPassword(email: string, password: string): Promise<{ success: boolean; message?: string; sessionInfo?: AuthSessionInfo }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase chưa được cấu hình.' };
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return { success: false, message: 'Vui lòng nhập email và mật khẩu.' };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        // Map common Supabase auth errors to Vietnamese
        let userMessage = error.message;
        if (error.message.includes('Invalid login')) {
          userMessage = 'Email hoặc mật khẩu không đúng.';
        } else if (error.message.includes('Email not confirmed')) {
          userMessage = 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.';
        } else if (error.message.includes('Too many requests')) {
          userMessage = 'Quá nhiều lần thử. Vui lòng đợi vài phút.';
        }
        return { success: false, message: userMessage };
      }

      const sessionInfo = await this.getCurrentSession();

      // Check if user has valid membership after login
      if (sessionInfo.noMembership) {
        // Sign out immediately — authenticated but no permission
        await supabase.auth.signOut();
        return {
          success: false,
          message: sessionInfo.errorMessage || 'Tài khoản không có quyền truy cập hệ thống. Vui lòng liên hệ quản trị viên.',
        };
      }

      return { success: true, sessionInfo };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Lỗi đăng nhập: ${msg}` };
    }
  },

  /**
   * Sign out and clear local state
   */
  async signOut(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Lỗi đăng xuất:', err);
    }
  },
};
