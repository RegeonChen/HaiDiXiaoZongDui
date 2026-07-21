import { useCallback, useEffect, useState } from 'react';

export type ReaderMode = 'reader' | 'web' | 'dual';

export const READER_MODE_STORAGE_KEY = 'juhe-shivi.reader.mode';

export function normalizeReaderMode(value: unknown): ReaderMode {
  return value === 'web' || value === 'dual' ? value : 'reader';
}

function readStoredMode(): ReaderMode {
  try {
    return normalizeReaderMode(window.localStorage.getItem(READER_MODE_STORAGE_KEY));
  } catch {
    return 'reader';
  }
}

export function useReaderMode(): [ReaderMode, (mode: ReaderMode) => void] {
  const [mode, setModeState] = useState<ReaderMode>(readStoredMode);

  const setMode = useCallback((nextMode: ReaderMode) => {
    setModeState(nextMode);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(READER_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage 被系统策略禁用时，本次会话仍可正常切换。
    }
  }, [mode]);

  return [mode, setMode];
}
