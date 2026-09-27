import React, { useState } from 'react';
import { Calendar, X, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const NewApptModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { customers, services, staffList, currentBranch, addAppointment } = useApp();

  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [staffId, setStaffId] = useState(staffList[2]?.id || staffList[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('14:00');
  const [roomOrBed, setRoomOrBed] = useState('Phòng Điều Trị 01');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const svc = services.find((s) => s.id === serviceId);
    addAppointment({
      branchId: currentBranch.id,
      customerId,
      serviceId,
      staffId,
      date,
      time,
      durationMinutes: svc?.durationMinutes || 60,
      status: 'confirmed',
      priceSnapshot: svc?.basePrice || 0,
      roomOrBed,
      notes
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-base">Đặt Lịch Hẹn Mới</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">Khách hàng</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.phone} ({c.vipTier.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Dịch vụ</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({(s.basePrice).toLocaleString('vi-VN')}đ)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Bác sĩ / Kỹ thuật viên</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Ngày hẹn</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Giờ hẹn</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Phòng / Giường</label>
              <input
                type="text"
                value={roomOrBed}
                onChange={(e) => setRoomOrBed(e.target.value)}
                placeholder="Ghế 01, VIP 2..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Ghi chú điều trị / Yêu cầu riêng</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Khách muốn làm êm, chuẩn bị máy Laser..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
            />
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
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md shadow-sky-600/20 flex items-center space-x-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Xác Nhận Đặt Lịch</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
