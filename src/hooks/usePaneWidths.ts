/**
 * 三栏宽度持久化（localStorage）
 *
 * Phase 2.5.3 落地 AppSettings.{sidebarWidth,articleListWidth} 后，
 * 改用 settings:update 持久化。
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'juhe-shivi:pane-widths';

const DEFAULTS = {
  // 相对 100vw 的百分比
  sidebarPercent: 18,
  listPercent: 28
} as const;

interface PaneWidths {
  sidebarPercent: number;
  listPercent: number;
}

function load(): PaneWidths {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PaneWidths>;
    return {
      sidebarPercent:
        typeof parsed.sidebarPercent === 'number' && parsed.sidebarPercent >= 10 && parsed.sidebarPercent <= 40
          ? parsed.sidebarPercent
          : DEFAULTS.sidebarPercent,
      listPercent:
        typeof parsed.listPercent === 'number' && parsed.listPercent >= 15 && parsed.listPercent <= 50
          ? parsed.listPercent
          : DEFAULTS.listPercent
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(value: PaneWidths): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage 不可用（隐私模式 / 磁盘满）— 静默忽略
  }
}

export function usePaneWidths() {
  const [widths, setWidths] = useState<PaneWidths>(() => load());

  useEffect(() => {
    save(widths);
  }, [widths]);

  const setSidebar = useCallback((percent: number) => {
    setWidths((prev) => ({
      ...prev,
      sidebarPercent: Math.max(10, Math.min(40, percent))
    }));
  }, []);

  const setList = useCallback((percent: number) => {
    setWidths((prev) => ({
      ...prev,
      listPercent: Math.max(15, Math.min(50, percent))
    }));
  }, []);

  return { widths, setSidebar, setList };
}
