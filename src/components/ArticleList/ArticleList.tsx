/**
 * 文章列表
 *
 *  - 顶部显示当前过滤标题
 *  - 列表项：标题、来源、未读 / 星标小标
 *  - 选中项高亮；点击触发 onSelect
 */
import { useMemo } from 'react';
import type { Article, Feed } from '@shared/types';
import './ArticleList.css';

export interface ArticleListProps {
  feeds: Feed[];
  articles: Article[];
  selectedArticleId: string | null;
  onSelect: (id: string) => void;
  filterLabel: string;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (deltaSec < 60) return '刚刚';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} 分钟前`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} 小时前`;
  if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)} 天前`;
  return iso.slice(0, 10);
}

export function ArticleList({
  feeds,
  articles,
  selectedArticleId,
  onSelect,
  filterLabel
}: ArticleListProps) {
  const feedTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of feeds) m.set(f.id, f.title);
    return m;
  }, [feeds]);

  return (
    <div className="article-list">
      <div className="article-list__header">
        <span className="article-list__title">{filterLabel}</span>
        <span className="article-list__count">{articles.length} 篇</span>
      </div>
      <ul className="article-list__items" role="listbox" aria-label="文章列表">
        {articles.length === 0 ? (
          <li className="article-list__empty">没有匹配的文章</li>
        ) : (
          articles.map((a) => {
            const isSelected = a.id === selectedArticleId;
            return (
              <li key={a.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`article-list__item ${isSelected ? 'is-active' : ''} ${
                    a.isRead ? '' : 'is-unread'
                  }`}
                  onClick={() => onSelect(a.id)}
                >
                  <div className="article-list__row1">
                    <span className="article-list__feed">
                      {feedTitleById.get(a.feedId) ?? '未知来源'}
                    </span>
                    <span className="article-list__time">
                      {formatRelativeTime(a.publishedAt)}
                    </span>
                  </div>
                  <div className="article-list__row2">
                    <span className="article-list__article-title">{a.title}</span>
                    {a.isStarred && (
                      <span className="article-list__star" aria-label="已加星标">★</span>
                    )}
                  </div>
                  {a.author && (
                    <div className="article-list__row3">{a.author}</div>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
