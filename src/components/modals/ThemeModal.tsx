import React from 'react';
import { Palette, X, Check, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { APP_THEMES } from '../../mock/themes';

export const ThemeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { currentTheme, setCurrentTheme, showToast } = useApp();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div
          className="text-white px-5 py-4 flex items-center justify-between transition-colors duration-300"
          style={{ background: currentTheme.heroGradient }}
        >
          <div className="flex items-center space-x-2">
            <Palette className="w-5 h-5 text-white" />
            <div>
              <h3 className="font-bold text-base flex items-center gap-1.5 text-white">
                <span>Bộ Sưu Tập 10 Giao Diện & Ngành Hàng</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              </h3>
              <p className="text-[11px] text-slate-200">
                ⚡ Bấm vào bất kỳ màu nào sẽ chuyển ngay lập tức toàn bộ CRM!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {APP_THEMES.map((th) => {
              const isSelected = currentTheme.id === th.id;
              return (
                <button
                  key={th.id}
                  onClick={() => {
                    setCurrentTheme(th);
                    showToast(`✨ Đã chuyển ngay: ${th.name}`, 'success');
                  }}
                  className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-2 shadow-md ring-2 scale-[1.02]'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  style={{
                    borderColor: isSelected ? th.primaryColor : undefined,
                    backgroundColor: isSelected ? th.badgeBg : undefined,
                    boxShadow: isSelected ? `0 4px 14px ${th.ringColor}` : undefined
                  }}
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className="w-8 h-8 rounded-xl shadow-md flex items-center justify-center text-white shrink-0 transition-transform active:scale-90"
                      style={{ backgroundColor: th.previewColor }}
                    >
                      {isSelected ? <Check className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-white/40" />}
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900">{th.name}</p>
                      <p className="text-[10px] font-mono font-bold" style={{ color: th.primaryColor }}>
                        {th.primaryColor}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded text-white shrink-0"
                      style={{ backgroundColor: th.primaryColor }}
                    >
                      ĐANG DÙNG
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-medium">
              Đang áp dụng: <b style={{ color: currentTheme.primaryColor }}>{currentTheme.name}</b>
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer hover:opacity-90 active:scale-95"
              style={{ backgroundColor: currentTheme.buttonBg }}
            >
              Đóng Cửa Sổ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
