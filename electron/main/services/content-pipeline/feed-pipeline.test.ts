import { describe, expect, it, vi } from 'vitest';
import { FeedPipeline } from './feed-pipeline';
import type { CleanedContent } from './types';

const feedXml = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Pipeline</title><link>https://example.com</link>
<description>test</description><item><title>One</title><link>https://example.com/one</link>
<guid>one</guid><description><![CDATA[<p>Feed fallback</p>]]></description></item></channel></rss>`;

describe('FeedPipeline', () => {
  it('fetches the feed and article page before cleaning', async () => {
    const fetcher = vi.fn(async (url: string): Promise<string> =>
      url.endsWith('/feed') ? feedXml : '<article><p>Full article page</p></article>'
    );
    const cleaner = vi.fn((_html: string): CleanedContent => ({
      title: 'One',
      byline: null,
      excerpt: null,
      cleanedHtml: '<p>Full article page</p>',
      cleanedMarkdown: 'Full article page'
    }));
    const pipeline = new FeedPipeline(fetcher, cleaner);

    const result = await pipeline.syncFeed({
      feedId: 'feed-1',
      feedUrl: 'https://example.com/feed'
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.articles[0]).toMatchObject({
      guid: 'one',
      cleaningStatus: 'done',
      cleanedMarkdown: 'Full article page'
    });
    expect(result.warnings).toEqual([]);
  });

  it('falls back to feed content when the article page request fails', async () => {
    const fetcher = vi.fn(async (url: string): Promise<string> => {
      if (url.endsWith('/feed')) return feedXml;
      throw new Error('offline');
    });
    const cleaner = vi.fn((html: string): CleanedContent => ({
      title: null,
      byline: null,
      excerpt: null,
      cleanedHtml: html,
      cleanedMarkdown: 'Feed fallback'
    }));

    const result = await new FeedPipeline(fetcher, cleaner).syncFeed({
      feedId: 'feed-1',
      feedUrl: 'https://example.com/feed'
    });

    expect(result.articles[0]?.cleaningStatus).toBe('done');
    expect(result.warnings[0]).toContain('回退 Feed 内容');
  });
});
