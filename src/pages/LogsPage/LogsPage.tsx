/**
 * LogsPage — 本地日志。
 */
import { useCallback, useEffect, useState } from 'react';
import type { LogEntry } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { EmptyView } from '../../components/StatusView/EmptyView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import { LoadingView } from '../../components/StatusView/LoadingView';
import './LogsPage.css';

export interface LogsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function LogsPage({ onToast }: LogsPageProps) {
  const ds = useDataSource();
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadLogs = useCallback(() => {
    setLogs(null);
    setError(null);
    void (async () => {
      const r = await ds.logList(100);
      if (r.kind === 'ready') {
        setLogs(r.data);
        setError(null);
      } else {
        setError(r.kind === 'error' ? r.error : '加载失败');
        setLogs([]);
      }
    })();
  }, [ds]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await ds.logExport();
      if (result.kind === 'ready') {
        if (result.data) onToast(`日志已导出：${result.data}`, 'success');
      } else {
        onToast(
          `日志导出失败：${result.kind === 'error' ? result.error : '数据仍在加载'}`,
          'error'
        );
      }
    } catch (exportError) {
      onToast(
        `日志导出失败：${exportError instanceof Error ? exportError.message : String(exportError)}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  }, [ds, exporting, onToast]);

  return (
    <div className="logs-page">
      <header className="logs-page__header">
        <div>
          <h1 className="logs-page__title">本地日志</h1>
          <p>仅记录脱敏后的应用启动、同步和导入导出事件。</p>
        </div>
        <div className="logs-page__actions">
          <button type="button" onClick={loadLogs}>刷新</button>
          <button type="button" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? '正在导出…' : '导出日志'}
          </button>
        </div>
      </header>
      {error ? (
        <ErrorView message={error} onRetry={loadLogs} />
      ) : logs === null ? (
        <LoadingView message="正在加载日志…" />
      ) : logs.length === 0 ? (
        <EmptyView
          className="logs-page__empty"
          title="还没有日志"
          hint="同步、抓取和渲染过程中的事件会显示在这里。"
        />
      ) : (
        <table className="logs-page__table">
          <thead>
            <tr>
              <th>时间</th>
              <th>级别</th>
              <th>模块</th>
              <th>消息</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className={`logs-page__row logs-page__row--${l.level}`}>
                <td>{new Date(l.timestamp).toLocaleString('zh-CN')}</td>
                <td>{l.level}</td>
                <td>{l.module}</td>
                <td>{l.message}</td>
                <td>{l.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
