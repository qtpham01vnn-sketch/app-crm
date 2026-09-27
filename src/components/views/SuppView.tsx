import React from 'react';
import { Truck, Plus, Phone, Mail, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const SuppView: React.FC = () => {
  const { suppliers } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Danh Bạ Nhà Cung Cấp & Công Nợ Phải Trả</h3>
            <p className="text-xs text-slate-500">Quản lý đối tác vật tư y tế, dược mỹ phẩm</p>
          </div>
        </div>

        <button className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5">
          <Plus className="w-4 h-4" />
          <span>Thêm Nhà Cung Cấp</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suppliers.map((sup) => (
          <div
            key={sup.id}
            className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">{sup.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">Liên hệ: {sup.contactName}</p>
              </div>
              <span className={`text-xs font-black ${sup.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                Nợ NCC: {(sup.debt).toLocaleString('vi-VN')}đ
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-200/70 pt-2.5">
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> {sup.phone}
              </p>
              {sup.email && (
                <p className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> {sup.email}
                </p>
              )}
              {sup.address && (
                <p className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {sup.address}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
