import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendLocalLog,
  formatLocalLogs,
  initializeLocalLogService,
  listLocalLogs
} from './local-log-service';

let temporaryDirectory: string | null = null;

afterEach(() => {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('local log service', () => {
  it('persists newest-first entries and omits sensitive detail fields', () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-logs-'));
    initializeLocalLogService(temporaryDirectory);

    appendLocalLog('info', 'app:lifecycle', '应用已启动', { version: '0.3.0' });
    appendLocalLog('error', 'sync:feed', '同步失败', {
      feedId: 'feed-1',
      apiKey: 'sk-should-not-be-written',
      sourceUrl: 'https://example.com/private'
    });

    const logs = listLocalLogs(10);
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe('同步失败');
    expect(logs[0].detail).toBe('{"feedId":"feed-1"}');
    expect(logs[1].message).toBe('应用已启动');
  });

  it('exports chronological plain text without local storage paths', () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-logs-'));
    initializeLocalLogService(temporaryDirectory);
    appendLocalLog('info', 'app:lifecycle', '应用已启动', { platform: 'test' });

    const exported = formatLocalLogs(listLocalLogs(100));
    expect(exported).toContain('聚合拾遗本地日志');
    expect(exported).toContain('[INFO] [app:lifecycle] 应用已启动');
    expect(exported).not.toContain(temporaryDirectory);
  });
});
