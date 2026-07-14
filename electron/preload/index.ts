/**
 * 聚合拾遗 — Preload 安全桥
 * Phase 2: Core Reading Workflow
 *
 * 职责：
 *  - 在 sandbox 环境下用 contextBridge 暴露 window.api
 *  - 只暴露 shared/ipc.ts 约定的 IPC 通道
 *  - 绝不暴露 ipcRenderer / process / require / fs 之类的底层 API
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type IpcResponse,
  type IpcArgs,
  type IpcChannel
} from '../../shared/ipc.js';

// ============================================================
// 辅助：类型安全的 invoke 封装
// ============================================================

function invoke<C extends IpcChannel>(
  channel: C,
  args: IpcArgs<C>
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, args) as Promise<IpcResponse<C>>;
}

function invokeVoid<C extends IpcChannel>(
  channel: C
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel) as Promise<IpcResponse<C>>;
}

// ============================================================
// 类型契约
// ============================================================

const api = {
  // —— Feed ——
  feed: {
    list: (): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_LIST>> =>
      invokeVoid(IPC_CHANNELS.FEED_LIST),

    get: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_GET>> =>
      invoke(IPC_CHANNELS.FEED_GET, { id }),

    create: (input: IpcArgs<typeof IPC_CHANNELS.FEED_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_CREATE>> =>
      invoke(IPC_CHANNELS.FEED_CREATE, { input }),

    update: (id: string, input: IpcArgs<typeof IPC_CHANNELS.FEED_UPDATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_UPDATE>> =>
      invoke(IPC_CHANNELS.FEED_UPDATE, { id, input }),

    delete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_DELETE>> =>
      invoke(IPC_CHANNELS.FEED_DELETE, { id })
  },

  // —— Article ——
  article: {
    list: (filter?: IpcArgs<typeof IPC_CHANNELS.ARTICLE_LIST>['filter']): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_LIST>> =>
      invoke(IPC_CHANNELS.ARTICLE_LIST, { filter }),

    get: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_GET>> =>
      invoke(IPC_CHANNELS.ARTICLE_GET, { id }),

    markRead: (id: string, isRead: boolean): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_MARK_READ>> =>
      invoke(IPC_CHANNELS.ARTICLE_MARK_READ, { id, isRead }),

    markStarred: (id: string, isStarred: boolean): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_MARK_STARRED>> =>
      invoke(IPC_CHANNELS.ARTICLE_MARK_STARRED, { id, isStarred }),

    batchMarkRead: (ids: string[], isRead: boolean): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_BATCH_MARK_READ>> =>
      invoke(IPC_CHANNELS.ARTICLE_BATCH_MARK_READ, { ids, isRead })
  },

  // —— Sync ——
  sync: {
    feed: (feedId: string): Promise<IpcResponse<typeof IPC_CHANNELS.SYNC_FEED>> =>
      invoke(IPC_CHANNELS.SYNC_FEED, { feedId }),

    all: (): Promise<IpcResponse<typeof IPC_CHANNELS.SYNC_ALL>> =>
      invokeVoid(IPC_CHANNELS.SYNC_ALL),

    progress: (): Promise<IpcResponse<typeof IPC_CHANNELS.SYNC_PROGRESS>> =>
      invokeVoid(IPC_CHANNELS.SYNC_PROGRESS)
  },

  // —— Settings ——
  settings: {
    get: (): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>> =>
      invokeVoid(IPC_CHANNELS.SETTINGS_GET),

    update: (settings: IpcArgs<typeof IPC_CHANNELS.SETTINGS_UPDATE>['settings']): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_UPDATE>> =>
      invoke(IPC_CHANNELS.SETTINGS_UPDATE, { settings })
  }
  // 后续按 Phase 接入时在这里加：tag / note / digest / topic / ai / log / opml / content
} as const;

export type AppApi = typeof api;

// ============================================================
// 安全暴露
// ============================================================

contextBridge.exposeInMainWorld('api', api);
