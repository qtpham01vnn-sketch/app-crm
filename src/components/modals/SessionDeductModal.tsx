import React, { useState, useEffect } from 'react';
import { Sparkles, X, FileCheck, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CustomerCourse } from '../../types';

export const SessionDeductModal: React.FC<{
  course: CustomerCourse | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ course, isOpen, onClose }) => {
  const { staffList, currentUser, deductSession } = useApp();

  const [staffId, setStaffId] = useState(currentUser.id);
  const [notes, setNotes] = useState('');

  const nextSessionNum = course ? (course.usedSessions || 0) + 1 : 1;

  useEffect(() => {
    if (course) {
      setNotes(`Buổi ${nextSessionNum}: Thực hiện liệu trình theo phác đồ chuẩn y khoa. Tình trạng đáp ứng tốt.`);
    }
  }, [course, nextSessionNum]);

  if (!isOpen || !course) return null;

  const remaining = course.totalSessions - course.usedSessions;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    deductSession(course.id, staffId, notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base">Xác Nhận Trừ Buổi #{nextSessionNum} / {course.totalSessions}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Course summary badge */}
          <div className="p-3.5 bg-sky-50 rounded-xl border border-sky-200 space-y-1">
            <p className="font-bold text-sm text-sky-900">{course.name}</p>
            <div className="flex justify-between text-slate-600 pt-1">
              <span>Đang trừ lượt: <b className="text-indigo-700 font-black">Buổi #{nextSessionNum}</b></span>
              <span>Còn lại sau trừ: <b className="text-emerald-700 font-black">{remaining - 1}</b> buổi</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Kỹ thuật viên / Bác sĩ thực hiện</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) - {s.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Ghi chú tình trạng da / Răng miệng & Diễn tiến buổi #{nextSessionNum}</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: Laser mức 1.4J, khách êm, đã đắp mặt nạ dịu da..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start space-x-2 text-amber-900">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-[11px] leading-relaxed">
              <b>Ledger bất biến:</b> Thao tác trừ buổi sẽ sinh nhật ký kiểm toán Buổi #{nextSessionNum} không thể xóa hoặc sửa đè, đảm bảo đối soát chính xác số buổi của khách hàng.
            </span>
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition-all"
            >
              <FileCheck className="w-4 h-4" />
              <span>Xác Nhận Trừ Buổi #{nextSessionNum}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
