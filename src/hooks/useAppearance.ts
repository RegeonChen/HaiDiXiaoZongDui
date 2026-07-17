/**
 * 字体主题 + 视觉主题 + 多语言 + 排版参数 持久化
 *
 * 与 useTheme 平行：从 settings.fontTheme / visualTheme / fontSize / readingWidth 读，
 * 写到 <html> data-* 属性 + CSS 变量，切换通过 settings:update IPC 持久化到 SQLite。
 *
 * Phase 3.4.4.2：accepts `effectiveTheme`（来自 useTheme 解析后的 'light' | 'dark'），
 * 当 effectiveTheme === 'dark' 时强制忽略 visualTheme='paper'，使用经典色。
 * 这是"纸质主题"在深色模式下与"经典深色"完全一致的关键。
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
 */
export const FONT_STACKS: Record<string, string> = {
  default: `Georgia, "Source Han Serif SC", "Songti SC", "SimSun", "PingFang SC", "Hiragino Sans GB", serif`,
  hei: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Helvetica Neue", Arial, sans-serif`,
  kai: `"Kaiti SC", "STKaiti", "KaiTi", "FangSong", "Source Han Serif SC", serif`
};

/**
 * 视觉主题变量。
 * - paper 浅色：暖黄底 + 深棕字
 * - paper 深色：与 classic 深色完全一致（不写 paper 变量 → 走 useTheme 的 dark CSS）
 * 验收 3.4.4.2：纸质 + 深色 == 经典 + 深色。
 */
function applyToHtml(
  fontTheme: string,
  visualTheme: 'classic' | 'paper',
  effectiveTheme: 'light' | 'dark',
  fontSize?: number,
  readingWidth?: number
): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.setAttribute('data-font-theme', fontTheme);
  html.setAttribute('data-visual-theme', visualTheme);
  html.style.setProperty('--font-body', FONT_STACKS[fontTheme] || FONT_STACKS.default);

  // 只有"浅色 + paper"才写暖黄变量。
  // 深色 + paper 时不写 → CSS 走 useTheme 的 dark 调色板（与 classic 深色一致）。
  if (visualTheme === 'paper' && effectiveTheme === 'light') {
    html.style.setProperty('--bg', '#f4ecd8');
    html.style.setProperty('--bg-elev', '#ede1c2');
    html.style.setProperty('--bg-elev-hover', '#e3d6b0');
    html.style.setProperty('--fg', '#3a2e1a');
    html.style.setProperty('--fg-soft', '#6b5a3e');
    html.style.setProperty('--border', '#d6c8a4');
    html.style.setProperty('--border-soft', '#e0d5b6');
  } else {
    // 切换回 classic 或切到深色：清掉 paper 变量，让 useTheme / :root 默认值生效
    html.style.removeProperty('--bg');
    html.style.removeProperty('--bg-elev');
    html.style.removeProperty('--bg-elev-hover');
    html.style.removeProperty('--fg');
    html.style.removeProperty('--fg-soft');
    html.style.removeProperty('--border');
    html.style.removeProperty('--border-soft');
  }

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
  fontSize: number;
  readingWidth: number;
  loaded: boolean;
  setFontTheme: (next: string) => Promise<boolean>;
  setVisualTheme: (next: 'classic' | 'paper') => Promise<boolean>;
  setLanguage: (next: 'zh' | 'en') => Promise<boolean>;
  setFontSize: (next: number) => Promise<boolean>;
  setReadingWidth: (next: number) => Promise<boolean>;
}

export function useAppearance(effectiveTheme: 'light' | 'dark' = 'light'): UseAppearanceResult {
  const ds = useDataSource();
  const [state, setState] = useState<AppearanceSettings & { fontSize: number; readingWidth: number }>({
    ...DEFAULTS,
    fontSize: 16,
    readingWidth: 800
  });
  const [loaded, setLoaded] = useState(false);

  // 初次加载 + effectiveTheme 变化时重应用
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await ds.settingsGet();
      if (cancelled) return;
      if (r.kind === 'ready') {
        const next = {
          fontTheme: r.data.fontTheme,
          visualTheme: r.data.visualTheme,
          language: r.data.language,
          fontSize: r.data.fontSize,
          readingWidth: r.data.readingWidth
        };
        setState(next);
        applyToHtml(next.fontTheme, next.visualTheme, effectiveTheme, next.fontSize, next.readingWidth);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ds, effectiveTheme]);

  // 当 effectiveTheme 在 visualTheme 没变的情况下切换（如用户在 paper 主题下切到深色），
  // 重新应用 CSS 变量（不触发 IPC）
  useEffect(() => {
    applyToHtml(state.fontTheme, state.visualTheme, effectiveTheme, state.fontSize, state.readingWidth);
  }, [effectiveTheme, state.fontTheme, state.visualTheme, state.fontSize, state.readingWidth]);

  const update = useCallback(
    async (
      patch: Partial<AppearanceSettings & { fontSize: number; readingWidth: number }>
    ) => {
      const r = await ds.settingsUpdate(patch);
      if (r.kind === 'ready') {
        const next = {
          fontTheme: r.data.fontTheme,
          visualTheme: r.data.visualTheme,
          language: r.data.language,
          fontSize: r.data.fontSize,
          readingWidth: r.data.readingWidth
        };
        setState(next);
        applyToHtml(next.fontTheme, next.visualTheme, effectiveTheme, next.fontSize, next.readingWidth);
        return true;
      }
      return false;
    },
    [ds, effectiveTheme]
  );

  return {
    fontTheme: state.fontTheme,
    visualTheme: state.visualTheme,
    language: state.language,
    fontSize: state.fontSize,
    readingWidth: state.readingWidth,
    loaded,
    // 修复：之前 .then(() => undefined) 把 update 的 boolean 返回值吞掉，
    // 导致 GeneralSettingsModal.handleFontTheme 等地方 ok 永远 undefined，
    // toast 无论成败都显示 "切换失败"。
    // （回归自 097735a：陈冠中已修过但被 working tree reset 冲掉）
    setFontTheme: (next) => update({ fontTheme: next }),
    setVisualTheme: (next) => update({ visualTheme: next }),
    setLanguage: (next) => update({ language: next }),
    setFontSize: (next) => update({ fontSize: next }),
    setReadingWidth: (next) => update({ readingWidth: next })
  };
}
