/**
 * DataSource 工厂
 *
 * 选 mock 还是 IPC：
 *   - URL 带 `?mock=1` → MockDataSource（用于 smoke 脚本验证 UI 渲染）
 *   - 其他 → IpcDataSource（默认）
 */
import { IpcDataSource, type FullDataSource } from './ipcDataSource';
import { MockDataSource } from './mockDataSource';

export function createDataSource(): FullDataSource {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('mock');
    if (flag === '1') return new MockDataSource();
  }
  return new IpcDataSource();
}
