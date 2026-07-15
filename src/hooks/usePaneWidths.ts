/**
 * 三栏宽度持久化（AppSettings.sidebarPercent / listPercent）
 *
 * Task 2.5.3 已落地：通过 settings:update IPC 持久化到 SQLite。
 * 首次加载从 settings:get 读取，拖拽结束时写入 settings:update。
 */
import { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    api: {
      settings: {
        get: () => Promise<{
          success: boolean;
          data?: {
            sidebarPercent?: number;
            listPercent?: number;
          };
          error?: unknown;
        }>;
        update: (settings: { sidebarPercent?: number; listPercent?: number }) => Promise<{
          success: boolean;
          data?: unknown;
          error?: unknown;
        }>;
      };
    };
  }
}

const DEFAULTS = {
  sidebarPercent: 18,
  listPercent: 28
} as const;

interface PaneWidths {
  sidebarPercent: number;
  listPercent: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

async function loadFromSettings(): Promise<PaneWidths> {
  try {
    const r = await window.api.settings.get();
    if (!r.success || !r.data) return { ...DEFAULTS };
    return {
      sidebarPercent:
        typeof r.data.sidebarPercent === 'number'
          ? clamp(r.data.sidebarPercent, 10, 40)
          : DEFAULTS.sidebarPercent,
      listPercent:
        typeof r.data.listPercent === 'number'
          ? clamp(r.data.listPercent, 15, 50)
          : DEFAULTS.listPercent
    };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveToSettings(widths: PaneWidths): Promise<void> {
  try {
    await window.api.settings.update({
      sidebarPercent: widths.sidebarPercent,
      listPercent: widths.listPercent
    });
  } catch {
    // 保存失败静默忽略（下次拖拽会重试）
  }
}

export function usePaneWidths() {
  const [widths, setWidths] = useState<PaneWidths>({ ...DEFAULTS });

  // 启动时从 settings:get 加载
  useEffect(() => {
    let cancelled = false;
    void loadFromSettings().then((w) => {
      if (cancelled) return;
      setWidths(w);
    });
    return () => { cancelled = true; };
  }, []);

  const setSidebar = useCallback((percent: number) => {
    setWidths((prev) => {
      const next = { ...prev, sidebarPercent: clamp(percent, 10, 40) };
      void saveToSettings(next);
      return next;
    });
  }, []);

  const setList = useCallback((percent: number) => {
    setWidths((prev) => {
      const next = { ...prev, listPercent: clamp(percent, 15, 50) };
      void saveToSettings(next);
      return next;
    });
  }, []);

  return { widths, setSidebar, setList };
}
