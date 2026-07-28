/**
 * 文章列表（Mercury 风格）
 *  - 顶部：tab 切换 + 标题 + 计数
 *  - 列表项：小字标题 + 来源 / 时间 / 未读圆点
 *  - 选中：灰底 + 左侧 2px 强调线
 *  - Phase 4.1.1：标题前彩色标签 chips（从 article.title 解析 tag prefix）
 *  - Phase 4.1.1：顶部 action bar slot（同步 / 全部已读按钮）
 *  - Phase 自动加载：滚动到底部自动追加 50 篇，无需点按钮
 *    （IntersectionObserver + 末尾哨兵元素）
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Article, Feed } from '@shared/types';
import { EmptyView } from '../StatusView/EmptyView';
import { parseArticleTitleTags } from '../../utils/article-title-tags';
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
  /** 滚动哨兵进入列表可视区时加载下一页 */
  onLoadMore?: () => void;
  /** Phase 3.7.1:正在加载更多(显示 loading 状态) */
  loadingMore?: boolean;
  /**
   * Phase 4.1.1：中栏顶部操作按钮 slot。
   * 调用方传入同步/全部已读等按钮；不传则不显示 action bar。
   * 渲染在 .article-list__header 下方一行。
   */
  actionBar?: ReactNode;
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

export function ArticleList({ feeds, articles, selectedArticleId, onSelect, filterLabel, filterHint, total, hasMore, onLoadMore, loadingMore, actionBar }: ArticleListProps) {
  // Phase 自动加载:IntersectionObserver 监听末尾哨兵
  //   哨兵进入视口(用户滚到底)→ 自动调 onLoadMore()
  //   哨兵必须位于 ul 滚动容器内部，root 也必须明确指向 ul；否则哨兵会始终
  //   位于外层 flex 容器的可见区，导致页面刚打开就连续加载全部文章。
  const listRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const loadingMoreRef = useRef(Boolean(loadingMore));
  const loadRequestedRef = useRef(false);
  onLoadMoreRef.current = onLoadMore;
  loadingMoreRef.current = Boolean(loadingMore);

  const requestLoadMore = useCallback(() => {
    const loadMore = onLoadMoreRef.current;
    if (!loadMore || loadingMoreRef.current || loadRequestedRef.current) return;
    // IntersectionObserver 可能在父组件来得及把 loadingMore 设为 true 前重复回调。
    // 先同步上锁，保证同一页只请求一次。
    loadRequestedRef.current = true;
    loadMore();
  }, []);

  useEffect(() => {
    if (!loadingMore) {
      loadRequestedRef.current = false;
    }
  }, [loadingMore, articles.length]);

  useEffect(() => {
    if (!hasMore || !onLoadMore || loadingMore) return;
    const el = sentinelRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestLoadMore();
        }
      },
      { root: list, rootMargin: '0px 0px 200px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, loadingMore, articles.length, requestLoadMore]);
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
      {/* Phase 4.1.1:中栏顶部操作按钮 slot(同步 / 全部已读) */}
      {actionBar && <div className="article-list__action-bar" data-testid="article-list__action-bar">{actionBar}</div>}
      <ul ref={listRef} className="article-list__items" role="listbox" aria-label="文章列表">
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
            // Phase 4.1.1:从 title 解析 tag prefix(后端把 tag 信息嵌到 title 前缀)
            let titleTags: ReturnType<typeof parseArticleTitleTags>['tags'] = [];
            let cleanTitle = a.title ?? '';
            try {
              const parsed = parseArticleTitleTags(a.title ?? '');
              titleTags = parsed.tags;
              cleanTitle = parsed.cleanTitle;
            } catch (e) {
              // 解析失败:回退原始 title,避免列表渲染崩
              console.error('[ArticleList] parseArticleTitleTags failed', e);
            }
            return (
              <li key={a.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`article-list__item ${isSelected ? 'is-active' : ''} ${a.isRead ? 'is-read' : 'is-unread'}`}
                  onClick={() => onSelect(a.id)}
                  title={`${cleanTitle}\n${a.author ?? ''}`}
                >
                  <div className="article-list__row1">
                    <span className={`article-list__dot ${a.isRead ? 'is-read' : 'is-unread'}`} aria-hidden="true" />
                    {titleTags.length > 0 && (
                      <span className="article-list__title-tags" data-testid="article-list__title-tags">
                        {titleTags.map((t, i) => (
                          <span
                            key={`${t.name}-${i}`}
                            className="article-list__title-tag"
                            style={{ background: t.color ?? 'var(--accent)' }}
                            title={`标签：${t.name}`}
                          >
                            {t.name}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="article-list__article-title">{cleanTitle}</span>
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
        {/* Phase 自动加载：哨兵必须留在真正滚动的 ul 内部。 */}
        {hasMore && onLoadMore && (
          <li
            ref={sentinelRef}
            className="article-list__sentinel"
            data-testid="article-list__sentinel"
            role="presentation"
            aria-hidden="true"
          />
        )}
      </ul>
    </div>
  );
}
