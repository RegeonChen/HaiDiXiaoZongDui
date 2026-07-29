// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FullDataSource } from '../../data/ipcDataSource';
import { DataSourceProvider } from '../../context/DataSourceContext';
import { LogsPage } from './LogsPage';

const flushEffects = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('LogsPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('lists persisted entries and reports a successful export', async () => {
    const onToast = vi.fn();
    const ds = {
      logList: vi.fn(async () => ({
        kind: 'ready',
        data: [{
          id: 'log-1',
          level: 'info',
          module: 'app:lifecycle',
          message: '应用已启动',
          detail: '{"version":"0.3.0"}',
          timestamp: '2026-07-28T00:00:00.000Z'
        }]
      })),
      logExport: vi.fn(async () => ({ kind: 'ready', data: 'juhe-shiyi-logs.txt' }))
    } as unknown as FullDataSource;

    await act(async () => {
      root.render(
        createElement(
          DataSourceProvider,
          { value: ds },
          createElement(LogsPage, { onToast })
        )
      );
      await flushEffects();
    });

    expect(container.querySelector('.logs-page__table')?.textContent).toContain('应用已启动');
    const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '导出日志');
    await act(async () => {
      exportButton?.click();
      await flushEffects();
    });

    expect(ds.logExport).toHaveBeenCalledOnce();
    expect(onToast).toHaveBeenCalledWith('日志已导出：juhe-shiyi-logs.txt', 'success');
  });
});
