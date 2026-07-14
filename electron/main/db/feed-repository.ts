/**
 * FeedRepository — 订阅源数据访问层
 * Task 2.3: Local Database
 *
 * 职责：
 *  - feeds 表的 CRUD 操作
 *  - url 去重（忽略末尾 / 和 www. 前缀差异）
 *  - 返回 typed/shared 中的 Feed 类型
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { Feed, FeedCreateInput, FeedUpdateInput, IsoTimestamp } from '../../../shared/types';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 规范化 URL 用于查重比较：
 * - 转小写
 * - 去掉协议前缀 www.
 * - 去掉末尾 /
 */
function normalizeUrl(url: string): string {
  let u = url.toLowerCase().trim();
  u = u.replace(/^https?:\/\/www\./, 'https://');
  u = u.replace(/\/$/, '');
  return u;
}

/**
 * 生成 ISO 8601 UTC 时间戳。
 */
function now(): IsoTimestamp {
  return new Date().toISOString();
}

/**
 * 生成唯一 ID。
 */
function uid(): string {
  return crypto.randomUUID();
}

// ============================================================
// FeedRepository
// ============================================================

export const FeedRepository = {
  /**
   * 列出所有订阅源。
   */
  list(): Feed[] {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT id, title, url, site_title AS siteTitle, description, link,
              feed_type AS feedType, group_name AS groupName, icon_url AS iconUrl,
              last_sync_at AS lastSyncAt, last_sync_success AS lastSyncSuccess,
              last_sync_error AS lastSyncError, sync_interval_min AS syncIntervalMin,
              created_at AS createdAt, updated_at AS updatedAt
       FROM feeds
       ORDER BY title ASC`
    );

    if (!rows.length) return [];

    return rows[0].values.map(row => rowToFeed(rows[0].columns, row));
  },

  /**
   * 按 ID 获取单个订阅源。
   */
  getById(id: string): Feed | null {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT id, title, url, site_title AS siteTitle, description, link,
              feed_type AS feedType, group_name AS groupName, icon_url AS iconUrl,
              last_sync_at AS lastSyncAt, last_sync_success AS lastSyncSuccess,
              last_sync_error AS lastSyncError, sync_interval_min AS syncIntervalMin,
              created_at AS createdAt, updated_at AS updatedAt
       FROM feeds WHERE id = ?`,
      [id]
    );

    if (!rows.length || !rows[0].values.length) return null;
    return rowToFeed(rows[0].columns, rows[0].values[0]);
  },

  /**
   * 查找与给定 URL 去重后匹配的 Feed（已存在的订阅源）。
   * 返回 null 表示该 URL 无重复，可以新建。
   */
  findByUrl(url: string): Feed | null {
    const norm = normalizeUrl(url);
    const all = FeedRepository.list();
    for (const f of all) {
      if (normalizeUrl(f.url) === norm) return f;
    }
    return null;
  },

  /**
   * 创建新订阅源。
   * 返回创建的 Feed。若 url 重复则返回已存在的 Feed（幂等）。
   */
  create(input: FeedCreateInput): Feed {
    // 检查重复
    const existing = FeedRepository.findByUrl(input.url);
    if (existing) return existing;

    const ts = now();
    const feed: Feed = {
      id: uid(),
      title: input.title || '',
      url: input.url,
      siteTitle: '',
      description: '',
      link: '',
      feedType: 'rss',
      groupName: input.groupName ?? null,
      iconUrl: null,
      lastSyncAt: null,
      lastSyncSuccess: false,
      lastSyncError: null,
      syncIntervalMin: input.syncIntervalMin ?? null,
      createdAt: ts,
      updatedAt: ts
    };

    const db = getDatabase();
    db.run(
      `INSERT INTO feeds (id, title, url, site_title, description, link, feed_type,
                          group_name, icon_url, last_sync_at, last_sync_success,
                          last_sync_error, sync_interval_min, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feed.id, feed.title, feed.url, feed.siteTitle, feed.description, feed.link,
        feed.feedType, feed.groupName, feed.iconUrl, feed.lastSyncAt,
        feed.lastSyncSuccess ? 1 : 0, feed.lastSyncError, feed.syncIntervalMin,
        feed.createdAt, feed.updatedAt
      ]
    );

    saveDatabase();
    return feed;
  },

  /**
   * 更新订阅源的部分字段。
   */
  update(id: string, input: FeedUpdateInput): Feed | null {
    const existing = FeedRepository.getById(id);
    if (!existing) return null;

    const ts = now();

    if (input.title !== undefined) existing.title = input.title;
    if (input.groupName !== undefined) existing.groupName = input.groupName;
    if (input.syncIntervalMin !== undefined) existing.syncIntervalMin = input.syncIntervalMin;
    existing.updatedAt = ts;

    const db = getDatabase();
    db.run(
      `UPDATE feeds SET title = ?, group_name = ?, sync_interval_min = ?, updated_at = ?
       WHERE id = ?`,
      [existing.title, existing.groupName, existing.syncIntervalMin, ts, id]
    );

    saveDatabase();
    return existing;
  },

  /**
   * 更新同步结果到 feeds 表。
   */
  recordSync(feedId: string, success: boolean, error: string | null): void {
    const ts = now();
    const db = getDatabase();
    db.run(
      `UPDATE feeds SET last_sync_at = ?, last_sync_success = ?, last_sync_error = ?, updated_at = ?
       WHERE id = ?`,
      [ts, success ? 1 : 0, error, ts, feedId]
    );
    saveDatabase();
  },

  /**
   * 删除订阅源（级联删除其文章）。
   */
  delete(id: string): boolean {
    const db = getDatabase();
    db.run('DELETE FROM articles WHERE feed_id = ?', [id]);
    db.run('DELETE FROM feeds WHERE id = ?', [id]);
    saveDatabase();
    return true;
  }
};

// ============================================================
// 内部辅助
// ============================================================

function rowToFeed(columns: string[], row: unknown[]): Feed {
  const o: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }
  return {
    id: o.id as string,
    title: o.title as string,
    url: o.url as string,
    siteTitle: o.siteTitle as string,
    description: o.description as string,
    link: o.link as string,
    feedType: o.feedType as Feed['feedType'],
    groupName: (o.groupName ?? null) as string | null,
    iconUrl: (o.iconUrl ?? null) as string | null,
    lastSyncAt: (o.lastSyncAt ?? null) as IsoTimestamp | null,
    lastSyncSuccess: !!(o.lastSyncSuccess ?? 0),
    lastSyncError: (o.lastSyncError ?? null) as string | null,
    syncIntervalMin: (o.syncIntervalMin ?? null) as number | null,
    createdAt: o.createdAt as IsoTimestamp,
    updatedAt: o.updatedAt as IsoTimestamp
  };
}
