/**
 * 通用设置 Modal（Phase 3.4.4.4 + Phase 4.2.1）
 *
 * 顶栏点击"通用"按钮触发；包含：
 *   - 界面语言
 *   - 字体主题（3 套预设）
 *   - 视觉主题（经典 / 纸质）
 *   - 排版：系统字号、正文字号、阅读宽度
 *
 * 字号/宽度输入使用 type="text" + inputMode="numeric" 手动控制，
 * 避免 type="number" 受控组件在 React 中的值回弹问题：
 *   - 上下箭头 → onKeyDown 手动 ±1（受 step 影响）
 *   - 键盘输入 → onChange 更新本地 state + 即时应用视觉效果
 *   - Enter → 钳制到合法边界并固化
 *   - onBlur → 钳制到合法边界并固化
 *   - 非编辑状态下 appearance 变化 → 同步本地 state（初始化 / 外部变更）
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

/**
 * 数值输入 hook — type="text" + 手动上下箭头 + 编辑锁
 * 返回 text value、onChange、onKeyDown、onBlur 四个 props。
 */
function useNumericInput(
  appearanceValue: number,
  setAppearance: (n: number) => Promise<boolean>,
  min: number,
  max: number,
  step: number
) {
  const [text, setText] = useState(String(appearanceValue));
  const editingRef = useRef(false);

  // 初始化 / 外部变更同步（非编辑中时）
  useEffect(() => {
    if (!editingRef.current) {
      setText(String(appearanceValue));
    }
  }, [appearanceValue]);

  const applyIfValid = (n: number) => {
    if (n >= min && n <= max) {
      void setAppearance(n);
    }
  };

  const commit = () => {
    editingRef.current = false;
    const clamped = clampValue(Number(text), min, max, appearanceValue);
    setText(String(clamped));
    if (clamped !== appearanceValue) {
      void setAppearance(clamped);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editingRef.current = true;
    const raw = e.target.value;
    // 仅允许数字输入
    if (raw !== '' && !/^\d+$/.test(raw)) return;
    setText(raw);
    const n = Number(raw);
    if (raw !== '' && n >= min && n <= max) {
      void setAppearance(n);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      editingRef.current = true;
      const cur = Number(text) || min;
      const next = Math.min(max, cur + step);
      setText(String(next));
      applyIfValid(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      editingRef.current = true;
      const cur = Number(text) || min;
      const next = Math.max(min, cur - step);
      setText(String(next));
      applyIfValid(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  const onBlur = () => {
    commit();
  };

  return { value: text, onChange, onKeyDown, onBlur };
}

export function GeneralSettingsModal({ open, embedded = false, onClose, onToast }: GeneralSettingsModalProps) {
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  const sysFont = useNumericInput(appearance.systemFontSize, appearance.setSystemFontSize, 10, 24, 1);
  const fontSize = useNumericInput(appearance.fontSize, appearance.setFontSize, 12, 24, 1);
  const readingWidth = useNumericInput(appearance.readingWidth, appearance.setReadingWidth, 500, 1400, 50);

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
              <div className="general-modal__row" data-testid="general-modal__system-font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__system-font-size-input">
                  系统字号
                </label>
                <input
                  id="general-modal__system-font-size-input"
                  type="text"
                  inputMode="numeric"
                  className="general-modal__input"
                  {...sysFont}
                  data-testid="general-modal__system-font-size"
                  title="左栏（订阅源）和中栏（文章列表）的文字大小，不影响右栏阅读区"
                />
                <span className="general-modal__hint">px（影响左/中栏）</span>
              </div>

              <div className="general-modal__row" data-testid="general-modal__font-size-row">
                <label className="general-modal__label" htmlFor="general-modal__font-size-input">正文字号</label>
                <input
                  id="general-modal__font-size-input"
                  type="text"
                  inputMode="numeric"
                  className="general-modal__input"
                  {...fontSize}
                  data-testid="general-modal__font-size"
                  title="右栏阅读区文字大小，不影响左/中栏 UI"
                />
                <span className="general-modal__hint">px（仅影响右栏）</span>
              </div>

              <div className="general-modal__row">
                <label className="general-modal__label" htmlFor="general-modal__reading-width-input">阅读宽度</label>
                <input
                  id="general-modal__reading-width-input"
                  type="text"
                  inputMode="numeric"
                  className="general-modal__input"
                  {...readingWidth}
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
