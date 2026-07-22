/**
 * 选中态管理
 *
 * 维护当前选中的 feed / article。
 * 选中 article 时不直接调 markRead——上层组件按需触发。
 *
 * feedId 支持的取值：
 *   - 'all' / 'unread' / 'starred'：虚拟分组
 *   - 普通 feed.id：选中具体订阅源
 *   - `tag:<tagId>`：按标签过滤文章（Phase 3.5.x 标签管理落地）
 */
import { useCallback, useState } from 'react';

export type FeedSelector = string | 'all' | 'unread' | 'starred' | `tag:${string}`;

export function isTagSelector(value: string): value is `tag:${string}` {
  return value.startsWith('tag:');
}

export function parseTagSelector(value: string): string | null {
  return isTagSelector(value) ? value.slice(4) : null;
}

export interface Selection {
  feedId: FeedSelector;
  articleId: string | null;
}

const INITIAL: Selection = { feedId: 'all', articleId: null };

export function useSelection() {
  const [selection, setSelection] = useState<Selection>(INITIAL);

  const selectFeed = useCallback((feedId: FeedSelector) => {
    setSelection({ feedId, articleId: null });
  }, []);

  const selectArticle = useCallback((articleId: string | null) => {
    setSelection((prev) => ({ ...prev, articleId }));
  }, []);

  return { selection, selectFeed, selectArticle };
}
