import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  X,
  Search,
  Flame,
  Eye,
  Edit2,
  Zap,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { Service } from '../../types';

export const SvcView: React.FC = () => {
  const { services, setServices, staffList, org, showToast, isLiveMode, setActiveTab } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Massage');
  const [basePrice, setBasePrice] = useState<number>(590000);
  const [promoPrice, setPromoPrice] = useState<number | ''>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [bufferBefore, setBufferBefore] = useState<number>(5);
  const [bufferAfter, setBufferAfter] = useState<number>(10);
  const [commissionPct, setCommissionPct] = useState<number>(10);
  const [description, setDescription] = useState('');
  const [allowOnline, setAllowOnline] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  // Category list & counts
  const predefinedCategories = [
    { name: 'Massage', count: services.filter((s) => s.category?.toLowerCase().includes('massage')).length || 18, active: 16, hidden: 2, icon: '💆‍♀️' },
    { name: 'Chăm sóc da', count: services.filter((s) => s.category?.toLowerCase().includes('da') || s.category?.toLowerCase().includes('facial')).length || 15, active: 14, hidden: 1, icon: '✨' },
    { name: 'Gội đầu dưỡng sinh', count: services.filter((s) => s.category?.toLowerCase().includes('gội') || s.category?.toLowerCase().includes('head')).length || 12, active: 11, hidden: 1, icon: '🌿' },
    { name: 'Combo trị liệu', count: services.filter((s) => s.category?.toLowerCase().includes('combo')).length || 10, active: 9, hidden: 1, icon: '🌸' }
  ];

  const filteredServices = services.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat =
      selectedCategory === 'all' ||
      s.category.toLowerCase().includes(selectedCategory.toLowerCase());
    const matchStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'active' && s.isActive && !s.isFeatured) ||
      (selectedStatus === 'featured' && s.isFeatured) ||
      (selectedStatus === 'hidden' && !s.isActive);
    return matchSearch && matchCat && matchStatus;
  });

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showToast('⚠️ Vui lòng nhập mã và tên dịch vụ', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLiveMode) {
        if (!org?.id) {
          throw new Error('Chưa xác định tổ chức hợp lệ để tạo dịch vụ.');
        }

        const createdSvc = await masterDataService.createService(
          {
            code: code.trim(),
            name: name.trim(),
            category: category.trim(),
            basePrice: Number(basePrice),
            durationMinutes: Number(durationMinutes),
            commissionPct: Number(commissionPct),
            description: description.trim() || undefined,
            bufferMinutesBefore: bufferBefore,
            bufferMinutesAfter: bufferAfter,
            allowOnlineBooking: allowOnline,
            isFeatured
          },
          org.id
        );

        if (!createdSvc) {
          throw new Error('Máy chủ Supabase không phản hồi dữ liệu sau khi tạo dịch vụ.');
        }

        createdSvc.assignedStaffIds = selectedStaffIds;
        setServices((prev) => [createdSvc, ...prev]);
        showToast(`✅ Đã thêm dịch vụ: ${createdSvc.name} vào hệ thống`, 'success');
      } else {
        const demoSvc: Service = {
          id: `svc_demo_${Date.now()}`,
          orgId: org?.id || 'demo-org',
          code: code.trim().toUpperCase(),
          name: name.trim(),
          category: category.trim(),
          basePrice: Number(basePrice),
          promoPrice: promoPrice ? Number(promoPrice) : undefined,
          durationMinutes: Number(durationMinutes),
          commissionPct: Number(commissionPct),
          description: description.trim() || undefined,
          bufferMinutesBefore: bufferBefore,
          bufferMinutesAfter: bufferAfter,
          allowOnlineBooking: allowOnline,
          isFeatured,
          assignedStaffIds: selectedStaffIds,
          isActive: true
        };
        setServices((prev) => [demoSvc, ...prev]);
        showToast(`ℹ️ [Demo Mode] Đã thêm dịch vụ: ${demoSvc.name} vào bộ nhớ thử nghiệm`, 'info');
      }

      setIsModalOpen(false);
      setCode('');
      setName('');
      setBasePrice(590000);
      setPromoPrice('');
      setDurationMinutes(60);
      setCommissionPct(10);
      setDescription('');
      setIsFeatured(false);
      setSelectedStaffIds([]);
    } catch (err: unknown) {
      let msg = 'Lỗi lưu dịch vụ';
      if (typeof err === 'string') msg = err;
      else if (err instanceof Error) msg = err.message;
      else if (typeof err === 'object' && err !== null) {
        const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
        msg = anyErr.message || anyErr.details || anyErr.hint || `Lỗi Supabase (Mã: ${anyErr.code || 'UNKNOWN'})`;
      }
      showToast(`❌ Lỗi tạo dịch vụ: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🌸</span>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Dịch Vụ & Bảng Giá</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý danh mục dịch vụ, cấu hình giá, thời lượng và gán kỹ thuật viên đủ kỹ năng phục vụ.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-rose-500/20 flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Dịch Vụ</span>
          </button>
        </div>
      </div>

      {/* 2. Top Category Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {predefinedCategories.map((cat, idx) => {
          const isSelected = selectedCategory.toLowerCase().includes(cat.name.toLowerCase());
          return (
            <div
              key={idx}
              onClick={() => setSelectedCategory(isSelected ? 'all' : cat.name)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-xs hover:shadow-md ${
                isSelected ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg shadow-xs">
                    {cat.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">{cat.name}</h4>
                    <p className="text-xl font-black text-slate-900 mt-0.5">{cat.count}</p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">dịch vụ</span>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đang áp dụng: {cat.active}
                </span>
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> Tạm ẩn: {cat.hidden}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Main Body: Table (Left 8 cols) + Right Sidebar (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Services Data Table */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm dịch vụ, mã dịch vụ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 font-medium"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none font-semibold text-slate-700"
              >
                <option value="all">Danh mục: Tất cả</option>
                <option value="Massage">Massage</option>
                <option value="Chăm sóc da">Chăm sóc da</option>
                <option value="Gội đầu dưỡng sinh">Gội đầu dưỡng sinh</option>
                <option value="Combo trị liệu">Combo trị liệu</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none font-semibold text-slate-700"
              >
                <option value="all">Trạng thái: Tất cả</option>
                <option value="active">Đang áp dụng</option>
                <option value="featured">Nổi bật</option>
                <option value="hidden">Tạm ẩn</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-rose-50/40 border-b border-rose-100/60 text-slate-700 font-bold">
                  <th className="p-3">Mã DV</th>
                  <th className="p-3">Tên Dịch Vụ</th>
                  <th className="p-3">Danh Mục</th>
                  <th className="p-3 text-center">Thời Lượng</th>
                  <th className="p-3 text-right">Giá Niêm Yết</th>
                  <th className="p-3 text-right">Giá Ưu Đãi</th>
                  <th className="p-3 text-center">KTV Phù Hợp</th>
                  <th className="p-3 text-center">Lượt Đặt</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      Không tìm thấy dịch vụ nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((svc, idx) => {
                    const matchedStaff = staffList.slice(0, 3);
                    const isEven = idx % 2 === 0;
                    return (
                      <tr key={svc.id} className={`hover:bg-slate-50/80 transition-colors ${isEven ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <td className="p-3 font-mono font-bold text-slate-700">{svc.code}</td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center font-bold text-rose-600 text-xs shrink-0">
                              {svc.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{svc.name}</p>
                              {svc.description && <p className="text-[10px] text-slate-400 line-clamp-1">{svc.description}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {svc.category}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-600 font-medium">{svc.durationMinutes} phút</td>
                        <td className="p-3 text-right font-bold text-slate-900">{svc.basePrice.toLocaleString('vi-VN')} đ</td>
                        <td className="p-3 text-right font-bold text-rose-600">
                          {svc.promoPrice ? `${svc.promoPrice.toLocaleString('vi-VN')} đ` : (
                            svc.basePrice > 400000 ? `${(svc.basePrice * 0.8).toLocaleString('vi-VN')} đ` : '—'
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center -space-x-1.5">
                            {matchedStaff.map((st, sIdx) => (
                              <div
                                key={st.id || sIdx}
                                title={st.name}
                                className="w-6 h-6 rounded-full bg-gradient-to-tr from-rose-400 to-amber-400 text-white font-black text-[9px] flex items-center justify-center border-2 border-white shadow-xs"
                              >
                                {st.name.slice(0, 1)}
                              </div>
                            ))}
                            <span className="text-[10px] font-bold text-slate-400 pl-2">+2</span>
                          </div>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700">{svc.monthlyBookingCount || 80 + (idx * 17) % 65}</td>
                        <td className="p-3 text-center">
                          {svc.isFeatured ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Nổi bật
                            </span>
                          ) : svc.isActive ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              Đang áp dụng
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              Tạm ẩn
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <span>Hiển thị {filteredServices.length} trên tổng số {services.length} dịch vụ</span>
            <div className="flex items-center space-x-1">
              <button className="px-2.5 py-1 bg-rose-500 text-white font-bold rounded-lg shadow-xs">1</button>
              <button className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">2</button>
              <button className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">3</button>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Top Services, Combos & Flash Promo */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card 1: Top Dịch Vụ Bán Chạy */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <Flame className="w-4 h-4 text-rose-500" /> Top Dịch Vụ Bán Chạy
              </h3>
              <button className="text-[11px] text-rose-600 font-semibold hover:underline">Xem tất cả</button>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { rank: 1, name: 'Gội đầu dưỡng sinh Thảo dược', count: 143, price: '299.000 đ' },
                { rank: 2, name: 'Massage thư giãn Body Relax', count: 128, price: '599.000 đ' },
                { rank: 3, name: 'Chăm sóc da cơ bản Basic Facial', count: 112, price: '499.000 đ' },
                { rank: 4, name: 'Massage đá nóng Hot Stone', count: 97, price: '790.000 đ' },
                { rank: 5, name: 'Massage cổ vai gáy Neck & Shoulder', count: 91, price: '250.000 đ' }
              ].map((item) => (
                <div key={item.rank} className="flex items-center justify-between p-2 rounded-xl hover:bg-rose-50/40 transition-colors">
                  <div className="flex items-center space-x-2.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      item.rank === 1 ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.rank}
                    </span>
                    <div>
                      <p className="font-bold text-slate-800 line-clamp-1">{item.name}</p>
                      <p className="text-[10px] text-slate-400">{item.price}</p>
                    </div>
                  </div>
                  <span className="font-black text-xs text-slate-900 shrink-0">{item.count} lượt</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Gói Combo Nổi Bật */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-amber-500" /> Gói Combo Nổi Bật
              </h3>
              <button onClick={() => setActiveTab('pkg')} className="text-[11px] text-rose-600 font-semibold hover:underline">Xem tất cả</button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-gradient-to-r from-rose-50 to-amber-50/50 border border-rose-100 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">Combo Thư Giãn Toàn Thân</h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md">★ Nổi bật</span>
                </div>
                <p className="text-[11px] text-slate-500">120 phút • 3 dịch vụ liên hoàn</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-black text-rose-600">1.090.000 đ</span>
                  <span className="text-[10px] text-slate-400 line-through">1.490.000 đ</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">Combo Chăm Sóc Da Nâng Cao</h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded-md">Hot Deal</span>
                </div>
                <p className="text-[11px] text-slate-500">120 phút • Trị liệu chuyên sâu</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-black text-rose-600">1.190.000 đ</span>
                  <span className="text-[10px] text-slate-400 line-through">1.690.000 đ</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Khuyến Mãi Flash Đang Áp Dụng */}
          <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-500/20 space-y-3">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
              <h3 className="font-bold text-sm">Khuyến Mãi Flash Đang Áp Dụng</h3>
            </div>
            <p className="text-xs text-rose-100 leading-relaxed">
              Ưu đãi đặc biệt trong thời gian ngắn, tăng trải nghiệm và thúc đẩy đặt lịch nhanh chóng.
            </p>
            <button
              onClick={() => setActiveTab('promos')}
              className="w-full py-2.5 bg-white text-rose-600 font-bold text-xs rounded-xl shadow-md hover:bg-rose-50 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <span>Tạo chương trình Flash</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Modal "+ Thêm Dịch Vụ Mới" */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Thêm Dịch Vụ Mới</h3>
                  <p className="text-xs text-slate-500">Khai báo thông tin dịch vụ, bảng giá chuẩn và kỹ thuật viên phụ trách</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateService} className="space-y-4 text-xs overflow-y-auto pt-4 pr-1 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Mã dịch vụ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="DV011..."
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase focus:bg-white focus:ring-2 focus:ring-rose-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Tên dịch vụ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Massage Trị Liệu Cổ Vai Gáy Chuyên Sâu..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Danh mục nhóm</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400"
                  >
                    <option value="Massage">Massage thư giãn & trị liệu</option>
                    <option value="Chăm sóc da">Chăm sóc da & Facial</option>
                    <option value="Gội đầu dưỡng sinh">Gội đầu dưỡng sinh thảo dược</option>
                    <option value="Combo trị liệu">Combo trị liệu tổng hợp</option>
                    <option value="Nha khoa">Nha khoa & Thẩm mỹ răng</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Thời lượng (phút)</label>
                  <input
                    type="number"
                    min={15}
                    step={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Giá niêm yết (VND) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Giá ưu đãi / Khuyến mãi (VND)</label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    placeholder="Để trống nếu không có ưu đãi"
                    value={promoPrice}
                    onChange={(e) => setPromoPrice(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Buffer trước ca (phút)</label>
                  <input
                    type="number"
                    min={0}
                    value={bufferBefore}
                    onChange={(e) => setBufferBefore(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Buffer dọn dẹp sau ca (phút)</label>
                  <input
                    type="number"
                    min={0}
                    value={bufferAfter}
                    onChange={(e) => setBufferAfter(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mô tả dịch vụ & Quy trình thực hiện</label>
                <textarea
                  rows={2}
                  placeholder="Gồm các bước tẩy trang, xông hơi, massage đá nóng và đắp mặt nạ..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div className="flex items-center space-x-4 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowOnline}
                    onChange={(e) => setAllowOnline(e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded"
                  />
                  <span className="font-semibold text-slate-700">Cho phép khách đặt Online</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded"
                  />
                  <span className="font-semibold text-slate-700">Đánh dấu Dịch vụ Nổi bật</span>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu Dịch Vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
