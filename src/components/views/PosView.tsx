import React, { useState } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Percent,
  TicketPercent,
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PosView: React.FC = () => {
  const {
    services,
    products,
    packages,
    branchStocks,
    currentBranch,
    branches,
    promotions,
    customers,
    staffList,
    currentTheme,
    cart,
    addToCart,
    removeFromCart,
    updateCartQty,
    setCartCustomer,
    setCartStaff,
    setCartDiscountPct,
    setCartPromoCode,
    setCartPaidAmount,
    setCartPaymentMethod,
    clearCart,
    checkoutCart
  } = useApp();

  const [activeCategory, setActiveCategory] = useState<'all' | 'svc' | 'prod' | 'pkg'>('all');
  const [filterSearch, setFilterSearch] = useState('');

  const targetCustomer = customers.find((c) => c.id === cart.customerId);

  // Calculations
  const subtotal = cart.items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const discountAmount = Math.round((subtotal * cart.discountPct) / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * cart.taxPct) / 100);
  const total = afterDiscount + taxAmount + cart.tipAmount;
  const debt = Math.max(0, total - cart.paidAmount);
  const change = Math.max(0, cart.paidAmount - total);

  // Items filtering
  const filteredServices = services
    .filter((s) => s.name.toLowerCase().includes(filterSearch.toLowerCase()))
    .map((s) => ({
      type: 'service' as const,
      refId: s.id,
      name: s.name,
      price: s.basePrice,
      category: s.category,
      duration: s.durationMinutes,
      badge: 'Dịch vụ'
    }));

  const filteredProducts = products
    .filter((p) => p.name.toLowerCase().includes(filterSearch.toLowerCase()))
    .map((p) => {
      const stock = branchStocks.find((stk) => stk.branchId === currentBranch.id && stk.productId === p.id)?.stockOnHand ?? 0;
      return {
        type: 'product' as const,
        refId: p.id,
        name: p.name,
        price: p.retailPrice,
        category: p.category,
        stock,
        badge: 'Sản phẩm'
      };
    });

  const filteredPackages = packages
    .filter((pkg) => pkg.name.toLowerCase().includes(filterSearch.toLowerCase()))
    .map((pkg) => ({
      type: 'package' as const,
      refId: pkg.id,
      name: pkg.name,
      price: pkg.price,
      category: 'Gói Combo',
      sessions: pkg.sessions,
      badge: 'Gói Liệu Trình'
    }));

  let catalogItems: any[] = [];
  if (activeCategory === 'all' || activeCategory === 'svc') catalogItems.push(...filteredServices);
  if (activeCategory === 'all' || activeCategory === 'prod') catalogItems.push(...filteredProducts);
  if (activeCategory === 'all' || activeCategory === 'pkg') catalogItems.push(...filteredPackages);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start animate-fade-in">
      {/* Left Column: Product & Service Catalog (7 cols) */}
      <div className="xl:col-span-7 space-y-4">
        {/* Search & Category Filter Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm nhanh dịch vụ, sản phẩm, gói combo..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-sky-500 transition-all font-medium"
              />
            </div>

            {/* Category Tabs */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl shrink-0 text-xs font-semibold overflow-x-auto max-w-full">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                  activeCategory === 'all' ? 'bg-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                style={activeCategory === 'all' ? { color: currentTheme.primaryColor } : {}}
              >
                Tất cả
              </button>
              <button
                onClick={() => setActiveCategory('svc')}
                className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                  activeCategory === 'svc' ? 'bg-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                style={activeCategory === 'svc' ? { color: currentTheme.primaryColor } : {}}
              >
                Dịch vụ
              </button>
              <button
                onClick={() => setActiveCategory('prod')}
                className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                  activeCategory === 'prod' ? 'bg-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                style={activeCategory === 'prod' ? { color: currentTheme.primaryColor } : {}}
              >
                Sản phẩm
              </button>
              <button
                onClick={() => setActiveCategory('pkg')}
                className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                  activeCategory === 'pkg' ? 'bg-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                style={activeCategory === 'pkg' ? { color: currentTheme.primaryColor } : {}}
              >
                Gói Combo
              </button>
            </div>
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {catalogItems.map((item, idx) => {
            const isOutOfStock = item.type === 'product' && item.stock <= 0;
            return (
              <div
                key={idx}
                onClick={() => {
                  if (isOutOfStock) return;
                  addToCart({
                    type: item.type,
                    refId: item.refId,
                    name: item.name,
                    price: item.price,
                    qty: 1
                  });
                }}
                className={`bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group ${
                  isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{
                  borderColor: undefined
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {item.badge}
                    </span>
                    {item.type === 'product' && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          item.stock > 5 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        Tồn: {item.stock}
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 transition-colors line-clamp-2">
                    {item.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">{item.category}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-black text-sm" style={{ color: currentTheme.primaryColor }}>
                    {item.price.toLocaleString('vi-VN')}đ
                  </span>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shadow-xs"
                    style={{
                      backgroundColor: currentTheme.badgeBg,
                      color: currentTheme.primaryColor
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: POS Order Cart & Checkout (5 cols) */}
      <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-lg flex flex-col overflow-hidden sticky top-20">
        {/* Cart Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShoppingCart className="w-5 h-5" style={{ color: currentTheme.primaryColor }} />
            <div>
              <h3 className="font-bold text-sm">Hóa Đơn Bán Hàng</h3>
              <p className="text-[10px] text-slate-400">{currentBranch.code} • Thu Ngân Trực Tiếp</p>
            </div>
          </div>
          {cart.items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Xóa giỏ
            </button>
          )}
        </div>

        {/* Customer & Staff Selection Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Khách Hàng</label>
            <select
              value={cart.customerId}
              onChange={(e) => setCartCustomer(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-sky-500"
            >
              <option value="">-- Khách Vãng Lai --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.vipTier.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">KTV / Thu Ngân</label>
            <select
              value={cart.staffId}
              onChange={(e) => setCartStaff(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-sky-500"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {targetCustomer && (
            <div className="col-span-2 pt-1 flex items-center justify-between text-[11px] text-slate-600">
              <span>Số dư cọc: <b className="text-emerald-600">{targetCustomer.creditBalance.toLocaleString('vi-VN')}đ</b></span>
              <span>Nợ hiện tại: <b className="text-rose-600">{targetCustomer.debt.toLocaleString('vi-VN')}đ</b></span>
            </div>
          )}
        </div>

        {/* Cart Line Items */}
        <div className="p-4 flex-1 overflow-y-auto max-h-56 divide-y divide-slate-100">
          {cart.items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Chưa có món nào trong giỏ hàng. Hãy chọn dịch vụ hoặc sản phẩm ở bên trái!
            </div>
          ) : (
            cart.items.map((it, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex-1 pr-2">
                  <p className="font-bold text-slate-800">{it.name}</p>
                  <p className="text-[11px] font-semibold" style={{ color: currentTheme.primaryColor }}>
                    {it.price.toLocaleString('vi-VN')}đ
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                    <button
                      onClick={() => updateCartQty(idx, it.qty - 1)}
                      className="p-1 hover:bg-slate-200 rounded-l-lg text-slate-600 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-2 font-bold text-slate-800">{it.qty}</span>
                    <button
                      onClick={() => updateCartQty(idx, it.qty + 1)}
                      className="p-1 hover:bg-slate-200 rounded-r-lg text-slate-600 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="font-bold text-slate-900 w-20 text-right">
                    {(it.price * it.qty).toLocaleString('vi-VN')}đ
                  </span>

                  <button
                    onClick={() => removeFromCart(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Adjustments: Discount %, Promo, Tax %, Tip */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Chiết khấu (%)</label>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2">
                <Percent className="w-3.5 h-3.5 text-slate-400 mr-1" />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={cart.discountPct || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCartDiscountPct(val);
                    const newSub = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
                    const newDisc = Math.round((newSub * val) / 100);
                    const newTot = newSub - newDisc + cart.tipAmount;
                    setCartPaidAmount(newTot);
                  }}
                  placeholder="0"
                  className="w-full py-1 text-xs font-bold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[11px] font-bold text-slate-600">Mã Voucher</label>
                {cart.promoCode && (() => {
                  const promo = promotions.find((p) => p.code.toUpperCase() === cart.promoCode.toUpperCase());
                  if (!promo) return <span className="text-[10px] text-rose-500 font-semibold">Không tồn tại</span>;
                  const isBranchValid = !promo.applicableBranchIds || promo.applicableBranchIds.length === 0 || promo.applicableBranchIds.includes(currentBranch?.id || '');
                  if (!isBranchValid) {
                    const validBranchName = promo.applicableBranchIds?.map((id) => branches.find((b) => b.id === id)?.name || id).join(', ');
                    return <span className="text-[10px] text-amber-600 font-semibold" title={`Chỉ áp dụng tại: ${validBranchName}`}>Chỉ tại {validBranchName}</span>;
                  }
                  return <span className="text-[10px] text-emerald-600 font-semibold">Hợp lệ ({promo.discountType === 'pct' ? `-${promo.discountValue}%` : `-${promo.discountValue.toLocaleString()}đ`})</span>;
                })()}
              </div>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2">
                <TicketPercent className="w-3.5 h-3.5 text-slate-400 mr-1" />
                <input
                  type="text"
                  value={cart.promoCode}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase();
                    setCartPromoCode(code);
                    const promo = promotions.find((p) => p.code.toUpperCase() === code);
                    if (promo) {
                      const isBranchValid = !promo.applicableBranchIds || promo.applicableBranchIds.length === 0 || promo.applicableBranchIds.includes(currentBranch?.id || '');
                      if (isBranchValid && promo.discountType === 'pct') {
                        setCartDiscountPct(promo.discountValue);
                        const newSub = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
                        const newDisc = Math.round((newSub * promo.discountValue) / 100);
                        setCartPaidAmount(newSub - newDisc + cart.tipAmount);
                      }
                    }
                  }}
                  placeholder="VIPDIAMOND"
                  className="w-full py-1 text-xs font-bold focus:outline-none uppercase"
                />
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Hình Thức Thanh Toán</label>
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
              {[
                { id: 'bank_transfer', label: 'Chuyển Khoản' },
                { id: 'cash', label: 'Tiền Mặt' },
                { id: 'card', label: 'Quẹt Thẻ' },
                { id: 'debt', label: 'Ghi Nợ' },
                { id: 'deposit', label: 'Trừ Cọc' },
                { id: 'split', label: 'Hỗn Hợp' }
              ].map((m) => {
                const isSelected = cart.paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setCartPaymentMethod(m.id as any);
                      if (m.id === 'debt') setCartPaidAmount(0);
                      else if (cart.paidAmount === 0) setCartPaidAmount(total);
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'text-white font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: currentTheme.buttonBg,
                            borderColor: currentTheme.buttonBg
                          }
                        : {}
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Totals Breakdown */}
          <div className="space-y-1 pt-2 border-t border-slate-200 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Tạm tính:</span>
              <span>{subtotal.toLocaleString('vi-VN')}đ</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Giảm giá ({cart.discountPct}%):</span>
                <span>-{discountAmount.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
              <span>TỔNG THANH TOÁN:</span>
              <span style={{ color: currentTheme.primaryColor }}>{total.toLocaleString('vi-VN')}đ</span>
            </div>

            {/* Paid input */}
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-slate-700">Khách thực trả:</span>
              <input
                type="number"
                value={cart.paidAmount}
                onChange={(e) => setCartPaidAmount(Number(e.target.value))}
                className="w-32 py-1 px-2 bg-white border rounded-lg text-right font-black text-xs text-slate-900 focus:ring-2"
                style={{ borderColor: currentTheme.primaryColor }}
              />
            </div>

            {debt > 0 && (
              <div className="flex justify-between font-bold text-rose-600">
                <span>Ghi nợ phiếu:</span>
                <span>{debt.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between font-bold text-emerald-600">
                <span>Tiền thối lại:</span>
                <span>{change.toLocaleString('vi-VN')}đ</span>
              </div>
            )}
          </div>
        </div>

        {/* Checkout Button */}
        <div className="p-4 bg-white border-t border-slate-200">
          <button
            onClick={checkoutCart}
            disabled={cart.items.length === 0}
            className="w-full py-3 text-white font-black text-sm rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${currentTheme.primaryColor}, ${currentTheme.secondaryColor})`,
              boxShadow: `0 4px 14px ${currentTheme.ringColor}`
            }}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>XÁC NHẬN THANH TOÁN & IN PHIẾU</span>
          </button>
        </div>
      </div>
    </div>
  );
};
