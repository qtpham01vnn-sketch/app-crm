import React from 'react';
import {
  TrendingUp,
  Users,
  Calendar,
  AlertTriangle,
  CreditCard,
  Sparkles,
  ArrowUpRight,
  Clock,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const HomeView: React.FC<{ onOpenNewAppt: () => void }> = ({ onOpenNewAppt }) => {
  const { currentBranch, sales, appointments, customers, branchStocks, products, setActiveTab, currentTheme } = useApp();

  const isSoftLight = currentTheme.isSoftLight;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Branch-specific filters & Date calculations
  const branchSales = sales.filter((s) => !currentBranch?.id || s.branchId === currentBranch.id);
  const todaySales = branchSales.filter((s) => s.createdAt && s.createdAt.startsWith(todayStr));
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalRevenue = branchSales.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalDebt = branchSales.reduce((sum, s) => sum + s.debtAmount, 0);

  // Today's appointments for current branch
  const todayBranchAppts = appointments.filter(
    (a) => (!currentBranch?.id || a.branchId === currentBranch.id || !a.branchId) && (a.date === todayStr || !a.date)
  );

  // New customers (created this month or today)
  const currentMonthPrefix = todayStr.slice(0, 7);
  const newCustomersThisMonth = customers.filter(
    (c) => c.createdAt && c.createdAt.startsWith(currentMonthPrefix)
  ).length;

  const lowStockItems = branchStocks
    .filter((stk) => stk.branchId === currentBranch.id && stk.stockOnHand <= stk.minStock)
    .map((stk) => {
      const prod = products.find((p) => p.id === stk.productId);
      return { ...stk, productName: prod?.name || 'Sản phẩm', unit: prod?.unit || 'Cái' };
    });

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Top Banner Greeting - Dynamically adapts to active Theme */}
      <div
        className={`rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border transition-all duration-300 ${
          isSoftLight
            ? 'bg-white border-[#E5E7E4] text-[#26342F]'
            : 'text-white border-white/10 shadow-lg'
        }`}
        style={
          isSoftLight
            ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' }
            : {
                background: currentTheme.heroGradient,
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)'
              }
        }
      >
        <div>
          <span
            className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
              isSoftLight
                ? 'bg-[#FFF1F5] text-[#244B3C] border-[#E5E7E4]'
                : 'text-white bg-white/20 border-white/30 backdrop-blur-xs'
            }`}
          >
            Chi nhánh {currentBranch.name}
          </span>
          <h1
            className={`text-xl md:text-2xl font-black mt-2 tracking-tight ${
              isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-white'
            }`}
          >
            Xin chào! Chúc một ngày làm việc hiệu quả ✨
          </h1>
          <p
            className={`text-xs mt-1 ${
              isSoftLight ? 'text-[#59665F]' : 'text-slate-200'
            }`}
          >
            Giao diện: <b className="font-bold" style={{ color: isSoftLight ? currentTheme.primaryColor : '#ffffff' }}>{currentTheme.name}</b> • Hệ thống phục vụ {todayBranchAppts.length} lượt hẹn hôm nay.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            onClick={() => setActiveTab('pos')}
            className="text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 transition-all hover:opacity-90 active:scale-95 cursor-pointer"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <CreditCard className="w-4 h-4" />
            <span>Thu Ngân POS</span>
          </button>
          <button
            onClick={onOpenNewAppt}
            className={`font-semibold text-xs px-4 py-2.5 rounded-xl border flex items-center space-x-1.5 transition-all cursor-pointer ${
              isSoftLight
                ? 'bg-white hover:bg-[#FFF1F5] text-[#244B3C] border-[#E5E7E4]'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Đặt Lịch Mới</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Revenue */}
        <div
          className={`rounded-2xl p-5 border transition-shadow ${
            isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Doanh Thu Thực Thu</span>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center font-bold"
              style={{ backgroundColor: currentTheme.iconBg, color: currentTheme.primaryColor }}
            >
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className={`text-2xl font-black tracking-tight ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
              {todayRevenue > 0 ? todayRevenue.toLocaleString('vi-VN') + ' đ' : totalRevenue.toLocaleString('vi-VN') + ' đ'}
            </p>
            <p className="text-[11px] font-semibold mt-1 flex items-center text-slate-500">
              {todayRevenue > 0 ? (
                <span className="text-emerald-700 font-bold flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> Hôm nay ({todaySales.length} hóa đơn)
                </span>
              ) : (
                <span className={isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}>Lũy kế toàn thời gian ({branchSales.length} hóa đơn)</span>
              )}
            </p>
          </div>
        </div>

        {/* Metric 2: Appointments */}
        <div
          className={`rounded-2xl p-5 border transition-shadow ${
            isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Lịch Hẹn Hôm Nay</span>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center font-bold"
              style={{ backgroundColor: currentTheme.iconBg, color: currentTheme.primaryColor }}
            >
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className={`text-2xl font-black tracking-tight ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{todayBranchAppts.length} Lượt</p>
            <p className="text-[11px] font-bold mt-1" style={{ color: currentTheme.primaryColor }}>
              {todayBranchAppts.filter((a) => a.status === 'in_progress').length} đang làm • {todayBranchAppts.filter((a) => a.status === 'done').length} hoàn thành
            </p>
          </div>
        </div>

        {/* Metric 3: Customers */}
        <div
          className={`rounded-2xl p-5 border transition-shadow ${
            isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Khách Hàng Toàn Chuỗi</span>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center font-bold"
              style={{ backgroundColor: currentTheme.iconBg, color: currentTheme.primaryColor }}
            >
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className={`text-2xl font-black tracking-tight ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{customers.length} Khách</p>
            <p className={`text-[11px] font-semibold mt-1 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
              {newCustomersThisMonth > 0 ? `+${newCustomersThisMonth} khách mới tháng này` : `Nợ cần thu: ${totalDebt.toLocaleString('vi-VN')} đ`}
            </p>
          </div>
        </div>

        {/* Metric 4: Inventory Alerts */}
        <div
          className={`rounded-2xl p-5 border transition-shadow ${
            isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Cảnh Báo Tồn Kho</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              lowStockItems.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className={`text-2xl font-black tracking-tight ${
              lowStockItems.length > 0 ? 'text-rose-600' : isSoftLight ? 'text-[#244B3C]' : 'text-emerald-700'
            }`}>
              {lowStockItems.length} Mặt Hàng
            </p>
            <p className={`text-[11px] font-medium mt-1 ${
              lowStockItems.length > 0 ? 'text-rose-600' : 'text-emerald-700 font-semibold'
            }`}>
              {lowStockItems.length > 0 ? 'Cần tạo đơn PO nhập thêm' : 'Tồn kho an toàn'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Today's Appointments + Activity / Stock alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Today's Schedule */}
        <div
          className={`lg:col-span-2 rounded-2xl p-5 border ${
            isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4" style={{ color: currentTheme.primaryColor }} />
              <h3 className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
                Lịch Hẹn Phục Vụ Chi Nhánh
              </h3>
            </div>
            <button
              onClick={() => setActiveTab('appts')}
              className="text-xs font-bold flex items-center hover:opacity-80 cursor-pointer"
              style={{ color: currentTheme.primaryColor }}
            >
              Xem tất cả <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          {todayBranchAppts.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center rounded-xl bg-[#FFF1F5]/40 border border-dashed border-[#E5E7E4]">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                style={{ backgroundColor: currentTheme.badgeBg, color: currentTheme.primaryColor }}
              >
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className={`font-bold text-sm mb-1 ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}`}>
                Chưa có lịch hẹn nào hôm nay
              </h4>
              <p className={`text-xs mb-4 max-w-sm ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
                Chi nhánh {currentBranch.name} chưa có lịch tiếp đón trong ngày. Bấm nút bên dưới để tạo lịch hẹn mới cho khách.
              </p>
              <button
                onClick={onOpenNewAppt}
                className="px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all hover:opacity-90 cursor-pointer active:scale-95"
                style={{ backgroundColor: currentTheme.buttonBg }}
              >
                <Plus className="w-4 h-4" />
                <span>Đặt Lịch Mới Ngay</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {todayBranchAppts.map((appt) => {
                const statusBadges: Record<string, { label: string; bg: string; text: string }> = {
                  booked: { label: 'Đã đặt', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
                  confirmed: { label: 'Đã xác nhận', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
                  in_progress: { label: 'Đang làm', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' },
                  done: { label: 'Hoàn thành', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700' },
                  cancelled: { label: 'Đã hủy', bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600' }
                };
                const badge = statusBadges[appt.status] || statusBadges.booked;

                return (
                  <div
                    key={appt.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl transition-colors border gap-3 ${
                      isSoftLight
                        ? 'bg-white hover:bg-[#FFF1F5]/50 border-[#E5E7E4]'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/60'
                    }`}
                  >
                    <div className="flex items-start space-x-3 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 border ${
                          isSoftLight ? 'bg-[#FFF1F5] border-[#E5E7E4]' : 'bg-white border-slate-200'
                        }`}
                      >
                        <span className="text-xs font-bold" style={{ color: currentTheme.primaryColor }}>{appt.time}</span>
                        <span className={`text-[10px] font-normal ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>{appt.durationMinutes}p</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className={`font-bold text-xs truncate ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{appt.customerName}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className={`text-xs font-medium mt-0.5 truncate ${isSoftLight ? 'text-[#26342F]' : 'text-slate-600'}`}>{appt.serviceName}</p>
                        <p className={`text-[11px] mt-0.5 truncate ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
                          KTV: <span className={`font-semibold ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-700'}`}>{appt.staffName}</span> • {appt.roomOrBed}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/80 shrink-0">
                      <span className={`font-bold text-xs ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
                        {(appt.priceSnapshot || 0).toLocaleString('vi-VN')} đ
                      </span>
                      <button
                        onClick={() => setActiveTab('pos')}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all hover:opacity-90 cursor-pointer mt-1"
                        style={{
                          backgroundColor: currentTheme.badgeBg,
                          color: currentTheme.badgeText || currentTheme.primaryColor,
                          borderColor: currentTheme.borderColor || currentTheme.primaryColor
                        }}
                      >
                        Vào Thu Ngân
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Alerts & Quick Stats */}
        <div className="space-y-6">
          {/* Low Stock Warning Card */}
          <div
            className={`rounded-2xl p-5 border ${
              isSoftLight ? 'bg-white border-[#E5E7E4]' : 'bg-white border-slate-200/80'
            }`}
            style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-rose-500' : 'text-emerald-600'}`} />
                <h3 className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}`}>Cảnh Báo Tồn Kho</h3>
              </div>
              {lowStockItems.length > 0 && (
                <button
                  onClick={() => setActiveTab('po')}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                >
                  Nhập hàng
                </button>
              )}
            </div>

            {lowStockItems.length === 0 ? (
              <p className={`text-xs py-3 text-center ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>Tồn kho các mặt hàng đều an toàn.</p>
            ) : (
              <div className="space-y-2.5">
                {lowStockItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-800">{item.productName}</p>
                      <p className="text-[10px] text-rose-600 font-semibold">
                        Tồn: {item.stockOnHand} {item.unit} (Min: {item.minStock})
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('po')}
                      className="bg-rose-600 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] cursor-pointer hover:bg-rose-700"
                    >
                      Tạo PO
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Shortcuts */}
          <div
            className={`rounded-2xl p-5 border transition-colors ${
              isSoftLight
                ? 'bg-white border-[#E5E7E4] text-[#26342F]'
                : 'bg-slate-900 text-white border-slate-800 shadow-lg'
            }`}
            style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
          >
            <h3
              className={`font-bold text-sm mb-3 flex items-center gap-2 ${
                isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" style={{ color: currentTheme.primaryColor }} /> Thao Tác Nhanh
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setActiveTab('pos')}
                className={`p-3 rounded-xl text-left font-semibold transition-colors cursor-pointer border ${
                  isSoftLight
                    ? 'bg-[#FAFAF8] hover:bg-[#FFF1F5] text-[#26342F] border-[#E5E7E4]'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                💳 Bán hàng POS
              </button>
              <button
                onClick={() => setActiveTab('courses')}
                className={`p-3 rounded-xl text-left font-semibold transition-colors cursor-pointer border ${
                  isSoftLight
                    ? 'bg-[#FAFAF8] hover:bg-[#FFF1F5] text-[#26342F] border-[#E5E7E4]'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                ✨ Trừ liệu trình
              </button>
              <button
                onClick={() => setActiveTab('times')}
                className={`p-3 rounded-xl text-left font-semibold transition-colors cursor-pointer border ${
                  isSoftLight
                    ? 'bg-[#FAFAF8] hover:bg-[#FFF1F5] text-[#26342F] border-[#E5E7E4]'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                ⏱️ Chấm công ca
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`p-3 rounded-xl text-left font-semibold transition-colors cursor-pointer border ${
                  isSoftLight
                    ? 'bg-[#FAFAF8] hover:bg-[#FFF1F5] text-[#26342F] border-[#E5E7E4]'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                📊 Báo cáo ngày
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
