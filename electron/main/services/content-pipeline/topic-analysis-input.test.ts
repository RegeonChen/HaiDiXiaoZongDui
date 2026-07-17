import { describe, expect, it } from 'vitest';
import type { Article, Feed } from '../../../../shared/types';
import {
  canonicalizeArticleUrl,
  normalizeTopicAnalysisInput,
  prepareTopicAnalysisInputs
} from './topic-analysis-input';

describe('topic analysis input', () => {
  it('normalizes stable source, time, content and summary fields', () => {
    const input = normalizeTopicAnalysisInput(article({
      title: '  A   useful article  ',
      url: 'HTTPS://WWW.Example.com/posts/1/?utm_source=rss&b=2&a=1#section',
      author: '  Ada   Lovelace ',
      publishedAt: '2026-07-17T08:30:00+08:00',
      cleanedMarkdown: '## Heading\r\n\r\n\r\nBody  ',
      rawText: 'lower priority content',
      summary: '  ## Summary\r\n\r\n- point  '
    }), feed());

    expect(input).toMatchObject({
      title: 'A useful article',
      canonicalUrl: 'https://example.com/posts/1?a=1&b=2',
      author: 'Ada Lovelace',
      publishedAt: '2026-07-17T00:30:00.000Z',
      publishedAtSource: 'published_at',
      sourceTitle: 'Example Site',
      sourceFeedUrl: 'https://feeds.example.com/rss.xml',
      sourceSiteUrl: 'https://example.com/',
      content: '## Heading\n\nBody',
      contentSource: 'cleaned_markdown',
      summary: '## Summary\n\n- point',
      duplicateOfArticleId: null
    });
  });

  it('falls back across missing title, date, feed and content fields', () => {
    const fromRawText = normalizeTopicAnalysisInput(article({
      title: ' ',
      url: 'https://news.example/path',
      publishedAt: 'invalid',
      fetchedAt: '2026-07-17T01:02:03.000Z',
      cleanedMarkdown: null,
      rawText: '  Raw   text ',
      summary: ' '
    }));
    expect(fromRawText).toMatchObject({
      title: 'Untitled article (news.example)',
      publishedAt: '2026-07-17T01:02:03.000Z',
      publishedAtSource: 'fetched_at',
      sourceTitle: 'news.example',
      sourceFeedUrl: '',
      sourceSiteUrl: null,
      content: 'Raw text',
      contentSource: 'raw_text',
      summary: null
    });

    const fromHtml = normalizeTopicAnalysisInput(article({
      cleanedMarkdown: null,
      rawText: null,
      rawHtml: '<nav>menu</nav><article><p>Useful body</p><script>secret()</script></article>'
    }), feed({ siteTitle: '', title: '', link: '' }));
    expect(fromHtml.content).toBe('Useful body');
    expect(fromHtml.contentSource).toBe('raw_html');
    expect(fromHtml.sourceTitle).toBe('feeds.example.com');

    const unavailable = normalizeTopicAnalysisInput(article({
      cleanedMarkdown: null,
      rawText: null,
      rawHtml: ''
    }));
    expect(unavailable.content).toBe('');
    expect(unavailable.contentSource).toBe('unavailable');
  });

  it('keeps traceability while grouping canonical URL and exact-content duplicates', () => {
    const longBody = 'The same detailed report contains stable facts and evidence. '.repeat(3);
    const batch = prepareTopicAnalysisInputs([
      article({
        id: 'primary',
        feedId: 'feed-a',
        url: 'https://example.com/report/?utm_campaign=newsletter',
        title: 'Shared report',
        cleanedMarkdown: longBody
      }),
      article({
        id: 'same-url',
        feedId: 'feed-b',
        url: 'https://www.example.com/report#top',
        title: 'Updated page title',
        cleanedMarkdown: 'Different body that should still be grouped by its canonical URL. '.repeat(2)
      }),
      article({
        id: 'same-content',
        feedId: 'feed-b',
        url: 'https://mirror.example.net/reprint',
        title: 'Republished under a different headline',
        cleanedMarkdown: longBody
      }),
      article({
        id: 'unique',
        feedId: 'feed-a',
        url: 'https://other.example/unique',
        title: 'Unique report',
        cleanedMarkdown: 'Completely unrelated content with enough detail to get its own fingerprint. '.repeat(2)
      })
    ], [
      feed({ id: 'feed-a', title: 'Source A', siteTitle: 'Source A' }),
      feed({ id: 'feed-b', title: 'Source B', siteTitle: 'Source B' })
    ]);

    expect(batch.items).toHaveLength(4);
    expect(batch.uniqueItems.map((item) => item.articleId)).toEqual(['primary', 'unique']);
    expect(batch.items.find((item) => item.articleId === 'same-url')?.duplicateOfArticleId)
      .toBe('primary');
    expect(batch.items.find((item) => item.articleId === 'same-content')?.duplicateOfArticleId)
      .toBe('primary');
    expect(batch.items.map((item) => item.sourceTitle)).toEqual([
      'Source A', 'Source B', 'Source B', 'Source A'
    ]);
    expect(batch.duplicateGroups).toEqual([{
      primaryArticleId: 'primary',
      articleIds: ['primary', 'same-url', 'same-content']
    }]);
  });

  it('does not treat short boilerplate as a content duplicate', () => {
    const batch = prepareTopicAnalysisInputs([
      article({ id: 'a', url: 'https://a.example/1', cleanedMarkdown: 'Read more' }),
      article({ id: 'b', url: 'https://b.example/2', cleanedMarkdown: 'Read more' })
    ], []);
    expect(batch.uniqueItems).toHaveLength(2);
    expect(batch.duplicateGroups).toEqual([]);
  });

  it('merges duplicate groups transitively across URL and content keys', () => {
    const firstBody = 'First sufficiently long exact article body. '.repeat(4);
    const secondBody = 'Second sufficiently long exact article body. '.repeat(4);
    const batch = prepareTopicAnalysisInputs([
      article({ id: 'first', url: 'https://one.example/story', cleanedMarkdown: firstBody }),
      article({ id: 'second', url: 'https://two.example/story', cleanedMarkdown: secondBody }),
      article({ id: 'bridge', url: 'https://one.example/story#copy', cleanedMarkdown: secondBody })
    ], []);

    expect(batch.uniqueItems.map((item) => item.articleId)).toEqual(['first']);
    expect(batch.duplicateGroups[0]).toEqual({
      primaryArticleId: 'first',
      articleIds: ['first', 'second', 'bridge']
    });
  });

  it('canonicalizes tracking parameters without changing meaningful query values', () => {
    expect(canonicalizeArticleUrl(
      'https://WWW.Example.com/a//b/?utm_medium=email&z=2&q=machine%20learning#result'
    )).toBe('https://example.com/a/b?q=machine+learning&z=2');
    expect(canonicalizeArticleUrl('not a URL')).toBe('not a URL');
  });
});

function article(overrides: Partial<Article> = {}): Article {
  const timestamp = '2026-07-17T00:00:00.000Z';
  return {
    id: 'article-id', feedId: 'feed-id', title: 'Article title',
    url: 'https://example.com/article', author: null, publishedAt: timestamp,
    fetchedAt: timestamp, rawHtml: '<p>Raw HTML body</p>', rawText: 'Raw text body',
    cleanedHtml: '<p>Cleaned body</p>', cleanedMarkdown: 'Cleaned body',
    cleaningStatus: 'done', isRead: false, isStarred: false, summary: null,
    translatedParagraphs: null, guid: 'article-guid', createdAt: timestamp,
    updatedAt: timestamp, ...overrides
  };
}

function feed(overrides: Partial<Feed> = {}): Feed {
  const timestamp = '2026-07-17T00:00:00.000Z';
  return {
    id: 'feed-id', title: 'Example Feed', url: 'https://feeds.example.com/rss.xml',
    siteTitle: 'Example Site', description: '', link: 'https://example.com',
    feedType: 'rss', groupName: null, iconUrl: null, lastSyncAt: timestamp,
    lastSyncSuccess: true, lastSyncError: null, syncIntervalMin: null,
    createdAt: timestamp, updatedAt: timestamp, ...overrides
  };
}
