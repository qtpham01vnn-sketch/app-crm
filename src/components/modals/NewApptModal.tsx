import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, X, Check, UserPlus, Search, Clock, MapPin, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { Customer } from '../../types';

export const NewApptModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialStaffId?: string;
  initialRoomOrBed?: string;
  initialDate?: string;
  initialTime?: string;
}> = ({ isOpen, onClose, initialStaffId, initialRoomOrBed, initialDate, initialTime }) => {
  const { customers, setCustomers, services, staffList, currentBranch, branches, addAppointment, currentTheme, showToast, isLiveMode } = useApp();

  // Step 1: Branch
  const [selectedBranchId, setSelectedBranchId] = useState(currentBranch?.id || branches[0]?.id || '');

  // Step 2: Customer Mode (Existing vs New)
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');

  // Step 3: Service
  const [serviceId, setServiceId] = useState(services[0]?.id || '');

  // Step 4: Staff & Room
  const [staffId, setStaffId] = useState(initialStaffId || '');
  const [roomOrBed, setRoomOrBed] = useState(initialRoomOrBed || 'Phòng Điều Trị 01');

  // Step 5: Date & Time
  const [date, setDate] = useState(initialDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(initialTime || '09:30');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync selected branch and fields on open
  useEffect(() => {
    if (isOpen) {
      if (currentBranch) setSelectedBranchId(currentBranch.id);
      if (customers.length > 0 && (!customerId || !customers.some((c) => c.id === customerId))) {
        setCustomerId(customers[0].id);
      }
      if (services.length > 0 && (!serviceId || !services.some((s) => s.id === serviceId))) {
        setServiceId(services[0].id);
      }
      if (initialStaffId) setStaffId(initialStaffId);
      if (initialRoomOrBed) setRoomOrBed(initialRoomOrBed);
      if (initialDate) setDate(initialDate);
      if (initialTime) setTime(initialTime);
    }
  }, [isOpen, currentBranch, customers, services, initialStaffId, initialRoomOrBed, initialDate, initialTime]);

  // Filter staff by selected branch
  const branchStaff = useMemo(() => {
    return staffList.filter((s) => !s.branchIds || s.branchIds.length === 0 || s.branchIds.includes(selectedBranchId));
  }, [staffList, selectedBranchId]);

  // Keep staffId valid for branch if not specified
  useEffect(() => {
    if (branchStaff.length > 0) {
      if (!staffId || !branchStaff.some((s) => s.id === staffId)) {
        setStaffId(branchStaff[0].id);
      }
    } else if (staffList.length > 0 && (!staffId || !staffList.some((s) => s.id === staffId))) {
      setStaffId(staffList[0].id);
    }
  }, [branchStaff, staffList, staffId]);

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, customerSearch]);

  // Sync customerId with filtered results
  useEffect(() => {
    if (filteredCustomers.length > 0 && !filteredCustomers.some((c) => c.id === customerId)) {
      setCustomerId(filteredCustomers[0].id);
    }
  }, [filteredCustomers, customerId]);

  const selectedService = services.find((s) => s.id === serviceId) || services[0];
  const selectedStaff = staffList.find((s) => s.id === staffId) || branchStaff[0] || staffList[0];
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) || currentBranch;
  const targetCust = customers.find((c) => c.id === customerId) || filteredCustomers[0] || customers[0];

  // Calculate estimated end time
  const endTime = useMemo(() => {
    if (!time || !selectedService) return '';
    const [h, m] = time.split(':').map(Number);
    const totalMinutes = h * 60 + m + (selectedService.durationMinutes || 60);
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  }, [time, selectedService]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let effectiveCustomerId = customerId;
    let effectiveCustName = targetCust?.name || 'Khách Vãng Lai';
    let effectiveCustPhone = targetCust?.phone || '0900000000';

    // If creating a new customer inline
    if (customerMode === 'new') {
      if (!newCustName.trim() || !newCustPhone.trim()) {
        showToast('⚠️ Vui lòng điền đủ Tên và Số điện thoại khách mới', 'warning');
        return;
      }
      if (isLiveMode) {
        if (!selectedBranch?.orgId || !selectedBranchId) {
          showToast('⚠️ Chưa xác định chi nhánh hợp lệ để tạo khách', 'error');
          return;
        }
        setIsSubmitting(true);
        try {
          const created = await masterDataService.createCustomer(
            {
              name: newCustName.trim(),
              phone: newCustPhone.trim(),
              notes: newCustNotes.trim() || undefined,
              vipTier: 'standard',
              gender: 'female'
            },
            selectedBranch.orgId,
            selectedBranchId
          );
          if (!created) {
            throw new Error('Máy chủ không phản hồi bản ghi khách hàng mới');
          }
          setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
          effectiveCustomerId = created.id;
          effectiveCustName = created.name;
          effectiveCustPhone = created.phone;
          showToast(`✅ Đã tạo hồ sơ khách hàng: ${effectiveCustName}`, 'success');
        } catch (err: any) {
          setIsSubmitting(false);
          showToast(`❌ Lỗi tạo hồ sơ khách hàng: ${err?.message || err}`, 'error');
          return;
        }
      } else {
        const newCustId = `c-new-${Date.now().toString().slice(-4)}`;
        const newCustomer: Customer = {
          id: newCustId,
          orgId: selectedBranch?.id || '',
          primaryBranchId: selectedBranchId,
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          gender: 'female',
          vipTier: 'standard',
          totalSpent: 0,
          debt: 0,
          creditBalance: 0,
          notes: newCustNotes.trim(),
          createdAt: new Date().toISOString()
        };
        setCustomers((prev) => [newCustomer, ...prev]);
        effectiveCustomerId = newCustId;
        effectiveCustName = newCustName.trim();
        effectiveCustPhone = newCustPhone.trim();
        showToast(`✅ Đã tạo hồ sơ khách hàng: ${effectiveCustName}`, 'success');
      }
    } else {
      const selected = filteredCustomers.find((c) => c.id === customerId) || customers.find((c) => c.id === customerId) || filteredCustomers[0] || customers[0];
      if (selected) {
        effectiveCustomerId = selected.id;
        effectiveCustName = selected.name;
        effectiveCustPhone = selected.phone;
      }
    }

    if (!selectedService) {
      showToast('⚠️ Vui lòng chọn dịch vụ thực hiện', 'warning');
      return;
    }

    if (!selectedStaff) {
      showToast('⚠️ Vui lòng chọn Bác sĩ / KTV phụ trách', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await addAppointment({
        branchId: selectedBranchId,
        customerId: effectiveCustomerId,
        customerName: effectiveCustName,
        customerPhone: effectiveCustPhone,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        staffId: selectedStaff.id,
        staffName: selectedStaff.name,
        date,
        time,
        durationMinutes: selectedService.durationMinutes || 60,
        status: 'confirmed',
        priceSnapshot: selectedService.basePrice || 350000,
        roomOrBed,
        notes: notes.trim()
      });

      if (res && res.success) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const branchRooms = [
    'Phòng Điều Trị 01 (VIP Laser)',
    'Phòng Chăm Sóc Da 02',
    'Phòng Thẩm Mỹ 03',
    'Giường Thư Giãn 01',
    'Giường Thư Giãn 02'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div
          className="px-6 py-4 flex items-center justify-between text-white"
          style={{ backgroundColor: '#244B3C' }}
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-rose-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Đặt Lịch Hẹn Khách Hàng</h3>
              <p className="text-[11px] text-emerald-100/80">Quy trình điều phối dịch vụ, nhân sự và phòng theo chi nhánh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Step 1: Branch Selection */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>Chi Nhánh Tiếp Đón (*):</span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">Chọn địa điểm thực hiện</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBranchId(b.id)}
                  className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer truncate ${
                    selectedBranchId === b.id
                      ? 'border-rose-400 bg-rose-50/70 text-rose-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Customer Selection / Fast Create */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700">Khách Hàng (*)</label>
              <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    customerMode === 'existing' ? 'bg-white shadow-xs font-bold text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Khách có sẵn
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('new')}
                  className={`px-2.5 py-1 rounded-md flex items-center space-x-1 transition-all ${
                    customerMode === 'new' ? 'bg-white shadow-xs font-bold text-rose-700' : 'text-slate-500'
                  }`}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Tạo khách mới</span>
                </button>
              </div>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm nhanh theo tên, số điện thoại..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-rose-400"
                  />
                </div>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 font-medium"
                >
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {c.phone} ({c.vipTier.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-rose-50/40 border border-rose-200 rounded-xl space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Họ và Tên (*)</label>
                    <input
                      type="text"
                      placeholder="VD: Trần Thị Mai"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Số Điện Thoại (*)</label>
                    <input
                      type="tel"
                      placeholder="0912345678"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Tiền sử da / Yêu cầu dị ứng</label>
                  <input
                    type="text"
                    placeholder="VD: Da nhạy cảm, dị ứng cồn mỹ phẩm..."
                    value={newCustNotes}
                    onChange={(e) => setNewCustNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Service Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Dịch Vụ Trị Liệu (*)</span>
              <span className="text-[11px] text-slate-500 font-normal">Thời lượng: {selectedService?.durationMinutes || 60} phút</span>
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-medium"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.basePrice.toLocaleString('vi-VN')}đ ({s.durationMinutes}p)
                </option>
              ))}
            </select>
          </div>

          {/* Step 4: Staff & Room Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kỹ Thuật Viên / Bác Sĩ (*)</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-medium"
              >
                {branchStaff.length === 0 ? (
                  <option value="">Không có KTV trực tại chi nhánh này</option>
                ) : (
                  branchStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) - {s.role.includes('doctor') ? 'Bác sĩ/Chuyên viên' : 'KTV'}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Phòng / Giường Thực Hiện</label>
              <select
                value={roomOrBed}
                onChange={(e) => setRoomOrBed(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-medium"
              >
                {branchRooms.map((rm) => (
                  <option key={rm} value={rm}>
                    {rm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 5: Date, Time & Estimated Slot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Ngày Hẹn (*)</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Giờ Bắt Đầu (*)</label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-medium font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Khung Giờ Dự Kiến</label>
              <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-800 font-bold font-mono text-center flex items-center justify-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>{time} → {endTime}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ghi Chú Điều Trị / Yêu Cầu Đặc Biệt</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Khách yêu cầu KTV làm nhẹ tay, chuẩn bị máy nâng cơ..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-400 font-medium"
            />
          </div>

          {/* Step 6: Confirmation Summary Card */}
          <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-2">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-rose-500" />
              <span>Tóm Tắt Phiếu Hẹn</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block">Địa điểm:</span>
                <b className="text-slate-900">{selectedBranch?.name || 'Chi nhánh'}</b>
              </div>
              <div>
                <span className="text-slate-500 block">Dịch vụ:</span>
                <b className="text-rose-700">{selectedService?.name || 'Chăm sóc da'}</b>
              </div>
              <div>
                <span className="text-slate-500 block">Nhân sự:</span>
                <b className="text-slate-900">{selectedStaff?.name || 'KTV'}</b>
              </div>
              <div>
                <span className="text-slate-500 block">Giá dự kiến:</span>
                <b className="text-emerald-700">{selectedService?.basePrice.toLocaleString('vi-VN')}đ</b>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-white font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: currentTheme.buttonBg || '#B83D62' }}
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang Kiểm Tra & Đặt...' : 'Xác Nhận Đặt Lịch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
