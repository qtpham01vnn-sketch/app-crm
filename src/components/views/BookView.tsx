import React, { useState } from 'react';
import { CalendarPlus, Check, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const BookView: React.FC = () => {
  const { customers, services, staffList, currentBranch, addAppointment, setActiveTab } = useApp();

  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [staffId, setStaffId] = useState(staffList[2]?.id || staffList[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('15:00');
  const [roomOrBed, setRoomOrBed] = useState('Phòng Điều Trị 02');
  const [notes, setNotes] = useState('');

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
    setActiveTab('appts');
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6 border border-slate-200/80 shadow-md animate-fade-in space-y-6">
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
          <CalendarPlus className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Đặt Chỗ Nhanh Tại Quầy</h2>
          <p className="text-xs text-slate-500">Tiếp nhận khách đặt hẹn qua điện thoại hoặc trực tiếp</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Chi Nhánh Thực Hiện</label>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-2 text-slate-700 font-bold">
            <MapPin className="w-4 h-4 text-sky-600" />
            <span>{currentBranch.name} ({currentBranch.code})</span>
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Khách Hàng</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.phone} (VIP: {c.vipTier.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Dịch Vụ Yêu Cầu</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({(s.basePrice).toLocaleString('vi-VN')}đ - {s.durationMinutes}p)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Bác Sĩ / Kỹ Thuật Viên Phụ Trách</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ngày Hẹn</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Giờ Bắt Đầu</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Giường / Ghế</label>
            <input
              type="text"
              value={roomOrBed}
              onChange={(e) => setRoomOrBed(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Ghi Chú Đặt Chỗ</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Yêu cầu riêng của khách..."
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="pt-3">
          <button
            type="submit"
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md shadow-sky-600/20 flex items-center justify-center space-x-2 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Lưu & Chuyển Sang Lưới Lịch Hẹn</span>
          </button>
        </div>
      </form>
    </div>
  );
};
