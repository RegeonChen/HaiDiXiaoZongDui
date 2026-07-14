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
