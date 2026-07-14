/**
 * 选中态管理
 *
 * 维护当前选中的 feed / article。
 * 选中 article 时不直接调 markRead——上层组件按需触发。
 */
import { useCallback, useState } from 'react';

export interface Selection {
  feedId: string | 'all' | 'unread' | 'starred';
  articleId: string | null;
}

const INITIAL: Selection = { feedId: 'all', articleId: null };

export function useSelection() {
  const [selection, setSelection] = useState<Selection>(INITIAL);

  const selectFeed = useCallback((feedId: Selection['feedId']) => {
    setSelection({ feedId, articleId: null });
  }, []);

  const selectArticle = useCallback((articleId: string | null) => {
    setSelection((prev) => ({ ...prev, articleId }));
  }, []);

  return { selection, selectFeed, selectArticle };
}
