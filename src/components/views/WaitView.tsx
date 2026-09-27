import React, { useState } from 'react';
import { Clock, Plus, ArrowRight, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface WaitingCustomer {
  id: string;
  name: string;
  phone: string;
  serviceRequested: string;
  arrivedAt: string;
  assignedStaff?: string;
  status: 'waiting' | 'in_service' | 'done';
}

export const WaitView: React.FC = () => {
  const { customers, services, setActiveTab, addToCart, setCartCustomer } = useApp();

  const [waitList, setWaitList] = useState<WaitingCustomer[]>([
    {
      id: 'w-1',
      name: 'Chị Đặng Thu Thảo',
      phone: '0988112233',
      serviceRequested: 'Laser Pico Toning Trị Nám',
      arrivedAt: '13:50',
      assignedStaff: 'BS. Lê Hoàng Long',
      status: 'in_service'
    },
    {
      id: 'w-2',
      name: 'Cô Nguyễn Thị Hoa',
      phone: '0911445566',
      serviceRequested: 'Cạo Vôi Răng Siêu Âm',
      arrivedAt: '14:10',
      status: 'waiting'
    }
  ]);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newService, setNewService] = useState(services[0]?.name || '');

  const handleAddWalkin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    const item: WaitingCustomer = {
      id: 'w-' + Date.now(),
      name: newName,
      phone: newPhone,
      serviceRequested: newService,
      arrivedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      status: 'waiting'
    };
    setWaitList((prev) => [...prev, item]);
    setNewName('');
    setNewPhone('');
  };

  const transferToPos = (item: WaitingCustomer) => {
    const matchedCustomer = customers.find((c) => c.name === item.name || c.phone === item.phone);
    if (matchedCustomer) {
      setCartCustomer(matchedCustomer.id);
    }
    const matchedService = services.find((s) => s.name === item.serviceRequested);
    if (matchedService) {
      addToCart({
        type: 'service',
        refId: matchedService.id,
        name: matchedService.name,
        price: matchedService.basePrice,
        qty: 1
      });
    }
    setActiveTab('pos');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Left: Quick Check-in form */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
          <Clock className="w-5 h-5 text-sky-600" />
          <h3 className="font-bold text-sm text-slate-800">Tiếp Đón Khách Vãng Lai</h3>
        </div>

        <form onSubmit={handleAddWalkin} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tên khách hàng</label>
            <input
              type="text"
              required
              placeholder="VD: Chị Minh Anh..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Số điện thoại</label>
            <input
              type="text"
              placeholder="VD: 0912..."
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Dịch vụ muốn làm</label>
            <select
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-sky-500"
            >
              {services.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md shadow-sky-600/20 flex items-center justify-center space-x-1.5 transition-all mt-2"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Vào Hàng Đợi</span>
          </button>
        </form>
      </div>

      {/* Right: Waiting Queue List (2 cols) */}
      <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-800">Hàng Đợi Khách Chờ Phục Vụ ({waitList.length})</h3>
          </div>
          <span className="text-xs text-slate-500">Tự động cập nhật thời gian chờ</span>
        </div>

        <div className="space-y-3">
          {waitList.length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400">Không có khách nào đang chờ.</p>
          ) : (
            waitList.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center font-bold text-slate-800 shrink-0 shadow-xs">
                    <span className="text-[10px] text-slate-400">Đến</span>
                    <span className="text-xs text-sky-700">{item.arrivedAt}</span>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.status === 'in_service'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {item.status === 'in_service' ? 'Đang phục vụ' : 'Đang chờ'}
                      </span>
                    </div>
                    <p className="text-slate-600 font-medium mt-0.5">{item.serviceRequested}</p>
                    {item.assignedStaff && (
                      <p className="text-indigo-600 text-[11px] mt-0.5">
                        Phụ trách: <b>{item.assignedStaff}</b>
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => transferToPos(item)}
                  className="bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold px-3 py-1.5 rounded-xl border border-sky-200 flex items-center space-x-1.5 transition-all text-xs shrink-0 self-end sm:self-auto"
                >
                  <span>Chuyển Sang POS</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
