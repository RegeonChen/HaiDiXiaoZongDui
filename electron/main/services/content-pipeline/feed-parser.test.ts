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

  it('accepts XML processing instructions before the RSS root element', async () => {
    const result = await parseFeed(`
      <?xml version="1.0" encoding="UTF-8"?>
      <?xml-stylesheet type="text/xsl" href="/css/rss.xsl"?>
      <!-- Browser presentation only; not part of the feed payload. -->
      <rss version="2.0"><channel>
        <title>Styled RSS</title>
        <link>https://idiallo.com</link>
        <item>
          <title>Article</title>
          <link>https://idiallo.com/blog/article</link>
          <guid>https://idiallo.com/blog/article</guid>
        </item>
      </channel></rss>
    `, 'https://idiallo.com/feed.rss');

    expect(result.feedType).toBe('rss');
    expect(result.title).toBe('Styled RSS');
    expect(result.articles).toHaveLength(1);
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

  it('skips malformed items without dropping valid entries', async () => {
    const result = await parseFeed(`
      <rss version="2.0"><channel><link>https://example.com</link>
        <item><title>Missing URL</title><guid>missing-url</guid></item>
        <item><title>Bad URL</title><link>javascript:alert(1)</link><guid>bad-url</guid></item>
        <item><link>/valid</link><description>Fallback body</description></item>
        <item><link>/valid</link><description>Duplicate URL fallback GUID</description></item>
      </channel></rss>
    `, 'https://example.com/feed.xml');

    expect(result.title).toBe('example.com');
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({
      title: 'Untitled',
      url: 'https://example.com/valid'
    });
    expect(result.articles[0]?.guid).toMatch(/^[a-f0-9]{16}$/);
  });
});
