/**
 * DataSource 工厂
 *
 * 选 mock 还是 IPC：
 *   - URL 带 `?mock=1` → MockDataSource（用于 smoke 脚本验证 UI 渲染）
 *   - URL 带 `?mock=0` → IpcDataSource（强制 IPC）
 *   - 没参数或解析失败 → IpcDataSource（默认）
 *
 * 切换策略后续可扩展（远程 flag、settings 等），但 Phase 2 不需要。
 */
import { IpcDataSource } from './ipcDataSource';
import { MockDataSource } from './mockDataSource';
import type { DataSource } from '../types/dataSource';

export function createDataSource(): DataSource {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('mock');
    if (flag === '1') return new MockDataSource();
  }
  return new IpcDataSource();
}
