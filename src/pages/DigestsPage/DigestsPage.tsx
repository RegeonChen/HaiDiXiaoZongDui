/**
 * DigestsPage — 文摘管理
 *
 *  - 列全部 digest（ds.digestList）
 *  - 新建：name + 从 NotesPage 选 noteIds（这里简化为手动输入 noteId，多个用逗号）
 *  - 导出：选 markdown/html/pdf，调 ds.digestExport
 *  - 删除：ds.digestDelete
 */
import { useCallback, useEffect, useState } from 'react';
import type { Digest, ExportFormat } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import './DigestsPage.css';

export interface DigestsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function DigestsPage({ onToast }: DigestsPageProps) {
  const ds = useDataSource();
  const [digests, setDigests] = useState<Digest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNoteIds, setNewNoteIds] = useState('');

  const load = useCallback(async () => {
    const r = await ds.digestList();
    if (r.kind === 'ready') {
      setDigests(r.data);
      setError(null);
    } else {
      setError(r.kind === 'error' ? r.error : '加载失败');
    }
  }, [ds]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim()) return;
      const noteIds = newNoteIds
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (noteIds.length === 0) {
        onToast('请至少填一个笔记 ID', 'error');
        return;
      }
      const r = await ds.digestCreate({ name: newName.trim(), noteIds });
      if (r.kind === 'ready') {
        onToast(`文摘「${newName.trim()}」已创建`, 'success');
        setNewName('');
        setNewNoteIds('');
        void load();
      } else {
        onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, newName, newNoteIds, load, onToast]
  );

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
        <input
          className="digests-page__input"
          value={newNoteIds}
          onChange={(e) => setNewNoteIds(e.target.value)}
          placeholder="笔记 ID 列表（逗号或空格分隔，暂需手动从数据库/NotesPage 获取）"
        />
        <button type="submit" className="digests-page__btn digests-page__btn--primary">
          + 新建文摘
        </button>
      </form>

      {digests.length === 0 ? (
        <p className="digests-page__empty">还没有文摘。创建一个开始聚合你的笔记。</p>
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
