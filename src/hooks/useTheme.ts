/**
 * 主题切换
 *
 * 三档：light / dark / system
 *   - system：跟随 OS 的 prefers-color-scheme
 *   - light/dark：覆盖
 * 通过在 <html> 上设置 data-theme="light|dark" 触发 CSS 变量切换。
 */
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

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

function load(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function save(theme: Theme): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

function apply(theme: Theme): void {
  const effective = resolve(theme);
  document.documentElement.setAttribute('data-theme', effective);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => load());

  // 初次应用
  useEffect(() => {
    apply(theme);
  }, [theme]);

  // system 档时跟随 OS
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setAndSave = useCallback((next: Theme) => {
    save(next);
    setTheme(next);
  }, []);

  return { theme, setTheme: setAndSave };
}
