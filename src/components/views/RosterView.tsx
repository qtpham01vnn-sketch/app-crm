import React, { useState } from 'react';
import {
  Plus,
  Ban,
  Printer,
  ChevronLeft,
  ChevronRight,
  Flame,
  ArrowRightLeft
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const RosterView: React.FC = () => {
  const { staffList, currentBranch, branches, setCurrentBranch, showToast, currentTheme } = useApp();
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [selectedServiceType, setSelectedServiceType] = useState<string>('all');
  const [currentWeekRange] = useState('19/05/2025 - 25/05/2025');

  const days = [
    { name: 'Thứ 2', date: '19/05' },
    { name: 'Thứ 3', date: '20/05' },
    { name: 'Thứ 4', date: '21/05' },
    { name: 'Thứ 5', date: '22/05' },
    { name: 'Thứ 6', date: '23/05' },
    { name: 'Thứ 7', date: '24/05' },
    { name: 'Chủ nhật', date: '25/05' }
  ];

  const hours = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
  ];

  // Schedule appointment slots
  const mockScheduleSlots = [
    { dayIdx: 0, time: '08:30 - 10:00', hour: '08:00', customer: 'Nguyễn Thu Hà', service: 'Massage thư giãn', room: 'P. Sen 1', staff: 'Hương Giang', type: 'massage_relax' },
    { dayIdx: 0, time: '10:30 - 12:00', hour: '10:00', customer: 'Trần Minh Anh', service: 'Chăm sóc da mặt', room: 'P. Sen 2', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 0, time: '13:30 - 15:00', hour: '13:00', customer: 'Lê Thu Trang', service: 'Massage body đá nóng', room: 'P. Trúc 1', staff: 'Phương Anh', type: 'hot_stone' },
    { dayIdx: 0, time: '15:30 - 17:00', hour: '15:00', customer: 'Phạm Hoàng Yến', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },
    { dayIdx: 0, time: '19:00 - 20:30', hour: '19:00', customer: 'Đỗ Quốc Bảo', service: 'Massage trị liệu', room: 'P. Sen 3', staff: 'Đức Huy', type: 'massage_therapy' },

    { dayIdx: 1, time: '09:00 - 10:30', hour: '09:00', customer: 'Vũ Thùy Linh', service: 'Massage Thái', room: 'P. Trúc 2', staff: 'Quang Minh', type: 'massage_therapy' },
    { dayIdx: 1, time: '11:00 - 12:30', hour: '11:00', customer: 'Bùi Thanh Huyền', service: 'Chăm sóc da mặt', room: 'P. Sen 1', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 1, time: '14:00 - 15:30', hour: '14:00', customer: 'Nguyễn Văn Nam', service: 'Massage body thư giãn', room: 'P. Sen 2', staff: 'Hương Giang', type: 'massage_relax' },
    { dayIdx: 1, time: '16:00 - 17:30', hour: '16:00', customer: 'Đặng Minh Tuấn', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },
    { dayIdx: 1, time: '19:30 - 21:00', hour: '19:00', customer: 'Trịnh Khánh Linh', service: 'Chăm sóc da chuyên sâu', room: 'P. Trúc 1', staff: 'Phương Anh', type: 'facial' },

    { dayIdx: 2, time: '08:30 - 10:00', hour: '08:00', customer: 'Hoàng Thùy Dương', service: 'Massage trị liệu', room: 'P. Sen 3', staff: 'Đức Huy', type: 'massage_therapy' },
    { dayIdx: 2, time: '10:30 - 12:00', hour: '10:00', customer: 'Lê Hoài Nam', service: 'Massage đá nóng', room: 'P. Trúc 2', staff: 'Quang Minh', type: 'hot_stone' },
    { dayIdx: 2, time: '13:30 - 15:00', hour: '13:00', customer: 'Phan Thanh Mai', service: 'Chăm sóc da mặt', room: 'P. Sen 1', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 2, time: '15:30 - 17:00', hour: '15:00', customer: 'Võ Minh Đức', service: 'Massage Thái', room: 'P. Sen 2', staff: 'Hương Giang', type: 'massage_therapy' },
    { dayIdx: 2, time: '18:30 - 20:00', hour: '18:00', customer: 'Nguyễn Phương Anh', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },

    { dayIdx: 3, time: '09:00 - 10:30', hour: '09:00', customer: 'Đào Thu Thảo', service: 'Chăm sóc da mặt', room: 'P. Sen 2', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 3, time: '11:00 - 12:30', hour: '11:00', customer: 'Trần Quốc Việt', service: 'Massage body thư giãn', room: 'P. Trúc 1', staff: 'Phương Anh', type: 'massage_relax' },
    { dayIdx: 3, time: '14:00 - 15:30', hour: '14:00', customer: 'Nguyễn Quỳnh Chi', service: 'Massage trị liệu', room: 'P. Sen 3', staff: 'Đức Huy', type: 'massage_therapy' },
    { dayIdx: 3, time: '16:00 - 17:30', hour: '16:00', customer: 'Lý Gia Bảo', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },
    { dayIdx: 3, time: '19:00 - 20:30', hour: '19:00', customer: 'Bùi Ngọc Ánh', service: 'Chăm sóc da chuyên sâu', room: 'P. Sen 1', staff: 'Mai Linh', type: 'facial' },

    { dayIdx: 4, time: '08:30 - 10:00', hour: '08:00', customer: 'Phạm Tuấn Anh', service: 'Massage Thái', room: 'P. Trúc 2', staff: 'Quang Minh', type: 'massage_therapy' },
    { dayIdx: 4, time: '10:30 - 12:00', hour: '10:00', customer: 'Lương Minh Hằng', service: 'Chăm sóc da mặt', room: 'P. Sen 2', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 4, time: '13:30 - 15:00', hour: '13:00', customer: 'Ngô Đức Duy', service: 'Massage body đá nóng', room: 'P. Trúc 1', staff: 'Phương Anh', type: 'hot_stone' },
    { dayIdx: 4, time: '15:30 - 17:00', hour: '15:00', customer: 'Nguyễn Thanh Vy', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },
    { dayIdx: 4, time: '19:30 - 21:00', hour: '19:00', customer: 'Trần Bảo Châu', service: 'Massage trị liệu', room: 'P. Sen 3', staff: 'Đức Huy', type: 'massage_therapy' },

    { dayIdx: 5, time: '09:00 - 10:30', hour: '09:00', customer: 'Đinh Thị Hạnh', service: 'Chăm sóc da mặt', room: 'P. Sen 1', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 5, time: '11:00 - 12:30', hour: '11:00', customer: 'Vũ Mạnh Cường', service: 'Massage body thư giãn', room: 'P. Sen 2', staff: 'Hương Giang', type: 'massage_relax' },
    { dayIdx: 5, time: '14:00 - 15:30', hour: '14:00', customer: 'Đỗ Thị Quỳnh', service: 'Massage Thái', room: 'P. Trúc 2', staff: 'Quang Minh', type: 'massage_therapy' },
    { dayIdx: 5, time: '16:00 - 17:30', hour: '16:00', customer: 'Mai Quốc Huy', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },
    { dayIdx: 5, time: '18:30 - 20:00', hour: '18:00', customer: 'Hà My Linh', service: 'Chăm sóc da chuyên sâu', room: 'P. Sen 1', staff: 'Mai Linh', type: 'facial' },

    { dayIdx: 6, time: '08:30 - 10:00', hour: '08:00', customer: 'Trương Gia Hân', service: 'Massage trị liệu', room: 'P. Sen 3', staff: 'Đức Huy', type: 'massage_therapy' },
    { dayIdx: 6, time: '10:30 - 12:00', hour: '10:00', customer: 'Nguyễn Hoàng Hải', service: 'Massage đá nóng', room: 'P. Trúc 1', staff: 'Phương Anh', type: 'hot_stone' },
    { dayIdx: 6, time: '13:30 - 15:00', hour: '13:00', customer: 'Lê Thảo Nguyên', service: 'Chăm sóc da mặt', room: 'P. Sen 2', staff: 'Mai Linh', type: 'facial' },
    { dayIdx: 6, time: '15:30 - 17:00', hour: '15:00', customer: 'Đoàn Minh Khoa', service: 'Gội đầu dưỡng sinh', room: 'P. Mộc', staff: 'Trà My', type: 'head_spa' },
    { dayIdx: 6, time: '19:00 - 20:30', hour: '19:00', customer: 'Phạm Quỳnh Anh', service: 'Massage body thư giãn', room: 'P. Trúc 2', staff: 'Hương Giang', type: 'massage_relax' }
  ];

  const typeColorConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
    massage_relax: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', label: 'Massage thư giãn' },
    massage_therapy: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', label: 'Massage trị liệu' },
    facial: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', label: 'Chăm sóc da mặt' },
    head_spa: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-900', label: 'Gội đầu dưỡng sinh' },
    hot_stone: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', label: 'Massage đá nóng' },
    other: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-800', label: 'Khác' }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Header Title & Top Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">🗓️</span>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Lịch Làm Việc & Điều Phối</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Điều phối kỹ thuật viên, theo dõi công suất phòng trị liệu và tối ưu lịch hẹn toàn chi nhánh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => showToast('Chức năng tạo ca làm đang mở', 'info')}
            className="text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer hover:opacity-90 active:scale-95"
            style={{ backgroundColor: currentTheme.buttonBg }}
          >
            <Plus className="w-4 h-4" />
            <span>Tạo ca làm</span>
          </button>
          <button
            onClick={() => showToast('Đã mở chức năng chặn lịch nghỉ/bảo trì', 'info')}
            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Ban className="w-4 h-4 text-slate-500" />
            <span>Chặn lịch</span>
          </button>
          <button
            onClick={handlePrint}
            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>In lịch tuần</span>
          </button>
        </div>
      </div>

      {/* 2. Filters Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Chi nhánh</label>
          <select
            value={currentBranch.id}
            onChange={(e) => {
              const b = branches.find((br) => br.id === e.target.value);
              if (b) setCurrentBranch(b);
            }}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Phòng trị liệu</label>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            <option value="all">Tất cả phòng</option>
            <option value="P. Sen 1">P. Sen 1 (Body)</option>
            <option value="P. Sen 2">P. Sen 2 (Facial)</option>
            <option value="P. Sen 3">P. Sen 3 (Trị liệu)</option>
            <option value="P. Trúc 1">P. Trúc 1 (VIP)</option>
            <option value="P. Trúc 2">P. Trúc 2 (Đá nóng)</option>
            <option value="P. Mộc">P. Mộc (Gội dưỡng sinh)</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Kỹ thuật viên</label>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            <option value="all">Tất cả KTV</option>
            {staffList.map((st) => (
              <option key={st.id} value={st.name}>{st.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Loại dịch vụ</label>
          <select
            value={selectedServiceType}
            onChange={(e) => setSelectedServiceType(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
          >
            <option value="all">Tất cả dịch vụ</option>
            <option value="massage">Massage thư giãn</option>
            <option value="facial">Chăm sóc da</option>
            <option value="head">Gội đầu dưỡng sinh</option>
            <option value="therapy">Trị liệu chuyên sâu</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Tuần</label>
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
            <button className="p-0.5 hover:bg-slate-200 rounded"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="font-mono text-[11px]">{currentWeekRange}</span>
            <button className="p-0.5 hover:bg-slate-200 rounded"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* 3. Main Weekly Scheduling Grid (8-9 cols) + Right Sidebar (3-4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 cols: Weekly Dispatching Grid */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  <th className="p-2.5 w-16 text-slate-400 font-mono text-center">Giờ</th>
                  {days.map((d, dIdx) => (
                    <th key={dIdx} className="p-2.5 text-center font-bold text-slate-800 border-l border-slate-100">
                      <div>{d.name}</div>
                      <span className="text-[11px] text-slate-400 font-mono font-normal">{d.date}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hours.map((h, hIdx) => (
                  <tr key={hIdx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="p-2 font-mono text-[11px] text-slate-400 text-center font-semibold border-r border-slate-100">
                      {h}
                    </td>
                    {days.map((_, dIdx) => {
                      const slots = mockScheduleSlots.filter((s) => s.dayIdx === dIdx && s.hour === h);
                      return (
                        <td key={dIdx} className="p-1 border-l border-slate-100 align-top h-16 w-[13%]">
                          {slots.map((sl, slIdx) => {
                            const conf = typeColorConfig[sl.type] || typeColorConfig.other;
                            return (
                              <div
                                key={slIdx}
                                className={`p-1.5 rounded-xl border text-[10px] space-y-0.5 shadow-xs hover:shadow-md transition-all cursor-pointer ${conf.bg} ${conf.border} ${conf.text}`}
                              >
                                <div className="font-mono font-bold text-[9px] text-rose-600">{sl.time}</div>
                                <p className="font-bold line-clamp-1">{sl.customer}</p>
                                <p className="text-[9px] text-slate-600">{sl.service}</p>
                                <div className="flex items-center justify-between text-[9px] pt-0.5 border-t border-black/5">
                                  <span className="font-semibold">{sl.room}</span>
                                  <span className="font-medium">★ {sl.staff}</span>
                                </div>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Color Legend at Bottom */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t border-slate-100 text-[11px]">
            {Object.entries(typeColorConfig).map(([key, item]) => (
              <div key={key} className="flex items-center space-x-1.5">
                <span className={`w-3.5 h-3.5 rounded-md border ${item.bg} ${item.border}`}></span>
                <span className="font-medium text-slate-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right 4 cols: Technician Status, Vacant Rooms & Peak Hours */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card 1: Kỹ Thuật Viên */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Kỹ Thuật Viên</h3>
              <button className="text-[11px] text-rose-600 font-semibold hover:underline">Xem tất cả</button>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { name: 'Mai Linh', status: 'Đang làm', count: 5, shift: '08:00 - 17:00' },
                { name: 'Hương Giang', status: 'Đang làm', count: 4, shift: '08:00 - 17:00' },
                { name: 'Phương Anh', status: 'Đang làm', count: 4, shift: '09:00 - 18:00' },
                { name: 'Quang Minh', status: 'Đang làm', count: 4, shift: '09:00 - 18:00' },
                { name: 'Trà My', status: 'Đang làm', count: 5, shift: '10:00 - 19:00' },
                { name: 'Đức Huy', status: 'Đang làm', count: 4, shift: '10:00 - 19:00' }
              ].map((ktv, kIdx) => (
                <div key={kIdx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 hover:bg-slate-100/70 transition-colors">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-400 to-amber-400 text-white font-black text-xs flex items-center justify-center shadow-xs">
                      {ktv.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{ktv.name}</p>
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {ktv.status}
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-[11px]">
                    <span className="font-black text-slate-900">{ktv.count} lịch</span>
                    <span className="text-[10px] text-slate-400 block font-mono">{ktv.shift}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Phòng Còn Trống (Hôm Nay) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Phòng Còn Trống (Hôm Nay)</h3>
              <button className="text-[11px] text-rose-600 font-semibold hover:underline">Xem tất cả</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
                <p className="font-bold text-slate-800">P. Sen 1</p>
                <span className="text-[10px] font-mono text-emerald-700 font-bold block mt-0.5">10:00 - 11:00</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
                <p className="font-bold text-slate-800">P. Sen 3</p>
                <span className="text-[10px] font-mono text-emerald-700 font-bold block mt-0.5">15:00 - 16:30</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
                <p className="font-bold text-slate-800">P. Trúc 2</p>
                <span className="text-[10px] font-mono text-emerald-700 font-bold block mt-0.5">16:00 - 18:00</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
                <p className="font-bold text-slate-800">P. Mộc</p>
                <span className="text-[10px] font-mono text-emerald-700 font-bold block mt-0.5">18:30 - 21:00</span>
              </div>
            </div>
          </div>

          {/* Card 3: Khung Giờ Cao Điểm (Hôm Nay) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" /> Khung Giờ Cao Điểm (Hôm Nay)
            </h3>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                <p className="text-[10px] text-slate-500 font-mono">09:00 - 11:00</p>
                <b className="font-black text-rose-600 text-sm block mt-1">23 lịch</b>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <p className="text-[10px] text-rose-700 font-mono font-bold">14:00 - 16:00</p>
                <b className="font-black text-rose-700 text-sm block mt-1">28 lịch</b>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                <p className="text-[10px] text-slate-500 font-mono">19:00 - 21:00</p>
                <b className="font-black text-rose-600 text-sm block mt-1">19 lịch</b>
              </div>
            </div>
          </div>

          {/* Card 4: Yêu Cầu Đổi Ca */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-sky-600" /> Yêu Cầu Đổi Ca
              </h3>
              <button className="text-[11px] text-rose-600 font-semibold hover:underline">Xem tất cả</button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Hương Giang</p>
                  <span className="text-[10px] text-slate-500 block">Đổi từ 24/05 (T7) sang ca chiều</span>
                </div>
                <button
                  onClick={() => showToast('Đã duyệt yêu cầu đổi ca', 'success')}
                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] rounded-lg transition-all cursor-pointer"
                >
                  Chờ duyệt
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Phương Anh</p>
                  <span className="text-[10px] text-slate-500 block">Đổi từ 25/05 (CN) sang ca sáng</span>
                </div>
                <button
                  onClick={() => showToast('Đã duyệt yêu cầu đổi ca', 'success')}
                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] rounded-lg transition-all cursor-pointer"
                >
                  Chờ duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
