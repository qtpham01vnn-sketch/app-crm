import React, { useState } from 'react';
import { Sparkles, CheckCircle2, History, PlusCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CustomerCourse } from '../../types';

export const CoursesView: React.FC<{ onOpenDeductModal: (course: CustomerCourse) => void }> = ({ onOpenDeductModal }) => {
  const { courses, customers, sessionDeductions, staffList } = useApp();
  const [activeCourseId, setActiveCourseId] = useState<string>(courses[0]?.id || '');

  const activeCourse = courses.find((c) => c.id === activeCourseId);
  const targetCust = activeCourse ? customers.find((c) => c.id === activeCourse.customerId) : null;
  const courseDeductions = sessionDeductions.filter((d) => d.courseId === activeCourseId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in items-start">
      {/* Left: Active Courses Cards (6 cols) */}
      <div className="lg:col-span-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-800">Gói Liệu Trình Khách Hàng ({courses.length})</h3>
          </div>
        </div>

        <div className="space-y-3">
          {courses.map((crs) => {
            const cust = customers.find((c) => c.id === crs.customerId);
            const remaining = crs.totalSessions - crs.usedSessions;
            const isSelected = crs.id === activeCourseId;
            const progress = (crs.usedSessions / crs.totalSessions) * 100;

            return (
              <div
                key={crs.id}
                onClick={() => setActiveCourseId(crs.id)}
                className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer shadow-xs ${
                  isSelected
                    ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-md'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-800">
                      Gói Điều Trị
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 mt-1.5">{crs.name}</h4>
                    <p className="text-xs text-slate-600 font-semibold mt-0.5">Khách: {cust?.name || 'Khách hàng'}</p>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      crs.status === 'completed'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {crs.status === 'completed' ? 'Đã xong phác đồ' : 'Đang điều trị'}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-4 space-y-1 text-xs">
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>Tiến độ thực hiện:</span>
                    <span className="text-sky-700">{crs.usedSessions} / {crs.totalSessions} Buổi ({Math.round(progress)}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        progress >= 100 ? 'bg-slate-400' : 'bg-gradient-to-r from-sky-500 to-amber-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Còn lại: <b className="text-emerald-700 font-black">{remaining}</b> buổi
                  </span>

                  {remaining > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDeductModal(crs);
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center space-x-1.5 transition-all text-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Trừ 1 Buổi Làm</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Immutable Session Deductions Ledger (6 cols) */}
      <div className="lg:col-span-6 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-bold text-sm text-slate-800">Nhật Ký Thực Hiện Buổi (Ledger Bất Biến)</h3>
              <p className="text-[10px] text-slate-400">Ghi nhận minh bạch từng buổi theo chuẩn y khoa</p>
            </div>
          </div>
          <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        {activeCourse ? (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-slate-900">{activeCourse.name}</p>
                <p className="text-slate-500 text-[11px]">Khách: {targetCust?.name}</p>
              </div>
              <div className="text-right">
                <span className="font-black text-sm text-sky-700">
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
                  return (
                    <div
                      key={ded.id}
                      className="p-4 rounded-xl bg-indigo-50/30 border border-indigo-100 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="font-bold text-slate-900">Trừ {ded.sessionsDeducted} buổi điều trị</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">{ded.performedAt}</span>
                      </div>

                      <p className="text-slate-600 bg-white p-2.5 rounded-lg border border-indigo-100/60 text-[11px]">
                        "{ded.notes}"
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                        <span>KTV / Bác sĩ: <b className="text-slate-800">{staff?.name || ded.staffId}</b></span>
                        <span>Khách ký: <b className="text-slate-800">{ded.customerSignature}</b></span>
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
