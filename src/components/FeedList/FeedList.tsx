/**
 * 订阅源侧栏
 *
 *  - 顶部固定"全部 / 未读 / 星标"三个虚拟分组
 *  - 下面按 groupName 分组列出所有订阅源
 *  - 显示未读数 / 同步失败标记
 */
import { useMemo } from 'react';
import type { Article, Feed } from '@shared/types';
import './FeedList.css';

export interface FeedListProps {
  feeds: Feed[];
  articles: Article[];
  selected: string | 'all' | 'unread' | 'starred';
  onSelect: (id: string | 'all' | 'unread' | 'starred') => void;
}

interface VirtualEntry {
  id: 'all' | 'unread' | 'starred';
  label: string;
  icon: string;
  count: number;
}

export function FeedList({ feeds, articles, selected, onSelect }: FeedListProps) {
  const unreadCount = useMemo(() => articles.filter((a) => !a.isRead).length, [articles]);
  const starredCount = useMemo(() => articles.filter((a) => a.isStarred).length, [articles]);
  const totalCount = articles.length;

  const virtuals: VirtualEntry[] = [
    { id: 'all', label: '全部文章', icon: '☷', count: totalCount },
    { id: 'unread', label: '未读', icon: '●', count: unreadCount },
    { id: 'starred', label: '星标', icon: '★', count: starredCount }
  ];

  const unreadByFeed = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      if (a.isRead) continue;
      m.set(a.feedId, (m.get(a.feedId) ?? 0) + 1);
    }
    return m;
  }, [articles]);

  const grouped = useMemo(() => {
    const map = new Map<string, Feed[]>();
    for (const f of feeds) {
      const key = f.groupName ?? '未分组';
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh'));
  }, [feeds]);

  return (
    <div className="feed-list">
      <div className="feed-list__section">
        {virtuals.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`feed-list__item ${selected === v.id ? 'is-active' : ''}`}
            onClick={() => onSelect(v.id)}
          >
            <span className="feed-list__icon" aria-hidden="true">{v.icon}</span>
            <span className="feed-list__label">{v.label}</span>
            <span className="feed-list__count">{v.count}</span>
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="feed-list__empty">还没有订阅源</div>
      ) : (
        grouped.map(([group, list]) => (
          <div key={group} className="feed-list__section">
            <div className="feed-list__group-title">{group}</div>
            {list.map((f) => {
              const unread = unreadByFeed.get(f.id) ?? 0;
              const isSelected = selected === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`feed-list__item ${isSelected ? 'is-active' : ''}`}
                  onClick={() => onSelect(f.id)}
                  title={f.title}
                >
                  <span className="feed-list__icon" aria-hidden="true">
                    {f.feedType === 'atom' ? 'Ⓐ' : f.feedType === 'jsonfeed' ? '⌘' : '☰'}
                  </span>
                  <span className="feed-list__label">{f.title}</span>
                  {unread > 0 && <span className="feed-list__count">{unread}</span>}
                  {!f.lastSyncSuccess && (
                    <span
                      className="feed-list__status-dot feed-list__status-dot--fail"
                      title={f.lastSyncError ?? '同步失败'}
                      aria-label="同步失败"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
