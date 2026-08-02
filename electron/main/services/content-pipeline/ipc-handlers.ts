import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  IPC_CHANNELS,
  type IpcChannel,
  type IpcResponse
} from '../../../../shared/ipc';
import { ContentPipelineError, errorMessage } from './errors';
import { splitCleanedHtmlIntoBlocks } from './content-cleaner';
import type { ArticleContentService } from './article-content-service';
import type { OpmlApplicationService } from './opml-service';
import type { SyncService } from './sync-service';

export interface ContentPipelineIpcServices {
  sync: SyncService;
  content: ArticleContentService;
  opml: OpmlApplicationService;
}

export interface ContentPipelineIpcSecurity {
  /** Exact production file URL, or the trusted development-server entry URL. */
  trustedRendererUrl: string;
  selectOpmlImportPath: (event: IpcMainInvokeEvent) => Promise<string | null>;
  selectOpmlExportPath: (event: IpcMainInvokeEvent) => Promise<string | null>;
  recordLog?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    module: string,
    message: string,
    detail?: Record<string, string | number | boolean | null>
  ) => void;
}

/**
 * Registers only Task 2.2-owned channels. Call this after Task 2.3 constructs
 * FeedSyncStore and OpmlFeedStore. Returns a disposer for tests/app shutdown.
 */
export function registerContentPipelineIpc(
  services: ContentPipelineIpcServices,
  security: ContentPipelineIpcSecurity
): () => void {
  const secureHandle = <C extends IpcChannel>(
    channel: C,
    handler: (event: IpcMainInvokeEvent, args: unknown) => Promise<IpcResponse<C>>
  ): void => handle(channel, security.trustedRendererUrl, handler);

  secureHandle(IPC_CHANNELS.SYNC_ALL, async () => {
    const results = await services.sync.syncAll();
    const failedCount = results.filter((result) => !result.success).length;
    const failureCodes = uniqueFailureCodes(results.map((result) => result.error));
    security.recordLog?.(
      failedCount > 0 ? 'warn' : 'info',
      'sync:all',
      failedCount > 0 ? '批量同步部分失败' : '批量同步完成',
      {
        totalCount: results.length,
        successCount: results.length - failedCount,
        failedCount,
        ...(failureCodes ? { failureCodes } : {})
      }
    );
    return success(results);
  });

  secureHandle(IPC_CHANNELS.SYNC_FEED, async (_event, args) => {
    const feedId = requiredString(args, 'feedId');
    const result = await services.sync.syncFeed(feedId);
    const failureCode = stableFailureCode(result.error);
    security.recordLog?.(
      result.success ? 'info' : 'warn',
      'sync:feed',
      result.success ? '订阅源同步完成' : '订阅源同步失败',
      {
        feedId,
        success: result.success,
        newArticles: result.newArticles,
        updatedArticles: result.updatedArticles,
        ...(failureCode ? { failureCode } : {})
      }
    );
    return success(result);
  });

  secureHandle(IPC_CHANNELS.SYNC_PROGRESS, async () => success(services.sync.getProgress()));

  secureHandle(IPC_CHANNELS.CONTENT_GET_CLEANED_HTML, async (_event, args) => {
    const articleId = requiredString(args, 'articleId');
    const result = await services.content.getOrBuild(articleId);
    return success(result.content.cleanedHtml);
  });

  secureHandle(IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN, async (_event, args) => {
    const articleId = requiredString(args, 'articleId');
    const result = await services.content.getOrBuild(articleId);
    return success(result.content.cleanedMarkdown);
  });

  // Phase 3.5.2（张宇凡 b53e7a2）：UI 段落内翻译插槽需要把 cleaned HTML
  // 切分为顶层块（每个块挂一个 TranslationSlot）。这是纯函数，JSDOM 在主进程跑。
  // 不依赖 ArticleContentService —— 任意 HTML 字符串都可切（不限于已清洗的）。
  secureHandle(IPC_CHANNELS.HTML_BLOCK_SPLIT, async (_event, args) => {
    const html = requiredString(args, 'html');
    return success(splitCleanedHtmlIntoBlocks(html));
  });

  secureHandle(IPC_CHANNELS.OPML_IMPORT, async (event) => {
    const filePath = await security.selectOpmlImportPath(event);
    if (!filePath) return success(null);
    try {
      const result = await services.opml.importFile(filePath);
      security.recordLog?.(
        result.errors.length > 0 ? 'warn' : 'info',
        'opml:import',
        result.errors.length > 0 ? 'OPML 导入部分完成' : 'OPML 导入完成',
        {
          feedsImported: result.feedsImported,
          feedsSkipped: result.feedsSkipped,
          errorCount: result.errors.length
        }
      );
      return success(result);
    } catch (error) {
      security.recordLog?.('error', 'opml:import', 'OPML 导入失败');
      throw error;
    }
  });

  secureHandle(IPC_CHANNELS.OPML_EXPORT, async (event, args) => {
    const feedIds = optionalStringArray(args, 'feedIds');
    const filePath = await security.selectOpmlExportPath(event);
    if (!filePath) return success(false);
    try {
      await services.opml.exportFile(filePath, feedIds);
      security.recordLog?.('info', 'opml:export', 'OPML 导出完成', {
        selectedFeedCount: feedIds?.length ?? 0,
        exportedAll: feedIds === undefined
      });
      return success(true);
    } catch (error) {
      security.recordLog?.('error', 'opml:export', 'OPML 导出失败');
      throw error;
    }
  });

  const channels = [
    IPC_CHANNELS.SYNC_ALL,
    IPC_CHANNELS.SYNC_FEED,
    IPC_CHANNELS.SYNC_PROGRESS,
    IPC_CHANNELS.CONTENT_GET_CLEANED_HTML,
    IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN,
    IPC_CHANNELS.HTML_BLOCK_SPLIT,
    IPC_CHANNELS.OPML_IMPORT,
    IPC_CHANNELS.OPML_EXPORT
  ];
  return () => channels.forEach((channel) => ipcMain.removeHandler(channel));
}

function handle<C extends IpcChannel>(
  channel: C,
  trustedRendererUrl: string,
  handler: (event: IpcMainInvokeEvent, args: unknown) => Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, async (event, args: unknown): Promise<IpcResponse<C>> => {
    if (!isTrustedRendererUrl(event.senderFrame?.url ?? '', trustedRendererUrl)) {
      return {
        success: false,
        error: {
          code: 'UNTRUSTED_IPC_SENDER',
          message: '拒绝来自非应用页面的请求'
        }
      };
    }

    try {
      return await handler(event, args);
    } catch (error) {
      const pipelineError = error instanceof ContentPipelineError ? error : null;
      return {
        success: false,
        error: {
          code: pipelineError?.code
            ?? (error instanceof TypeError ? 'VALIDATION_ERROR' : 'CONTENT_PIPELINE_ERROR'),
          message: errorMessage(error)
        }
      };
    }
  });
}

/**
 * Production trusts one exact file URL (hash changes are allowed). Development
 * trusts only the configured dev-server origin so Vite routes/HMR keep working.
 */
export function isTrustedRendererUrl(candidate: string, trustedEntry: string): boolean {
  try {
    const actual = new URL(candidate);
    const trusted = new URL(trustedEntry);
    if (actual.username || actual.password || trusted.username || trusted.password) return false;

    if (trusted.protocol === 'file:') {
      if (actual.protocol !== 'file:') return false;
      actual.hash = '';
      actual.search = '';
      trusted.hash = '';
      trusted.search = '';
      return actual.href === trusted.href;
    }

    if (trusted.protocol !== 'http:' && trusted.protocol !== 'https:') return false;
    return actual.protocol === trusted.protocol && actual.origin === trusted.origin;
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** Keeps untrusted documents out of the privileged BrowserWindow. */
export function installNavigationGuards(
  webContents: WebContents,
  trustedRendererUrl: string,
  openExternal: (url: string) => void
): void {
  const forwardAllowedExternalUrl = (url: string): void => {
    if (isAllowedExternalUrl(url)) openExternal(url);
  };

  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (isTrustedRendererUrl(url, trustedRendererUrl)) return;
    event.preventDefault();
    forwardAllowedExternalUrl(url);
  };

  webContents.on('will-navigate', guardNavigation);
  webContents.on('will-redirect', guardNavigation);
  webContents.setWindowOpenHandler(({ url }) => {
    forwardAllowedExternalUrl(url);
    return { action: 'deny' };
  });
}

function success<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

function requiredString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== 'string' || !value[key].trim()) {
    throw new TypeError(`${key} 必须是非空字符串`);
  }
  return value[key].trim();
}

function optionalStringArray(value: unknown, key: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new TypeError('请求参数必须是对象');
  const candidate = value[key];
  if (candidate === undefined) return undefined;
  if (!Array.isArray(candidate)) throw new TypeError(`${key} 必须是字符串数组`);

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of candidate) {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new TypeError(`${key} 只能包含非空字符串`);
    }
    const id = entry.trim();
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function uniqueFailureCodes(errors: Array<string | null>): string | null {
  const codes = [...new Set(errors.map(stableFailureCode).filter((code): code is string => code !== null))];
  return codes.length > 0 ? codes.join(',') : null;
}

function stableFailureCode(error: string | null): string | null {
  return error?.match(/^\[([A-Z0-9_]+)\]/)?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
