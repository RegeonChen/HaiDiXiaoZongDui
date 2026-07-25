/**
 * ArticleRepository — 文章数据访问层
 * Task 2.3: Local Database
 *
 * 职责：
 *  - articles 表的 CRUD 操作
 *  - 批量插入（INSERT OR IGNORE 基于 feed_id + guid 唯一索引去重）
 *  - 已读/星标状态更新
 *  - 按筛选条件分页查询
 *  - Phase 3.4：文章模糊搜索（相关性打分排序，上限 20 篇）
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
   * 当 filter.search 非空时进入搜索模式：全量 LIKE 匹配 + JS 相关性打分排序，
   * 返回 top N 结果（上限 filter.limit 或默认 20）。
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
      conditions.push('(title LIKE ? OR raw_text LIKE ? OR cleaned_markdown LIKE ?)');
      const q = `%${filter.search}%`;
      params.push(q, q, q);
    }
    // Phase 3.5.x:按 tag 过滤文章(侧栏 tab=tags 接入)。
    // 用 EXISTS 子查询命中 article_tags, 多 tagId 走 AND(文章必须同时具备所有 tag)。
    if (filter.tagIds && filter.tagIds.length > 0) {
      const placeholders = filter.tagIds.map(() => '?').join(',');
      // 每个 tagId 都要求至少存在一条 article_tags 记录
      // 为 AND 语义, 多个 tagId 时用 EXISTS 累加(每条必须命中)
      for (const tagId of filter.tagIds) {
        conditions.push(
          `EXISTS (SELECT 1 FROM article_tags WHERE article_tags.article_id = articles.id AND article_tags.tag_id = ?)`
        );
        params.push(tagId);
      }
      // 占位 use placeholders 避免 unused var lint
      void placeholders;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 搜索模式：全量查询所有匹配文章，JS 端打分排序，返回 top N
    if (filter.search) {
      const searchLimit = filter.limit || 50;
      const allRows = db.exec(
        `SELECT ${ARTICLE_SELECT} FROM articles ${where}
         ORDER BY published_at DESC`,
        params
      );
      const allItems: Article[] = allRows.length > 0
        ? allRows[0].values.map(row => rowToArticle(allRows[0].columns, row))
        : [];

      if (allItems.length === 0) return { items: [], total: 0 };

      const searchLower = filter.search.toLowerCase();
      const scored = allItems.map(article => ({
        article,
        score: computeSearchScore(article, searchLower)
      }));
      scored.sort(compareScored);

      const topItems = scored.slice(0, searchLimit).map(s => s.article);
      return { items: topItems, total: allItems.length };
    }

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
   * 使用 INSERT OR IGNORE 基于 feed_id + guid 唯一索引去重：
   * 同一 Feed 内 guid 冲突的旧文章保留，新文章跳过。
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

    db.run('BEGIN TRANSACTION');
    try {
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
        inserted += db.getRowsModified();
      }
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
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
   * Phase 3.5.3：回写摘要到 articles 表，使缓存持久化。
   */
  updateSummary(id: string, content: string): void {
    const db = getDatabase();
    const ts = now();
    db.run('UPDATE articles SET summary = ?, updated_at = ? WHERE id = ?', [content, ts, id]);
    saveDatabase();
  },

  /**
   * Phase 3.5.3：回写翻译到 articles 表，使缓存持久化。
   */
  updateTranslation(id: string, paragraphs: TranslatedParagraph[]): void {
    const db = getDatabase();
    const ts = now();
    db.run('UPDATE articles SET translated_paragraphs = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(paragraphs), ts, id]);
    saveDatabase();
  },

  /**
   * Phase 3.6.3：获取所有文章总数（含已读/未读）。
   */
  countAll(): number {
    const db = getDatabase();
    const rows = db.exec('SELECT COUNT(*) AS cnt FROM articles');
    return rows.length > 0 ? (rows[0].values[0][0] as number) : 0;
  },

  /**
   * Phase 3.6.3：获取所有未读文章数。
   */
  countUnread(): number {
    const db = getDatabase();
    const rows = db.exec('SELECT COUNT(*) AS cnt FROM articles WHERE is_read = 0');
    return rows.length > 0 ? (rows[0].values[0][0] as number) : 0;
  },

  /**
   * Phase 3.6.3：获取所有星标文章数（含已读/未读）。
   */
  countStarred(): number {
    const db = getDatabase();
    const rows = db.exec('SELECT COUNT(*) AS cnt FROM articles WHERE is_starred = 1');
    return rows.length > 0 ? (rows[0].values[0][0] as number) : 0;
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
  },

  /**
   * Phase 3.5.x：侧栏 tab=tags 用。统计每个 tag 关联的文章数。
   * 返回 Record<tagId, count>。tags 表里没有出现在 article_tags 的 tag 不会出现在结果里,
   * 调用方需要在聚合后填 0 以保持 tag 列表完整。
   */
  countByTag(): Record<string, number> {
    const db = getDatabase();
    const rows = db.exec(`
      SELECT at.tag_id AS tagId, COUNT(DISTINCT at.article_id) AS cnt
      FROM article_tags at
      GROUP BY at.tag_id
    `);
    const result: Record<string, number> = {};
    if (rows.length) {
      for (const row of rows[0].values) {
        result[row[0] as string] = row[1] as number;
      }
    }
    return result;
  }
};

// ============================================================
// 内部辅助
// ============================================================

// ============================================================
// 搜索相关性评分（Phase 3.4.3）
// ============================================================

/** 标题命中权重 */
const SCORE_TITLE_HIT = 10;
/** 正文命中权重 */
const SCORE_BODY_HIT = 1;
/** 标题完全一致额外加分 */
const SCORE_TITLE_EXACT = 100;

/**
 * 按相关性得分 + 发布时间排序的比较器。
 * 得分高排前，同分时越新排越前。
 */
function compareScored(
  a: { article: Article; score: number },
  b: { article: Article; score: number }
): number {
  if (b.score !== a.score) return b.score - a.score;
  const aTime = a.article.publishedAt ? new Date(a.article.publishedAt).getTime() : 0;
  const bTime = b.article.publishedAt ? new Date(b.article.publishedAt).getTime() : 0;
  return bTime - aTime;
}

/** 统计 needle 在 haystack 中出现的次数（不区分大小写） */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/** 根据文章 title / raw_text / cleaned_markdown 与搜索词的匹配程度计算相关性得分 */
function computeSearchScore(article: Article, searchLower: string): number {
  let score = 0;
  const title = (article.title ?? '').toLowerCase();
  const body = ((article.rawText ?? '') + ' ' + (article.cleanedMarkdown ?? '')).toLowerCase();

  // 标题完全一致
  if (title === searchLower) score += SCORE_TITLE_EXACT;
  // 标题命中
  score += countOccurrences(title, searchLower) * SCORE_TITLE_HIT;
  // 正文命中
  score += countOccurrences(body, searchLower) * SCORE_BODY_HIT;

  return score;
}

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
