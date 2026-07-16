/**
 * DigestRepository — 文摘数据访问层
 * Task 3.3: Database and AI Services
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import type { Digest, DigestCreateInput, ExportFormat, Note } from '../../../shared/types';
import { NoteRepository } from './note-repository';

function now(): string {
  return new Date().toISOString();
}

export const DigestRepository = {
  list(): Digest[] {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM digests ORDER BY updated_at DESC');
    if (rows.length === 0 || !rows[0].values.length) return [];
    return rows[0].values.map((row) => rowToDigest(rows[0].columns, row));
  },

  getById(id: string): Digest | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM digests WHERE id = ?', [id]);
    if (rows.length === 0 || !rows[0].values.length) return null;
    return rowToDigest(rows[0].columns, rows[0].values[0]);
  },

  create(input: DigestCreateInput): Digest {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const timestamp = now();
    db.run(
      'INSERT INTO digests (id, name, note_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, input.name, JSON.stringify(input.noteIds), timestamp, timestamp]
    );
    saveDatabase();
    return this.getById(id)!;
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return false;
    db.run('DELETE FROM digests WHERE id = ?', [id]);
    saveDatabase();
    return true;
  },

  /**
   * 导出文摘为 Markdown / HTML / PDF 格式文本。
   * PDF 返回包含内联样式的 HTML（由前端通过 print PDF 完成）。
   */
  exportDigest(id: string, format: ExportFormat): string | null {
    const digest = this.getById(id);
    if (!digest) return null;

    const notes: Note[] = [];
    for (const noteId of digest.noteIds) {
      const note = NoteRepository.getById(noteId);
      if (note) notes.push(note);
    }

    if (format === 'markdown') {
      return buildMarkdownExport(digest, notes);
    }
    // html / pdf 均输出 HTML
    return buildHtmlExport(digest, notes);
  }
};

// ============================================================
// 导出构造
// ============================================================

function buildMarkdownExport(digest: Digest, notes: Note[]): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: "${digest.name}"`);
  lines.push(`date: "${digest.createdAt}"`);
  lines.push(`notes_count: ${notes.length}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${digest.name}`);
  lines.push('');

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    lines.push(`## ${i + 1}.`);
    if (note.excerptText) {
      lines.push('> ' + note.excerptText.split('\n').join('\n> '));
      lines.push('');
    }
    lines.push(note.markdownContent);
    lines.push('');
  }

  return lines.join('\n');
}

function buildHtmlExport(digest: Digest, notes: Note[]): string {
  const htmlNotes = notes
    .map((note, i) => {
      let block = `<h2>${i + 1}.</h2>`;
      if (note.excerptText) {
        block += `<blockquote>${escapeHtml(note.excerptText)}</blockquote>`;
      }
      // 先转义 HTML 防止注入，再做简易 Markdown → HTML 转换
      let mdContent = escapeHtml(note.markdownContent);
      mdContent = mdContent
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
      block += `<p>${mdContent}</p>`;
      return block;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(digest.name)}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2em; line-height: 1.6; }
h1 { border-bottom: 2px solid #333; padding-bottom: 0.5em; }
blockquote { border-left: 4px solid #ccc; padding-left: 1em; color: #555; margin: 1em 0; }
code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
</style>
</head>
<body>
<h1>${escapeHtml(digest.name)}</h1>
${htmlNotes}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowToDigest(columns: string[], row: unknown[]): Digest {
  const o: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }
  let noteIds: string[] = [];
  try {
    noteIds = JSON.parse(o.note_ids as string) as string[];
  } catch { /* keep empty */ }
  return {
    id: o.id as string,
    name: o.name as string,
    noteIds,
    createdAt: o.created_at as string,
    updatedAt: o.updated_at as string
  };
}
