/**
 * ArticleRepository — 文章数据访问层
 * Task 2.3: Local Database
 *
 * 职责：
 *  - articles 表的 CRUD 操作
 *  - 批量插入（INSERT OR IGNORE 基于 guid 唯一索引去重）
 *  - 已读/星标状态更新
 *  - 按筛选条件分页查询
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { SqlValue } from 'sql.js';
import type {
  Article,
  ArticleFilter,
  IsoTimestamp,
  TranslatedParagraph
} from '../../../shared/types';

// ============================================================
// 辅助
// ============================================================

function now(): IsoTimestamp {
  return new Date().toISOString();
}

function uid(): string {
  return crypto.randomUUID();
}

// sql.js exec 返回的列名会保留 AS 别名，所以用 AS 直接做 snake→camel 映射
const ARTICLE_SELECT = `
  id,
  feed_id AS feedId,
  title,
  url,
  author,
  published_at AS publishedAt,
  fetched_at AS fetchedAt,
  raw_html AS rawHtml,
  raw_text AS rawText,
  cleaned_html AS cleanedHtml,
  cleaned_markdown AS cleanedMarkdown,
  cleaning_status AS cleaningStatus,
  is_read AS isRead,
  is_starred AS isStarred,
  summary,
  translated_paragraphs AS translatedParagraphs,
  guid,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

// ============================================================
// ArticleRepository
// ============================================================

export const ArticleRepository = {
  /**
   * 按筛选条件分页查询文章。
   */
  list(filter: ArticleFilter = {}): { items: Article[]; total: number } {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: SqlValue[] = [];

    if (filter.feedId) {
      conditions.push('feed_id = ?');
      params.push(filter.feedId);
    }
    if (filter.isRead !== undefined) {
      conditions.push('is_read = ?');
      params.push(filter.isRead ? 1 : 0);
    }
    if (filter.isStarred !== undefined) {
      conditions.push('is_starred = ?');
      params.push(filter.isStarred ? 1 : 0);
    }
    if (filter.search) {
      conditions.push('(title LIKE ? OR raw_text LIKE ?)');
      const q = `%${filter.search}%`;
      params.push(q, q);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 总数
    const countRows = db.exec(`SELECT COUNT(*) AS cnt FROM articles ${where}`, params);
    const total = countRows.length > 0 ? (countRows[0].values[0][0] as number) : 0;

    // 排序
    const sortBy = filter.sortBy || 'publishedAt';
    const sortOrder = filter.sortOrder || 'desc';
    const sortCol = columnForSort(sortBy);
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;

    const allParams: SqlValue[] = [
      ...params,
      limit,
      offset
    ];

    const dataRows = db.exec(
      `SELECT ${ARTICLE_SELECT} FROM articles ${where}
       ORDER BY ${sortCol} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
      allParams
    );

    const items: Article[] = dataRows.length > 0
      ? dataRows[0].values.map(row => rowToArticle(dataRows[0].columns, row))
      : [];

    return { items, total };
  },

  /**
   * 按 ID 获取单篇文章。
   */
  getById(id: string): Article | null {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT ${ARTICLE_SELECT} FROM articles WHERE id = ?`,
      [id]
    );
    if (!rows.length || !rows[0].values.length) return null;
    return rowToArticle(rows[0].columns, rows[0].values[0]);
  },

  /**
   * 批量插入文章。
   * 使用 INSERT OR IGNORE 基于 guid 唯一索引去重：
   * guid 冲突的旧文章保留，新文章跳过。
   *
   * 返回实际新插入的文章数量。
   */
  insertBatch(articles: Article[]): number {
    if (!articles.length) return 0;

    const db = getDatabase();
    let inserted = 0;

    const stmt = `
      INSERT OR IGNORE INTO articles (
        id, feed_id, title, url, author, published_at, fetched_at,
        raw_html, raw_text, cleaned_html, cleaned_markdown, cleaning_status,
        is_read, is_starred, summary, translated_paragraphs, guid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const a of articles) {
      db.run(stmt, [
        a.id || uid(),
        a.feedId,
        a.title,
        a.url,
        a.author ?? null,
        a.publishedAt ?? null,
        a.fetchedAt || now(),
        a.rawHtml,
        a.rawText ?? null,
        a.cleanedHtml ?? null,
        a.cleanedMarkdown ?? null,
        a.cleaningStatus || 'pending',
        a.isRead ? 1 : 0,
        a.isStarred ? 1 : 0,
        a.summary ?? null,
        a.translatedParagraphs ? JSON.stringify(a.translatedParagraphs) : null,
        a.guid,
        a.createdAt || now(),
        a.updatedAt || now()
      ]);
      inserted++;
    }

    saveDatabase();
    return inserted;
  },

  /**
   * 标记文章已读/未读。
   */
  markRead(id: string, isRead: boolean): boolean {
    const db = getDatabase();
    const ts = now();
    db.run(
      `UPDATE articles SET is_read = ?, updated_at = ? WHERE id = ?`,
      [isRead ? 1 : 0, ts, id]
    );
    saveDatabase();
    return true;
  },

  /**
   * 标记文章星标/取消星标。
   */
  markStarred(id: string, isStarred: boolean): boolean {
    const db = getDatabase();
    const ts = now();
    db.run(
      `UPDATE articles SET is_starred = ?, updated_at = ? WHERE id = ?`,
      [isStarred ? 1 : 0, ts, id]
    );
    saveDatabase();
    return true;
  },

  /**
   * 批量标记文章已读/未读。
   */
  batchMarkRead(ids: string[], isRead: boolean): void {
    if (!ids.length) return;
    const db = getDatabase();
    const ts = now();
    const placeholders = ids.map(() => '?').join(',');
    db.run(
      `UPDATE articles SET is_read = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [isRead ? 1 : 0, ts, ...ids]
    );
    saveDatabase();
  },

  /**
   * 获取指定 feed 下最近文章的 guid 集合（用于同步后判断哪些是新文章）。
   * 返回 Set 供 Feed 同步服务使用。
   */
  getExistingGuidsForFeed(feedId: string): Set<string> {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT guid FROM articles WHERE feed_id = ?',
      [feedId]
    );
    const guids = new Set<string>();
    if (rows.length) {
      for (const row of rows[0].values) {
        guids.add(row[0] as string);
      }
    }
    return guids;
  }
};

// ============================================================
// 内部辅助
// ============================================================

function columnForSort(sortBy: string): string {
  switch (sortBy) {
    case 'publishedAt': return 'published_at';
    case 'fetchedAt': return 'fetched_at';
    case 'title': return 'title';
    default: return 'published_at';
  }
}

/**
 * 将 exec 返回的一行转为 Article 对象。
 * columns 是 AS 别名后的 camelCase 名称。
 */
function rowToArticle(columns: string[], row: SqlValue[]): Article {
  const o: Record<string, SqlValue> = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }

  let translatedParagraphs: TranslatedParagraph[] | null = null;
  if (typeof o.translatedParagraphs === 'string' && o.translatedParagraphs) {
    try {
      translatedParagraphs = JSON.parse(o.translatedParagraphs);
    } catch {
      translatedParagraphs = null;
    }
  }

  return {
    id: o.id as string,
    feedId: o.feedId as string,
    title: o.title as string,
    url: o.url as string,
    author: (o.author ?? null) as string | null,
    publishedAt: (o.publishedAt ?? null) as IsoTimestamp | null,
    fetchedAt: o.fetchedAt as IsoTimestamp,
    rawHtml: o.rawHtml as string,
    rawText: (o.rawText ?? null) as string | null,
    cleanedHtml: (o.cleanedHtml ?? null) as string | null,
    cleanedMarkdown: (o.cleanedMarkdown ?? null) as string | null,
    cleaningStatus: (o.cleaningStatus ?? 'pending') as Article['cleaningStatus'],
    isRead: !!(o.isRead ?? 0),
    isStarred: !!(o.isStarred ?? 0),
    summary: (o.summary ?? null) as string | null,
    translatedParagraphs,
    guid: o.guid as string,
    createdAt: o.createdAt as IsoTimestamp,
    updatedAt: o.updatedAt as IsoTimestamp
  };
}
