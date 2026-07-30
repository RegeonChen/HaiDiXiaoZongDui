/**
 * DataSource 工厂
 *
 * 选 mock 还是 IPC：
 *   - URL 带 `?mock=1` → MockDataSource（用于 smoke 脚本验证 UI 渲染）
 *   - 其他 → IpcDataSource（默认）
 *
 * Phase 4.1.4：`?mock=1` 时把 DataSource 实例挂到 window.__JUHE_DS__
 *   方便 smoke 探针 hook（替代 hook window.api.*，后者只对 IPC 模式生效，
 *   mock 模式前端不走 IPC，直接调 MockDataSource）
 *   生产模式不带 ?mock=1，所以不会暴露
 */
import { IpcDataSource, type FullDataSource } from './ipcDataSource';
import { MockDataSource } from './mockDataSource';

export function createDataSource(): FullDataSource {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('mock');
    if (flag === '1') {
      const ds = new MockDataSource({
        onboardingCompleted: params.get('onboarding') !== '1'
      });
      (window as unknown as { __JUHE_DS__?: FullDataSource }).__JUHE_DS__ = ds;
      return ds;
    }
  }
  return new IpcDataSource();
}
