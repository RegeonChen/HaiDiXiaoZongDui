/**
 * 字体主题 + 视觉主题 + 多语言 + 排版参数 持久化
 *
 * 与 useTheme 平行：从 settings.fontTheme / visualTheme / fontSize / readingWidth / 
 * systemFontSize / sidebarVisible 读，写到 <html> data-* 属性 + CSS 变量，
 * 切换通过 settings:update IPC 持久化到 SQLite。
 *
 * Phase 3.4.4.2：accepts `effectiveTheme`（来自 useTheme 解析后的 'light' | 'dark'），
 * 当 effectiveTheme === 'dark' 时强制忽略 visualTheme='paper'，使用经典色。
 * 这是"纸质主题"在深色模式下与"经典深色"完全一致的关键。
 *
 * Phase 4.2.1：新增 systemFontSize（控制左/中栏 UI 字号，独立于正文字号）
 *   + sidebarVisible（持久化一级目录是否展开，供 App 初始化 DirectoryMode）
 */
import { useCallback, useEffect, useState } from 'react';
import { useDataSource } from '../context/DataSourceContext';

export interface AppearanceSettings {
  fontTheme: string;
  visualTheme: 'classic' | 'paper';
  language: 'zh' | 'en';
  /** 系统字号（左/中栏），与正文字号独立 */
  systemFontSize: number;
  /** 左栏（订阅源侧栏）是否可见 */
  sidebarVisible: boolean;
  /** 是否已完成或跳过首次使用引导 */
  onboardingCompleted: boolean;
}

const DEFAULTS: AppearanceSettings = {
  fontTheme: 'default',
  visualTheme: 'classic',
  language: 'zh',
  systemFontSize: 14,
  sidebarVisible: true,
  onboardingCompleted: false
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
 * 应用外观设置到 <html> 元素 + CSS 变量
 * - 字体主题 → data-font-theme + --font-body
 * - 视觉主题 → data-visual-theme + paper 浅色暖黄变量
 * - 正文字号 → --font-size（驱动 ArticleReader 阅读区）
 * - 系统字号 → --ui-font-size（驱动左/中栏 UI）
 * - 阅读宽度 → --reading-width
 * - 一级目录可见 → data-sidebar-visible（"true" / "false"，供持久化语义与 smoke 验证）
 */
function applyToHtml(
  fontTheme: string,
  visualTheme: 'classic' | 'paper',
  effectiveTheme: 'light' | 'dark',
  fontSize?: number,
  readingWidth?: number,
  systemFontSize?: number,
  sidebarVisible?: boolean
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
  // Phase 4.2.1:系统字号 — 独立 CSS 变量,只影响左/中栏 UI 不影响右栏正文
  if (typeof systemFontSize === 'number' && systemFontSize >= 10 && systemFontSize <= 24) {
    html.style.setProperty('--ui-font-size', `${systemFontSize}px`);
  }
  // Phase 4.2.1:一级目录可见性 — 同步到 data-sidebar-visible 属性。
  // App 的 DirectoryMode 负责即时布局；此属性保留持久化语义与可验证状态。
  if (typeof sidebarVisible === 'boolean') {
    html.setAttribute('data-sidebar-visible', String(sidebarVisible));
  }
}

export interface UseAppearanceResult {
  fontTheme: string;
  visualTheme: 'classic' | 'paper';
  language: 'zh' | 'en';
  fontSize: number;
  readingWidth: number;
  systemFontSize: number;
  sidebarVisible: boolean;
  onboardingCompleted: boolean;
  loaded: boolean;
  /** settingsGet 成功返回，允许依赖持久化值触发一次性流程。 */
  settingsReady: boolean;
  setFontTheme: (next: string) => Promise<boolean>;
  setVisualTheme: (next: 'classic' | 'paper') => Promise<boolean>;
  setLanguage: (next: 'zh' | 'en') => Promise<boolean>;
  setFontSize: (next: number) => Promise<boolean>;
  setReadingWidth: (next: number) => Promise<boolean>;
  setSystemFontSize: (next: number) => Promise<boolean>;
  setSidebarVisible: (next: boolean) => Promise<boolean>;
  setOnboardingCompleted: (next: boolean) => Promise<boolean>;
}

export function useAppearance(effectiveTheme: 'light' | 'dark' = 'light'): UseAppearanceResult {
  const ds = useDataSource();
  const [state, setState] = useState<AppearanceSettings & { fontSize: number; readingWidth: number }>({
    ...DEFAULTS,
    fontSize: 16,
    readingWidth: 800
  });
  const [loaded, setLoaded] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);

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
          readingWidth: r.data.readingWidth,
          systemFontSize: r.data.systemFontSize,
          sidebarVisible: r.data.sidebarVisible,
          onboardingCompleted: r.data.onboardingCompleted
        };
        setState(next);
        applyToHtml(
          next.fontTheme, next.visualTheme, effectiveTheme,
          next.fontSize, next.readingWidth,
          next.systemFontSize, next.sidebarVisible
        );
        setSettingsReady(true);
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
    applyToHtml(
      state.fontTheme, state.visualTheme, effectiveTheme,
      state.fontSize, state.readingWidth,
      state.systemFontSize, state.sidebarVisible
    );
  }, [
    effectiveTheme,
    state.fontTheme, state.visualTheme,
    state.fontSize, state.readingWidth,
    state.systemFontSize, state.sidebarVisible
  ]);

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
          readingWidth: r.data.readingWidth,
          systemFontSize: r.data.systemFontSize,
          sidebarVisible: r.data.sidebarVisible,
          onboardingCompleted: r.data.onboardingCompleted
        };
        setState(next);
        setSettingsReady(true);
        applyToHtml(
          next.fontTheme, next.visualTheme, effectiveTheme,
          next.fontSize, next.readingWidth,
          next.systemFontSize, next.sidebarVisible
        );
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
    systemFontSize: state.systemFontSize,
    sidebarVisible: state.sidebarVisible,
    onboardingCompleted: state.onboardingCompleted,
    loaded,
    settingsReady,
    setFontTheme: (next) => update({ fontTheme: next }),
    setVisualTheme: (next) => update({ visualTheme: next }),
    setLanguage: (next) => update({ language: next }),
    setFontSize: (next) => update({ fontSize: next }),
    setReadingWidth: (next) => update({ readingWidth: next }),
    setSystemFontSize: (next) => update({ systemFontSize: next }),
    setSidebarVisible: (next) => update({ sidebarVisible: next }),
    setOnboardingCompleted: (next) => update({ onboardingCompleted: next })
  };
}
