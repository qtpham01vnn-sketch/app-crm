import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Lock,
  User,
  Calendar,
  Search,
  CheckCircle2,
  MessageCircle,
  Globe
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { ConversationThread, ChatMessage, ChannelIntegration, Customer } from '../../types';
import { chatboxService } from '../../services/chatboxService';

// Inline Facebook Icon
const FacebookIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface ChatboxViewProps {
  onOpenNewApptModal?: (customer?: Customer) => void;
}

export const ChatboxView: React.FC<ChatboxViewProps> = ({ onOpenNewApptModal }) => {
  const { org, staffList, customers, showToast } = useApp();
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<ChannelIntegration[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Composer
  const [composerMode, setComposerMode] = useState<'message' | 'internal_note'>('message');
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadChannels = useCallback(async () => {
    if (!org?.id) return;
    try {
      const chs = await chatboxService.getChannelIntegrations(org.id);
      setChannels(chs);
    } catch (err) {
      console.error('Lỗi tải kênh:', err);
    }
  }, [org?.id]);

  const loadThreads = useCallback(async () => {
    if (!org?.id) return;
    setLoadingThreads(true);
    try {
      const { threads: data } = await chatboxService.getConversationThreads({
        orgId: org.id,
        status: statusFilter === 'all' ? undefined : statusFilter,
        channelType: channelFilter === 'all' ? undefined : channelFilter,
        search: searchQuery.trim() || undefined
      });
      setThreads(data);
      if (data.length > 0 && !selectedThread) {
        setSelectedThread(data[0]);
      }
    } catch (err) {
      console.error('Lỗi tải hội thoại:', err);
    } finally {
      setLoadingThreads(false);
    }
  }, [org?.id, statusFilter, channelFilter, searchQuery, selectedThread]);

  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const msgs = await chatboxService.getThreadMessages(threadId);
      setMessages(msgs);
    } catch (err) {
      console.error('Lỗi tải tin nhắn:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
    loadThreads();
  }, [loadChannels, loadThreads]);

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
    }
  }, [selectedThread, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !messageInput.trim() || !staffList?.[0]?.id) return;

    const content = messageInput.trim();
    const isNote = composerMode === 'internal_note';
    setIsSending(true);

    try {
      const res = await chatboxService.sendMessage({
        threadId: selectedThread.id,
        senderStaffId: staffList[0].id,
        content,
        isInternalNote: isNote
      });

      if (res.success) {
        setMessageInput('');
        loadMessages(selectedThread.id);
        loadThreads();
      } else {
        showToast(res.error || 'Lỗi khi gửi tin nhắn', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi hệ thống', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedThread) return;
    try {
      await chatboxService.updateThread({
        threadId: selectedThread.id,
        status: newStatus
      });
      setSelectedThread((prev) => prev ? { ...prev, status: newStatus as any } : null);
      showToast(`Đã chuyển trạng thái: ${newStatus}`, 'success');
      loadThreads();
    } catch (err: any) {
      showToast('Không thể cập nhật trạng thái', 'error');
    }
  };

  const handleLinkCustomer = async (customerId: string) => {
    if (!selectedThread) return;
    try {
      await chatboxService.updateThread({
        threadId: selectedThread.id,
        customerId: customerId || undefined
      });
      const cust = customers.find((c) => c.id === customerId);
      setSelectedThread((prev) =>
        prev
          ? {
              ...prev,
              customerId,
              customerName: cust?.name,
              customerPhone: cust?.phone
            }
          : null
      );
      showToast('Đã gắn hồ sơ khách hàng thành công', 'success');
      loadThreads();
    } catch (err: any) {
      showToast('Lỗi khi gắn khách hàng', 'error');
    }
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'zalo_oa':
        return <MessageCircle className="w-3.5 h-3.5 text-blue-500" />;
      case 'facebook_messenger':
        return <FacebookIcon className="w-3.5 h-3.5 text-indigo-500" />;
      case 'web_widget':
        return <Globe className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const linkedCustomer = customers.find((c) => c.id === selectedThread?.customerId);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      {/* 1. TOP STATUS BAR: CHANNELS & SETTINGS NOTICE */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Hộp Thư CSKH Đa Kênh (Omnichannel Inbox)
            </h2>
            <p className="text-xs text-slate-500">
              Quản lý hội thoại Zalo OA, Facebook, Web Livechat & Ghi chú nội bộ
            </p>
          </div>
        </div>

        {/* Channels Integration Badges */}
        <div className="flex items-center gap-2">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                ch.isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {getChannelIcon(ch.channelType)}
              <span>{ch.channelName}</span>
              <span className={`w-2 h-2 rounded-full ${ch.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-[10px] font-normal">
                {ch.isConnected ? 'Đang kết nối' : 'Chưa kết nối'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. MAIN 3-COLUMN INBOX LAYOUT */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* COLUMN 1: THREAD LIST (Width: 4/12) */}
        <div className="col-span-12 lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-xs flex flex-col min-h-0">
          {/* Filters & Search */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm theo tên, SĐT, nội dung..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold">
              {['all', 'open', 'in_progress', 'resolved', 'closed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'all'
                    ? 'Tất cả'
                    : st === 'open'
                    ? 'Chưa xử lý'
                    : st === 'in_progress'
                    ? 'Đang xử lý'
                    : st === 'resolved'
                    ? 'Đã xong'
                    : 'Đã đóng'}
                </button>
              ))}
            </div>

            {/* Channel Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-medium text-slate-500">
              <span className="text-slate-400 shrink-0 mr-1">Kênh:</span>
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'zalo_oa', label: 'Zalo' },
                { id: 'facebook_messenger', label: 'Facebook' },
                { id: 'web_widget', label: 'Livechat' }
              ].map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setChannelFilter(ch.id)}
                  className={`px-2 py-1 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                    channelFilter === ch.id
                      ? 'bg-slate-800 text-white font-bold'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Threads Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
            {loadingThreads ? (
              <div className="py-12 text-center text-xs text-slate-400">Đang tải hội thoại...</div>
            ) : threads.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Không tìm thấy hội thoại nào phù hợp.
              </div>
            ) : (
              threads.map((t) => {
                const isSelected = selectedThread?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedThread(t)}
                    className={`w-full text-left p-3.5 rounded-2xl transition-all flex items-start space-x-3 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/70 border border-indigo-200 shadow-xs'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {t.externalUserName.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-white shadow-xs">
                        {getChannelIcon(t.channelType)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {t.customerName || t.externalUserName}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(t.lastMessageAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 truncate">
                        {t.lastMessagePreview || 'Chưa có tin nhắn'}
                      </p>

                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                            t.status === 'open'
                              ? 'bg-amber-100 text-amber-700'
                              : t.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {t.status === 'open' ? 'Chưa xử lý' : t.status === 'in_progress' ? 'Đang xử lý' : 'Đã xử lý'}
                        </span>
                        {t.assignedStaffName && (
                          <span className="text-[10px] text-slate-400 truncate">
                            • {t.assignedStaffName}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: ACTIVE CONVERSATION MESSAGES & COMPOSER (Width: 5/12) */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-xs flex flex-col min-h-0">
          {selectedThread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                    {selectedThread.externalUserName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      {selectedThread.customerName || selectedThread.externalUserName}
                      {getChannelIcon(selectedThread.channelType)}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      ID: {selectedThread.externalUserId} {selectedThread.customerPhone ? `• SĐT: ${selectedThread.customerPhone}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleUpdateStatus('resolved')}
                    className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Đã Xử Lý</span>
                  </button>
                </div>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {loadingMessages ? (
                  <div className="py-8 text-center text-xs text-slate-400">Đang tải tin nhắn...</div>
                ) : messages.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Bắt đầu cuộc trò chuyện hoặc gửi ghi chú nội bộ...
                  </div>
                ) : (
                  messages.map((m) => {
                    const isStaff = m.senderType === 'staff';
                    const isNote = m.isInternalNote;

                    if (isNote) {
                      return (
                        <div
                          key={m.id}
                          className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 shadow-xs"
                        >
                          <div className="flex items-center justify-between font-bold text-[11px] text-amber-800 mb-1">
                            <span className="flex items-center gap-1">
                              <Lock className="w-3 h-3 text-amber-600" /> Ghi Chú Nội Bộ ({m.senderName})
                            </span>
                            <span className="font-normal text-[10px] text-amber-600">
                              {new Date(m.createdAt).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>
                          <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[80%] p-3.5 rounded-2xl text-xs shadow-xs ${
                            isStaff
                              ? 'bg-indigo-600 text-white rounded-br-xs'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {m.senderName} • {new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="p-3 border-t border-slate-100 bg-white">
                {/* Composer Mode Toggle */}
                <div className="flex items-center space-x-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setComposerMode('message')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                      composerMode === 'message'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Send className="w-3 h-3" />
                    <span>Tin Nhắn Khách Hàng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setComposerMode('internal_note')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                      composerMode === 'internal_note'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    <span>Ghi Chú Nội Bộ</span>
                  </button>
                </div>

                <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
                  <textarea
                    rows={2}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={
                      composerMode === 'internal_note'
                        ? 'Nhập ghi chú nội bộ (chỉ nhân viên phòng khám thấy)...'
                        : 'Nhập tin nhắn phản hồi khách hàng...'
                    }
                    className={`flex-1 p-2.5 rounded-2xl text-xs border focus:outline-none transition-all ${
                      composerMode === 'internal_note'
                        ? 'bg-amber-50/50 border-amber-300 focus:bg-white'
                        : 'bg-slate-50 border-slate-200 focus:bg-white'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={isSending || !messageInput.trim()}
                    className={`p-3 rounded-2xl text-white font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer ${
                      composerMode === 'internal_note'
                        ? 'bg-amber-500 hover:bg-amber-600'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              Chọn một hội thoại để bắt đầu phản hồi
            </div>
          )}
        </div>

        {/* COLUMN 3: CUSTOMER SIDEBAR & QUICK APPOINTMENT (Width: 3/12) */}
        <div className="col-span-12 lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-xs p-4 flex flex-col space-y-4 overflow-y-auto">
          {selectedThread ? (
            <>
              {/* Linked Customer Profile */}
              <div>
                <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" /> Hồ Sơ Khách Hàng
                </h4>

                {linkedCustomer ? (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{linkedCustomer.name}</p>
                      <p className="text-slate-500">{linkedCustomer.phone}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-500">Hạng:</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold uppercase text-[10px]">
                        {linkedCustomer.vipTier || 'STANDARD'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Chi tiêu chuỗi:</span>
                      <span className="font-bold text-slate-900">
                        {linkedCustomer.totalSpent.toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    <button
                      onClick={() => onOpenNewApptModal?.(linkedCustomer)}
                      className="w-full mt-2 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Đặt Lịch Hẹn Mới</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-2">
                    <p className="text-amber-800 font-medium">
                      Hội thoại này chưa được liên kết với hồ sơ khách hàng.
                    </p>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Gắn hồ sơ khách hàng:
                      </label>
                      <select
                        onChange={(e) => handleLinkCustomer(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 cursor-pointer"
                      >
                        <option value="">-- Chọn khách hàng --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Thread Controls */}
              <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nhân viên phụ trách:
                  </label>
                  <select
                    value={selectedThread.assignedStaffId || ''}
                    onChange={async (e) => {
                      await chatboxService.updateThread({
                        threadId: selectedThread.id,
                        assignedStaffId: e.target.value || undefined
                      });
                      loadThreads();
                    }}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="">-- Chưa chỉ định --</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Trạng thái hội thoại:
                  </label>
                  <select
                    value={selectedThread.status}
                    onChange={(e) => handleUpdateStatus(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="open">Chưa xử lý (Open)</option>
                    <option value="in_progress">Đang xử lý (In Progress)</option>
                    <option value="resolved">Đã xử lý (Resolved)</option>
                    <option value="closed">Đã đóng (Closed)</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              Chi tiết thông tin khách hàng
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
