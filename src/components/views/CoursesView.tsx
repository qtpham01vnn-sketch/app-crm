import React, { useState, useMemo } from 'react';
import { Sparkles, CheckCircle2, History, PlusCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CustomerCourse } from '../../types';

export const CoursesView: React.FC<{ onOpenDeductModal: (course: CustomerCourse) => void }> = ({ onOpenDeductModal }) => {
  const { courses, customers, sessionDeductions, staffList, branches, currentBranch, currentTheme } = useApp();
  const [courseScope, setCourseScope] = useState<'branch' | 'all'>('all');
  const [activeCourseId, setActiveCourseId] = useState<string>(courses[0]?.id || '');

  const isSoftLight = currentTheme.isSoftLight;

  const filteredCourses = useMemo(() => {
    if (courseScope === 'branch') {
      return courses.filter((c) => c.soldBranchId === currentBranch?.id || c.allowInterBranch);
    }
    return courses;
  }, [courses, courseScope, currentBranch]);

  const activeCourse = courses.find((c) => c.id === activeCourseId) || filteredCourses[0];
  const targetCust = activeCourse ? customers.find((c) => c.id === activeCourse.customerId) : null;
  const courseDeductions = sessionDeductions.filter((d) => d.courseId === activeCourse?.id);

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
                {courseScope === 'branch' ? `Khả dụng tại ${currentBranch?.name}` : 'Toàn hệ thống'} ({filteredCourses.length} gói)
              </p>
            </div>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-slate-100 text-xs font-semibold self-start sm:self-auto">
            <button
              onClick={() => setCourseScope('branch')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                courseScope === 'branch'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tại chi nhánh
            </button>
            <button
              onClick={() => setCourseScope('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                courseScope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({courses.length})
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredCourses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              Không có gói liệu trình nào đang hoạt động tại cơ sở này.
            </div>
          ) : (
            filteredCourses.map((crs) => {
              const cust = customers.find((c) => c.id === crs.customerId);
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
                        Khách: {cust?.name || 'Khách hàng'} • Bán tại: <b>{soldBranch ? soldBranch.name.split(' - ')[0] : 'Chi nhánh gốc'}</b>
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
                <p className={`font-bold ${isSoftLight ? 'text-[#244B3C]' : 'text-slate-900'}`}>{activeCourse.name}</p>
                <p className={`text-[11px] ${isSoftLight ? 'text-[#59665F]' : 'text-slate-500'}`}>
                  Khách: <b>{targetCust?.name}</b> • Nơi mua: <b>{branches.find((b) => b.id === activeCourse.soldBranchId)?.name || 'Chi nhánh'}</b>
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
