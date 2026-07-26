import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '../../../shared/types';
import type { FeedPipelineOutput, ParsedArticle } from '../services/content-pipeline/types';

const electronState = vi.hoisted(() => ({ userDataPath: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected Electron path: ${name}`);
      return electronState.userDataPath;
    }
  }
}));

import { ArticleRepository } from './article-repository';
import {
  closeDatabase,
  getDatabase,
  getDbPath,
  initDatabase,
  saveDatabase
} from './connection';
import { SqliteContentPipelineStore } from './content-pipeline-store';
import { FeedRepository } from './feed-repository';
import { TagRepository } from './tag-repository';
import { TopicRepository } from './topic-repository';
import { runMigrations } from './migration';

describe('database integrity', () => {
  beforeEach(async () => {
    electronState.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-db-test-'));
    await initDatabase();
    runMigrations();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(electronState.userDataPath, { recursive: true, force: true });
  });

  it('keeps the previous database file when the atomic replacement fails', () => {
    FeedRepository.create({
      url: 'https://example.test/feed.xml',
      title: 'Persisted feed'
    });
    const databasePath = getDbPath();
    expect(databasePath).not.toBeNull();
    const previousSnapshot = fs.readFileSync(databasePath!);

    const timestamp = '2026-07-14T08:00:00.000Z';
    getDatabase().run(
      `INSERT INTO feeds (id, title, url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['not-yet-persisted', 'Transient feed', 'https://transient.example/feed', timestamp, timestamp]
    );

    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('simulated atomic replacement failure');
    });
    try {
      expect(() => saveDatabase()).toThrow('simulated atomic replacement failure');
    } finally {
      rename.mockRestore();
    }

    expect(fs.readFileSync(databasePath!).equals(previousSnapshot)).toBe(true);
    expect(fs.readdirSync(electronState.userDataPath)).toEqual(['juhe-shivi.db']);
    expect(getDatabase().exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1);
  });

  it('rolls back the whole article batch when one row fails', () => {
    const feed = FeedRepository.create({
      url: 'https://example.test/feed.xml',
      title: 'Batch feed'
    });
    const valid = article({ id: 'valid-article', feedId: feed.id, guid: 'valid-guid' });
    const invalid = article({ id: 'invalid-article', feedId: 'missing-feed', guid: 'invalid-guid' });

    expect(() => ArticleRepository.insertBatch([valid, invalid])).toThrow(/FOREIGN KEY/);
    expect(ArticleRepository.list({ feedId: feed.id }).total).toBe(0);
  });

  it('ranks article search matches by relevance and limits results', () => {
    const feed = FeedRepository.create({
      url: 'https://search.example/feed.xml',
      title: 'Search feed'
    });
    const articles = Array.from({ length: 53 }, (_, index) => article({
      id: `search-${index}`,
      feedId: feed.id,
      guid: `search-guid-${index}`,
      title: index === 0 ? 'machine learning' : index === 1 ? 'Practical machine learning' : `Article ${index}`,
      rawText: index >= 2 ? 'A body about machine learning.' : 'Other content',
      publishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString()
    }));
    expect(ArticleRepository.insertBatch(articles)).toBe(53);

    const result = ArticleRepository.list({ search: 'machine learning' });

    expect(result.total).toBe(53);
    expect(result.items).toHaveLength(50);
    expect(result.items[0].id).toBe('search-0');
    expect(result.items[1].id).toBe('search-1');
    expect(ArticleRepository.list({ search: 'machine learning', limit: 8 }).items).toHaveLength(8);
    expect(ArticleRepository.list({ search: 'not present' })).toEqual({ items: [], total: 0 });
  });

  it('finds and retrieves the 51st historical article across the documented search scope', () => {
    const feed = FeedRepository.create({
      url: 'https://history.example/feed.xml',
      title: 'History feed'
    });
    const articles = Array.from({ length: 60 }, (_, index) => {
      const position = index + 1;
      const isTarget = position === 51;
      return article({
        id: `history-${position}`,
        feedId: feed.id,
        guid: `history-guid-${position}`,
        url: `https://history.example/articles/${position}`,
        title: isTarget ? 'Happy iCal Day' : `Historical article ${position}`,
        rawText: isTarget ? 'A feed excerpt with the raw-scope-marker.' : 'Ordinary feed excerpt.',
        cleanedMarkdown: isTarget
          ? 'The cleaned article contains the cleaned-scope-marker.'
          : 'Ordinary cleaned article.',
        publishedAt: new Date(Date.UTC(2026, 0, 1) + (60 - position) * 86_400_000).toISOString()
      });
    });
    expect(ArticleRepository.insertBatch(articles)).toBe(60);

    const firstPage = ArticleRepository.list({ feedId: feed.id, limit: 50 });
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.items.some((item) => item.id === 'history-51')).toBe(false);

    const byTitle = ArticleRepository.list({ search: 'Happy iCal Day' });
    const byRawText = ArticleRepository.list({ search: 'raw-scope-marker' });
    const byCleanedMarkdown = ArticleRepository.list({ search: 'cleaned-scope-marker' });

    expect(byTitle).toMatchObject({ total: 1, items: [{ id: 'history-51' }] });
    expect(byRawText).toMatchObject({ total: 1, items: [{ id: 'history-51' }] });
    expect(byCleanedMarkdown).toMatchObject({ total: 1, items: [{ id: 'history-51' }] });
    expect(ArticleRepository.getById('history-51')).toMatchObject({
      id: 'history-51',
      title: 'Happy iCal Day'
    });
  });

  it('persists topics, auto-associates related articles and caches a traceable graph', async () => {
    const feed = FeedRepository.create({
      url: 'https://topic.example/feed.xml',
      title: 'Topic source'
    });
    const sharedReport = 'GPT-5.6 benchmark capabilities and evaluation details. '.repeat(4);
    expect(ArticleRepository.insertBatch([
      article({
        id: 'gpt-release', feedId: feed.id, guid: 'gpt-release',
        url: 'https://topic.example/gpt-release',
        title: 'GPT-5.6 model released',
        publishedAt: '2026-07-09T00:00:00.000Z',
        cleanedMarkdown: 'OpenAI released the GPT-5.6 model with new capabilities.'
      }),
      article({
        id: 'gpt-benchmark', feedId: feed.id, guid: 'gpt-benchmark',
        url: 'https://topic.example/gpt-benchmark',
        title: 'GPT-5.6 benchmark results',
        publishedAt: '2026-07-10T00:00:00.000Z',
        cleanedMarkdown: sharedReport
      }),
      article({
        id: 'gpt-api', feedId: feed.id, guid: 'gpt-api',
        url: 'https://topic.example/gpt-api',
        title: 'Developers adopt the GPT-5.6 API',
        publishedAt: '2026-07-12T00:00:00.000Z',
        cleanedMarkdown: 'Developer SDK integration and coding agents use the GPT-5.6 API.'
      }),
      article({
        id: 'unrelated', feedId: feed.id, guid: 'unrelated',
        url: 'https://topic.example/sqlite',
        title: 'SQLite migration guide',
        cleanedMarkdown: 'A database schema migration article.'
      })
    ])).toBe(4);

    const topic = TopicRepository.create({
      name: 'GPT-5.6',
      description: '跟踪模型发展',
      keywords: ['GPT-5.6'],
      seedArticleId: 'gpt-release'
    });
    expect(TopicRepository.getArticles(topic.id).map((item) => item.id).sort())
      .toEqual(['gpt-api', 'gpt-benchmark', 'gpt-release']);

    const graph = TopicRepository.getGraph(topic.id);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.directions.map((direction) => direction.name))
      .toEqual(expect.arrayContaining(['发布与能力', '产品与应用']));
    expect(graph.edges).toHaveLength(2);
    expect(TopicRepository.getGraph(topic.id).generatedAt).toBe(graph.generatedAt);

    const briefing = TopicRepository.generateBriefing(topic.id);
    expect(briefing.sourceArticleIds).toHaveLength(3);
    expect(briefing.content).toContain('[来源：GPT-5.6 model released]');

    closeDatabase();
    await initDatabase();
    runMigrations();
    expect(TopicRepository.getById(topic.id)?.name).toBe('GPT-5.6');
    expect(TopicRepository.getGraph(topic.id).sourceSignature).toBe(graph.sourceSignature);
  });

  it('persists pending in-memory changes when the connection closes', async () => {
    const timestamp = '2026-07-14T08:00:00.000Z';
    getDatabase().run(
      `INSERT INTO feeds (id, title, url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['close-persisted', 'Close persisted', 'https://close.example/feed', timestamp, timestamp]
    );

    closeDatabase();
    await initDatabase();
    runMigrations();

    expect(FeedRepository.getById('close-persisted')).toMatchObject({
      title: 'Close persisted',
      url: 'https://close.example/feed'
    });
  });

  it('invalidates old cleaned article pages once for the image-pipeline upgrade', async () => {
    const feed = FeedRepository.create({
      url: 'https://images.example/feed.xml',
      title: 'Image migration feed'
    });
    const storedArticle = article({
      id: 'image-migration-article',
      feedId: feed.id,
      guid: 'image-migration-guid',
      url: 'https://images.example/post'
    });
    expect(ArticleRepository.insertBatch([storedArticle])).toBe(1);

    const store = new SqliteContentPipelineStore();
    await store.saveArticleContent({
      articleId: storedArticle.id,
      articleUrl: storedArticle.url,
      sourceHtml: '<article><img data-src="/real.png"></article>',
      sourceKind: 'article_page',
      title: 'Old cleaned article',
      byline: null,
      excerpt: null,
      cleanedHtml: '<p>Old content without the image</p>',
      cleanedMarkdown: 'Old content without the image'
    });

    getDatabase().run('DELETE FROM db_version WHERE version = 8');
    saveDatabase();
    closeDatabase();
    await initDatabase();
    runMigrations();

    expect(await store.getArticleContentTarget(storedArticle.id)).toMatchObject({
      sourceHtml: '<article><img data-src="/real.png"></article>',
      sourceKind: 'article_page',
      contentTitle: null,
      cleanedHtml: null,
      cleanedMarkdown: null,
      cleaningStatus: 'pending'
    });
  });

  it('invalidates cleaned content only when the synchronized source changes', async () => {
    const feed = FeedRepository.create({
      url: 'https://example.test/feed.xml',
      title: 'Cache feed'
    });
    const storedArticle = article({
      id: 'cached-article',
      feedId: feed.id,
      guid: 'stable-guid',
      url: 'https://example.test/article-v1',
      rawHtml: '<p>Feed V1</p>',
      rawText: 'Feed text V1'
    });
    expect(ArticleRepository.insertBatch([storedArticle])).toBe(1);

    const store = new SqliteContentPipelineStore();
    await store.saveArticleContent({
      articleId: storedArticle.id,
      articleUrl: storedArticle.url,
      sourceHtml: '<article>Article V1</article>',
      sourceKind: 'article_page',
      title: 'Article V1',
      byline: 'Author V1',
      excerpt: 'Excerpt V1',
      cleanedHtml: '<p>Cleaned V1</p>',
      cleanedMarkdown: 'Cleaned V1'
    });

    const changedOutput = pipelineOutput(feed.id, feed.url, {
      title: 'Article V2',
      url: 'https://example.test/article-v2',
      rawHtml: '<p>Feed V2</p>',
      rawText: 'Feed text V2',
      guid: storedArticle.guid
    });
    expect(await store.saveFeedPipelineOutput(changedOutput)).toEqual({
      newArticles: 0,
      updatedArticles: 1
    });

    const invalidated = await store.getArticleContentTarget(storedArticle.id);
    expect(invalidated).toMatchObject({
      articleUrl: 'https://example.test/article-v2',
      feedRawHtml: '<p>Feed V2</p>',
      feedRawText: 'Feed text V2',
      sourceHtml: null,
      sourceKind: null,
      contentTitle: null,
      contentByline: null,
      contentExcerpt: null,
      cleanedHtml: null,
      cleanedMarkdown: null,
      cleaningStatus: 'pending'
    });

    await store.saveArticleContent({
      articleId: storedArticle.id,
      articleUrl: 'https://example.test/article-v2',
      sourceHtml: '<article>Article V2</article>',
      sourceKind: 'article_page',
      title: 'Article V2',
      byline: 'Author V2',
      excerpt: 'Excerpt V2',
      cleanedHtml: '<p>Cleaned V2</p>',
      cleanedMarkdown: 'Cleaned V2'
    });

    expect(await store.saveFeedPipelineOutput({
      ...changedOutput,
      finishedAt: '2026-07-14T08:02:00.000Z'
    })).toEqual({
      newArticles: 0,
      updatedArticles: 1
    });
    expect(await store.getArticleContentTarget(storedArticle.id)).toMatchObject({
      sourceHtml: '<article>Article V2</article>',
      cleanedHtml: '<p>Cleaned V2</p>',
      cleanedMarkdown: 'Cleaned V2',
      cleaningStatus: 'done'
    });
  });

  it('keeps title tag markers consistent across tag edits and feed resyncs', async () => {
    const feed = FeedRepository.create({
      url: 'https://tags.example/feed.xml',
      title: 'Tag feed'
    });
    const storedArticle = article({
      id: 'tagged-article',
      feedId: feed.id,
      guid: 'tagged-guid',
      title: 'Source V1',
      url: 'https://tags.example/article'
    });
    expect(ArticleRepository.insertBatch([storedArticle])).toBe(1);

    const tag = TagRepository.create({ name: 'AI', color: '#123456' });
    TagRepository.addToArticle(storedArticle.id, tag.id);
    expect(ArticleRepository.getById(storedArticle.id)?.title)
      .toBe('[tag:AI|#123456] Source V1');

    expect(TagRepository.update(tag.id, { name: '模型', color: '#654321' }))
      .toMatchObject({ name: '模型', color: '#654321' });
    expect(ArticleRepository.getById(storedArticle.id)?.title)
      .toBe('[tag:模型|#654321] Source V1');

    const store = new SqliteContentPipelineStore();
    await store.saveFeedPipelineOutput(pipelineOutput(feed.id, feed.url, {
      title: '[tag:Injected|#000000] Source V2',
      url: storedArticle.url,
      rawHtml: storedArticle.rawHtml,
      rawText: storedArticle.rawText,
      guid: storedArticle.guid
    }));
    expect(ArticleRepository.getById(storedArticle.id)?.title)
      .toBe('[tag:模型|#654321] Source V2');

    TagRepository.removeFromArticle(storedArticle.id, tag.id);
    expect(ArticleRepository.getById(storedArticle.id)?.title).toBe('Source V2');
  });
});

function article(overrides: Partial<Article> = {}): Article {
  const timestamp = '2026-07-14T08:00:00.000Z';
  return {
    id: 'article-id',
    feedId: 'feed-id',
    title: 'Article',
    url: 'https://example.test/article',
    author: null,
    publishedAt: timestamp,
    fetchedAt: timestamp,
    rawHtml: '<p>Feed content</p>',
    rawText: 'Feed content',
    cleanedHtml: null,
    cleanedMarkdown: null,
    cleaningStatus: 'pending',
    isRead: false,
    isStarred: false,
    summary: null,
    translatedParagraphs: null,
    guid: 'article-guid',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function pipelineOutput(
  feedId: string,
  feedUrl: string,
  parsedArticle: Pick<ParsedArticle, 'title' | 'url' | 'rawHtml' | 'rawText' | 'guid'>
): FeedPipelineOutput {
  const timestamp = '2026-07-14T08:01:00.000Z';
  const completeArticle: ParsedArticle = {
    author: null,
    publishedAt: timestamp,
    ...parsedArticle
  };
  return {
    feedId,
    feedUrl,
    feed: {
      title: 'Cache feed',
      siteTitle: 'Cache feed',
      description: '',
      link: 'https://example.test',
      feedType: 'rss',
      iconUrl: null,
      articles: [completeArticle]
    },
    articles: [completeArticle],
    warnings: [],
    startedAt: timestamp,
    finishedAt: timestamp
  };
}
