/**
 * DataSource 上下文
 *
 * 整个应用共享一个 DataSource 实例；
 * 由 createDataSource() 在 App 启动时根据 URL 参数（?mock=1）选择
 * MockDataSource 或 IpcDataSource。
 *
 * Phase 3 Integration 起统一使用 FullDataSource（含 Tag/Note/Digest/Topic/AI/Settings/Log）。
 */
import { createContext, useContext } from 'react';
import type { FullDataSource } from '../data/ipcDataSource';

const DataSourceContext = createContext<FullDataSource | null>(null);

export const DataSourceProvider = DataSourceContext.Provider;

export function useDataSource(): FullDataSource {
  const ds = useContext(DataSourceContext);
  if (!ds) {
    throw new Error('useDataSource 必须在 DataSourceProvider 内使用');
  }
  return ds;
}
