import React, { useState } from 'react';
import { LogIn, AlertCircle, Loader2, Shield } from 'lucide-react';
import { authService } from '../../services/authService';
import { supabaseEnvType } from '../../lib/supabase';

interface LoginPageProps {
  onLoginSuccess: () => void;
  errorMessage?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, errorMessage: externalError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(externalError || null);

  const [showPassword, setShowPassword] = useState(false);

  const fillAccount = (accEmail: string) => {
    setEmail(accEmail);
    setPassword('PhuongNam@123');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await authService.loginWithPassword(email.trim(), password.trim());
      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.message || 'Đăng nhập thất bại.');
      }
    } catch {
      setError('Đã xảy ra lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            PHƯƠNG NAM CRM
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Quản lý Spa & Nha khoa Đa chi nhánh
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Đăng nhập</h2>
          <p className="text-xs text-slate-500 mb-4">
            Sử dụng tài khoản nhân viên được cấp bởi quản trị viên
          </p>

          {/* Quick Selection for Staging Only */}
          {supabaseEnvType === 'staging' && (
            <div className="mb-5 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl">
              <p className="text-[11px] font-bold text-amber-900 mb-1.5 flex items-center gap-1">
                ⚡ Điền nhanh tài khoản Diễn tập Staging:
              </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => fillAccount('admin.staging@phuongnam.vn')}
                className="px-2 py-1.5 text-[11px] font-semibold bg-white hover:bg-amber-100/60 border border-amber-200 text-slate-800 rounded-lg text-left transition-all shadow-xs"
              >
                👑 Admin Tổng
              </button>
              <button
                type="button"
                onClick={() => fillAccount('manager.q1@phuongnam.vn')}
                className="px-2 py-1.5 text-[11px] font-semibold bg-white hover:bg-amber-100/60 border border-amber-200 text-slate-800 rounded-lg text-left transition-all shadow-xs"
              >
                🏢 Quản lý Q1
              </button>
              <button
                type="button"
                onClick={() => fillAccount('reception.q1@phuongnam.vn')}
                className="px-2 py-1.5 text-[11px] font-semibold bg-white hover:bg-amber-100/60 border border-amber-200 text-slate-800 rounded-lg text-left transition-all shadow-xs"
              >
                👩‍💼 Lễ tân Q1
              </button>
              <button
                type="button"
                onClick={() => fillAccount('doctor.tuan@phuongnam.vn')}
                className="px-2 py-1.5 text-[11px] font-semibold bg-white hover:bg-amber-100/60 border border-amber-200 text-slate-800 rounded-lg text-left transition-all shadow-xs"
              >
                👨‍⚕️ Bác sĩ Tuấn
              </button>
            </div>
          </div>

          {/* Error message */}
          {(error || externalError) && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <p className="text-xs text-rose-700 font-medium">{error || externalError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@congty.vn"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium cursor-pointer"
                >
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-bold text-sm rounded-xl shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Đăng nhập</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-slate-400">
            Chưa có tài khoản? Liên hệ quản trị viên để được cấp quyền truy cập.
          </p>
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-600">
          © 2026 Phương Nam Beauty & Dental Clinic
        </p>
      </div>
    </div>
  );
};
