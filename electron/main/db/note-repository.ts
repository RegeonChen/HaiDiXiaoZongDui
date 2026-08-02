/**
 * NoteRepository — 笔记/摘录数据访问层
 * Task 3.3: Database and AI Services
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { Note, NoteCreateInput, NoteUpdateInput } from '../../../shared/types';

function now(): string {
  return new Date().toISOString();
}

export const NoteRepository = {
  listByArticle(articleId: string): Note[] {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM notes WHERE article_id = ? ORDER BY created_at ASC', [articleId]);
    if (rows.length === 0 || !rows[0].values.length) return [];
    return rows[0].values.map((row) => rowToNote(rows[0].columns, row));
  },

  getById(id: string): Note | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM notes WHERE id = ?', [id]);
    if (rows.length === 0 || !rows[0].values.length) return null;
    return rowToNote(rows[0].columns, rows[0].values[0]);
  },

  create(input: NoteCreateInput): Note {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const timestamp = now();
    db.run(
      `INSERT INTO notes (id, article_id, excerpt_text, excerpt_offset, markdown_content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.articleId, input.excerptText ?? null, input.excerptOffset ?? null, input.markdownContent, timestamp, timestamp]
    );
    saveDatabase();
    return this.getById(id)!;
  },

  update(id: string, input: NoteUpdateInput): Note | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const content = input.markdownContent ?? existing.markdownContent;
    const timestamp = now();
    db.run('UPDATE notes SET markdown_content=?, updated_at=? WHERE id=?', [content, timestamp, id]);
    saveDatabase();
    return this.getById(id);
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return false;
    db.run('DELETE FROM notes WHERE id = ?', [id]);
    saveDatabase();
    return true;
  }
};

function rowToNote(columns: string[], row: unknown[]): Note {
  const o: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }
  return {
    id: o.id as string,
    articleId: o.article_id as string,
    excerptText: (o.excerpt_text as string) ?? null,
    excerptOffset: (o.excerpt_offset as number) ?? null,
    markdownContent: (o.markdown_content as string) ?? '',
    createdAt: o.created_at as string,
    updatedAt: o.updated_at as string
  };
}
