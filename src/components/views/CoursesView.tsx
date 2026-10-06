import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, CheckCircle2, History, PlusCircle, ShieldCheck, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CustomerCourse } from '../../types';

const mockNameMap: Record<string, string> = {
  'c-01': 'Chị Nguyễn Mai Anh',
  'c-02': 'Anh Trần Văn Hùng',
  'c-03': 'Chị Hoàng Bảo Ngọc',
  'c-04': 'Cô Nguyễn Thị Hoa',
  'c-05': 'Chị Lê Khánh Chi'
};

export const CoursesView: React.FC<{ onOpenDeductModal: (course: CustomerCourse) => void }> = ({ onOpenDeductModal }) => {
  const { courses, customers, sessionDeductions, staffList, branches, currentBranch, currentTheme } = useApp();
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCourseId, setActiveCourseId] = useState<string>(courses[0]?.id || '');

  const isSoftLight = currentTheme.isSoftLight;

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (selectedBranchId !== 'all') {
        const branchIndex = branches.findIndex((b) => b.id === selectedBranchId);
        const selectedBranch = branches[branchIndex];
        const matchBranch =
          c.soldBranchId === selectedBranchId ||
          (selectedBranch && c.soldBranchId === selectedBranch.code) ||
          (selectedBranch && c.soldBranchId?.includes(selectedBranch.code)) ||
          (branchIndex === 0 && (c.soldBranchId === '22222222-2222-2222-2222-222222222221' || !c.soldBranchId)) ||
          (branchIndex === 1 && c.soldBranchId === '22222222-2222-2222-2222-222222222222') ||
          (branchIndex === 2 && c.soldBranchId === '22222222-2222-2222-2222-222222222223');
        if (!matchBranch) return false;
      }

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const cust = customers.find((cust) => cust.id === c.customerId);
      const custName = (cust?.name || c.customerName || mockNameMap[c.customerId] || '').toLowerCase();
      const courseName = (c.name || '').toLowerCase();
      const phone = (cust?.phone || '').toLowerCase();

      return courseName.includes(q) || custName.includes(q) || phone.includes(q);
    });
  }, [courses, selectedBranchId, searchTerm, customers, branches]);

  const activeCourse = courses.find((c) => c.id === activeCourseId) || filteredCourses[0];
  const targetCust = activeCourse ? (customers.find((c) => c.id === activeCourse.customerId) || (activeCourse.customerName ? { id: activeCourse.customerId, name: activeCourse.customerName, phone: '', vipTier: 'standard' as const, totalSpent: 0, debt: 0, creditBalance: 0, orgId: '', primaryBranchId: '' } : null)) : null;
  const courseDeductions = sessionDeductions.filter((d) => d.courseId === activeCourse?.id);

  const activeCustName = targetCust?.name || activeCourse?.customerName || (activeCourse ? mockNameMap[activeCourse.customerId] : '') || 'Khách Hàng';
  const activeSoldBranch = branches.find((b) => b.id === activeCourse?.soldBranchId)?.name || 'Chi Nhánh Quận 1 (Trụ sở)';

  // Auto-sync active course when filter changes
  useEffect(() => {
    if (filteredCourses.length > 0 && !filteredCourses.some((c) => c.id === activeCourseId)) {
      setActiveCourseId(filteredCourses[0].id);
    }
  }, [filteredCourses, activeCourseId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in items-start pb-8">
      {/* Left: Active Courses Cards (6 cols) */}
      <div className="lg:col-span-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5" style={{ color: currentTheme.primaryColor }} />
            <div>
              <h2 className={`font-bold text-base ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
                Gói Liệu Trình Khách Hàng
              </h2>
              <p className={`text-[11px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-400'}`}>
                {selectedBranchId === 'all' ? 'Toàn bộ 3 chi nhánh' : branches.find((b) => b.id === selectedBranchId)?.name || 'Chi nhánh'} ({filteredCourses.length} gói)
              </p>
            </div>
          </div>

          {/* Branch Filter Selector */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 text-xs font-semibold self-start sm:self-auto">
            <button
              onClick={() => setSelectedBranchId('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                selectedBranchId === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({courses.length})
            </button>
            {branches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBranchId(b.id)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer truncate max-w-[120px] ${
                  selectedBranchId === b.id
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={b.name}
              >
                {b.name.split(' - ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên khách hàng, SĐT hoặc tên gói..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#B83D62] transition-all"
          />
        </div>

        <div className="space-y-3">
          {filteredCourses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              Không tìm thấy gói liệu trình nào phù hợp.
            </div>
          ) : (
            filteredCourses.map((crs) => {
              const cust = customers.find((c) => c.id === crs.customerId);
              const displayName = cust?.name || crs.customerName || mockNameMap[crs.customerId] || 'Khách hàng';
              const remaining = crs.totalSessions - crs.usedSessions;
              const isSelected = crs.id === (activeCourse?.id || activeCourseId);
              const progress = (crs.usedSessions / crs.totalSessions) * 100;
              const soldBranch = branches.find((b) => b.id === crs.soldBranchId);

              return (
                <div
                  key={crs.id}
                  onClick={() => setActiveCourseId(crs.id)}
                  className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-[#B83D62] shadow-sm'
                      : isSoftLight
                      ? 'border-[#E5E7E4] hover:border-[#B83D62]'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          isSoftLight ? 'bg-[#FFF1F5] text-[#244B3C] border-[#E5E7E4]' : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          Gói Điều Trị
                        </span>
                        {crs.allowInterBranch ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                            Liên chi nhánh
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            Nội bộ cơ sở
                          </span>
                        )}
                      </div>
                      <h4 className={`font-bold text-sm mt-1.5 ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{crs.name}</h4>
                      <p className={`text-xs font-semibold mt-0.5 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-600'}`}>
                        Khách: <b className="text-slate-900">{displayName}</b> • Bán tại: <b>{soldBranch ? soldBranch.name.split(' - ')[0] : 'Chi nhánh gốc'}</b>
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        crs.status === 'completed'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {crs.status === 'completed' ? 'Đã xong phác đồ' : 'Đang điều trị'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4 space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span className={isSoftLight ? 'text-[#59665F]' : 'text-slate-600'}>Tiến độ thực hiện:</span>
                      <span style={{ color: currentTheme.primaryColor }}>{crs.usedSessions} / {crs.totalSessions} Buổi ({Math.round(progress)}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: progress >= 100 ? '#94a3b8' : currentTheme.primaryColor
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className={isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}>
                      Còn lại: <b className="text-emerald-700 font-black">{remaining}</b> buổi
                    </span>

                    {remaining > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDeductModal(crs);
                        }}
                        className="text-white font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center space-x-1.5 transition-all text-xs hover:opacity-90 cursor-pointer active:scale-95"
                        style={{ backgroundColor: currentTheme.buttonBg }}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Trừ 1 Buổi Tại {currentBranch?.name.split(' - ')[0]}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Immutable Session Deductions Ledger (6 cols) */}
      <div
        className={`lg:col-span-6 bg-white rounded-2xl p-6 border space-y-5 ${
          isSoftLight ? 'border-[#E5E7E4]' : 'border-slate-200/80'
        }`}
        style={isSoftLight ? { boxShadow: '0 2px 8px rgba(24,39,32,0.04)' } : undefined}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C] font-serif-heading' : 'text-slate-800'}`}>
                Nhật Ký Thực Hiện Buổi (Ledger Bất Biến)
              </h3>
              <p className="text-[10px] text-slate-400">Ghi nhận minh bạch từng buổi theo chuẩn y khoa & cơ sở thực hiện</p>
            </div>
          </div>
          <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        {activeCourse ? (
          <div className="space-y-4">
            <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
              isSoftLight ? 'bg-[#FAFAF8] border-[#E5E7E4]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <p className={`font-bold text-sm ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{activeCourse.name}</p>
                <p className={`text-xs font-semibold mt-0.5 ${isSoftLight ? 'text-[#59665F]' : 'text-slate-600'}`}>
                  Khách Hàng: <b className="text-slate-900 font-bold">{activeCustName}</b> • Nơi mua: <b>{activeSoldBranch.split(' - ')[0]}</b>
                </p>
              </div>
              <div className="text-right">
                <span className="font-black text-sm" style={{ color: currentTheme.primaryColor }}>
                  {activeCourse.usedSessions}/{activeCourse.totalSessions}
                </span>
                <p className="text-[10px] text-slate-400">Buổi hoàn thành</p>
              </div>
            </div>

            {/* Deduction Timeline */}
            <div className="space-y-3">
              {courseDeductions.length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400">
                  Chưa có lượt thực hiện nào được ghi nhận cho gói này.
                </p>
              ) : (
                courseDeductions.map((ded) => {
                  const staff = staffList.find((s) => s.id === ded.staffId);
                  const performedBranch = branches.find((b) => b.id === ded.branchId);

                  return (
                    <div
                      key={ded.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="font-bold text-slate-900">Trừ {ded.sessionsDeducted} buổi điều trị</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">{ded.performedAt}</span>
                      </div>

                      <p className="text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 text-[11px]">
                        "{ded.notes}"
                      </p>

                      <div className="flex flex-wrap items-center justify-between pt-1 text-[11px] text-slate-500 gap-1">
                        <span>Cơ sở làm: <b className="text-indigo-700">{performedBranch?.name || 'Chi nhánh'}</b></span>
                        <span>KTV: <b className="text-slate-800">{staff?.name || ded.staffId}</b> • Ký: <b>{ded.customerSignature}</b></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-10">Chọn một gói liệu trình để xem lịch sử buổi làm.</p>
        )}
      </div>
    </div>
  );
};
