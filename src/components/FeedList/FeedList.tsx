/**
 * 订阅源侧栏（Mercury 风格）
 *
 *  - tab 切换：订阅源 / 标签（标签是 Phase 3 占位）
 *  - + 添加 + ... 批量操作
 *  - 底部状态栏：订阅源数 / 文章数 / 未读数
 *  - 右键订阅源 → 弹菜单（删除 / 复制 URL）
 *  - 选中态：mercury 风格的圆点 + 灰底
 */
import { useMemo, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { showContextMenu } from '../ContextMenu/ContextMenu';
import './FeedList.css';

export interface FeedListProps {
  feeds: Feed[];
  articles: Article[];
  selected: string | 'all' | 'unread' | 'starred';
  onSelect: (id: string | 'all' | 'unread' | 'starred') => void;
  onDeleteFeed: (feed: Feed) => void;
  onSyncFeed?: (feed: Feed) => void;
  onExportOpml?: () => void;
  onAddFeed?: (url: string) => Promise<{ ok: boolean; message: string }>;
  /** Phase 3.6.3：数据库精确计数（由 App.tsx 传下），未提供时 fallback 到 articles 本地计算 */
  allCount?: number;
  unreadCount?: number;
  starredCount?: number;
  /** Phase 3.6.2：同步失败的订阅源 ID 列表（红点标记） */
  failedFeedIds?: string[];
}

type Tab = 'sources' | 'tags';

interface VirtualEntry {
  id: 'all' | 'unread' | 'starred';
  label: string;
  icon: string;
  count: number;
}

export function FeedList({ feeds, articles, selected, onSelect, onDeleteFeed, onSyncFeed, onExportOpml, onAddFeed, allCount, unreadCount, starredCount, failedFeedIds }: FeedListProps) {
  const [tab, setTab] = useState<Tab>('sources');
  const [showAll, setShowAll] = useState(true);
  const [feedUrl, setFeedUrl] = useState('');
  const [adding, setAdding] = useState(false);

  // Phase 3.6.3：优先使用数据库精确计数，未提供时 fallback 到本地计算
  const resolvedUnread = unreadCount ?? articles.filter((a) => !a.isRead).length;
  const resolvedStarred = starredCount ?? articles.filter((a) => a.isStarred).length;
  const resolvedAll = allCount ?? articles.length;

  const virtuals: VirtualEntry[] = [
    { id: 'all', label: '所有订阅源', icon: '◎', count: resolvedAll },
    { id: 'unread', label: '未读', icon: '●', count: resolvedUnread },
    { id: 'starred', label: '星标文章', icon: '★', count: resolvedStarred }
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

  const handleContextMenu = (e: React.MouseEvent, feed: Feed) => {
    e.preventDefault();
    e.stopPropagation();
    // Mercury 风格：6 项菜单（导出 OPML / 导出全文 / 刷新 / 同步 / 编辑 / 删除 / 复制 URL）
    // "导出全文" / "编辑" 当前未实现，用 disabled 标记；右键仍能看到入口，便于 Phase 4/5 扩展
    showContextMenu(e.clientX, e.clientY, [
      {
        label: '同步此订阅源',
        onClick: () => onSyncFeed?.(feed)
      },
      { label: '——', separator: true, onClick: () => undefined },
      {
        label: '导出 OPML',
        onClick: () => onExportOpml?.()
      },
      {
        label: '导出全文…',
        disabled: true,
        onClick: () => undefined
      },
      {
        label: '编辑…',
        disabled: true,
        onClick: () => undefined
      },
      { label: '——', separator: true, onClick: () => undefined },
      {
        label: '复制 RSS URL',
        onClick: () => {
          void navigator.clipboard.writeText(feed.url).catch(() => undefined);
        }
      },
      {
        label: '删除订阅源',
        danger: true,
        onClick: () => onDeleteFeed(feed)
      }
    ]);
  };

  const handleAddSubmit = async () => {
    if (!onAddFeed || !feedUrl.trim() || adding) return;
    setAdding(true);
    try {
      const result = await onAddFeed(feedUrl.trim());
      if (result.ok) setFeedUrl('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="feed-list">
      {/* 内联添加订阅源表单 */}
      {onAddFeed && (
        <form
          className="feed-list__add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddSubmit();
          }}
        >
          <input
            type="url"
            className="feed-list__add-input"
            placeholder="输入 RSS/Atom 订阅地址…"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            disabled={adding}
          />
          <button
            type="submit"
            className="feed-list__add-btn"
            disabled={adding || !feedUrl.trim()}
          >
            {adding ? '…' : '＋'}
          </button>
        </form>
      )}

      {/* 顶部 tab + 操作行 */}
      <div className="feed-list__topbar">
        <div className="feed-list__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sources'}
            className={`feed-list__tab ${tab === 'sources' ? 'is-active' : ''}`}
            onClick={() => setTab('sources')}
          >
            订阅源
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tags'}
            className={`feed-list__tab ${tab === 'tags' ? 'is-active' : ''}`}
            onClick={() => setTab('tags')}
            title="标签功能 Phase 3 落地"
          >
            标签
          </button>
        </div>
        <div className="feed-list__topbar-actions">
          <button
            type="button"
            className="feed-list__icon-btn"
            title="显示/折叠所有订阅源"
            onClick={() => setShowAll((s) => !s)}
            aria-pressed={!showAll}
          >
            {showAll ? '∧' : '∨'}
          </button>
          <button
            type="button"
            className="feed-list__icon-btn"
            title="更多（暂未实现）"
            disabled
          >
            ⋯
          </button>
        </div>
      </div>

      {/* 虚拟分组（所有 / 未读 / 星标）—— tab=sources 才显示 */}
      {tab === 'sources' && (
        <div className="feed-list__virtuals">
          {virtuals.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`feed-list__item ${selected === v.id ? 'is-active' : ''}`}
              onClick={() => onSelect(v.id)}
            >
              <span className="feed-list__icon">{v.icon}</span>
              <span className="feed-list__label">{v.label}</span>
              <span className="feed-list__count">{v.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 真实订阅源分组 */}
      {tab === 'sources' && showAll && (
        grouped.length === 0 ? (
          <div className="feed-list__empty">还没有订阅源</div>
        ) : (
          grouped.map(([group, list]) => (
            <div key={group} className="feed-list__group">
              <div className="feed-list__group-title">{group}</div>
              {list.map((f) => {
                const unread = unreadByFeed.get(f.id) ?? 0;
                const isSelected = selected === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`feed-list__item ${isSelected ? 'is-active' : ''} ${
                      f.lastSyncSuccess ? '' : 'is-failed'
                    }`}
                    onClick={() => onSelect(f.id)}
                    onContextMenu={(e) => handleContextMenu(e, f)}
                    title={`${f.siteTitle || f.title}\n${f.url}\n右键删除 / 复制 URL`}
                  >
                    <span className="feed-list__icon" aria-hidden="true">
                      {f.feedType === 'atom' ? 'Ⓐ' : f.feedType === 'jsonfeed' ? '⌘' : '☰'}
                    </span>
                    <span className="feed-list__label">{f.siteTitle || f.title}</span>
                    {unread > 0 && <span className="feed-list__count">{unread}</span>}
                    {(failedFeedIds?.includes(f.id) || !f.lastSyncSuccess) && (
                      <span
                        className="feed-list__status-dot"
                        title={f.lastSyncError ?? '同步失败'}
                        aria-label="同步失败"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )
      )}

      {/* tab=tags 占位 */}
      {tab === 'tags' && (
        <div className="feed-list__empty">标签管理（Phase 3 落地）</div>
      )}

      {/* 底部状态栏 */}
      <div className="feed-list__statusbar">
        <span>{feeds.length} 源</span>
        <span>·</span>
        <span>{resolvedAll} 篇文章</span>
        <span>·</span>
        <span>{resolvedUnread} 未读</span>
      </div>
    </div>
  );
}
