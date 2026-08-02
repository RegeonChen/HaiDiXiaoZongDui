/**
 * 通用设置 Modal（Phase 3.4.4.4 + Phase 4.2.1）
 *
 * 顶栏点击"通用"按钮触发；包含：
 *   - 界面语言
 *   - 字体主题（3 套预设）
 *   - 视觉主题（经典 / 纸质）
 *   - 排版
 *     - 系统字号：左栏（FeedList）+ 中栏（ArticleList）文字大小
 *     - 正文字号：右栏（ArticleReader）阅读区文字大小
 *     - 阅读宽度：阅读区最大宽度
 *
 * 修改即时生效 + 持久化（通过 useAppearance.setFontTheme 等），不跳转子页面。
 *
 * 字号/宽度输入采用非受控模式（defaultValue）：
 *   - 浏览器原生上下箭头直接生效，不依赖 React state 回写
 *   - onChange 立即应用视觉效果（如果值在合法范围）
 *   - onBlur / Enter 钳制到合法边界并持久化
 */
import { useEffect, useRef } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import { useTheme } from '../../hooks/useTheme';
import './GeneralSettingsModal.css';

export interface GeneralSettingsModalProps {
  open: boolean;
  embedded?: boolean;
  onClose: () => void;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

const FONT_THEMES: Array<{ id: string; label: string; preview: string; stack: string }> = [
  { id: 'default', label: '默认（衬线）', preview: 'Aa 默认', stack: `Georgia, "Source Han Serif SC", "Songti SC", "SimSun", "PingFang SC", "Hiragino Sans GB", serif` },
  { id: 'hei', label: '黑体（无衬线）', preview: 'Aa 黑体', stack: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Helvetica Neue", Arial, sans-serif` },
  { id: 'kai', label: '楷体', preview: 'Aa 楷体', stack: `"Kaiti SC", "STKaiti", "KaiTi", "FangSong", "Source Han Serif SC", serif` }
];

const VISUAL_THEMES: Array<{ id: 'classic' | 'paper'; label: string; description: string }> = [
  { id: 'classic', label: '经典', description: '白底深字' },
  { id: 'paper', label: '纸质', description: '暖黄护眼（深色模式下与经典一致）' }
];

/** 从 input 读取当前值，钳制到 [min, max]，越界时写回 input。返回 clamped 值。 */
function clampInputElement(el: HTMLInputElement, min: number, max: number): number {
  let n = Number(el.value);
  if (isNaN(n)) n = min;
  n = Math.max(min, Math.min(max, Math.round(n)));
  if (String(n) !== el.value) {
    el.value = String(n);
  }
  return n;
}

export function GeneralSettingsModal({ open, embedded = false, onClose, onToast }: GeneralSettingsModalProps) {
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  // 非受控输入 ref，用于 blur/Enter 时读取和钳制
  const sysFontRef = useRef<HTMLInputElement>(null);
  const fontSizeRef = useRef<HTMLInputElement>(null);
  const readingWidthRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleFontTheme = async (id: string) => {
    const ok = await appearance.setFontTheme(id);
    onToast(ok ? '字体已切换' : '切换失败', ok ? 'success' : 'error');
  };
  const handleVisualTheme = async (id: 'classic' | 'paper') => {
    const ok = await appearance.setVisualTheme(id);
    onToast(ok ? '视觉主题已切换' : '切换失败', ok ? 'success' : 'error');
  };

  // ---- 系统字号：onChange 即时应用视觉效果，onBlur/Enter 钳制并持久化 ----
  const onSysFontChange = () => {
    const el = sysFontRef.current;
    if (!el) return;
    const n = Number(el.value);
    if (!isNaN(n) && n >= 10 && n <= 24) {
      void appearance.setSystemFontSize(n);
    }
  };
  const commitSysFont = () => {
    const el = sysFontRef.current;
    if (!el) return;
    const clamped = clampInputElement(el, 10, 24);
    void appearance.setSystemFontSize(clamped);
  };

  // ---- 正文字号 ----
  const onFontSizeChange = () => {
    const el = fontSizeRef.current;
    if (!el) return;
    const n = Number(el.value);
    if (!isNaN(n) && n >= 12 && n <= 24) {
      void appearance.setFontSize(n);
    }
  };
  const commitFontSize = () => {
    const el = fontSizeRef.current;
    if (!el) return;
    const clamped = clampInputElement(el, 12, 24);
    void appearance.setFontSize(clamped);
  };

  // ---- 阅读宽度 ----
  const onReadingWidthChange = () => {
    const el = readingWidthRef.current;
    if (!el) return;
    const n = Number(el.value);
    if (!isNaN(n) && n >= 500 && n <= 1400) {
      void appearance.setReadingWidth(n);
    }
  };
  const commitReadingWidth = () => {
    const el = readingWidthRef.current;
    if (!el) return;
    const clamped = clampInputElement(el, 500, 1400);
    void appearance.setReadingWidth(clamped);
  };

  const onEnterKey = (commit: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

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
            <h2
              id="general-modal-title"
              className={`general-modal__title ${embedded ? 'settings-surface__title' : ''}`}
            >
              通用设置
            </h2>
            <p className={`general-modal__subtitle ${embedded ? 'settings-surface__intro' : ''}`}>
              调整界面外观与阅读排版，修改会立即生效。
            </p>
          </div>
          <button
            type="button"
            className="general-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className={`general-modal__body ${embedded ? 'settings-surface__body' : ''}`}>
          <section className={`general-modal__section ${embedded ? 'settings-surface__section' : ''}`}>
            <h3 className={`general-modal__section-title ${embedded ? 'settings-surface__section-title' : ''}`}>
              字体主题
            </h3>
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

          <section className={`general-modal__section ${embedded ? 'settings-surface__section' : ''}`}>
            <h3 className={`general-modal__section-title ${embedded ? 'settings-surface__section-title' : ''}`}>
              视觉主题
            </h3>
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

          <section className={`general-modal__section ${embedded ? 'settings-surface__section' : ''}`}>
            <h3 className={`general-modal__section-title ${embedded ? 'settings-surface__section-title' : ''}`}>
              排版
            </h3>
            <div className={embedded ? 'settings-surface__section-body settings-surface__section-body--rows' : undefined}>
              {/* 系统字号（控制左/中栏 UI 文字，独立于正文字号） */}
              <div className="general-modal__row" data-testid="general-modal__system-font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__system-font-size-input">
                  系统字号
                </label>
                <input
                  ref={sysFontRef}
                  id="general-modal__system-font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={10}
                  max={24}
                  defaultValue={appearance.systemFontSize}
                  onChange={onSysFontChange}
                  onBlur={commitSysFont}
                  onKeyDown={onEnterKey(commitSysFont)}
                  data-testid="general-modal__system-font-size"
                  title="左栏（订阅源）和中栏（文章列表）的文字大小，不影响右栏阅读区"
                />
                <span className="general-modal__hint">px（影响左/中栏）</span>
              </div>
              {/* 正文字号（仅右栏） */}
              <div className="general-modal__row" data-testid="general-modal__font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__font-size-input">正文字号</label>
                <input
                  ref={fontSizeRef}
                  id="general-modal__font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={12}
                  max={24}
                  defaultValue={appearance.fontSize}
                  onChange={onFontSizeChange}
                  onBlur={commitFontSize}
                  onKeyDown={onEnterKey(commitFontSize)}
                  data-testid="general-modal__font-size"
                  title="右栏阅读区文字大小，不影响左/中栏 UI"
                />
                <span className="general-modal__hint">px（仅影响右栏）</span>
              </div>
              {/* 阅读宽度 */}
              <div className="general-modal__row">
                <label className="general-modal__label" htmlFor="general-modal__reading-width-input">阅读宽度</label>
                <input
                  ref={readingWidthRef}
                  id="general-modal__reading-width-input"
                  type="number"
                  className="general-modal__input"
                  min={500}
                  max={1400}
                  step={50}
                  defaultValue={appearance.readingWidth}
                  onChange={onReadingWidthChange}
                  onBlur={commitReadingWidth}
                  onKeyDown={onEnterKey(commitReadingWidth)}
                  title="右栏阅读区最大宽度"
                />
                <span className="general-modal__hint">px</span>
              </div>
            </div>
          </section>
        </div>

        <div className="general-modal__footer">
          <button type="button" className="general-modal__btn" onClick={onClose}>
            返回阅读
          </button>
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
