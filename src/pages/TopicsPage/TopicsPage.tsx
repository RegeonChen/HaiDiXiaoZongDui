/**
 * TopicsPage — 专题追踪（Phase 4 占位）
 *
 * 后端 topic:* handler 已注册 stub（返回 NOT_IMPLEMENTED）。
 * Phase 4 启动后由陈冠中实现 Topic 仓储 + 真实 handler。
 *
 * 临时行为：调用 topicList 收到 NOT_IMPLEMENTED → 显示等待提示。
 */
import { useEffect, useState } from 'react';
import type { Topic } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import './TopicsPage.css';

export function TopicsPage() {
  const ds = useDataSource();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await ds.topicList();
      if (r.kind === 'ready') {
        setTopics(r.data);
        setError(null);
      } else {
        setError(r.kind === 'error' ? r.error : '加载失败');
        setTopics([]);
      }
    })();
  }, [ds]);

  const notImplemented = !!error && /NOT_IMPLEMENTED|专题|Phase 4/i.test(error);

  return (
    <div className="topics-page">
      <h1 className="topics-page__title">专题追踪</h1>

      {notImplemented ? (
        <div className="topics-page__placeholder">
          <p className="topics-page__placeholder-headline">专题追踪等待 Phase 4 接入</p>
          <p className="topics-page__placeholder-body">
            专题后端（Topic 仓储、匹配算法、Briefing Agent）由陈冠中在 Phase 4 Task 4.3 落地。
            当前的 <code>topic:*</code> IPC handler 已经注册并返回 <code>NOT_IMPLEMENTED</code> 占位响应。
          </p>
          <p className="topics-page__placeholder-body">
            UI 部分（专题创建、列表、文章匹配、简报展示）已在本页保留位置，等待后端就绪后即可联调。
          </p>
          <p className="topics-page__placeholder-body">
            <a
              href="https://github.com/RegeonChen/HaiDiXiaoZongDui/blob/main/PLAN.md#phase-4-topic-tracking"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看 PLAN.md → Phase 4
            </a>
          </p>
        </div>
      ) : topics === null ? (
        <p className="topics-page__empty">正在加载…</p>
      ) : topics.length === 0 ? (
        <p className="topics-page__empty">还没有专题。</p>
      ) : (
        <ul className="topics-page__list">
          {topics.map((t) => (
            <li key={t.id} className="topics-page__item">
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
