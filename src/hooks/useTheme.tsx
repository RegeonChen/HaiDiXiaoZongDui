/**
 * 主题切换（React Context）
 *
 * 三档：light / dark / system
 * 通过 Context 共享状态，所有组件看到一致的 theme + effective。
 * 修复：之前各组件各自实例化 useTheme()，ThemeToggle 切深色后
 * GeneralSettingsModal 看到的 effective 仍是 light，导致 paper 深色
 * 不生效（视觉主题不一致）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: Theme;
  effective: 'light' | 'dark';
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'juhe-shivi:theme';

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return theme;
}

function loadPersisted(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function savePersisted(theme: Theme): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => loadPersisted());
  const effective = useMemo(() => resolve(theme), [theme]);

  // data-theme → CSS 变量切换
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolve(theme));
  }, [theme]);

  // system 档跟随 OS
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.setAttribute('data-theme', resolve('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    savePersisted(next);
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, effective, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}

export { resolve };

