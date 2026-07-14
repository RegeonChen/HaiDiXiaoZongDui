/**
 * DataSource 上下文
 *
 * 整个应用共享一个 DataSource 实例；
 * 当前阶段由 App.tsx 注入 MockDataSource，Task 2.3 完成后替换为 IpcDataSource。
 */
import { createContext, useContext } from 'react';
import type { DataSource } from '../types/dataSource';

const DataSourceContext = createContext<DataSource | null>(null);

export const DataSourceProvider = DataSourceContext.Provider;

export function useDataSource(): DataSource {
  const ds = useContext(DataSourceContext);
  if (!ds) {
    throw new Error('useDataSource 必须在 DataSourceProvider 内使用');
  }
  return ds;
}
