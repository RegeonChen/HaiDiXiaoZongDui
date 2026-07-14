import { ipcMain } from 'electron';
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

/**
 * Registers only Task 2.2-owned channels. Call this after Task 2.3 constructs
 * FeedSyncStore and OpmlFeedStore. Returns a disposer for tests/app shutdown.
 */
export function registerContentPipelineIpc(
  services: ContentPipelineIpcServices
): () => void {
  handle(IPC_CHANNELS.SYNC_ALL, async () => success(await services.sync.syncAll()));

  handle(IPC_CHANNELS.SYNC_FEED, async (args) => {
    const feedId = requiredString(args, 'feedId');
    return success(await services.sync.syncFeed(feedId));
  });

  handle(IPC_CHANNELS.SYNC_PROGRESS, async () => success(services.sync.getProgress()));

  handle(IPC_CHANNELS.CONTENT_GET_CLEANED_HTML, async (args) => {
    const articleId = requiredString(args, 'articleId');
    const result = await services.content.getOrBuild(articleId);
    return success(result.content.cleanedHtml);
  });

  handle(IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN, async (args) => {
    const articleId = requiredString(args, 'articleId');
    const result = await services.content.getOrBuild(articleId);
    return success(result.content.cleanedMarkdown);
  });

  handle(IPC_CHANNELS.OPML_IMPORT, async (args) => {
    const filePath = requiredString(args, 'filePath');
    return success(await services.opml.importFile(filePath));
  });

  handle(IPC_CHANNELS.OPML_EXPORT, async (args) => {
    const filePath = requiredString(args, 'filePath');
    await services.opml.exportFile(filePath);
    return success(undefined);
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
  handler: (args: unknown) => Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, async (_event, args: unknown): Promise<IpcResponse<C>> => {
    try {
      return await handler(args);
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
