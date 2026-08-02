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
import { useEffect, useState } from 'react';
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

/** 将一个本地字符串值钳制到 [min, max] 并转为数字，无法解析时退回 fallback。 */
function clampInput(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function GeneralSettingsModal({ open, embedded = false, onClose, onToast }: GeneralSettingsModalProps) {
  // 必须在所有 hooks 之前
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  // 本地桥接 state — 解决 controlled input 被异步 IPC 回写覆盖的问题：
  // onChange 先更新本地 state（用户立即看到输入）；若值合法则逐次写入 appearance。
  // onBlur / Enter 时钳制到边界并最终持久化。
  const [sysFontSizeText, setSysFontSizeText] = useState(String(appearance.systemFontSize));
  const [fontSizeText, setFontSizeText] = useState(String(appearance.fontSize));
  const [readingWidthText, setReadingWidthText] = useState(String(appearance.readingWidth));

  // 外部状态变化时同步本地副本（例如默认值恢复）
  useEffect(() => { setSysFontSizeText(String(appearance.systemFontSize)); }, [appearance.systemFontSize]);
  useEffect(() => { setFontSizeText(String(appearance.fontSize)); }, [appearance.fontSize]);
  useEffect(() => { setReadingWidthText(String(appearance.readingWidth)); }, [appearance.readingWidth]);

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
    const raw = e.target.value;
    setSysFontSizeText(raw);
    const n = Number(raw);
    if (!isNaN(n) && n >= 10 && n <= 24) {
      void appearance.setSystemFontSize(n);
    }
  };
  const commitSysFont = () => {
    const clamped = clampInput(sysFontSizeText, 10, 24, appearance.systemFontSize);
    setSysFontSizeText(String(clamped));
    void appearance.setSystemFontSize(clamped);
  };

  // ---- 正文字号 ----
  const onFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFontSizeText(raw);
    const n = Number(raw);
    if (!isNaN(n) && n >= 12 && n <= 24) {
      void appearance.setFontSize(n);
    }
  };
  const commitFontSize = () => {
    const clamped = clampInput(fontSizeText, 12, 24, appearance.fontSize);
    setFontSizeText(String(clamped));
    void appearance.setFontSize(clamped);
  };

  // ---- 阅读宽度 ----
  const onReadingWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setReadingWidthText(raw);
    const n = Number(raw);
    if (!isNaN(n) && n >= 500 && n <= 1400) {
      void appearance.setReadingWidth(n);
    }
  };
  const commitReadingWidth = () => {
    const clamped = clampInput(readingWidthText, 500, 1400, appearance.readingWidth);
    setReadingWidthText(String(clamped));
    void appearance.setReadingWidth(clamped);
  };

  // 通用键盘处理：Enter → blur（触发 commit）
  const commitOnEnter = (commit: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
      // blur 事件会在 blur 之后触发，但我们直接 commit 以确保 Enter 也能立即生效
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
                  id="general-modal__system-font-size-input"
                  type="number"
                  className="general-modal__input"
                  min={10}
                  max={24}
                  value={sysFontSizeText}
                  onChange={onSysFontChange}
                  onBlur={commitSysFont}
                  onKeyDown={commitOnEnter(commitSysFont)}
                  data-testid="general-modal__system-font-size"
                  title="左栏（订阅源）和中栏（文章列表）的文字大小，不影响右栏阅读区"
                />
                <span className="general-modal__hint">px（影响左/中栏）</span>
              </div>
              {/* 正文字号（仅右栏） */}
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
                  onKeyDown={commitOnEnter(commitFontSize)}
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
                  onKeyDown={commitOnEnter(commitReadingWidth)}
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
