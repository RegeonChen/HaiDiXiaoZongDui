/**
 * 文章列表（Mercury 风格）
 *  - 顶部：tab 切换 + 标题 + 计数
 *  - 列表项：小字标题 + 来源 / 时间 / 未读圆点
 *  - 选中：灰底 + 左侧 2px 强调线
 *  - 底部：Phase 3.7.1"加载更多"按钮(hasMore 时显示)
 */
import { useMemo } from 'react';
import type { Article, Feed } from '@shared/types';
import { EmptyView } from '../StatusView/EmptyView';
import './ArticleList.css';

export interface ArticleListProps {
  feeds: Feed[];
  articles: Article[];
  selectedArticleId: string | null;
  onSelect: (id: string) => void;
  filterLabel: string;
  /** 当前的 filter 描述，用于空态提示（Phase 3.4.4.5） */
  filterHint?: string;
  /** Phase 3.7.1:已加载 / 匹配总数(显示 "10 / 433" 让用户知道还有更多) */
  total?: number;
  /** Phase 3.7.1:是否可以加载更多(articles.length < total 时为 true) */
  hasMore?: boolean;
  /** Phase 3.7.1:点击"加载更多"按钮 */
  onLoadMore?: () => void;
  /** Phase 3.7.1:正在加载更多(显示 loading 状态) */
  loadingMore?: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (deltaSec < 60) return '刚刚';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} 分钟前`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} 小时前`;
  if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)} 天前`;
  // 超过一周用月-日
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ArticleList({ feeds, articles, selectedArticleId, onSelect, filterLabel, filterHint, total, hasMore, onLoadMore, loadingMore }: ArticleListProps) {
  const feedTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of feeds) m.set(f.id, f.siteTitle || f.title);
    return m;
  }, [feeds]);

  // Phase 3.7.1:计数显示 "已加载 / 匹配总数"
  const countText = total !== undefined && total > articles.length
    ? `${articles.length} / ${total}`
    : `${articles.length}`;

  return (
    <div className="article-list">
      <div className="article-list__header">
        <span className="article-list__title">{filterLabel}</span>
        <span className="article-list__count" data-testid="article-list__count">{countText}</span>
      </div>
      <ul className="article-list__items" role="listbox" aria-label="文章列表">
        {articles.length === 0 ? (
          <li className="article-list__empty-wrap">
            <EmptyView
              // P2 体验打磨:统一"还没有 X"格式 + 给出明确操作指引
              title={filterHint ?? '还没有匹配的文章'}
              hint={filterHint ? '换筛选条件或回到"所有订阅源"试试' : '从侧栏切换其他订阅源或搜索关键词'}
            />
          </li>
        ) : (
          articles.map((a) => {
            const isSelected = a.id === selectedArticleId;
            return (
              <li key={a.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`article-list__item ${isSelected ? 'is-active' : ''} ${a.isRead ? 'is-read' : 'is-unread'}`}
                  onClick={() => onSelect(a.id)}
                  title={`${a.title}\n${a.author ?? ''}`}
                >
                  <div className="article-list__row1">
                    <span className={`article-list__dot ${a.isRead ? 'is-read' : 'is-unread'}`} aria-hidden="true" />
                    <span className="article-list__article-title">{a.title}</span>
                    {a.isStarred && <span className="article-list__star" aria-label="已加星标">★</span>}
                  </div>
                  <div className="article-list__row2">
                    <span className="article-list__feed">{feedTitleById.get(a.feedId) ?? '未知'}</span>
                    <span className="article-list__time" title={formatAbsolute(a.publishedAt)}>
                      {formatRelative(a.publishedAt)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {/* Phase 3.7.1:加载更多按钮(hasMore 时显示) */}
      {hasMore && onLoadMore && (
        <div className="article-list__load-more-wrap">
          <button
            type="button"
            className="article-list__load-more"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="article-list__load-more"
          >
            {loadingMore ? '加载中…' : `加载更多 (${total !== undefined ? total - articles.length : '?'} 篇)`}
          </button>
        </div>
      )}
    </div>
  );
}
