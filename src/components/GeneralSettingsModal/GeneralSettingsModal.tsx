/**
 * 通用设置 Modal（Phase 3.4.4.4）
 *
 * 顶栏点击"通用"按钮触发；包含：
 *   - 界面语言
 *   - 字体主题（3 套预设）
 *   - 视觉主题（经典 / 纸质）
 *   - 正文字号
 *   - 阅读宽度
 *
 * 修改即时生效 + 持久化（通过 useAppearance.setFontTheme 等），不跳转子页面。
 */
import { useEffect } from 'react';
import type { Language } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { useAppearance } from '../../hooks/useAppearance';
import { useTheme } from '../../hooks/useTheme';
import './GeneralSettingsModal.css';

export interface GeneralSettingsModalProps {
  open: boolean;
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

export function GeneralSettingsModal({ open, onClose, onToast }: GeneralSettingsModalProps) {
  // 必须在所有 hooks 之前
  const ds = useDataSource();
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

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
  const handleLanguage = async (lang: Language) => {
    const ok = await appearance.setLanguage(lang);
    onToast(ok ? '界面语言已切换' : '切换失败', ok ? 'success' : 'error');
  };
  const handleFontSize = async (n: number) => {
    if (n < 10 || n > 32) return;
    const ok = await appearance.setFontSize(n);
    onToast(ok ? '字号已更新' : '更新失败', ok ? 'success' : 'error');
  };
  const handleReadingWidth = async (n: number) => {
    if (n < 320 || n > 1600) return;
    const ok = await appearance.setReadingWidth(n);
    onToast(ok ? '阅读宽度已更新' : '更新失败', ok ? 'success' : 'error');
  };

  return (
    <div className="general-modal__backdrop" onClick={onClose}>
      <div
        className="general-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="general-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="general-modal__header">
          <h2 id="general-modal-title" className="general-modal__title">通用设置</h2>
          <button
            type="button"
            className="general-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="general-modal__body">
          <section className="general-modal__section">
            <h3 className="general-modal__section-title">界面语言</h3>
            <div className="general-modal__radio-group">
              {(['zh', 'en'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`general-modal__radio ${appearance.language === lang ? 'is-active' : ''}`}
                  onClick={() => void handleLanguage(lang)}
                >
                  {lang === 'zh' ? '中文' : 'English'}
                </button>
              ))}
            </div>
          </section>

          <section className="general-modal__section">
            <h3 className="general-modal__section-title">字体主题</h3>
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
          </section>

          <section className="general-modal__section">
            <h3 className="general-modal__section-title">视觉主题</h3>
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
          </section>

          <section className="general-modal__section">
            <h3 className="general-modal__section-title">排版</h3>
            <div className="general-modal__row">
              <label className="general-modal__label">正文字号</label>
              <input
                type="number"
                className="general-modal__input"
                min={12}
                max={24}
                value={appearance.fontSize}
                onChange={(e) => void handleFontSize(Number(e.target.value))}
              />
              <span className="general-modal__hint">px</span>
            </div>
            <div className="general-modal__row">
              <label className="general-modal__label">阅读宽度</label>
              <input
                type="number"
                className="general-modal__input"
                min={500}
                max={1400}
                step={50}
                value={appearance.readingWidth}
                onChange={(e) => void handleReadingWidth(Number(e.target.value))}
              />
              <span className="general-modal__hint">px</span>
            </div>
          </section>
        </div>

        <div className="general-modal__footer">
          <button type="button" className="general-modal__btn" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
