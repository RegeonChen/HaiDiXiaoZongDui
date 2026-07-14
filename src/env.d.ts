/**
 * 渲染进程类型声明
 *  - window.api: 由 preload 暴露，类型见 electron/preload/index.ts 的 AppApi
 *  - 不声明 require / process / module 之类的 Node 全局，强制走 IPC
 */
import type { AppApi } from '../electron/preload/index';

declare global {
  interface Window {
    api: AppApi;
  }
}

export {};
