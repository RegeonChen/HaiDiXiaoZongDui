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
 * Phase 4.2.1 关键改动：
 *   - "系统字号"与"正文字号"两个独立滑块
 *   - 拖动"系统字号"→ 左/中栏文字即时变化，**右栏正文不变**（独立 CSS 变量 --ui-font-size）
 *   - 拖动"正文字号"→ 仅右栏正文变化（CSS 变量 --font-size，ArticleReader 不引用 --ui-font-size）
 *   - 各自持久化到 AppSettings，重启后各自保持
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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

export function GeneralSettingsModal({ open, embedded = false, onClose, onToast }: GeneralSettingsModalProps) {
  // 必须在所有 hooks 之前
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  // 三个数字输入使用本地 state 缓冲用户输入，避免受控组件 + async IPC
  // 导致 React 在中间值上重置 DOM value 的问题。
  // 用户在输入框中自由编辑，onBlur / Enter 时提交到 IPC 持久化。
  const [localFontSize, setLocalFontSize] = useState<string>(String(appearance.fontSize));
  const [localSystemFontSize, setLocalSystemFontSize] = useState<string>(String(appearance.systemFontSize));
  const [localReadingWidth, setLocalReadingWidth] = useState<string>(String(appearance.readingWidth));
  const fontSizeRef = useRef(appearance.fontSize);
  const systemFontSizeRef = useRef(appearance.systemFontSize);
  const readingWidthRef = useRef(appearance.readingWidth);

  // 外部值变化时同步本地缓冲（如从其他途径修改了设置）
  useEffect(() => {
    if (appearance.fontSize !== fontSizeRef.current) {
      setLocalFontSize(String(appearance.fontSize));
      fontSizeRef.current = appearance.fontSize;
    }
  }, [appearance.fontSize]);
  useEffect(() => {
    if (appearance.systemFontSize !== systemFontSizeRef.current) {
      setLocalSystemFontSize(String(appearance.systemFontSize));
      systemFontSizeRef.current = appearance.systemFontSize;
    }
  }, [appearance.systemFontSize]);
  useEffect(() => {
    if (appearance.readingWidth !== readingWidthRef.current) {
      setLocalReadingWidth(String(appearance.readingWidth));
      readingWidthRef.current = appearance.readingWidth;
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

  const commitFontSize = useCallback(async () => {
    const n = Number(localFontSize);
    if (!Number.isFinite(n) || n < 10 || n > 32) {
      setLocalFontSize(String(appearance.fontSize));
      return;
    }
    const ok = await appearance.setFontSize(n);
    if (ok) fontSizeRef.current = n;
    else setLocalFontSize(String(appearance.fontSize));
    onToast(ok ? '正文字号已更新' : '更新失败', ok ? 'success' : 'error');
  }, [localFontSize, appearance.fontSize, appearance, onToast]);

  const commitSystemFontSize = useCallback(async () => {
    const n = Number(localSystemFontSize);
    if (!Number.isFinite(n) || n < 10 || n > 24) {
      setLocalSystemFontSize(String(appearance.systemFontSize));
      return;
    }
    const ok = await appearance.setSystemFontSize(n);
    if (ok) systemFontSizeRef.current = n;
    else setLocalSystemFontSize(String(appearance.systemFontSize));
    onToast(ok ? '系统字号已更新' : '更新失败', ok ? 'success' : 'error');
  }, [localSystemFontSize, appearance.systemFontSize, appearance, onToast]);

  const commitReadingWidth = useCallback(async () => {
    const n = Number(localReadingWidth);
    if (!Number.isFinite(n) || n < 320 || n > 1600) {
      setLocalReadingWidth(String(appearance.readingWidth));
      return;
    }
    const ok = await appearance.setReadingWidth(n);
    if (ok) readingWidthRef.current = n;
    else setLocalReadingWidth(String(appearance.readingWidth));
    onToast(ok ? '阅读宽度已更新' : '更新失败', ok ? 'success' : 'error');
  }, [localReadingWidth, appearance.readingWidth, appearance, onToast]);

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
              {/* Phase 4.2.1:系统字号 = 左/中栏 UI 字号(独立于正文字号)
                  - 拖动此滑块 → 左栏 + 中栏文字即时变化,右栏阅读区不变
                  - 范围 10-24,默认 14 */}
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
                  value={localSystemFontSize}
                  onChange={(e) => setLocalSystemFontSize(e.target.value)}
                  onBlur={() => void commitSystemFontSize()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitSystemFontSize(); }
                  }}
                  data-testid="general-modal__system-font-size"
                  title="左栏（订阅源）和中栏（文章列表）的文字大小，不影响右栏阅读区"
                />
                <span className="general-modal__hint">px（影响左/中栏）</span>
              </div>
              <div className="general-modal__row" data-testid="general-modal__font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__font-size-input">正文字号</label>
                <input
                  id="general-modal__font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={12}
                  max={24}
                  value={localFontSize}
                  onChange={(e) => setLocalFontSize(e.target.value)}
                  onBlur={() => void commitFontSize()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitFontSize(); }
                  }}
                  data-testid="general-modal__font-size"
                  title="右栏阅读区文字大小，不影响左/中栏 UI"
                />
                <span className="general-modal__hint">px（仅影响右栏）</span>
              </div>
              <div className="general-modal__row">
                <label className="general-modal__label">阅读宽度</label>
                <input
                  type="number"
                  className="general-modal__input"
                  min={500}
                  max={1400}
                  step={50}
                  value={localReadingWidth}
                  onChange={(e) => setLocalReadingWidth(e.target.value)}
                  onBlur={() => void commitReadingWidth()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitReadingWidth(); }
                  }}
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
