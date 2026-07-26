/**
 * SQLite adapters for the Task 2.2 content pipeline ports.
 *
 * The parser/cleaner services depend only on their small store interfaces;
 * this file is the integration boundary that knows about both those ports and
 * the Task 2.3 database schema.
 */
import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection.js';
import { FeedRepository } from './feed-repository.js';
import {
  preserveArticleTitleTags,
  stripArticleTitleTags
} from './article-title-tags.js';
import type { ArticleContentStore } from '../services/content-pipeline/article-content-service.js';
import type { OpmlFeedStore } from '../services/content-pipeline/opml-service.js';
import type {
  FeedSyncStore,
  FeedSyncTarget,
  PipelineSaveResult
} from '../services/content-pipeline/sync-service.js';
import type {
  ArticleContentOutput,
  ArticleContentSourceKind,
  ArticleContentTarget,
  FeedPipelineOutput,
  OpmlFeedEntry
} from '../services/content-pipeline/types.js';

export class SqliteContentPipelineStore implements
  FeedSyncStore,
  ArticleContentStore,
  OpmlFeedStore {
  async listFeedSyncTargets(): Promise<FeedSyncTarget[]> {
    return FeedRepository.list().map(({ id, url }) => ({ id, url }));
  }

  async getFeedSyncTarget(feedId: string): Promise<FeedSyncTarget | null> {
    const feed = FeedRepository.getById(feedId);
    return feed ? { id: feed.id, url: feed.url } : null;
  }

  async saveFeedPipelineOutput(output: FeedPipelineOutput): Promise<PipelineSaveResult> {
    const db = getDatabase();
    const timestamp = output.finishedAt;
    let newArticles = 0;
    let updatedArticles = 0;

    db.run('BEGIN TRANSACTION');
    try {
      db.run(
        `UPDATE feeds
         SET title = CASE WHEN TRIM(title) = '' THEN ? ELSE title END,
             site_title = ?, description = ?, link = ?, feed_type = ?, icon_url = ?,
             last_sync_at = ?, last_sync_success = 1, last_sync_error = NULL,
             updated_at = ?
         WHERE id = ?`,
        [
          output.feed.title,
          output.feed.siteTitle,
          output.feed.description,
          output.feed.link,
          output.feed.feedType,
          output.feed.iconUrl,
          timestamp,
          timestamp,
          output.feedId
        ]
      );
      if (db.getRowsModified() === 0) {
        throw new Error(`未找到订阅源：${output.feedId}`);
      }

      for (const article of output.articles) {
        const existingRows = db.exec(
          `SELECT id, title, url, raw_html AS rawHtml, raw_text AS rawText
           FROM articles WHERE feed_id = ? AND guid = ? LIMIT 1`,
          [output.feedId, article.guid]
        );
        const existingResult = existingRows[0];
        const existingValues = existingResult?.values[0];
        const existing = existingResult && existingValues
          ? rowToRecord(existingResult.columns, existingValues)
          : null;
        const existingId = existing?.id;

        if (existing && typeof existingId === 'string') {
          const contentInputChanged =
            existing.url !== article.url ||
            existing.rawHtml !== article.rawHtml ||
            nullableString(existing.rawText) !== article.rawText;
          const cacheInvalidation = contentInputChanged
            ? `, source_html = NULL, source_kind = NULL,
                 content_title = NULL, content_byline = NULL, content_excerpt = NULL,
                 cleaned_html = NULL, cleaned_markdown = NULL,
                 cleaning_status = 'pending', cleaning_error = NULL`
            : '';

          db.run(
            `UPDATE articles
             SET title = ?, url = ?, author = ?, published_at = ?, fetched_at = ?,
                 raw_html = ?, raw_text = ?, updated_at = ?${cacheInvalidation}
             WHERE id = ?`,
            [
              preserveArticleTitleTags(
                typeof existing.title === 'string' ? existing.title : '',
                article.title
              ),
              article.url,
              article.author,
              article.publishedAt,
              timestamp,
              article.rawHtml,
              article.rawText,
              timestamp,
              existingId
            ]
          );
          updatedArticles += db.getRowsModified();
          continue;
        }

        db.run(
          `INSERT INTO articles (
             id, feed_id, title, url, author, published_at, fetched_at,
             raw_html, raw_text, guid, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            output.feedId,
            stripArticleTitleTags(article.title),
            article.url,
            article.author,
            article.publishedAt,
            timestamp,
            article.rawHtml,
            article.rawText,
            article.guid,
            timestamp,
            timestamp
          ]
        );
        newArticles += db.getRowsModified();
      }

      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

    saveDatabase();
    return { newArticles, updatedArticles };
  }

  async recordFeedSyncFailure(feedId: string, error: string): Promise<void> {
    FeedRepository.recordSync(feedId, false, error);
  }

  async getArticleContentTarget(articleId: string): Promise<ArticleContentTarget | null> {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT id AS articleId, url AS articleUrl,
              raw_html AS feedRawHtml, raw_text AS feedRawText,
              source_html AS sourceHtml, source_kind AS sourceKind,
              content_title AS contentTitle, content_byline AS contentByline,
              content_excerpt AS contentExcerpt,
              cleaned_html AS cleanedHtml, cleaned_markdown AS cleanedMarkdown,
              cleaning_status AS cleaningStatus
       FROM articles WHERE id = ?`,
      [articleId]
    );
    if (!rows.length || !rows[0].values.length) return null;

    const row = rowToRecord(rows[0].columns, rows[0].values[0]);
    return {
      articleId: row.articleId as string,
      articleUrl: row.articleUrl as string,
      feedRawHtml: (row.feedRawHtml ?? '') as string,
      feedRawText: nullableString(row.feedRawText),
      sourceHtml: nullableString(row.sourceHtml),
      sourceKind: sourceKind(row.sourceKind),
      contentTitle: nullableString(row.contentTitle),
      contentByline: nullableString(row.contentByline),
      contentExcerpt: nullableString(row.contentExcerpt),
      cleanedHtml: nullableString(row.cleanedHtml),
      cleanedMarkdown: nullableString(row.cleanedMarkdown),
      cleaningStatus: cleaningStatus(row.cleaningStatus)
    };
  }

  async markArticleContentInProgress(articleId: string): Promise<void> {
    updateArticleContentState(
      articleId,
      `cleaning_status = 'in_progress', cleaning_error = NULL`
    );
  }

  async saveArticleContent(content: ArticleContentOutput): Promise<void> {
    const db = getDatabase();
    const timestamp = new Date().toISOString();
    db.run(
      `UPDATE articles
       SET source_html = ?, source_kind = ?, content_title = ?, content_byline = ?,
           content_excerpt = ?, cleaned_html = ?, cleaned_markdown = ?,
           cleaning_status = 'done', cleaning_error = NULL, updated_at = ?
       WHERE id = ?`,
      [
        content.sourceHtml,
        content.sourceKind,
        content.title,
        content.byline,
        content.excerpt,
        content.cleanedHtml,
        content.cleanedMarkdown,
        timestamp,
        content.articleId
      ]
    );
    assertArticleUpdated(db.getRowsModified(), content.articleId);
    saveDatabase();
  }

  async markArticleContentFailed(articleId: string, error: string): Promise<void> {
    const db = getDatabase();
    db.run(
      `UPDATE articles
       SET cleaning_status = 'failed', cleaning_error = ?, updated_at = ?
       WHERE id = ?`,
      [error, new Date().toISOString(), articleId]
    );
    assertArticleUpdated(db.getRowsModified(), articleId);
    saveDatabase();
  }

  async importFeedEntries(feeds: OpmlFeedEntry[]): Promise<{
    feedsImported: number;
    feedsSkipped: number;
    errors: string[];
  }> {
    let feedsImported = 0;
    let feedsSkipped = 0;
    const errors: string[] = [];

    for (const feed of feeds) {
      try {
        if (FeedRepository.findByUrl(feed.url)) {
          feedsSkipped += 1;
          continue;
        }
        FeedRepository.create({
          url: feed.url,
          title: feed.title,
          groupName: feed.groupName
        });
        feedsImported += 1;
      } catch (error) {
        errors.push(`${feed.title}: ${errorMessage(error)}`);
      }
    }

    return { feedsImported, feedsSkipped, errors };
  }

  async listFeedEntriesForExport(): Promise<OpmlFeedEntry[]> {
    return FeedRepository.list().map((feed) => ({
      id: feed.id,
      title: feed.title || feed.siteTitle || new URL(feed.url).hostname,
      url: feed.url,
      siteUrl: feed.link || null,
      groupName: feed.groupName
    }));
  }
}

function updateArticleContentState(articleId: string, assignments: string): void {
  const db = getDatabase();
  db.run(
    `UPDATE articles SET ${assignments}, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), articleId]
  );
  assertArticleUpdated(db.getRowsModified(), articleId);
  saveDatabase();
}

function assertArticleUpdated(rowsModified: number, articleId: string): void {
  if (rowsModified === 0) throw new Error(`未找到文章：${articleId}`);
}

function rowToRecord(columns: string[], values: unknown[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (let index = 0; index < columns.length; index += 1) {
    row[columns[index]] = values[index];
  }
  return row;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function sourceKind(value: unknown): ArticleContentSourceKind | null {
  return value === 'article_page' || value === 'feed_html' || value === 'feed_text'
    ? value
    : null;
}

function cleaningStatus(value: unknown): ArticleContentTarget['cleaningStatus'] {
  return value === 'in_progress' || value === 'done' || value === 'failed'
    ? value
    : 'pending';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
