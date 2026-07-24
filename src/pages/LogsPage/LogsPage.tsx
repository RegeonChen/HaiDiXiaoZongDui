/**
 * LogsPage — 本地日志（Phase 4 占位）
 *
 * log:* handler 已注册 stub（返回 NOT_IMPLEMENTED）。
 * Phase 4 启动后由陈冠中接入 Logger + 真实 handler。
 */
import { useEffect, useState } from 'react';
import type { LogEntry } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import './LogsPage.css';

export function LogsPage() {
  const ds = useDataSource();
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const notImplemented = !!error && /NOT_IMPLEMENTED|日志|Phase 4/i.test(error);

  if (notImplemented) {
    return (
      <div className="logs-page">
        <h1 className="logs-page__title">本地日志</h1>
        <div className="logs-page__placeholder">
          <p className="logs-page__placeholder-headline">日志查看等待 Phase 4 接入</p>
          <p className="logs-page__placeholder-body">
            本地 Logger（debug/info/warn/error）+ UI 查看 + 导出，由陈冠中在 Phase 4 接入。
            当前的 <code>log:*</code> IPC handler 已经注册并返回 <code>NOT_IMPLEMENTED</code> 占位响应。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="logs-page">
      <h1 className="logs-page__title">本地日志</h1>
      {logs === null ? (
        <p className="logs-page__empty">正在加载…</p>
      ) : logs.length === 0 ? (
        <p className="logs-page__empty">还没有日志。同步 / 抓取 / 渲染过程中的事件会出现在这里。</p>
      ) : (
        <table className="logs-page__table">
          <thead>
            <tr>
              <th>时间</th>
              <th>级别</th>
              <th>模块</th>
              <th>消息</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className={`logs-page__row logs-page__row--${l.level}`}>
                <td>{new Date(l.timestamp).toLocaleString('zh-CN')}</td>
                <td>{l.level}</td>
                <td>{l.module}</td>
                <td>{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
