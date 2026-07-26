import { describe, expect, it, vi } from 'vitest';
import { FeedPipeline } from './feed-pipeline';

const feedXml = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Pipeline</title><link>https://example.com</link>
<description>test</description><item><title>One</title><link>https://example.com/one</link>
<guid>one</guid><description><![CDATA[<p>Feed content</p>]]></description></item></channel></rss>`;

describe('FeedPipeline', () => {
  it('fetches only the feed and leaves full article content for lazy loading', async () => {
    const fetcher = vi.fn(async (): Promise<string> => feedXml);
    const pipeline = new FeedPipeline(fetcher);
    const onStage = vi.fn();

    const result = await pipeline.syncFeed({
      feedId: 'feed-1',
      feedUrl: 'https://example.com/feed'
    }, {
      onStage
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('https://example.com/feed', expect.any(Object));
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['fetching', 'parsing']);
    expect(result.articles[0]).toMatchObject({
      guid: 'one',
      url: 'https://example.com/one',
      rawHtml: '<p>Feed content</p>'
    });
    expect(result.warnings).toEqual([]);
  });
});
