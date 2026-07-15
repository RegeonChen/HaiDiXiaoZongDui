/**
 * TagRepository — 标签数据访问层
 * Task 3.3: Database and AI Services
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { Tag, TagCreateInput, TagUpdateInput } from '../../../shared/types';

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
    db.run('DELETE FROM article_tags WHERE tag_id = ?', [id]);
    db.run('DELETE FROM tags WHERE id = ?', [id]);
    saveDatabase();
    return true;
  },

  /** 为文章添加标签（幂等） */
  addToArticle(articleId: string, tagId: string): void {
    const db = getDatabase();
    db.run('INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)', [articleId, tagId]);
    saveDatabase();
  },

  /** 为文章移除标签 */
  removeFromArticle(articleId: string, tagId: string): void {
    const db = getDatabase();
    db.run('DELETE FROM article_tags WHERE article_id = ? AND tag_id = ?', [articleId, tagId]);
    saveDatabase();
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
