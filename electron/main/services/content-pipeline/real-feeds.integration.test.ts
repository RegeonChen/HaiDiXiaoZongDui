import { describe, expect, it } from 'vitest';
import { cleanArticleContent } from './content-cleaner';
import { parseFeed } from './feed-parser';
import { fetchText } from './http-client';

const runRealFeedTest = process.env['JUHE_REAL_FEEDS'] === '1' ? it : it.skip;

const realFeeds = [
  {
    name: 'NASA News Releases RSS',
    url: 'https://www.nasa.gov/news-release/feed/',
    expectedType: 'rss'
  },
  {
    name: 'Mozilla Blog Atom',
    url: 'https://blog.mozilla.org/feed/atom/',
    expectedType: 'atom'
  },
  {
    name: 'JSON Feed official blog',
    url: 'https://www.jsonfeed.org/feed.json',
    expectedType: 'jsonfeed'
  }
] as const;

describe('real feed compatibility', () => {
  for (const feed of realFeeds) {
    runRealFeedTest(`parses ${feed.name}`, async () => {
      const source = await fetchText(feed.url, { timeoutMs: 15_000 });
      const parsed = await parseFeed(source, feed.url);

      expect(parsed.feedType).toBe(feed.expectedType);
      expect(parsed.title).not.toBe('');
      expect(parsed.articles.length).toBeGreaterThan(0);
      expect(parsed.articles[0]?.url).toMatch(/^https?:\/\//);
    }, 40_000);
  }

  runRealFeedTest('cleans content from a real JSON Feed item', async () => {
    const url = 'https://www.jsonfeed.org/feed.json';
    const source = await fetchText(url, { timeoutMs: 15_000 });
    const parsed = await parseFeed(source, url);
    const article = parsed.articles.find((item) => item.rawHtml.trim() !== '');

    expect(article).toBeDefined();
    const cleaned = cleanArticleContent(article?.rawHtml ?? '', article?.url ?? url);
    expect(cleaned.cleanedHtml.length).toBeGreaterThan(50);
    expect(cleaned.cleanedMarkdown.length).toBeGreaterThan(30);
    expect(cleaned.cleanedHtml).not.toContain('<script');
  }, 40_000);
});
