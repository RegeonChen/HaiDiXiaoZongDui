/**
 * NotesPage — 笔记管理
 *
 *  - 顶部：选文章下拉（来自 ds.articles({})）
 *  - 选中后：列出该 article 的 notes（ds.noteListByArticle）
 *  - 添加：textarea 写 markdown 内容 → ds.noteCreate
 *  - 删除：ds.noteDelete
 *
 * Phase 3 落地：单文章粒度；Phase 4 接入后可以从任意文章跳转。
 */
import { useCallback, useEffect, useState } from 'react';
import type { Article, Note, NoteCreateInput } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import './NotesPage.css';

export interface NotesPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function NotesPage({ onToast }: NotesPageProps) {
  const ds = useDataSource();
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string>('');
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newMarkdown, setNewMarkdown] = useState('');

  // 拉全部文章
  useEffect(() => {
    void (async () => {
      const r = await ds.articles({});
      if (r.kind === 'ready') {
        setArticles(r.data);
        setArticlesError(null);
        if (r.data.length > 0 && !selectedArticleId) {
          setSelectedArticleId(r.data[0].id);
        }
      } else {
        setArticlesError(r.kind === 'error' ? r.error : '加载文章失败');
      }
    })();
  }, [ds, selectedArticleId]);

  // 拉选中文章的笔记
  const loadNotes = useCallback(async () => {
    if (!selectedArticleId) {
      setNotes([]);
      return;
    }
    setNotes(null);
    const r = await ds.noteListByArticle(selectedArticleId);
    if (r.kind === 'ready') {
      setNotes(r.data);
      setNotesError(null);
    } else {
      setNotesError(r.kind === 'error' ? r.error : '加载笔记失败');
    }
  }, [ds, selectedArticleId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedArticleId || !newMarkdown.trim()) return;
      const input: NoteCreateInput = {
        articleId: selectedArticleId,
        markdownContent: newMarkdown.trim()
      };
      const r = await ds.noteCreate(input);
      if (r.kind === 'ready') {
        onToast('笔记已添加', 'success');
        setNewMarkdown('');
        void loadNotes();
      } else {
        onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, selectedArticleId, newMarkdown, loadNotes, onToast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('确定要删除这条笔记？')) return;
      try {
        await ds.noteDelete(id);
        onToast('已删除', 'success');
        void loadNotes();
      } catch (err) {
        onToast(`删除失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [ds, loadNotes, onToast]
  );

  if (articlesError) return <ErrorView message={articlesError} onRetry={() => void loadNotes()} />;
  if (articles === null) return <LoadingView message="正在加载文章…" />;

  return (
    <div className="notes-page">
      <h1 className="notes-page__title">笔记</h1>

      <div className="notes-page__picker">
        <label className="notes-page__label">选择文章</label>
        <select
          className="notes-page__select"
          value={selectedArticleId}
          onChange={(e) => setSelectedArticleId(e.target.value)}
        >
          {articles.length === 0 && <option value="">（暂无文章）</option>}
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </div>

      {selectedArticleId && (
        <form className="notes-page__form" onSubmit={handleAdd}>
          <textarea
            className="notes-page__textarea"
            value={newMarkdown}
            onChange={(e) => setNewMarkdown(e.target.value)}
            placeholder="Markdown 笔记（支持 GFM：标题、代码块、列表等）"
            rows={4}
          />
          <button type="submit" className="notes-page__btn notes-page__btn--primary" disabled={!newMarkdown.trim()}>
            添加笔记
          </button>
        </form>
      )}

      {notesError ? (
        <ErrorView message={notesError} onRetry={loadNotes} />
      ) : notes === null ? (
        <LoadingView message="正在加载笔记…" />
      ) : notes.length === 0 ? (
        <p className="notes-page__empty">{selectedArticleId ? '该文章还没有笔记。' : '请先选择一篇文章。'}</p>
      ) : (
        <ul className="notes-page__list">
          {notes.map((n) => (
            <li key={n.id} className="notes-page__item">
              <pre className="notes-page__content">{n.markdownContent}</pre>
              <div className="notes-page__meta">
                <span>{new Date(n.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <button
                  type="button"
                  className="notes-page__btn notes-page__btn--danger"
                  onClick={() => void handleDelete(n.id)}
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
