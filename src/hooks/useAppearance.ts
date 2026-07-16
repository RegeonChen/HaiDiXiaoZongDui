/**
 * 字体主题 + 视觉主题 + 多语言 持久化
 *
 * 与 useTheme 平行：从 settings.fontTheme / visualTheme 读，写到 <html> data-* 属性，
 * 切换时通过 settings:update IPC 持久化到 SQLite。
 */
import { useCallback, useEffect, useState } from 'react';
import { useDataSource } from '../context/DataSourceContext';

export interface AppearanceSettings {
  fontTheme: string;
  visualTheme: 'classic' | 'paper';
  language: 'zh' | 'en';
}

const DEFAULTS: AppearanceSettings = {
  fontTheme: 'default',
  visualTheme: 'classic',
  language: 'zh'
};

/**
 * 字体栈映射：3 套预设对应 Plan I-4 验收
 *  - default: Georgia + 中宋（Mercury 默认 serif）
 *  - hei:     中英无衬线（PingFang/Microsoft YaHei）
 *  - kai:     中英楷体（Kaiti）
 */
export const FONT_STACKS: Record<string, string> = {
  default: `Georgia, "Source Han Serif SC", "Songti SC", "SimSun", "PingFang SC", "Hiragino Sans GB", serif`,
  hei: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Helvetica Neue", Arial, sans-serif`,
  kai: `"Kaiti SC", "STKaiti", "KaiTi", "FangSong", "Source Han Serif SC", serif`
};

function applyToHtml(
  fontTheme: string,
  visualTheme: 'classic' | 'paper',
  fontSize?: number,
  readingWidth?: number
): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.setAttribute('data-font-theme', fontTheme);
  html.setAttribute('data-visual-theme', visualTheme);
  // 字体栈
  html.style.setProperty('--font-body', FONT_STACKS[fontTheme] || FONT_STACKS.default);
  // 视觉主题：白底 vs 暖黄底
  if (visualTheme === 'paper') {
    html.style.setProperty('--bg', '#f4ecd8');
    html.style.setProperty('--bg-elev', '#ede1c2');
    html.style.setProperty('--fg', '#3a2e1a');
    html.style.setProperty('--fg-soft', '#6b5a3e');
    html.style.setProperty('--border', '#d6c8a4');
  } else {
    html.style.removeProperty('--bg');
    html.style.removeProperty('--bg-elev');
    html.style.removeProperty('--fg');
    html.style.removeProperty('--fg-soft');
    html.style.removeProperty('--border');
  }
  // 正文排版相关的 CSS 变量（Reader 通过 var(--font-size) / var(--reading-width) 读取）
  if (typeof fontSize === 'number' && fontSize >= 10 && fontSize <= 32) {
    html.style.setProperty('--font-size', `${fontSize}px`);
  }
  if (typeof readingWidth === 'number' && readingWidth >= 320 && readingWidth <= 1600) {
    html.style.setProperty('--reading-width', `${readingWidth}px`);
  }
}

export interface UseAppearanceResult {
  fontTheme: string;
  visualTheme: 'classic' | 'paper';
  language: 'zh' | 'en';
  loaded: boolean;
  setFontTheme: (next: string) => Promise<boolean>;
  setVisualTheme: (next: 'classic' | 'paper') => Promise<boolean>;
  setLanguage: (next: 'zh' | 'en') => Promise<boolean>;
}

export function useAppearance(): UseAppearanceResult {
  const ds = useDataSource();
  const [state, setState] = useState<AppearanceSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // 初次加载
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await ds.settingsGet();
      if (cancelled) return;
      if (r.kind === 'ready') {
        setState({
          fontTheme: r.data.fontTheme,
          visualTheme: r.data.visualTheme,
          language: r.data.language
        });
        applyToHtml(r.data.fontTheme, r.data.visualTheme, r.data.fontSize, r.data.readingWidth);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ds]);

  const update = useCallback(
    async (patch: Partial<AppearanceSettings & { fontSize?: number; readingWidth?: number }>) => {
      const r = await ds.settingsUpdate(patch);
      if (r.kind === 'ready') {
        const next = {
          fontTheme: r.data.fontTheme,
          visualTheme: r.data.visualTheme,
          language: r.data.language
        };
        setState(next);
        applyToHtml(next.fontTheme, next.visualTheme, r.data.fontSize, r.data.readingWidth);
        return true;
      }
      return false;
    },
    [ds]
  );

  return {
    fontTheme: state.fontTheme,
    visualTheme: state.visualTheme,
    language: state.language,
    loaded,
    setFontTheme: (next) => update({ fontTheme: next }),
    setVisualTheme: (next) => update({ visualTheme: next }),
    setLanguage: (next) => update({ language: next })
  };
}
