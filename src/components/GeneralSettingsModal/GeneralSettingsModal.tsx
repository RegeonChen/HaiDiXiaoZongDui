/**
 * 通用设置 Modal（Phase 3.4.4.4 + Phase 4.2.1）
 *
 * 顶栏点击"通用"按钮触发；包含：
 *   - 界面语言
 *   - 字体主题（3 套预设）
 *   - 视觉主题（经典 / 纸质）
 *   - 排版：系统字号、正文字号、阅读宽度
 *
 * 字号/宽度输入采用受控模式 + 编辑锁：
 *   - 本地 state 驱动 input value，确保"从其他页面返回时"显示已持久化的值
 *   - onChange 即时更新本地 state + 应用视觉效果
 *   - 编辑中时（isEditingRef）阻止 useAppearance 异步回写覆盖用户正在输入的内容
 *   - onBlur / Enter 钳制到合法边界并最终持久化
 */
import { useEffect, useRef, useState } from 'react';
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

function clampValue(raw: number, min: number, max: number, fallback: number): number {
  if (isNaN(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

export function GeneralSettingsModal({ open, embedded = false, onClose, onToast }: GeneralSettingsModalProps) {
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  // 编辑锁：true 时阻止外部 appearance 回写覆盖本地 state
  const sysFontEditingRef = useRef(false);
  const fontSizeEditingRef = useRef(false);
  const readingWidthEditingRef = useRef(false);

  // 本地 state（受控 input 的 value），初始化为 appearance 当前值
  const [sysFontText, setSysFontText] = useState(String(appearance.systemFontSize));
  const [fontSizeText, setFontSizeText] = useState(String(appearance.fontSize));
  const [readingWidthText, setReadingWidthText] = useState(String(appearance.readingWidth));

  // 非编辑状态下同步 appearance → 本地（初始化 + 外部变更 + 从其他页面返回）
  useEffect(() => {
    if (!sysFontEditingRef.current) {
      setSysFontText(String(appearance.systemFontSize));
    }
  }, [appearance.systemFontSize]);

  useEffect(() => {
    if (!fontSizeEditingRef.current) {
      setFontSizeText(String(appearance.fontSize));
    }
  }, [appearance.fontSize]);

  useEffect(() => {
    if (!readingWidthEditingRef.current) {
      setReadingWidthText(String(appearance.readingWidth));
    }
  }, [appearance.readingWidth]);

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

  // ---- 系统字号 ----
  const onSysFontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    sysFontEditingRef.current = true;
    const raw = e.target.value;
    setSysFontText(raw);
    const n = Number(raw);
    if (!isNaN(n) && n >= 10 && n <= 24) {
      void appearance.setSystemFontSize(n);
    }
  };
  const commitSysFont = () => {
    sysFontEditingRef.current = false;
    const clamped = clampValue(Number(sysFontText), 10, 24, appearance.systemFontSize);
    setSysFontText(String(clamped));
    if (clamped !== appearance.systemFontSize) {
      void appearance.setSystemFontSize(clamped);
    }
  };

  // ---- 正文字号 ----
  const onFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    fontSizeEditingRef.current = true;
    const raw = e.target.value;
    setFontSizeText(raw);
    const n = Number(raw);
    if (!isNaN(n) && n >= 12 && n <= 24) {
      void appearance.setFontSize(n);
    }
  };
  const commitFontSize = () => {
    fontSizeEditingRef.current = false;
    const clamped = clampValue(Number(fontSizeText), 12, 24, appearance.fontSize);
    setFontSizeText(String(clamped));
    if (clamped !== appearance.fontSize) {
      void appearance.setFontSize(clamped);
    }
  };

  // ---- 阅读宽度 ----
  const onReadingWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    readingWidthEditingRef.current = true;
    const raw = e.target.value;
    setReadingWidthText(raw);
    const n = Number(raw);
    if (!isNaN(n) && n >= 500 && n <= 1400) {
      void appearance.setReadingWidth(n);
    }
  };
  const commitReadingWidth = () => {
    readingWidthEditingRef.current = false;
    const clamped = clampValue(Number(readingWidthText), 500, 1400, appearance.readingWidth);
    setReadingWidthText(String(clamped));
    if (clamped !== appearance.readingWidth) {
      void appearance.setReadingWidth(clamped);
    }
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
              {/* 系统字号 */}
              <div className="general-modal__row" data-testid="general-modal__system-font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__system-font-size-input">
                  系统字号
                </label>
                <input
                  id="general-modal__system-font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={10}
                  max={24}
                  value={sysFontText}
                  onChange={onSysFontChange}
                  onBlur={commitSysFont}
                  onKeyDown={onEnterKey(commitSysFont)}
                  data-testid="general-modal__system-font-size"
                  title="左栏（订阅源）和中栏（文章列表）的文字大小，不影响右栏阅读区"
                />
                <span className="general-modal__hint">px（影响左/中栏）</span>
              </div>
              {/* 正文字号 */}
              <div className="general-modal__row" data-testid="general-modal__font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__font-size-input">正文字号</label>
                <input
                  id="general-modal__font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={12}
                  max={24}
                  value={fontSizeText}
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
                  id="general-modal__reading-width-input"
                  type="number"
                  className="general-modal__input"
                  min={500}
                  max={1400}
                  step={50}
                  value={readingWidthText}
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
