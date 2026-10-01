import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginPage } from './components/auth/LoginPage';
import { MockDataBanner } from './components/layout/MockDataBanner';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { BottomNav } from './components/layout/BottomNav';

// Views
import { HomeView } from './components/views/HomeView';
import { PosView } from './components/views/PosView';
import { ApptsView } from './components/views/ApptsView';
import { BookView } from './components/views/BookView';
import { WaitView } from './components/views/WaitView';
import { CustView } from './components/views/CustView';
import { ChatboxView } from './components/views/ChatboxView';
import { CoursesView } from './components/views/CoursesView';
import { StaffView } from './components/views/StaffView';
import { RosterView } from './components/views/RosterView';
import { TimesView } from './components/views/TimesView';
import { CommView } from './components/views/CommView';
import { PayrollView } from './components/views/PayrollView';
import { ProdView } from './components/views/ProdView';
import { SvcView } from './components/views/SvcView';
import { PkgView } from './components/views/PkgView';
import { InvView } from './components/views/InvView';
import { SuppView } from './components/views/SuppView';
import { PoView } from './components/views/PoView';
import { ExpView } from './components/views/ExpView';
import { PromosView } from './components/views/PromosView';
import { ReportsView } from './components/views/ReportsView';

// Modals
import { InvoiceModal } from './components/modals/InvoiceModal';
import { NewApptModal } from './components/modals/NewApptModal';
import { SessionDeductModal } from './components/modals/SessionDeductModal';
import { ThemeModal } from './components/modals/ThemeModal';
import type { CustomerCourse } from './types';

import { CheckCircle2, AlertCircle, Info, Loader2, ShieldOff } from 'lucide-react';

/**
 * Auth gate: Shows login or loading state based on auth status.
 * Only renders the main layout when properly authenticated.
 */
const AuthGate: React.FC = () => {
  const { authState, authErrorMessage, handleLoginSuccess, isLiveMode } = useApp();

  // In demo mode (no Supabase), skip auth entirely
  if (!isLiveMode) {
    return <MainLayout />;
  }

  switch (authState) {
    case 'loading':
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">Đang kiểm tra phiên đăng nhập...</p>
          </div>
        </div>
      );

    case 'unauthenticated':
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;

    case 'no_membership':
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-900/50 flex items-center justify-center">
              <ShieldOff className="w-8 h-8 text-rose-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Không có quyền truy cập</h2>
            <p className="text-sm text-slate-400 mb-6">
              {authErrorMessage || 'Tài khoản chưa được cấp quyền vào hệ thống. Vui lòng liên hệ quản trị viên.'}
            </p>
            <LoginPage onLoginSuccess={handleLoginSuccess} errorMessage={authErrorMessage || undefined} />
          </div>
        </div>
      );

    case 'error':
      return (
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          errorMessage={authErrorMessage || 'Lỗi kết nối máy chủ xác thực.'}
        />
      );

    case 'authenticated':
      return <MainLayout />;

    default:
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }
};

const MainLayout: React.FC = () => {
  const { activeTab, toasts, isThemeModalOpen, setIsThemeModalOpen } = useApp();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNewApptModalOpen, setIsNewApptModalOpen] = useState(false);
  const [deductModalCourse, setDeductModalCourse] = useState<CustomerCourse | null>(null);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'home':
        return <HomeView onOpenNewAppt={() => setIsNewApptModalOpen(true)} />;
      case 'pos':
        return <PosView />;
      case 'appts':
        return <ApptsView onOpenNewAppt={() => setIsNewApptModalOpen(true)} />;
      case 'book':
        return <BookView onOpenNewAppt={() => setIsNewApptModalOpen(true)} />;
      case 'wait':
        return <WaitView />;
      case 'cust':
        return <CustView />;
      case 'chatbox':
        return <ChatboxView onOpenNewApptModal={() => setIsNewApptModalOpen(true)} />;
      case 'courses':
        return <CoursesView onOpenDeductModal={(crs) => setDeductModalCourse(crs)} />;
      case 'staff':
        return <StaffView />;
      case 'roster':
        return <RosterView />;
      case 'times':
        return <TimesView />;
      case 'comm':
        return <CommView />;
      case 'payroll':
        return <PayrollView />;
      case 'prod':
        return <ProdView />;
      case 'svc':
        return <SvcView />;
      case 'pkg':
        return <PkgView />;
      case 'inv':
        return <InvView />;
      case 'supp':
        return <SuppView />;
      case 'po':
        return <PoView />;
      case 'exp':
        return <ExpView />;
      case 'promos':
        return <PromosView />;
      case 'reports':
        return <ReportsView />;
      default:
        return <HomeView onOpenNewAppt={() => setIsNewApptModalOpen(true)} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-main,#f8fafc)] text-[var(--body-text,#0f172a)] transition-colors duration-200">
      {/* Top Mock Banner */}
      <MockDataBanner />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (flex child on desktop, drawer on mobile) */}
        <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

        {/* Main Content Area (takes 100% of remaining width) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />

          <main className="flex-1 p-3 sm:p-4 md:p-6 pb-28 sm:pb-24 lg:pb-8 overflow-y-auto w-full max-w-7xl mx-auto">
            {renderActiveView()}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Global Modals */}
      <InvoiceModal />
      <NewApptModal isOpen={isNewApptModalOpen} onClose={() => setIsNewApptModalOpen(false)} />
      <SessionDeductModal
        course={deductModalCourse}
        isOpen={Boolean(deductModalCourse)}
        onClose={() => setDeductModalCourse(null)}
      />
      <ThemeModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />

      {/* Floating Toast Notifications */}
      <div className="fixed bottom-16 lg:bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-2xl shadow-xl border flex items-center space-x-2.5 text-xs font-semibold animate-fade-in ${
              t.type === 'success'
                ? 'bg-emerald-900 text-white border-emerald-700'
                : t.type === 'error'
                ? 'bg-rose-900 text-white border-rose-700'
                : t.type === 'warning'
                ? 'bg-amber-900 text-white border-amber-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <AuthGate />
    </AppProvider>
  );
}

export default App;
