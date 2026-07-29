/**
 * DigestsPage — 文摘管理
 *
 *  - 列全部 digest（ds.digestList）
 *  - 新建：name + 从现有笔记中勾选
 *  - 导出：选 markdown/html/pdf，调 ds.digestExport
 *  - 删除：ds.digestDelete
 */
import { useCallback, useEffect, useState } from 'react';
import type { Digest, ExportFormat, Note } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import { EmptyView } from '../../components/StatusView/EmptyView';
import './DigestsPage.css';

export interface DigestsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

interface DigestNoteOption {
  note: Note;
  articleTitle: string;
}

export function DigestsPage({ onToast }: DigestsPageProps) {
  const ds = useDataSource();
  const [digests, setDigests] = useState<Digest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [noteOptions, setNoteOptions] = useState<DigestNoteOption[] | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [digestResult, articleResult] = await Promise.all([
      ds.digestList(),
      ds.articles({ limit: 200 })
    ]);
    if (digestResult.kind === 'ready') {
      setDigests(digestResult.data);
      setError(null);
    } else {
      setError(digestResult.kind === 'error' ? digestResult.error : '加载失败');
    }

    if (articleResult.kind === 'ready') {
      const noteResults = await Promise.all(
        articleResult.data.map(async (article) => ({
          article,
          result: await ds.noteListByArticle(article.id)
        }))
      );
      const options = noteResults.flatMap(({ article, result }) =>
        result.kind === 'ready'
          ? result.data.map((note) => ({ note, articleTitle: article.title }))
          : []
      );
      options.sort((a, b) => Date.parse(b.note.updatedAt) - Date.parse(a.note.updatedAt));
      setNoteOptions(options);
    } else {
      setNoteOptions([]);
    }
  }, [ds]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim()) return;
      const noteIds = Array.from(selectedNoteIds);
      if (noteIds.length === 0) {
        onToast('请至少选择一条笔记', 'error');
        return;
      }
      const r = await ds.digestCreate({ name: newName.trim(), noteIds });
      if (r.kind === 'ready') {
        onToast(`文摘「${newName.trim()}」已创建`, 'success');
        setNewName('');
        setSelectedNoteIds(new Set());
        void load();
      } else {
        onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, newName, selectedNoteIds, load, onToast]
  );

  const toggleNote = useCallback((noteId: string) => {
    setSelectedNoteIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }, []);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`确定要删除文摘「${name}」？`)) return;
      try {
        await ds.digestDelete(id);
        onToast('已删除', 'success');
        void load();
      } catch (err) {
        onToast(`删除失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [ds, load, onToast]
  );

  const handleExport = useCallback(
    async (id: string, format: ExportFormat) => {
      onToast(`正在导出 ${format.toUpperCase()}…`, 'info');
      const r = await ds.digestExport(id, format);
      if (r.kind === 'ready') {
        onToast(`已导出到 ${r.data}`, 'success');
      } else {
        onToast(`导出失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, onToast]
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (digests === null) return <LoadingView message="正在加载文摘…" />;

  return (
    <div className="digests-page">
      <h1 className="digests-page__title">文摘</h1>

      <form className="digests-page__form" onSubmit={handleCreate}>
        <input
          className="digests-page__input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="文摘名称（必填）"
          required
        />
        <div className="digests-page__note-picker">
          <div className="digests-page__note-picker-head">
            <strong>选择笔记</strong>
            <span>{selectedNoteIds.size} 条已选择</span>
          </div>
          {noteOptions === null ? (
            <p className="digests-page__note-empty">正在加载笔记…</p>
          ) : noteOptions.length === 0 ? (
            <p className="digests-page__note-empty">还没有可用笔记。先在文章阅读页添加笔记。</p>
          ) : (
            <div className="digests-page__note-list">
              {noteOptions.map(({ note, articleTitle }) => (
                <label key={note.id} className="digests-page__note-option">
                  <input
                    type="checkbox"
                    checked={selectedNoteIds.has(note.id)}
                    onChange={() => toggleNote(note.id)}
                  />
                  <span>
                    <strong>{note.markdownContent.slice(0, 90) || '空笔记'}</strong>
                    <small>{articleTitle}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="digests-page__form-actions">
          <button
            type="submit"
            className="digests-page__btn digests-page__btn--primary"
            disabled={selectedNoteIds.size === 0}
          >
            + 新建文摘
          </button>
        </div>
      </form>

      {digests.length === 0 ? (
        <EmptyView
          className="digests-page__empty"
          title="还没有文摘"
          hint="从上方选择笔记并创建文摘。"
        />
      ) : (
        <ul className="digests-page__list">
          {digests.map((d) => (
            <li key={d.id} className="digests-page__item">
              <div className="digests-page__info">
                <strong className="digests-page__name">{d.name}</strong>
                <span className="digests-page__meta">
                  {d.noteIds.length} 条笔记 · {new Date(d.updatedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="digests-page__actions">
                <button
                  type="button"
                  className="digests-page__btn"
                  onClick={() => void handleExport(d.id, 'markdown')}
                >
                  导出 Markdown
                </button>
                <button
                  type="button"
                  className="digests-page__btn"
                  onClick={() => void handleExport(d.id, 'html')}
                >
                  导出 HTML
                </button>
                <button
                  type="button"
                  className="digests-page__btn digests-page__btn--danger"
                  onClick={() => void handleDelete(d.id, d.name)}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
