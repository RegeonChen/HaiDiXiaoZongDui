import { describe, expect, it } from 'vitest';
import { parseArticleTitleTags } from './article-title-tags';

describe('parseArticleTitleTags', () => {
  it('keeps supporting legacy plain-text tag prefixes', () => {
    expect(parseArticleTitleTags('[tag:技术|#3b82f6] 原标题')).toEqual({
      tags: [{ name: '技术', color: '#3b82f6' }],
      cleanTitle: '原标题'
    });
  });

  it('decodes delimiter characters from encoded tag fields', () => {
    expect(parseArticleTitleTags('[tag:AI%7CML%5D专题|#ff6b35] 原标题')).toEqual({
      tags: [{ name: 'AI|ML]专题', color: '#ff6b35' }],
      cleanTitle: '原标题'
    });
  });

  it('preserves percent-looking text that was part of the original tag name', () => {
    expect(parseArticleTitleTags('[tag:100%257C专题|inherit] 原标题')).toEqual({
      tags: [{ name: '100%7C专题', color: null }],
      cleanTitle: '原标题'
    });
  });
});
