/**
 * TagsPage — 标签管理
 *
 *  - 列出全部 tag（ds.tagList）
 *  - 新建：name 输入 + 颜色（可选）
 *  - 删除：调 ds.tagDelete
 *
 * 把 tag 关联到具体文章是在 ArticleReader 里完成（Phase 3 后续）。
 */
import { useCallback, useEffect, useState } from 'react';
import type { Tag, TagCreateInput } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import './TagsPage.css';

export interface TagsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function TagsPage({ onToast }: TagsPageProps) {
  const ds = useDataSource();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');

  const load = useCallback(async () => {
    const r = await ds.tagList();
    if (r.kind === 'ready') {
      setTags(r.data);
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
      const input: TagCreateInput = { name: newName.trim(), color: newColor };
      const r = await ds.tagCreate(input);
      if (r.kind === 'ready') {
        onToast('标签已添加', 'success');
        setNewName('');
        void load();
      } else {
        onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, newName, newColor, load, onToast]
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`确定要删除标签「${name}」？`)) return;
      try {
        await ds.tagDelete(id);
        onToast('已删除', 'success');
        void load();
      } catch (err) {
        onToast(`删除失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [ds, load, onToast]
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (tags === null) return <LoadingView message="正在加载标签…" />;

  return (
    <div className="tags-page">
      <h1 className="tags-page__title">标签管理</h1>

      <form className="tags-page__form" onSubmit={handleCreate}>
        <input
          className="tags-page__input tags-page__input--name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新标签名（必填）"
          required
        />
        <input
          type="color"
          className="tags-page__input tags-page__input--color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          title="颜色"
        />
        <button type="submit" className="tags-page__btn tags-page__btn--primary">
          + 添加
        </button>
      </form>

      {tags.length === 0 ? (
        <p className="tags-page__empty">还没有标签。在上方添加一个开始使用。</p>
      ) : (
        <ul className="tags-page__list">
          {tags.map((t) => (
            <li key={t.id} className="tags-page__item">
              <span
                className="tags-page__dot"
                style={{ background: t.color ?? 'var(--accent)' }}
                aria-hidden="true"
              />
              <span className="tags-page__name">{t.name}</span>
              <span className="tags-page__date">
                {new Date(t.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <button
                type="button"
                className="tags-page__btn tags-page__btn--danger"
                onClick={() => void handleDelete(t.id, t.name)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
