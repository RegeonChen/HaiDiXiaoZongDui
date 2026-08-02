import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { IPC_CHANNELS, type IpcResult } from '../../../../shared/ipc';

type StoredHandler = (...args: unknown[]) => unknown;

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, StoredHandler>(),
  removed: [] as string[]
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: StoredHandler): void => {
      electronMock.handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      electronMock.handlers.delete(channel);
      electronMock.removed.push(channel);
    }
  }
}));

import {
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  installNavigationGuards,
  registerContentPipelineIpc,
  type ContentPipelineIpcSecurity,
  type ContentPipelineIpcServices
} from './ipc-handlers';
import { ContentPipelineError } from './errors';

const trustedRendererUrl = 'file:///Applications/Juhe/out/renderer/index.html';

beforeEach(() => {
  electronMock.handlers.clear();
  electronMock.removed.length = 0;
  vi.clearAllMocks();
});

describe('content pipeline IPC security', () => {
  it('records stable network failure codes without persisting feed URLs', async () => {
    const harness = createHarness({ importPath: null, exportPath: null }, {
      feed: {
        feedId: 'feed-1',
        success: false,
        error: '[HTTP_REQUEST_FAILED] 请求失败：example.com（域名解析失败）',
        newArticles: 0,
        updatedArticles: 0,
        stages: [],
        startedAt: '2026-08-02T00:00:00.000Z',
        finishedAt: '2026-08-02T00:00:01.000Z'
      }
    });

    await expect(invoke(IPC_CHANNELS.SYNC_FEED, trustedRendererUrl, { feedId: 'feed-1' }))
      .resolves.toMatchObject({ success: true });
    expect(harness.recordLog).toHaveBeenCalledWith(
      'warn',
      'sync:feed',
      '订阅源同步失败',
      {
        feedId: 'feed-1',
        success: false,
        newArticles: 0,
        updatedArticles: 0,
        failureCode: 'HTTP_REQUEST_FAILED'
      }
    );
    expect(JSON.stringify(harness.recordLog.mock.calls)).not.toContain('example.com');
  });

  it('uses only Main-approved OPML paths and ignores Renderer-supplied arguments', async () => {
    const harness = createHarness({
      importPath: '/approved/subscriptions.opml',
      exportPath: '/approved/export.opml'
    });

    const imported = await invoke(
      IPC_CHANNELS.OPML_IMPORT,
      `${trustedRendererUrl}#reader`,
      { filePath: '/Users/victim/.zshrc' }
    );
    const exported = await invoke(
      IPC_CHANNELS.OPML_EXPORT,
      trustedRendererUrl,
      { filePath: '/Users/victim/Library/Application Support/app.db' }
    );

    expect(imported).toEqual({
      success: true,
      data: { feedsImported: 1, feedsSkipped: 0, errors: [] }
    });
    expect(exported).toEqual({ success: true, data: true });
    expect(harness.importFile).toHaveBeenCalledWith('/approved/subscriptions.opml');
    expect(harness.exportFile).toHaveBeenCalledWith('/approved/export.opml', undefined);
    expect(harness.importFile).not.toHaveBeenCalledWith('/Users/victim/.zshrc');
    expect(harness.exportFile).not.toHaveBeenCalledWith(
      '/Users/victim/Library/Application Support/app.db'
    );
    expect(harness.recordLog).toHaveBeenCalledWith(
      'info',
      'opml:import',
      'OPML 导入完成',
      { feedsImported: 1, feedsSkipped: 0, errorCount: 0 }
    );
    expect(JSON.stringify(harness.recordLog.mock.calls)).not.toContain('/approved/');
  });

  it('treats a cancelled native dialog as a successful no-op', async () => {
    const harness = createHarness({ importPath: null, exportPath: null });

    await expect(invoke(IPC_CHANNELS.OPML_IMPORT, trustedRendererUrl))
      .resolves.toEqual({ success: true, data: null });
    await expect(invoke(IPC_CHANNELS.OPML_EXPORT, trustedRendererUrl))
      .resolves.toEqual({ success: true, data: false });
    expect(harness.importFile).not.toHaveBeenCalled();
    expect(harness.exportFile).not.toHaveBeenCalled();
  });

  it('preserves stable OPML error codes for actionable renderer messages', async () => {
    const harness = createHarness({
      importPath: '/approved/broken.opml',
      exportPath: null
    });
    harness.importFile.mockRejectedValueOnce(
      new ContentPipelineError('OPML_PARSE_FAILED', '文件缺少 OPML 根节点')
    );

    await expect(invoke(IPC_CHANNELS.OPML_IMPORT, trustedRendererUrl)).resolves.toEqual({
      success: false,
      error: {
        code: 'OPML_PARSE_FAILED',
        message: '文件缺少 OPML 根节点'
      }
    });
  });

  it('validates, trims and deduplicates selected feed IDs before exporting', async () => {
    const harness = createHarness({
      importPath: null,
      exportPath: '/approved/export.opml'
    });

    const result = await invoke(IPC_CHANNELS.OPML_EXPORT, trustedRendererUrl, {
      feedIds: [' feed-a ', 'feed-b', 'feed-a']
    });

    expect(result).toEqual({ success: true, data: true });
    expect(harness.exportFile).toHaveBeenCalledWith(
      '/approved/export.opml',
      ['feed-a', 'feed-b']
    );
  });

  it('rejects invalid selected feed IDs before opening a native dialog', async () => {
    const harness = createHarness({
      importPath: null,
      exportPath: '/approved/export.opml'
    });

    const result = await invoke(IPC_CHANNELS.OPML_EXPORT, trustedRendererUrl, {
      feedIds: ['feed-a', '']
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(harness.selectOpmlExportPath).not.toHaveBeenCalled();
    expect(harness.exportFile).not.toHaveBeenCalled();
  });

  it('rejects an untrusted sender before services or file dialogs run', async () => {
    const harness = createHarness({
      importPath: '/approved/subscriptions.opml',
      exportPath: '/approved/export.opml'
    });

    const result = await invoke(IPC_CHANNELS.OPML_EXPORT, 'https://attacker.example/');

    expect(result).toMatchObject({
      success: false,
      error: { code: 'UNTRUSTED_IPC_SENDER' }
    });
    expect(harness.selectOpmlExportPath).not.toHaveBeenCalled();
    expect(harness.exportFile).not.toHaveBeenCalled();
  });
});

describe('renderer URL policy', () => {
  it('trusts only the production entry file, allowing a hash but not another file', () => {
    expect(isTrustedRendererUrl(`${trustedRendererUrl}#article-1`, trustedRendererUrl)).toBe(true);
    expect(isTrustedRendererUrl(
      'file:///Applications/Juhe/out/renderer/other.html',
      trustedRendererUrl
    )).toBe(false);
    expect(isTrustedRendererUrl('https://attacker.example/', trustedRendererUrl)).toBe(false);
  });

  it('trusts only the configured development origin', () => {
    const devEntry = 'http://localhost:5173/';
    expect(isTrustedRendererUrl('http://localhost:5173/articles/1', devEntry)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', devEntry)).toBe(false);
    expect(isTrustedRendererUrl('http://user:pass@localhost:5173/', devEntry)).toBe(false);
  });

  it('allows only browser-safe external schemes', () => {
    expect(isAllowedExternalUrl('https://example.com/article')).toBe(true);
    expect(isAllowedExternalUrl('http://example.com/article')).toBe(true);
    expect(isAllowedExternalUrl('mailto:reader@example.com')).toBe(true);
    expect(isAllowedExternalUrl('file:///Users/victim/.zshrc')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,unsafe')).toBe(false);
  });

  it('prevents remote same-window navigation and opens only allowed URLs externally', () => {
    type NavigationListener = (
      event: { preventDefault: () => void },
      url: string
    ) => void;
    type WindowOpenHandler = (details: { url: string }) => { action: string };

    const listeners = new Map<string, NavigationListener>();
    const captured: { windowOpenHandler?: WindowOpenHandler } = {};
    const webContents = {
      on: vi.fn((eventName: string, listener: NavigationListener) => {
        listeners.set(eventName, listener);
      }),
      setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
        captured.windowOpenHandler = handler;
      })
    } as unknown as WebContents;
    const openExternal = vi.fn();
    installNavigationGuards(webContents, trustedRendererUrl, openExternal);

    const trustedEvent = { preventDefault: vi.fn() };
    listeners.get('will-navigate')?.(trustedEvent, `${trustedRendererUrl}#article-2`);
    expect(trustedEvent.preventDefault).not.toHaveBeenCalled();

    const remoteEvent = { preventDefault: vi.fn() };
    listeners.get('will-navigate')?.(remoteEvent, 'https://example.com/article');
    expect(remoteEvent.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/article');

    const unsafeEvent = { preventDefault: vi.fn() };
    listeners.get('will-redirect')?.(unsafeEvent, 'file:///Users/victim/.zshrc');
    expect(unsafeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).not.toHaveBeenCalledWith('file:///Users/victim/.zshrc');

    const windowOpenHandler = captured.windowOpenHandler;
    if (!windowOpenHandler) throw new Error('Window-open guard was not installed');
    expect(windowOpenHandler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(openExternal).not.toHaveBeenCalledWith('javascript:alert(1)');
  });
});

function createHarness(paths: {
  importPath: string | null;
  exportPath: string | null;
}, syncResults: {
  feed?: Awaited<ReturnType<ContentPipelineIpcServices['sync']['syncFeed']>>;
  all?: Awaited<ReturnType<ContentPipelineIpcServices['sync']['syncAll']>>;
} = {}): {
  importFile: ReturnType<typeof vi.fn>;
  exportFile: ReturnType<typeof vi.fn>;
  selectOpmlExportPath: ReturnType<typeof vi.fn>;
  recordLog: ReturnType<typeof vi.fn>;
} {
  const importFile = vi.fn(async () => ({ feedsImported: 1, feedsSkipped: 0, errors: [] }));
  const exportFile = vi.fn(async () => undefined);
  const selectOpmlImportPath = vi.fn(async () => paths.importPath);
  const selectOpmlExportPath = vi.fn(async () => paths.exportPath);
  const recordLog = vi.fn();
  const services = {
    sync: {
      syncAll: vi.fn(async () => syncResults.all ?? []),
      syncFeed: vi.fn(async () => syncResults.feed),
      getProgress: vi.fn(() => ({ totalFeeds: 0, completedFeeds: 0, results: [] }))
    },
    content: {
      getOrBuild: vi.fn()
    },
    opml: {
      importFile,
      exportFile
    }
  } as unknown as ContentPipelineIpcServices;
  const security: ContentPipelineIpcSecurity = {
    trustedRendererUrl,
    selectOpmlImportPath,
    selectOpmlExportPath,
    recordLog
  };

  registerContentPipelineIpc(services, security);
  return { importFile, exportFile, selectOpmlExportPath, recordLog };
}

async function invoke(
  channel: string,
  senderUrl: string,
  args?: unknown
): Promise<IpcResult<unknown>> {
  const handler = electronMock.handlers.get(channel);
  if (!handler) throw new Error(`Missing mocked IPC handler: ${channel}`);
  return await handler({ senderFrame: { url: senderUrl } }, args) as IpcResult<unknown>;
}
