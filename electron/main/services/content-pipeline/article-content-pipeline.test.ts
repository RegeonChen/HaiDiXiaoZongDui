import { describe, expect, it, vi } from 'vitest';
import { ArticleContentPipeline } from './article-content-pipeline';
import type { ArticleContentTarget, CleanedContent } from './types';

function target(overrides: Partial<ArticleContentTarget> = {}): ArticleContentTarget {
  return {
    articleId: 'article-1',
    articleUrl: 'https://example.com/article-1',
    feedRawHtml: '<p>Feed fallback</p>',
    feedRawText: 'Feed fallback',
    sourceHtml: null,
    sourceKind: null,
    contentTitle: null,
    contentByline: null,
    contentExcerpt: null,
    cleanedHtml: null,
    cleanedMarkdown: null,
    cleaningStatus: 'pending',
    ...overrides
  };
}

function cleaned(html: string): CleanedContent {
  return {
    title: 'Article',
    byline: null,
    excerpt: null,
    cleanedHtml: html,
    cleanedMarkdown: 'cleaned'
  };
}

describe('ArticleContentPipeline', () => {
  it('fetches and cleans the article page only when explicitly built', async () => {
    const fetcher = vi.fn(async () => '<article><p>Full page</p></article>');
    const cleaner = vi.fn((html: string) => cleaned(html));

    const result = await new ArticleContentPipeline(fetcher, cleaner).build(target());

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.sourceKind).toBe('article_page');
    expect(result.sourceHtml).toContain('Full page');
    expect(cleaner).toHaveBeenCalledWith(result.sourceHtml, 'https://example.com/article-1');
  });

  it('reuses persisted source HTML without another network request', async () => {
    const fetcher = vi.fn(async () => '<p>network should not run</p>');
    const cleaner = vi.fn((html: string) => cleaned(html));

    const result = await new ArticleContentPipeline(fetcher, cleaner).build(target({
      sourceHtml: '<article><p>Persisted source</p></article>',
      sourceKind: 'article_page'
    }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.sourceHtml).toContain('Persisted source');
  });

  it('falls back to Feed HTML when the page request fails', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline'); });
    const cleaner = vi.fn((html: string) => cleaned(html));

    const result = await new ArticleContentPipeline(fetcher, cleaner).build(target());

    expect(result.sourceKind).toBe('feed_html');
    expect(result.sourceHtml).toBe('<p>Feed fallback</p>');
  });
});
