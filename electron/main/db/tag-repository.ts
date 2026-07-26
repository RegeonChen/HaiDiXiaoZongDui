/**
 * TagRepository — 标签数据访问层
 * Task 3.3: Database and AI Services
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { Tag, TagCreateInput, TagUpdateInput } from '../../../shared/types';

/** 标签嵌入标题的前缀标记格式：`[tag:标签名|颜色hex] ` */
const TAG_TITLE_MARKER_RE = /\[tag:[^\]]+\]\s*/g;

/** 为单篇文章重建标题中的标签标记前缀，写入 articles 表。
 *  skipSave: 批量操作时设为 true，由调用方统一 saveDatabase()。 */
function rebuildArticleTitleTags(articleId: string, skipSave = false): void {
  const db = getDatabase();

  // 获取干净标题（不含任何 tag 标记）
  const titleRows = db.exec('SELECT title FROM articles WHERE id = ?', [articleId]);
  if (!titleRows.length || !titleRows[0].values.length) return;
  const rawTitle = titleRows[0].values[0][0] as string;
  const cleanTitle = rawTitle.replace(TAG_TITLE_MARKER_RE, '').trim();

  // 获取当前文章所有标签（读取内存中的最新状态）
  const tags = TagRepository.getByArticle(articleId);
  if (tags.length === 0) {
    db.run('UPDATE articles SET title = ? WHERE id = ?', [cleanTitle, articleId]);
  } else {
    const prefix = tags
      .map((t) => `[tag:${t.name}|${t.color ?? 'inherit'}]`)
      .join(' ') + ' ';
    db.run('UPDATE articles SET title = ? WHERE id = ?', [prefix + cleanTitle, articleId]);
  }
  if (!skipSave) saveDatabase();
}

function now(): string {
  return new Date().toISOString();
}

export const TagRepository = {
  list(): Tag[] {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM tags ORDER BY name ASC');
    if (rows.length === 0 || !rows[0].values.length) return [];
    return rows[0].values.map((row) => rowToTag(rows[0].columns, row));
  },

  getById(id: string): Tag | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM tags WHERE id = ?', [id]);
    if (rows.length === 0 || !rows[0].values.length) return null;
    return rowToTag(rows[0].columns, rows[0].values[0]);
  },

  getByName(name: string): Tag | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM tags WHERE name = ?', [name]);
    if (rows.length === 0 || !rows[0].values.length) return null;
    return rowToTag(rows[0].columns, rows[0].values[0]);
  },

  create(input: TagCreateInput): Tag {
    const db = getDatabase();
    const existing = this.getByName(input.name);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const timestamp = now();
    db.run(
      'INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, input.name, input.color ?? null, timestamp, timestamp]
    );
    saveDatabase();
    return this.getById(id)!;
  },

  update(id: string, input: TagUpdateInput): Tag | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const name = input.name ?? existing.name;
    const color = input.color !== undefined ? input.color : existing.color;
    const timestamp = now();
    db.run(
      'UPDATE tags SET name=?, color=?, updated_at=? WHERE id=?',
      [name, color, timestamp, id]
    );
    saveDatabase();
    return this.getById(id);
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return false;
    // 先收集受影响的文章 ID，再删除关联
    const affectedRows = db.exec('SELECT article_id FROM article_tags WHERE tag_id = ?', [id]);
    const affectedArticleIds: string[] = [];
    if (affectedRows.length && affectedRows[0].values.length) {
      for (const row of affectedRows[0].values) {
        affectedArticleIds.push(row[0] as string);
      }
    }
    db.run('DELETE FROM article_tags WHERE tag_id = ?', [id]);
    db.run('DELETE FROM tags WHERE id = ?', [id]);
    // Phase 4.1.3：标签删除后同步回写受影响文章的标题，最后统一 saveDatabase
    for (const articleId of affectedArticleIds) {
      rebuildArticleTitleTags(articleId, true);
    }
    saveDatabase();
    return true;
  },

  /** 为文章添加标签（幂等） */
  addToArticle(articleId: string, tagId: string): void {
    const db = getDatabase();
    db.run('INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)', [articleId, tagId]);
    // Phase 4.1.3：标签增删后同步回写文章标题（内部统一 saveDatabase）
    rebuildArticleTitleTags(articleId);
  },

  /** 为文章移除标签 */
  removeFromArticle(articleId: string, tagId: string): void {
    const db = getDatabase();
    db.run('DELETE FROM article_tags WHERE article_id = ? AND tag_id = ?', [articleId, tagId]);
    // Phase 4.1.3：标签增删后同步回写文章标题（内部统一 saveDatabase）
    rebuildArticleTitleTags(articleId);
  },

  /** 获取文章的标签列表 */
  getByArticle(articleId: string): Tag[] {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT t.* FROM tags t INNER JOIN article_tags at ON t.id = at.tag_id WHERE at.article_id = ? ORDER BY t.name`,
      [articleId]
    );
    if (rows.length === 0 || !rows[0].values.length) return [];
    return rows[0].values.map((row) => rowToTag(rows[0].columns, row));
  },

  /** 批量为文章添加标签 */
  batchAdd(articleIds: string[], tagIds: string[]): void {
    const db = getDatabase();
    const stmt = db.prepare('INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)');
    for (const articleId of articleIds) {
      for (const tagId of tagIds) {
        stmt.run([articleId, tagId]);
      }
    }
    stmt.free();
    // Phase 4.1.3：批量重建所有文章标题，最后统一 saveDatabase
    for (const articleId of articleIds) {
      rebuildArticleTitleTags(articleId, true);
    }
    saveDatabase();
  }
};

function rowToTag(columns: string[], row: unknown[]): Tag {
  const o: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }
  return {
    id: o.id as string,
    name: o.name as string,
    color: (o.color as string) ?? null,
    createdAt: o.created_at as string,
    updatedAt: o.updated_at as string
  };
}
