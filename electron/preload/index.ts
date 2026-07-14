/**
 * 聚合拾遗 — Preload 安全桥
 * Task 1.1: Application Scaffold
 *
 * 职责：
 *  - 在 sandbox 环境下用 contextBridge 暴露 window.api
 *  - 只暴露 shared/ipc.ts 约定的 IPC 通道
 *  - 绝不暴露 ipcRenderer / process / require / fs 之类的底层 API
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcResponse } from '../../shared/ipc.js';

// ============================================================
// 类型契约
// ============================================================

/**
 * Renderer 端可见的 API 形状。
 * 每个方法签名 = (args) => Promise<IpcResult<T>>
 */
const api = {
  // —— Settings ——
  settings: {
    get: (): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET) as Promise<
        IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>
      >
  }
  // 后续按 Phase 接入时在这里加：feed / article / sync / topic / ai / ...
} as const;

export type AppApi = typeof api;

// ============================================================
// 安全暴露
// ============================================================

contextBridge.exposeInMainWorld('api', api);
