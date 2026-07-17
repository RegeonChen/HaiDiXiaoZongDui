/**
 * TopicEventGroupsTab — 事件分组卡片
 *  - 每组：name / 时间范围 / 文章数 / 缩略文章列表
 *  - 按 startDate 倒序
 */
import { useMemo, useState } from 'react';
import type { Article, EventGroup, Feed } from '@shared/types';
import { useDataSource } from '../../../context/DataSourceContext';
import { LoadingView } from '../../StatusView/LoadingView';
import { EmptyView } from '../../StatusView/EmptyView';
import './TopicEventGroupsTab.css';

export interface TopicEventGroupsTabProps {
  eventGroups: EventGroup[] | null;
  feeds: Feed[];
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

function formatEventDate(iso: string | null): string {
  if (!iso) return '?';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '?';
  return new Date(t).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function TopicEventGroupsTab({ eventGroups, feeds, onToast: _onToast }: TopicEventGroupsTabProps) {
  const ds = useDataSource();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [articlesByGroup, setArticlesByGroup] = useState<Record<string, Article[]>>({});
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);

  if (eventGroups === null) {
    return <LoadingView message="正在加载事件分组…" />;
  }
  if (eventGroups.length === 0) {
    return (
      <EmptyView
        title="还没有事件分组"
        hint="相似报道聚类后会形成事件分组。"
      />
    );
  }

  // 按 startDate 倒序
  const sorted = [...eventGroups].sort((a, b) => {
    const ta = a.startDate ? Date.parse(a.startDate) : 0;
    const tb = b.startDate ? Date.parse(b.startDate) : 0;
    return tb - ta;
  });

  const feedTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of feeds) m.set(f.id, f.siteTitle || f.title);
    return m;
  }, [feeds]);

  const toggleGroup = async (group: EventGroup) => {
    if (expandedId === group.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(group.id);
    if (!articlesByGroup[group.id]) {
      setLoadingGroupId(group.id);
      try {
        // 加载该 group 下的文章（articleIds → Article 详情）
        const loaded: Article[] = [];
        for (const articleId of group.articleIds) {
          // 通过 topicGetArticles 拿到全部文章，再 filter
          // 简化：调用一次全量然后 filter；或者用 articleGet（如果存在）
          // 这里复用 topicGetArticles 接口数据
          const r = await ds.topicGetArticles(group.topicId);
          if (r.kind === 'ready') {
            const a = r.data.find((x) => x.id === articleId);
            if (a) loaded.push(a);
          }
        }
        setArticlesByGroup((prev) => ({ ...prev, [group.id]: loaded }));
      } finally {
        setLoadingGroupId(null);
      }
    }
  };

  return (
    <ul className="topic-event-groups" role="list">
      {sorted.map((g) => {
        const isExpanded = expandedId === g.id;
        const groupArticles = articlesByGroup[g.id];
        return (
          <li key={g.id} className="topic-event-group">
            <button
              type="button"
              className={`topic-event-group__header ${isExpanded ? 'is-expanded' : ''}`}
              onClick={() => void toggleGroup(g)}
            >
              <div className="topic-event-group__rail">
                <span className="topic-event-group__chevron" aria-hidden="true">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>
              <div className="topic-event-group__summary">
                <h3 className="topic-event-group__name">{g.name}</h3>
                <div className="topic-event-group__meta">
                  <span className="topic-event-group__count">{g.articleIds.length} 篇文章</span>
                  <span className="topic-event-group__range">
                    {formatEventDate(g.startDate)} → {formatEventDate(g.endDate)}
                  </span>
                </div>
              </div>
            </button>
            {isExpanded && (
              <div className="topic-event-group__body">
                {loadingGroupId === g.id ? (
                  <p className="topic-event-group__loading">正在加载文章…</p>
                ) : !groupArticles || groupArticles.length === 0 ? (
                  <p className="topic-event-group__empty">该事件下还没有文章</p>
                ) : (
                  <ul className="topic-event-group__articles">
                    {groupArticles.map((a) => (
                      <li key={a.id} className="topic-event-group__article">
                        <span className="topic-event-group__article-title">{a.title}</span>
                        <span className="topic-event-group__article-feed">
                          {feedTitleById.get(a.feedId) ?? '未知'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
