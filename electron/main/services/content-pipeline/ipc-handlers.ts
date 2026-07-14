import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  IPC_CHANNELS,
  type IpcChannel,
  type IpcResponse
} from '../../../../shared/ipc';
import { errorMessage } from './errors';
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

  secureHandle(IPC_CHANNELS.SYNC_ALL, async () => success(await services.sync.syncAll()));

  secureHandle(IPC_CHANNELS.SYNC_FEED, async (_event, args) => {
    const feedId = requiredString(args, 'feedId');
    return success(await services.sync.syncFeed(feedId));
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

  secureHandle(IPC_CHANNELS.OPML_IMPORT, async (event) => {
    const filePath = await security.selectOpmlImportPath(event);
    if (!filePath) return success(null);
    return success(await services.opml.importFile(filePath));
  });

  secureHandle(IPC_CHANNELS.OPML_EXPORT, async (event) => {
    const filePath = await security.selectOpmlExportPath(event);
    if (!filePath) return success(false);
    await services.opml.exportFile(filePath);
    return success(true);
  });

  const channels = [
    IPC_CHANNELS.SYNC_ALL,
    IPC_CHANNELS.SYNC_FEED,
    IPC_CHANNELS.SYNC_PROGRESS,
    IPC_CHANNELS.CONTENT_GET_CLEANED_HTML,
    IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN,
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
      return {
        success: false,
        error: {
          code: error instanceof TypeError ? 'VALIDATION_ERROR' : 'CONTENT_PIPELINE_ERROR',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
