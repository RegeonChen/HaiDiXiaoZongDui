/**
 * 通用设置 Modal
 *
 * 排版输入采用非受控模式（defaultValue + type="number"）：
 *   - 浏览器原生上下箭头直接操作 DOM，不经过 React state
 *   - key 依赖 settingsReady：DB 加载完成后强制 remount 以应用持久化值
 *   - onChange 读取 DOM 当前值，合法时立即应用视觉效果
 *   - onBlur / Enter 钳制到 [min, max] 边界并固化到 SQLite
 */
import { useEffect, useCallback } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import { useTheme } from '../../hooks/useTheme';
import './GeneralSettingsModal.css';

export interface GeneralSettingsModalProps {
  open: boolean;
  embedded?: boolean;
  onClose: () => void;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

const FONT_THEMES = [
  { id: 'default', label: '默认（衬线）', preview: 'Aa 默认', stack: `Georgia, "Source Han Serif SC", "Songti SC", "SimSun", "PingFang SC", "Hiragino Sans GB", serif` },
  { id: 'hei', label: '黑体（无衬线）', preview: 'Aa 黑体', stack: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Helvetica Neue", Arial, sans-serif` },
  { id: 'kai', label: '楷体', preview: 'Aa 楷体', stack: `"Kaiti SC", "STKaiti", "KaiTi", "FangSong", "Source Han Serif SC", serif` }
] as const;

const VISUAL_THEMES = [
  { id: 'classic' as const, label: '经典', description: '白底深字' },
  { id: 'paper' as const, label: '纸质', description: '暖黄护眼（深色模式下与经典一致）' }
] as const;

/** 从 input 元素读取并钳制值；越界时写回 DOM。返回 clamped 值。 */
function clampInput(el: HTMLInputElement, min: number, max: number, fallback: number): number {
  let n = Number(el.value);
  if (isNaN(n)) n = fallback;
  n = Math.max(min, Math.min(max, Math.round(n)));
  if (String(n) !== el.value) {
    el.value = String(n);
  }
  return n;
}

export function GeneralSettingsModal({ open, embedded = false, onClose, onToast }: GeneralSettingsModalProps) {
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  // 设置加载完成后 key 变化 → input remount → defaultValue 使用持久化值
  const inputKey = appearance.settingsReady ? 'loaded' : 'init';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // ---- 系统字号 (10-24, step 1) ----
  const onSysFontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!isNaN(n) && n >= 10 && n <= 24) void appearance.setSystemFontSize(n);
  };
  const onSysFontBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const clamped = clampInput(e.target, 10, 24, appearance.systemFontSize);
    void appearance.setSystemFontSize(clamped);
  };
  const onSysFontKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const clamped = clampInput(e.currentTarget, 10, 24, appearance.systemFontSize);
      void appearance.setSystemFontSize(clamped);
    }
  };

  // ---- 正文字号 (12-24, step 1) ----
  const onFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!isNaN(n) && n >= 12 && n <= 24) void appearance.setFontSize(n);
  };
  const onFontSizeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const clamped = clampInput(e.target, 12, 24, appearance.fontSize);
    void appearance.setFontSize(clamped);
  };
  const onFontSizeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const clamped = clampInput(e.currentTarget, 12, 24, appearance.fontSize);
      void appearance.setFontSize(clamped);
    }
  };

  // ---- 阅读宽度 (500-1400, step 50) ----
  const onReadingWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!isNaN(n) && n >= 500 && n <= 1400) void appearance.setReadingWidth(n);
  };
  const onReadingWidthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const clamped = clampInput(e.target, 500, 1400, appearance.readingWidth);
    void appearance.setReadingWidth(clamped);
  };
  const onReadingWidthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const clamped = clampInput(e.currentTarget, 500, 1400, appearance.readingWidth);
      void appearance.setReadingWidth(clamped);
    }
  };

  const handleFontTheme = useCallback(async (id: string) => {
    const ok = await appearance.setFontTheme(id);
    onToast(ok ? '字体已切换' : '切换失败', ok ? 'success' : 'error');
  }, [appearance, onToast]);

  const handleVisualTheme = useCallback(async (id: 'classic' | 'paper') => {
    const ok = await appearance.setVisualTheme(id);
    onToast(ok ? '视觉主题已切换' : '切换失败', ok ? 'success' : 'error');
  }, [appearance, onToast]);

  const panel = (
    <div
      className={`general-modal ${embedded ? 'general-modal--embedded settings-surface' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-labelledby="general-modal-title"
      onClick={(e) => e.stopPropagation()}
    >
        <div className={`general-modal__header ${embedded ? 'settings-surface__header' : ''}`}>
          <div>
            <h2 id="general-modal-title" className={`general-modal__title ${embedded ? 'settings-surface__title' : ''}`}>
              通用设置
            </h2>
            <p className={`general-modal__subtitle ${embedded ? 'settings-surface__intro' : ''}`}>
              调整界面外观与阅读排版，修改会立即生效。
            </p>
          </div>
          <button type="button" className="general-modal__close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className={`general-modal__body ${embedded ? 'settings-surface__body' : ''}`}>
          {/* 字体主题 */}
          <section className={`general-modal__section ${embedded ? 'settings-surface__section' : ''}`}>
            <h3 className={`general-modal__section-title ${embedded ? 'settings-surface__section-title' : ''}`}>字体主题</h3>
            <div className={embedded ? 'settings-surface__section-body' : undefined}>
              <div className="general-modal__font-list">
                {FONT_THEMES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`general-modal__font-card ${appearance.fontTheme === f.id ? 'is-active' : ''}`}
                    onClick={() => void handleFontTheme(f.id)}
                    style={{ fontFamily: f.stack }}
                  >
                    <span className="general-modal__font-preview">{f.preview}</span>
                    <span className="general-modal__font-label">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 视觉主题 */}
          <section className={`general-modal__section ${embedded ? 'settings-surface__section' : ''}`}>
            <h3 className={`general-modal__section-title ${embedded ? 'settings-surface__section-title' : ''}`}>视觉主题</h3>
            <div className={embedded ? 'settings-surface__section-body' : undefined}>
              <div className="general-modal__visual-list">
                {VISUAL_THEMES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`general-modal__visual-card general-modal__visual-card--${v.id} ${appearance.visualTheme === v.id ? 'is-active' : ''}`}
                    onClick={() => void handleVisualTheme(v.id)}
                  >
                    <span className="general-modal__visual-swatch" />
                    <span className="general-modal__visual-label">{v.label}</span>
                    <span className="general-modal__visual-desc">{v.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 排版 */}
          <section className={`general-modal__section ${embedded ? 'settings-surface__section' : ''}`}>
            <h3 className={`general-modal__section-title ${embedded ? 'settings-surface__section-title' : ''}`}>排版</h3>
            <div className={embedded ? 'settings-surface__section-body settings-surface__section-body--rows' : undefined}>

              <div className="general-modal__row" data-testid="general-modal__system-font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__system-font-size-input">系统字号</label>
                <input
                  key={`sys-${inputKey}`}
                  id="general-modal__system-font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={10}
                  max={24}
                  defaultValue={appearance.systemFontSize}
                  onChange={onSysFontChange}
                  onBlur={onSysFontBlur}
                  onKeyDown={onSysFontKeyDown}
                  data-testid="general-modal__system-font-size"
                  title="左栏（订阅源）和中栏（文章列表）的文字大小，不影响右栏阅读区"
                />
                <span className="general-modal__hint">px（影响左/中栏）</span>
              </div>

              <div className="general-modal__row" data-testid="general-modal__font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__font-size-input">正文字号</label>
                <input
                  key={`fs-${inputKey}`}
                  id="general-modal__font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={12}
                  max={24}
                  defaultValue={appearance.fontSize}
                  onChange={onFontSizeChange}
                  onBlur={onFontSizeBlur}
                  onKeyDown={onFontSizeKeyDown}
                  data-testid="general-modal__font-size"
                  title="右栏阅读区文字大小，不影响左/中栏 UI"
                />
                <span className="general-modal__hint">px（仅影响右栏）</span>
              </div>

              <div className="general-modal__row">
                <label className="general-modal__label" htmlFor="general-modal__reading-width-input">阅读宽度</label>
                <input
                  key={`rw-${inputKey}`}
                  id="general-modal__reading-width-input"
                  type="number"
                  className="general-modal__input"
                  min={500}
                  max={1400}
                  step={50}
                  defaultValue={appearance.readingWidth}
                  onChange={onReadingWidthChange}
                  onBlur={onReadingWidthBlur}
                  onKeyDown={onReadingWidthKeyDown}
                  title="右栏阅读区最大宽度"
                />
                <span className="general-modal__hint">px</span>
              </div>

            </div>
          </section>
        </div>

        <div className="general-modal__footer">
          <button type="button" className="general-modal__btn" onClick={onClose}>返回阅读</button>
        </div>
    </div>
  );

  if (embedded) return panel;

  return (
    <div className="general-modal__backdrop" onClick={onClose}>
      {panel}
    </div>
  );
}
