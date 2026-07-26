/**
 * TagRepository — 标签数据访问层
 * Task 3.3: Database and AI Services
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { Tag, TagCreateInput, TagUpdateInput } from '../../../shared/types';
import { buildTaggedArticleTitle } from './article-title-tags';

/** 为单篇文章重建标题中的标签标记前缀，写入 articles 表。
 *  skipSave: 批量操作时设为 true，由调用方统一 saveDatabase()。 */
function rebuildArticleTitleTags(articleId: string, skipSave = false): void {
  const db = getDatabase();

  // 获取当前标题；buildTaggedArticleTitle 会先剥离旧前缀。
  const titleRows = db.exec('SELECT title FROM articles WHERE id = ?', [articleId]);
  if (!titleRows.length || !titleRows[0].values.length) return;
  const currentTitle = titleRows[0].values[0][0] as string;

  // 获取当前文章所有标签（读取内存中的最新状态）
  const tags = TagRepository.getByArticle(articleId);
  db.run(
    'UPDATE articles SET title = ? WHERE id = ?',
    [buildTaggedArticleTitle(currentTitle, tags), articleId]
  );
  if (!skipSave) saveDatabase();
}

function now(): string {
  return new Date().toISOString();
}

function articleIdsForTag(tagId: string): string[] {
  const rows = getDatabase().exec(
    'SELECT article_id FROM article_tags WHERE tag_id = ?',
    [tagId]
  );
  if (!rows.length) return [];
  return rows[0].values.map((row) => row[0] as string);
}

function runTransaction<T>(action: () => T): T {
  const db = getDatabase();
  db.run('BEGIN TRANSACTION');
  let result: T;
  try {
    result = action();
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  saveDatabase();
  return result;
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
    const affectedArticleIds = articleIdsForTag(id);
    return runTransaction(() => {
      db.run(
        'UPDATE tags SET name=?, color=?, updated_at=? WHERE id=?',
        [name, color, timestamp, id]
      );
      for (const articleId of affectedArticleIds) {
        rebuildArticleTitleTags(articleId, true);
      }
      return this.getById(id);
    });
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return false;
    const affectedArticleIds = articleIdsForTag(id);
    return runTransaction(() => {
      db.run('DELETE FROM article_tags WHERE tag_id = ?', [id]);
      db.run('DELETE FROM tags WHERE id = ?', [id]);
      for (const articleId of affectedArticleIds) {
        rebuildArticleTitleTags(articleId, true);
      }
      return true;
    });
  },

  /** 为文章添加标签（幂等） */
  addToArticle(articleId: string, tagId: string): void {
    const db = getDatabase();
    runTransaction(() => {
      db.run(
        'INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)',
        [articleId, tagId]
      );
      rebuildArticleTitleTags(articleId, true);
    });
  },

  /** 为文章移除标签 */
  removeFromArticle(articleId: string, tagId: string): void {
    const db = getDatabase();
    runTransaction(() => {
      db.run(
        'DELETE FROM article_tags WHERE article_id = ? AND tag_id = ?',
        [articleId, tagId]
      );
      rebuildArticleTitleTags(articleId, true);
    });
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
    runTransaction(() => {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)'
      );
      try {
        for (const articleId of articleIds) {
          for (const tagId of tagIds) {
            stmt.run([articleId, tagId]);
          }
        }
      } finally {
        stmt.free();
      }
      for (const articleId of articleIds) {
        rebuildArticleTitleTags(articleId, true);
      }
    });
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
