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
  //
  // Phase 4.3.2 真根因修复:之前只覆写 7 个变量(--bg / --bg-elev / --bg-elev-hover /
  //   --fg / --fg-soft / --border / --border-soft),剩下的 13 个布局/UI 变量
  //   (--workspace-bg / --toolbar-bg / --sidebar-bg / --activity-bg / --tabbar-bg
  //   / --muted / --border-strong / --accent / --accent-hover / --accent-soft
  //   / --focus-ring / --shadow-sm / --shadow-md)仍是浅色默认,导致工作区 /
  //   顶栏工具栏 / 侧栏 / 功能栏 / tab 栏 / accent 系全部仍是浅灰,只有部分
  //   区域变暖。下面把所有 UI 变量都补齐,确保"整个界面"都是护眼暖色调。
  // --ok / --err / --warn 状态色在暖黄底上仍清晰可辨,保持原值。
  if (visualTheme === 'paper' && effectiveTheme === 'light') {
    // 主背景三件套
    html.style.setProperty('--bg', '#f4ecd8');
    html.style.setProperty('--bg-elev', '#ede1c2');
    html.style.setProperty('--bg-elev-hover', '#e3d6b0');
    // 布局层级背景(之前是浅灰,补齐暖色)
    html.style.setProperty('--workspace-bg', '#f0e7cf');
    html.style.setProperty('--toolbar-bg', '#ebe0c5');
    html.style.setProperty('--sidebar-bg', '#ebe0c5');
    html.style.setProperty('--activity-bg', '#e3d6b0');
    html.style.setProperty('--tabbar-bg', '#ede1c2');
    // 文字
    html.style.setProperty('--fg', '#3a2e1a');
    html.style.setProperty('--fg-soft', '#6b5a3e');
    html.style.setProperty('--muted', '#8a7855');
    // 边框
    html.style.setProperty('--border', '#d6c8a4');
    html.style.setProperty('--border-soft', '#e0d5b6');
    html.style.setProperty('--border-strong', '#b9a87f');
    // 主题强调色:原 #4776e6 蓝色与暖黄底冲突,改为暖橙
    html.style.setProperty('--accent', '#b5681a');
    html.style.setProperty('--accent-hover', '#9a5816');
    html.style.setProperty('--accent-soft', '#f0d9b0');
    html.style.setProperty('--focus-ring', 'rgb(181 104 26 / 22%)');
    // 阴影:用暖棕色而不是冷黑
    html.style.setProperty('--shadow-sm', '0 1px 2px rgb(108 76 26 / 8%)');
    html.style.setProperty('--shadow-md', '0 10px 28px rgb(108 76 26 / 18%)');
  } else {
    // 切换回 classic 或切到深色：清掉 paper 变量，让 useTheme / :root 默认值生效
    const paperProps = [
      '--bg', '--bg-elev', '--bg-elev-hover',
      '--workspace-bg', '--toolbar-bg', '--sidebar-bg', '--activity-bg', '--tabbar-bg',
      '--fg', '--fg-soft', '--muted',
      '--border', '--border-soft', '--border-strong',
      '--accent', '--accent-hover', '--accent-soft', '--focus-ring',
      '--shadow-sm', '--shadow-md'
    ];
    for (const prop of paperProps) {
      html.style.removeProperty(prop);
    }
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

  // Mock smoke 可直接修改 DataSource 设置；事件让当前 hook 与这类外部更新同步。
  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<
        Partial<AppearanceSettings & { fontSize: number; readingWidth: number }>
      >).detail;
      if (!detail) return;
      setState((current) => ({ ...current, ...detail }));
      setSettingsReady(true);
    };
    window.addEventListener('juhe:settings-changed', handleSettingsChanged);
    return () => window.removeEventListener('juhe:settings-changed', handleSettingsChanged);
  }, []);

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
