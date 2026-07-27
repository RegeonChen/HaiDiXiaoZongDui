import { describe, expect, it } from 'vitest';
import type { Tag } from '../../../shared/types';
import {
  buildTaggedArticleTitle,
  preserveArticleTitleTags,
  stripArticleTitleTags
} from './article-title-tags';

const tag = (name: string, color: string | null): Tag => ({
  id: `tag-${name}`,
  name,
  color,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z'
});

describe('article title tag storage', () => {
  it('encodes delimiter characters before embedding tag metadata', () => {
    const title = buildTaggedArticleTitle('原标题', [tag('AI|ML]专题', '#ff6b35')]);
    expect(title).toBe('[tag:AI%7CML%5D专题|#ff6b35] 原标题');
    expect(stripArticleTitleTags(title)).toBe('原标题');
  });

  it('preserves an encoded prefix when a feed refresh changes the source title', () => {
    const existing = buildTaggedArticleTitle('旧标题', [tag('A|B', null)]);
    expect(preserveArticleTitleTags(existing, '新标题')).toBe(
      '[tag:A%7CB|inherit] 新标题'
    );
  });
});
