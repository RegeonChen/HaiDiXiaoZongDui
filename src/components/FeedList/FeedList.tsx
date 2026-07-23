/**
 * 订阅源侧栏（Mercury 风格）
 *
 *  - tab 切换：订阅源 / 标签（按 tag 分类文章，Phase 3.5.x 落地）
 *  - 添加订阅源入口：顶栏 + 按钮（打开 AddFeedDialog），不在侧栏重复
 *  - 添加组入口：tab=sources 顶部"+"按钮（打开 AddGroupDialog）
 *  - 底部状态栏：订阅源数 / 文章数 / 未读数
 *  - 右键订阅源 → 弹菜单（同步 / 移动到组 / 删除 / 复制 URL）
 *  - 选中态：mercury 风格的圆点 + 灰底
 *
 * Phase 3.5.x 标签分类：
 *  - tab=tags 展示所有用户标签 + 每个 tag 名下的文章数
 *  - 点击标签 → onSelect('tag:<id>')，由 useSelection 切到 tag 过滤态
 *  - tags 列表为空时显示"还没有任何标签"引导
 *
 * Phase 3.5.x 订阅源分组：
 *  - tab=sources 按 groupName 聚合分组（"未分组"作为兜底组）
 *  - 顶栏 "+" 按钮添加空组（本地缓存，需用户把订阅源移动到新组来激活）
 *  - 右键菜单"移动到..."子菜单列出所有组 + "未分组"
 *  - 组标题旁"+删除"按钮可删除组（组内订阅源移到未分组）
 */
import { useMemo, useState } from 'react';
import type { Article, Feed, Tag } from '@shared/types';
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
  /** Phase 3.6.3：数据库精确计数（由 App.tsx 传下），未提供时 fallback 到 articles 本地计算 */
  allCount?: number;
  unreadCount?: number;
  starredCount?: number;
  /** Phase 3.6.2：同步失败的订阅源 ID 列表（红点标记） */
  failedFeedIds?: string[];
  /** Phase 3.5.x：用户的所有 tag 列表（tab=tags 展示） */
  tags?: Tag[];
  /** Phase 3.5.x：每个 tag 名下的文章数（来自 article_tags SQL 聚合） */
  tagCounts?: Record<string, number>;
  /** Phase 3.5.x：所有订阅源组名（侧栏"移动到组"子菜单 + 顶栏添加组用） */
  groups?: string[];
  /** Phase 3.5.x：打开"添加组"对话框 */
  onAddGroup?: () => void;
  /** Phase 3.5.x：把订阅源移动到指定组（null = 未分组） */
  onMoveFeedToGroup?: (feed: Feed, groupName: string | null) => void;
  /** Phase 3.5.x：删除组（组内订阅源移到未分组） */
  onDeleteGroup?: (groupName: string) => void;
}

type Tab = 'sources' | 'tags';

interface VirtualEntry {
  id: 'all' | 'unread' | 'starred';
  label: string;
  icon: string;
  count: number;
}

const UNGROUPED_KEY = '未分组';

export function FeedList({
  feeds,
  articles,
  selected,
  onSelect,
  onDeleteFeed,
  onSyncFeed,
  onExportOpml,
  allCount,
  unreadCount,
  starredCount,
  failedFeedIds,
  tags,
  tagCounts,
  groups = [],
  onAddGroup,
  onMoveFeedToGroup,
  onDeleteGroup
}: FeedListProps) {
  const [tab, setTab] = useState<Tab>('sources');
  const [showAll, setShowAll] = useState(true);

  // Phase 3.6.3：优先使用数据库精确计数（顶层三个虚拟分组），未提供时 fallback 到本地计算
  // PLAN 3.6.3 仅要求"所有订阅源/未读/星标文章"三个虚拟分类使用数据库精确计数；
  // 单个订阅源行的未读数仍走本地 allArticles 聚合（PLAN 未要求每行精确，且本地计算对
  // 当前已加载的 allArticles 来说已经覆盖全集，行为正确且无额外 IPC 开销）。
  const resolvedUnread = unreadCount ?? articles.filter((a) => !a.isRead).length;
  const resolvedStarred = starredCount ?? articles.filter((a) => a.isStarred).length;
  const resolvedAll = allCount ?? articles.length;

  const virtuals: VirtualEntry[] = [
    { id: 'all', label: '所有订阅源', icon: '◎', count: resolvedAll },
    { id: 'unread', label: '未读', icon: '●', count: resolvedUnread },
    { id: 'starred', label: '星标文章', icon: '★', count: resolvedStarred }
  ];

  // 单订阅源行未读数（本地聚合，详见上方注释）
  const unreadByFeed = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      if (a.isRead) continue;
      m.set(a.feedId, (m.get(a.feedId) ?? 0) + 1);
    }
    return m;
  }, [articles]);

  // Phase 3.5.x：按 groupName 聚合（"未分组"始终放最后，已添加的空组也显示在分类里）
  const grouped = useMemo(() => {
    const map = new Map<string, Feed[]>();
    for (const f of feeds) {
      const key = f.groupName ?? UNGROUPED_KEY;
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    // 空组也占一行（用户已添加但还没移动任何订阅源）
    for (const g of groups) {
      if (!map.has(g)) map.set(g, []);
    }
    // "未分组"放最后；其它按字典序
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNGROUPED_KEY) return 1;
      if (b === UNGROUPED_KEY) return -1;
      return a.localeCompare(b, 'zh');
    });
  }, [feeds, groups]);

  const handleContextMenu = (e: React.MouseEvent, feed: Feed) => {
    e.preventDefault();
    e.stopPropagation();
    // Mercury 风格：5 项主菜单 + 1 项"移动到..."子菜单（hover 弹出）
    // 导出全文 / 编辑当前未实现，用 disabled 占位
    const moveToSubmenu = onMoveFeedToGroup
      ? [
          ...(groups.length > 0
            ? groups.map((g) => ({
                label: g + (feed.groupName === g ? '  ✓' : ''),
                onClick: () => onMoveFeedToGroup(feed, g)
              }))
            : [{ label: '（还没有组）', disabled: true, onClick: () => undefined }]),
          { label: '——', separator: true, onClick: () => undefined },
          {
            label: UNGROUPED_KEY + (feed.groupName == null ? '  ✓' : ''),
            onClick: () => onMoveFeedToGroup(feed, null)
          }
        ]
      : undefined;

    showContextMenu(e.clientX, e.clientY, [
      {
        label: '同步此订阅源',
        onClick: () => onSyncFeed?.(feed)
      },
      { label: '——', separator: true, onClick: () => undefined },
      ...(moveToSubmenu
        ? [
            { label: '移动到…', submenu: moveToSubmenu, onClick: () => undefined },
            { label: '——', separator: true, onClick: () => undefined }
          ]
        : []),
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

  return (
    <div className="feed-list">
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
          {/* Phase 3.5.x：tab=sources 时显示"添加组"按钮；tab=tags 不显示 */}
          {tab === 'sources' && onAddGroup && (
            <button
              type="button"
              className="feed-list__icon-btn"
              title="添加订阅源组"
              onClick={onAddGroup}
              data-testid="feed-list__add-group"
            >
              +
            </button>
          )}
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
          grouped.map(([group, list]) => {
            // "未分组"是兜底组，不能删除也不能添加（也没意义）
            const canDelete = group !== UNGROUPED_KEY && !!onDeleteGroup;
            return (
              <div key={group} className="feed-list__group" data-feed-group={group}>
                <div className="feed-list__group-title">
                  <span>{group}</span>
                  {canDelete && (
                    <button
                      type="button"
                      className="feed-list__group-delete"
                      onClick={() => onDeleteGroup?.(group)}
                      title={`删除组「${group}」（组内订阅源移到未分组）`}
                      data-testid={`feed-list__delete-group-${group}`}
                    >
                      ×
                    </button>
                  )}
                </div>
                {list.length === 0 ? (
                  <div className="feed-list__group-empty">
                    还没有订阅源。右键其他订阅源 → 移动到「{group}」。
                  </div>
                ) : (
                  list.map((f) => {
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
                        title={`${f.siteTitle || f.title}\n${f.url}\n右键：移动到组 / 同步 / 删除`}
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
                  })
                )}
              </div>
            );
          })
        )
      )}

      {/* tab=tags:按 tag 分类文章(Phase 3.5.x 落地) */}
      {tab === 'tags' && (
        <>
          {(!tags || tags.length === 0) ? (
            <div className="feed-list__empty">
              还没有任何标签。<br />
              在文章阅读区用 🏷 标签 / 🪄 标签建议 添加。
            </div>
          ) : (
            <div className="feed-list__virtuals" data-section="tags">
              {tags.map((t) => {
                const count = tagCounts?.[t.id] ?? 0;
                const isSelected = selected === `tag:${t.id}`;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`feed-list__item ${isSelected ? 'is-active' : ''}`}
                    onClick={() => onSelect(`tag:${t.id}`)}
                    data-tag-id={t.id}
                    title={`${t.name} · ${count} 篇文章`}
                  >
                    <span
                      className="feed-list__icon"
                      style={{ color: t.color ?? 'var(--accent)' }}
                      aria-hidden="true"
                    >
                      #
                    </span>
                    <span className="feed-list__label">{t.name}</span>
                    <span className="feed-list__count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
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
