import React, { useState, useEffect } from 'react';
import { Percent, RefreshCw, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { masterDataService } from '../../services/masterDataService';
import type { CommissionRecord } from '../../types';

export const CommView: React.FC = () => {
  const { staffList, currentBranch, branches, setCurrentBranch } = useApp();
  const orgId = currentBranch?.orgId || branches[0]?.orgId || '';

  const [loading, setLoading] = useState<boolean>(false);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const fetchCommissions = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await masterDataService.getPayrollOverview({
        branchId: currentBranch?.id
      });
      setCommissions(res.commissions);
    } catch (err: any) {
      console.error('Lỗi tải danh sách hoa hồng:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissions();
  }, [currentBranch?.id]);

  const filteredCommissions = commissions.filter((c) => {
    if (selectedStaff !== 'all' && c.staffId !== selectedStaff) return false;
    if (selectedStatus !== 'all' && c.status !== selectedStatus) return false;
    return true;
  });

  const totalCommission = filteredCommissions.reduce((sum, c) => sum + (c.finalCommission || 0), 0);
  const eligibleCommission = filteredCommissions
    .filter((c) => c.status === 'eligible')
    .reduce((sum, c) => sum + (c.finalCommission || 0), 0);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6 animate-fade-in pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">Sổ Theo Dõi Hoa Hồng & Doanh Số KTV</h3>
            <p className="text-xs text-slate-500">Phân biệt rõ: Dự kiến ➜ Đủ điều kiện ➜ Đã duyệt vào lương ➜ Đã chi trả</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-right">
            <span className="text-[10px] text-emerald-700 font-bold uppercase block">Hoa Hồng Đủ Điều Kiện</span>
            <span className="text-base font-black text-emerald-800">{eligibleCommission.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-right">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Tổng Hoa Hồng Phát Sinh</span>
            <span className="text-base font-black text-slate-900">{totalCommission.toLocaleString('vi-VN')}đ</span>
          </div>
          <button
            onClick={fetchCommissions}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Tải lại"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Chi nhánh</label>
          <select
            value={currentBranch.id}
            onChange={(e) => {
              const b = branches.find((br) => br.id === e.target.value);
              if (b) setCurrentBranch(b);
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Nhân viên</label>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
          >
            <option value="all">Tất cả nhân viên</option>
            {staffList.map((st) => (
              <option key={st.id} value={st.id}>{st.name} ({st.code || 'NV'})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Trạng thái hoa hồng</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="eligible">Đủ điều kiện (Chờ vào lương)</option>
            <option value="approved">Đã duyệt vào kỳ lương</option>
            <option value="paid">Đã chi trả lương</option>
            <option value="expected">Dự kiến (Chưa xong dịch vụ/đơn)</option>
            <option value="reversed">Đã hoàn/hủy</option>
          </select>
        </div>
      </div>

      {/* 3. Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-bold">
              <th className="p-3">Nhân Viên Thực Hiện</th>
              <th className="p-3">Dịch Vụ / Sản Phẩm</th>
              <th className="p-3 text-right">Doanh Thu Món</th>
              <th className="p-3 text-center">Tỷ Lệ / Định Suất</th>
              <th className="p-3 text-right">Hoa Hồng Thực Nhận</th>
              <th className="p-3 text-center">Trạng Thái</th>
              <th className="p-3">Thời Gian Ghi Nhận</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCommissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400 italic">
                  Không có bản ghi hoa hồng nào phù hợp điều kiện lọc.
                </td>
              </tr>
            ) : (
              filteredCommissions.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3 font-bold text-slate-900">{c.staffName}</td>
                  <td className="p-3 font-medium text-slate-800">{c.serviceOrProductName}</td>
                  <td className="p-3 text-right font-medium text-slate-700 font-mono">
                    {Number(c.itemRevenue).toLocaleString('vi-VN')}đ
                  </td>
                  <td className="p-3 text-center font-bold text-sky-700 font-mono">
                    {c.appliedRate}%
                  </td>
                  <td className="p-3 text-right font-black text-emerald-700 font-mono text-sm">
                    {Number(c.finalCommission).toLocaleString('vi-VN')}đ
                  </td>
                  <td className="p-3 text-center">
                    {c.status === 'eligible' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Đủ điều kiện
                      </span>
                    ) : c.status === 'paid' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Đã chi trả
                      </span>
                    ) : c.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Đã vào kỳ lương
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        <AlertCircle className="w-3 h-3" /> {c.status}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-500 text-[11px]">
                    {new Date(c.occurredAt || c.date || Date.now()).toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
