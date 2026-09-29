import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  X,
  Search,
  Flame,
  Eye,
  Edit2,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { Service } from '../../types';

export const SvcView: React.FC = () => {
  const { services, setServices, org, currentTheme, showToast, isLiveMode, setActiveTab } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const isSoftLight = currentTheme.isSoftLight;

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Massage');
  const [basePrice, setBasePrice] = useState<number>(590000);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [bufferBefore] = useState<number>(5);
  const [bufferAfter] = useState<number>(10);
  const [commissionPct, setCommissionPct] = useState<number>(10);
  const [description, setDescription] = useState('');
  const [allowOnline] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [selectedStaffIds] = useState<string[]>([]);

  // Category list & counts
  const predefinedCategories = useMemo(() => [
    { name: 'Massage', count: services.filter((s) => s.category?.toLowerCase().includes('massage')).length || 18, active: 16, hidden: 2, icon: '💆‍♀️' },
    { name: 'Chăm sóc da', count: services.filter((s) => s.category?.toLowerCase().includes('da') || s.category?.toLowerCase().includes('facial')).length || 15, active: 14, hidden: 1, icon: '✨' },
    { name: 'Gội đầu dưỡng sinh', count: services.filter((s) => s.category?.toLowerCase().includes('gội') || s.category?.toLowerCase().includes('head')).length || 12, active: 11, hidden: 1, icon: '🌿' },
    { name: 'Combo trị liệu', count: services.filter((s) => s.category?.toLowerCase().includes('combo')).length || 10, active: 9, hidden: 1, icon: '🌸' }
  ], [services]);

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchSearch =
        searchTerm.trim() === '' ||
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
  }, [services, searchTerm, selectedCategory, selectedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize));
  const paginatedServices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredServices.slice(start, start + pageSize);
  }, [filteredServices, currentPage, pageSize]);

  const isFiltered = searchTerm.trim() !== '' || selectedCategory !== 'all' || selectedStatus !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedStatus('all');
    setCurrentPage(1);
  };

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
          orgId: org.id,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          category: category.trim(),
          basePrice: Number(basePrice),
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
      setDurationMinutes(60);
      setCommissionPct(10);
      setDescription('');
      setIsFeatured(false);
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
    <div className="space-y-5 animate-fade-in pb-12 w-full max-w-full">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🌸</span>
            <h1 className={`text-xl md:text-2xl font-black tracking-tight ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-900'}`}>
              Dịch Vụ & Bảng Giá
            </h1>
          </div>
          <p className={`text-xs mt-0.5 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
            Quản lý danh mục dịch vụ, cấu hình giá niêm yết, thời lượng và gán kỹ thuật viên đủ kỹ năng phục vụ.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer hover:opacity-90 active:scale-95 shadow-xs"
          style={{ backgroundColor: currentTheme.buttonBg }}
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Dịch Vụ</span>
        </button>
      </div>

      {/* 2. Top Category Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {predefinedCategories.map((cat, idx) => {
          const isSelected = selectedCategory.toLowerCase().includes(cat.name.toLowerCase());
          return (
            <div
              key={idx}
              onClick={() => {
                setSelectedCategory(isSelected ? 'all' : cat.name);
                setCurrentPage(1);
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'ring-2 ring-[#B83D62] shadow-sm'
                  : isSoftLight
                  ? 'bg-white border-[#E5E7E4] hover:border-[#B83D62]'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
              style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-xs"
                    style={{ backgroundColor: currentTheme.iconBg, color: currentTheme.primaryColor }}
                  >
                    {cat.icon}
                  </div>
                  <div>
                    <h4 className={`font-bold text-xs ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{cat.name}</h4>
                    <p className={`text-xl font-black mt-0.5 ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{cat.count}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>dịch vụ</span>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đang dùng: {cat.active}
                </span>
                <span className={`font-medium flex items-center gap-1 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> Tạm ẩn: {cat.hidden}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Main Body: Full-Width Services Table Workspace */}
      <div
        className={`bg-white rounded-2xl p-4 sm:p-5 border space-y-4 transition-shadow ${
          isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
        }`}
        style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
      >
        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm dịch vụ, mã dịch vụ..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-10 pl-9 pr-3 border rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F] focus:ring-[#B83D62]'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
              }`}
            />
          </div>

          <div className="shrink-0 min-w-[150px]">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-10 px-3 border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <option value="all">Danh mục: Tất cả</option>
              <option value="Massage">Massage</option>
              <option value="Chăm sóc da">Chăm sóc da</option>
              <option value="Gội đầu dưỡng sinh">Gội đầu dưỡng sinh</option>
              <option value="Combo trị liệu">Combo trị liệu</option>
            </select>
          </div>

          <div className="shrink-0 min-w-[140px]">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-10 px-3 border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer ${
                isSoftLight
                  ? 'bg-[#FAFAF8] border-[#E5E7E4] text-[#26342F]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <option value="all">Trạng thái: Tất cả</option>
              <option value="active">Đang áp dụng</option>
              <option value="featured">Nổi bật</option>
              <option value="hidden">Tạm ẩn</option>
            </select>
          </div>

          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className={`h-10 px-3 rounded-xl text-xs font-bold border flex items-center space-x-1.5 transition-all cursor-pointer ${
                isSoftLight
                  ? 'bg-rose-50 hover:bg-rose-100 text-[#B83D62] border-rose-200'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className={`border-b font-bold ${
                isSoftLight
                  ? 'bg-[#FFF1F5]/70 border-[#E5E7E4] text-[#244B3C]'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <th className="py-3 px-3.5 w-24">Mã DV</th>
                <th className="py-3 px-3.5">Tên Dịch Vụ</th>
                <th className="py-3 px-3.5">Danh Mục</th>
                <th className="py-3 px-3.5 text-center">Thời Lượng</th>
                <th className="py-3 px-3.5 text-right">Giá Niêm Yết</th>
                <th className="py-3 px-3.5 text-right">Giá Ưu Đãi</th>
                <th className="py-3 px-3.5 text-center">Trạng Thái</th>
                <th className="py-3 px-3.5 text-center w-24">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {paginatedServices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-2">
                      <p className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-800'}`}>
                        Không tìm thấy dịch vụ nào
                      </p>
                      <p className={`text-xs ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
                        Không có dịch vụ khớp với từ khóa hoặc danh mục đã chọn.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedServices.map((svc) => {
                  return (
                    <tr
                      key={svc.id}
                      className={`transition-colors ${
                        isSoftLight ? 'hover:bg-[#FFF1F5]/40' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-700">{svc.code}</td>
                      <td className="py-3 px-3.5">
                        <p className={`font-bold ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{svc.name}</p>
                        {svc.description && <p className="text-[11px] text-slate-400 line-clamp-1">{svc.description}</p>}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                          isSoftLight ? 'bg-[#FAFAF8] text-[#59665F] border-[#E5E7E4]' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {svc.category}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center font-semibold text-slate-600">
                        {svc.durationMinutes} phút
                      </td>
                      <td className="py-3 px-3.5 text-right font-bold text-slate-700">
                        {svc.basePrice.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="py-3 px-3.5 text-right font-black" style={{ color: currentTheme.primaryColor }}>
                        {svc.basePrice.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        {svc.isFeatured ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            ★ Nổi bật
                          </span>
                        ) : svc.isActive ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Đang dùng
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            Tạm ẩn
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => showToast(`Dịch vụ: ${svc.name}`, 'info')}
                            title="Xem chi tiết"
                            className="p-1.5 text-slate-500 hover:text-[#B83D62] hover:bg-[#FFF1F5] rounded-lg transition-all cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => showToast('Mở trình chỉnh sửa dịch vụ', 'info')}
                            title="Chỉnh sửa"
                            className="p-1.5 text-slate-500 hover:text-[#B83D62] hover:bg-[#FFF1F5] rounded-lg transition-all cursor-pointer"
                          >
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

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-2 font-sans">
          <span>
            {filteredServices.length === 0
              ? 'Hiển thị 0 trong tổng số 0 dịch vụ'
              : `Hiển thị ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredServices.length)} trong tổng số ${filteredServices.length} dịch vụ`}
          </span>

          {filteredServices.length > 0 && totalPages > 1 && (
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`w-7 h-7 font-bold rounded-lg transition-all ${
                    currentPage === pg
                      ? 'text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-[#FFF1F5]'
                  }`}
                  style={currentPage === pg ? { backgroundColor: currentTheme.buttonBg } : undefined}
                >
                  {pg}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Secondary Promos & Combos Grid (Placed cleanly below table) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {/* Card 1: Top Dịch Vụ Bán Chạy */}
        <div
          className={`bg-white rounded-2xl p-5 border space-y-3.5 ${
            isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <h3 className={`font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
              <Flame className="w-4 h-4 text-rose-500" /> Top Dịch Vụ Bán Chạy
            </h3>
            <span className={`text-[11px] font-semibold ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>
              Toàn hệ thống
            </span>
          </div>

          <div className="space-y-2.5 text-xs font-sans">
            {[
              { rank: 1, name: 'Gội đầu dưỡng sinh Thảo dược', count: 143, price: '299.000 đ' },
              { rank: 2, name: 'Massage thư giãn Body Relax', count: 128, price: '599.000 đ' },
              { rank: 3, name: 'Chăm sóc da cơ bản Basic Facial', count: 112, price: '499.000 đ' },
              { rank: 4, name: 'Massage đá nóng Hot Stone', count: 97, price: '790.000 đ' }
            ].map((item) => (
              <div key={item.rank} className="flex items-center justify-between p-2 rounded-xl hover:bg-[#FFF1F5]/40 transition-colors">
                <div className="flex items-center space-x-2.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                    item.rank === 1 ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.rank}
                  </span>
                  <div>
                    <p className={`font-bold line-clamp-1 ${isSoftLight ? 'text-[#26342F]' : 'text-slate-800'}`}>{item.name}</p>
                    <p className="text-[10px] text-slate-400">{item.price}</p>
                  </div>
                </div>
                <span className="font-black text-xs text-slate-900 shrink-0">{item.count} lượt</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Gói Combo Nổi Bật */}
        <div
          className={`bg-white rounded-2xl p-5 border space-y-3.5 ${
            isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
          }`}
          style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
        >
          <div className="flex items-center justify-between">
            <h3 className={`font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>
              <Sparkles className="w-4 h-4 text-amber-500" /> Gói Combo Nổi Bật
            </h3>
            <button onClick={() => setActiveTab('pkg')} className="text-[11px] font-bold hover:underline cursor-pointer" style={{ color: currentTheme.primaryColor }}>
              Xem tất cả
            </button>
          </div>

          <div className="space-y-2.5 text-xs font-sans">
            <div className="p-3 rounded-xl bg-[#FFF1F5]/60 border border-[#E5E7E4] space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Combo Thư Giãn Toàn Thân</h4>
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md">★ Nổi bật</span>
              </div>
              <p className={`text-[11px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>120 phút • 3 dịch vụ liên hoàn</p>
              <div className="flex items-center justify-between pt-1">
                <span className="font-black" style={{ color: currentTheme.primaryColor }}>1.090.000 đ</span>
                <span className="text-[10px] text-slate-400 line-through">1.490.000 đ</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Combo Chăm Sóc Da Nâng Cao</h4>
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded-md">Hot Deal</span>
              </div>
              <p className={`text-[11px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>120 phút • Trị liệu chuyên sâu</p>
              <div className="flex items-center justify-between pt-1">
                <span className="font-black" style={{ color: currentTheme.primaryColor }}>1.190.000 đ</span>
                <span className="text-[10px] text-slate-400 line-through">1.690.000 đ</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Thêm Dịch Vụ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className={`font-bold text-base ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-900'}`}>
                Thêm Dịch Vụ Mới
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateService} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã DV *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: DV-MASSAGE-01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Danh Mục *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  >
                    <option value="Massage">Massage</option>
                    <option value="Chăm sóc da">Chăm sóc da</option>
                    <option value="Gội đầu dưỡng sinh">Gội đầu dưỡng sinh</option>
                    <option value="Combo trị liệu">Combo trị liệu</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên Dịch Vụ *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Massage Toàn Thân Tinh Dầu Oải Hương"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giá Niêm Yết (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={10000}
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Thời Lượng (Phút) *</label>
                  <input
                    type="number"
                    required
                    min={15}
                    step={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả dịch vụ</label>
                <textarea
                  rows={2}
                  placeholder="Giới thiệu quy trình trị liệu và công dụng..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#B83D62] outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: currentTheme.buttonBg }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Thêm Dịch Vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
