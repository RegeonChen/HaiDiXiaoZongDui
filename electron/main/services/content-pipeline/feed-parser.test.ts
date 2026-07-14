import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFeed } from './feed-parser';

async function fixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
}

describe('parseFeed', () => {
  it('normalizes RSS 2.0', async () => {
    const result = await parseFeed(await fixture('rss.xml'), 'https://example.com/feed.xml');

    expect(result.feedType).toBe('rss');
    expect(result.title).toBe('Example RSS');
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({
      title: 'RSS Article',
      url: 'https://example.com/rss-article',
      guid: 'rss-guid-1',
      publishedAt: '2026-07-13T08:00:00.000Z'
    });
    expect(result.articles[0]?.rawHtml).toContain('<strong>content</strong>');
  });

  it('normalizes Atom and resolves relative links', async () => {
    const result = await parseFeed(await fixture('atom.xml'), 'https://example.org/feed.atom');

    expect(result.feedType).toBe('atom');
    expect(result.articles[0]).toMatchObject({
      title: 'Atom Article',
      url: 'https://example.org/atom-article',
      author: 'Atom Author',
      publishedAt: '2026-07-13T01:30:00.000Z'
    });
  });

  it('normalizes JSON Feed 1.1', async () => {
    const result = await parseFeed(
      await fixture('json-feed.json'),
      'https://json.example.com/feed.json'
    );

    expect(result.feedType).toBe('jsonfeed');
    expect(result.articles[0]).toMatchObject({
      title: 'JSON Article',
      url: 'https://json.example.com/json-article',
      author: 'JSON Author',
      guid: 'json-guid-1'
    });
  });

  it('rejects unsupported URL protocols and unknown formats', async () => {
    await expect(parseFeed('{}', 'file:///tmp/feed.xml')).rejects.toMatchObject({
      code: 'URL_PROTOCOL_UNSUPPORTED'
    });
    await expect(parseFeed('<html></html>', 'https://example.com/feed')).rejects.toMatchObject({
      code: 'FEED_UNSUPPORTED'
    });
  });
});
