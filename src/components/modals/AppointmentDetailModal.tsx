import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  BellRing,
  Trash2,
  CreditCard,
  ChevronRight
} from 'lucide-react';
import type { Appointment, Customer, Service } from '../../types';

interface AppointmentDetailModalProps {
  appt: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus?: (apptId: string, newStatus: Appointment['status']) => void;
  customer?: Customer | null;
  service?: Service | null;
}

export const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  appt,
  isOpen,
  onClose,
  onUpdateStatus,
  customer,
  service
}) => {
  if (!isOpen || !appt) return null;

  const [activeTab, setActiveTab] = useState<'history' | 'cancelled' | 'preferences' | 'allergy' | 'notes'>('history');
  const [currentStatus, setCurrentStatus] = useState<Appointment['status']>(appt.status);
  const [customerName, setCustomerName] = useState(appt.customerName || 'Khách hàng');
  const [customerPhone, setCustomerPhone] = useState(appt.customerPhone || '');
  const [customerEmail, setCustomerEmail] = useState(customer?.email || 'hoai.an.nguyen@gmail.com');
  const [scheduledDate, setScheduledDate] = useState(appt.date);
  const [scheduledTime, setScheduledTime] = useState(appt.time);
  const [partySize, setPartySize] = useState<'1' | '2' | '3' | '4+'>('1');
  const [notes, setNotes] = useState(appt.notes || 'Khách thích không gian yên tĩnh, hương oải hương.');
  const [isReminderSent, setIsReminderSent] = useState(false);
  const [reminderTime, setReminderTime] = useState<string | null>(null);

  // Operational workflow steps (independent of notification logs)
  const steps = [
    { key: 'booked', label: 'Tạo lịch', time: `${appt.date} 09:15` },
    { key: 'pending', label: 'Chờ duyệt', time: `${appt.date} 09:20` },
    { key: 'confirmed', label: 'Đã xác nhận', time: `${appt.date} 09:30` },
    { key: 'in_progress', label: 'Đang làm', time: 'Trong ca' },
    { key: 'done', label: 'Hoàn thành', time: 'Dự kiến' }
  ];

  const getStepState = (stepKey: string) => {
    if (stepKey === 'booked') return 'completed';
    if (stepKey === 'pending') return currentStatus === 'booked' ? 'current' : 'completed';
    if (stepKey === 'confirmed') return currentStatus === 'confirmed' || currentStatus === 'in_progress' || currentStatus === 'done' ? 'completed' : 'upcoming';
    if (stepKey === 'in_progress') return currentStatus === 'in_progress' ? 'current' : currentStatus === 'done' ? 'completed' : 'upcoming';
    if (stepKey === 'done') return currentStatus === 'done' ? 'completed' : 'upcoming';
    return 'upcoming';
  };

  const handleConfirm = () => {
    setCurrentStatus('confirmed');
    if (onUpdateStatus) onUpdateStatus(appt.id, 'confirmed');
  };

  const handleRemind = () => {
    setIsReminderSent(true);
    const now = new Date();
    setReminderTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hôm nay`);
  };

  const handleCancel = () => {
    setCurrentStatus('cancelled');
    if (onUpdateStatus) onUpdateStatus(appt.id, 'cancelled');
  };

  const basePrice = service?.basePrice || 1250000;
  const discountAmount = 125000;
  const depositAmount = 225000;
  const remainingAmount = basePrice - discountAmount - depositAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 my-auto animate-scale-in">
        {/* Header Breadcrumb & Close */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-400">
              <span>CRM PHƯƠNG NAM</span>
              <ChevronRight className="w-3 h-3" />
              <span>Lịch hẹn</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-rose-600 font-bold">Chi tiết lịch hẹn #{appt.id.slice(0, 8)}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1">Chi Tiết Lịch Hẹn & Điều Phối</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body 3 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-4 overflow-y-auto text-xs pr-1 flex-1 items-start">
          {/* Column 1: Left Form Info (5 cols) */}
          <div className="lg:col-span-5 space-y-3.5 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/70">
            <h3 className="font-bold text-xs text-slate-800 flex items-center gap-1.5 uppercase tracking-wider pb-1 border-b border-slate-200/60">
              <Calendar className="w-4 h-4 text-rose-500" /> Thông Tin Lịch Hẹn
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Họ tên *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">SĐT *</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Email</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Ngày sinh</label>
                <input
                  type="text"
                  defaultValue="15/08/1990"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-600 block mb-1">Dịch vụ *</label>
              <input
                type="text"
                value={appt.serviceName}
                readOnly
                className="w-full px-2.5 py-1.5 bg-rose-50/50 border border-rose-200 rounded-xl font-bold text-rose-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Ngày hẹn *</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Giờ hẹn *</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Số người</label>
                <div className="grid grid-cols-4 gap-1">
                  {(['1', '2', '3', '4+'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setPartySize(sz)}
                      className={`py-1 rounded-lg font-bold text-[11px] border transition-all ${
                        partySize === sz ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">KTV Phụ trách</label>
                <input
                  type="text"
                  value={appt.staffName}
                  readOnly
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-600 block mb-1">Ghi chú & Yêu cầu</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700"
              />
            </div>
          </div>

          {/* Column 2: Workflow Steps & History Tabs (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Workflow Steps Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-sky-600" /> Quy Trình Xử Lý Lịch Hẹn
              </h3>

              <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {steps.map((st, idx) => {
                  const state = getStepState(st.key);
                  return (
                    <div key={idx} className="relative">
                      <div
                        className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                          state === 'completed'
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                            : state === 'current'
                            ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                            : 'bg-white border-slate-300 text-slate-400'
                        }`}
                      >
                        {state === 'completed' ? '✓' : idx + 1}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={`font-bold text-xs ${state === 'completed' ? 'text-slate-900' : 'text-slate-500'}`}>
                          {st.label}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono">{st.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* History & Notes Tabs Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
              <div className="flex items-center space-x-1 border-b border-slate-100 pb-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${
                    activeTab === 'history' ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  Lịch sử đặt
                </button>
                <button
                  onClick={() => setActiveTab('preferences')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${
                    activeTab === 'preferences' ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  Sở thích
                </button>
                <button
                  onClick={() => setActiveTab('allergy')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all ${
                    activeTab === 'allergy' ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  Dị ứng da
                </button>
              </div>

              {activeTab === 'history' && (
                <div className="space-y-2 text-[11px]">
                  {[
                    { date: '18/05/2025', service: 'Massage đá nóng 90p', price: '1.250.000 đ' },
                    { date: '05/05/2025', service: 'Chăm sóc da mặt chuyên sâu', price: '750.000 đ' },
                    { date: '20/04/2025', service: 'Massage thư giãn 60p', price: '850.000 đ' }
                  ].map((h, hIdx) => (
                    <div key={hIdx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="font-bold text-slate-800">{h.service}</p>
                        <span className="text-[10px] text-slate-400">{h.date}</span>
                      </div>
                      <span className="font-bold text-emerald-600">{h.price}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'preferences' && (
                <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl">
                  🌸 Thích lực massage vừa phải, tinh dầu hoa hồng, dùng khăn ấm trước ca.
                </p>
              )}

              {activeTab === 'allergy' && (
                <p className="text-[11px] text-rose-700 leading-relaxed bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  ⚠️ Nhạy cảm với cồn & hương liệu nhân tạo đậm đặc. Tránh tinh dầu tràm nồng độ cao.
                </p>
              )}
            </div>
          </div>

          {/* Column 3: Customer Card & Payment (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Customer Summary Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-md space-y-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-400 to-amber-400 text-white font-black text-sm flex items-center justify-center shadow-xs">
                  {customerName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h4 className="font-bold text-xs text-white">{customerName}</h4>
                    <span className="text-[9px] font-black px-1.5 py-0.2 bg-amber-400 text-slate-950 rounded-full">VIP</span>
                  </div>
                  <p className="text-[10px] text-slate-300">{customerPhone}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span>Tổng số lịch đã đặt:</span>
                  <b className="text-white">18 lần</b>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Doanh thu từ khách:</span>
                  <b className="text-amber-300">18.750.000 đ</b>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Lần gần nhất:</span>
                  <b className="text-white">18/05/2025</b>
                </div>
              </div>
            </div>

            {/* Notification & Reminder History Card */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="font-bold text-[11px] text-slate-800 flex items-center gap-1">
                  <BellRing className="w-3.5 h-3.5 text-sky-600" /> Nhật Ký Nhắc Hẹn
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isReminderSent ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isReminderSent ? 'Đã thông báo' : 'Chưa gửi'}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 leading-normal">
                {isReminderSent
                  ? `✅ Đã gửi tin nhắn nhắc tự động qua Zalo ZNS lúc ${reminderTime}.`
                  : 'ℹ️ Hệ thống sẵn sàng gửi tin nhắc Zalo ZNS / SMS trước 2 giờ.'}
              </p>
            </div>

            {/* Total Billing & Deposit Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2.5">
              <h3 className="font-bold text-xs text-slate-800 flex items-center gap-1.5 uppercase tracking-wider pb-1 border-b border-slate-100">
                <CreditCard className="w-4 h-4 text-emerald-600" /> Tổng Thanh Toán
              </h3>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Giá dịch vụ</span>
                  <b className="text-slate-800">{basePrice.toLocaleString('vi-VN')} đ</b>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Giảm giá thành viên</span>
                  <b className="text-rose-600">- {discountAmount.toLocaleString('vi-VN')} đ</b>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Cọc trước (20%)</span>
                  <b className="text-emerald-600">{depositAmount.toLocaleString('vi-VN')} đ</b>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black">
                  <span className="text-slate-900">Còn lại phải thu:</span>
                  <span className="text-rose-600">{remainingAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Hủy Lịch Hẹn</span>
          </button>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={handleRemind}
              className={`px-4 py-2 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                isReminderSent ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <BellRing className="w-4 h-4 text-sky-600" />
              <span>{isReminderSent ? 'Đã Gửi Nhắc Lịch' : 'Gửi Nhắc Lịch (Zalo)'}</span>
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Xác Nhận Lịch</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>Lưu Thay Đổi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
