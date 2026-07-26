/**
 * TagsPage — 标签管理
 * Phase 4.1.1：双栏布局
 *   - 左栏：标签列表 + CRUD（保持原有功能）
 *   - 右栏：选中标签下的文章列表（标题 + 来源 + 时间，点击跳到阅读器）
 *   - 实时同步：标签增删 / 选中切换时右栏文章列表即时更新
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Article, Feed, Tag, TagCreateInput } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import { parseArticleTitleTags } from '../../utils/article-title-tags';
import './TagsPage.css';

export interface TagsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  /**
   * Phase 4.1.1：点击右栏文章回调
   * App 收到回调后用 handleTopicOpenArticle 同款 externalSelectedArticle 模式跳到阅读器
   */
  onOpenArticle?: (article: Article) => void;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (deltaSec < 60) return '刚刚';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} 分钟前`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} 小时前`;
  if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TagsPage({ onToast, onOpenArticle }: TagsPageProps) {
  const ds = useDataSource();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  // Phase 4.1.1:右栏选中标签 + 该标签下文章列表
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagArticles, setTagArticles] = useState<Article[] | null>(null);
  const [tagArticlesLoading, setTagArticlesLoading] = useState(false);
  // Phase 4.1.1:右栏文章列表需要 feed 标题映射
  const [allFeeds, setAllFeeds] = useState<Feed[]>([]);

  const load = useCallback(async () => {
    const r = await ds.tagList();
    if (r.kind === 'ready') {
      setTags(r.data);
      setError(null);
    } else {
      setError(r.kind === 'error' ? r.error : '加载失败');
    }
  }, [ds]);

  // Phase 4.1.1:右栏文章列表需要 feed 标题做映射
  const loadFeeds = useCallback(async () => {
    const r = await ds.feeds();
    if (r.kind === 'ready') setAllFeeds(r.data);
  }, [ds]);

  useEffect(() => {
    void load();
    void loadFeeds();
  }, [load, loadFeeds]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim()) return;
      const input: TagCreateInput = { name: newName.trim(), color: newColor };
      const r = await ds.tagCreate(input);
      if (r.kind === 'ready') {
        onToast('标签已添加', 'success');
        setNewName('');
        await load();
      } else {
        onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, newName, newColor, load, onToast]
  );

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`确定要删除标签「${name}」？所有文章上的该标签关联会一并清除。`)) return;
      try {
        await ds.tagDelete(id);
        onToast('已删除', 'success');
        if (selectedTagId === id) {
          setSelectedTagId(null);
          setTagArticles(null);
        }
        await load();
      } catch (err) {
        onToast(`删除失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [ds, load, onToast, selectedTagId]
  );

  // Phase 4.1.1:选中标签变化时拉该标签下所有文章
  useEffect(() => {
    if (!selectedTagId) {
      setTagArticles(null);
      return;
    }
    let cancelled = false;
    setTagArticlesLoading(true);
    void (async () => {
      const r = await ds.articles({ tagIds: [selectedTagId] });
      if (cancelled) return;
      if (r.kind === 'ready') setTagArticles(r.data);
      else setTagArticles([]);
      setTagArticlesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTagId, ds, tags]); // tags 依赖：tag 改名/改色/删除时重新拉

  const selectedTag = useMemo(
    () => (tags ?? []).find((t) => t.id === selectedTagId) ?? null,
    [tags, selectedTagId]
  );

  const feedTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of allFeeds) m.set(f.id, f.siteTitle || f.title);
    return m;
  }, [allFeeds]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (tags === null) return <LoadingView message="正在加载标签…" />;

  return (
    <div className="tags-page">
      <h1 className="tags-page__title">标签管理</h1>

      <div className="tags-page__panes">
        {/* 左栏：标签 CRUD */}
        <section className="tags-page__left">
          <form className="tags-page__form" onSubmit={handleCreate}>
            <input
              className="tags-page__input tags-page__input--name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新标签名（必填）"
              required
              data-testid="tags-page__new-name"
            />
            <input
              type="color"
              className="tags-page__input tags-page__input--color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              title="颜色"
              data-testid="tags-page__new-color"
            />
            <button
              type="submit"
              className="tags-page__btn tags-page__btn--primary"
              data-testid="tags-page__add"
            >
              + 添加
            </button>
          </form>

          {tags.length === 0 ? (
            <p className="tags-page__empty">还没有标签。在上方添加一个开始使用。</p>
          ) : (
            <ul className="tags-page__list" data-testid="tags-page__list">
              {tags.map((t) => (
                <li
                  key={t.id}
                  className={`tags-page__item ${selectedTagId === t.id ? 'is-selected' : ''}`}
                  data-testid={`tags-page__item-${t.id}`}
                >
                  <button
                    type="button"
                    className="tags-page__item-pick"
                    onClick={() => setSelectedTagId(t.id)}
                    title={`查看「${t.name}」下的文章`}
                  >
                    <span
                      className="tags-page__dot"
                      style={{ background: t.color ?? 'var(--accent)' }}
                      aria-hidden="true"
                    />
                    <span className="tags-page__name">{t.name}</span>
                    <span className="tags-page__date">
                      {new Date(t.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </button>
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
        </section>

        {/* 右栏：选中标签下的文章列表 */}
        <section className="tags-page__right" data-testid="tags-page__right">
          {!selectedTagId ? (
            <div className="tags-page__right-empty">
              <p>← 在左侧选择一个标签，查看该标签下的文章列表</p>
            </div>
          ) : tagArticlesLoading && tagArticles === null ? (
            <LoadingView message="正在加载文章…" />
          ) : (
            <>
              <header className="tags-page__right-header">
                <h2 className="tags-page__right-title">
                  <span
                    className="tags-page__dot"
                    style={{ background: selectedTag?.color ?? 'var(--accent)' }}
                    aria-hidden="true"
                  />
                  # {selectedTag?.name ?? ''}
                  <span className="tags-page__right-count">
                    {tagArticles?.length ?? 0} 篇
                  </span>
                </h2>
              </header>
              {tagArticles && tagArticles.length === 0 ? (
                <p className="tags-page__empty">该标签下还没有文章。</p>
              ) : (
                <ul className="tags-page__article-list" data-testid="tags-page__article-list">
                  {tagArticles?.map((a) => {
                    const { cleanTitle } = parseArticleTitleTags(a.title);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          className={`tags-page__article-item ${a.isRead ? 'is-read' : 'is-unread'}`}
                          onClick={() => onOpenArticle?.(a)}
                          data-testid={`tags-page__article-${a.id}`}
                        >
                          <span className={`tags-page__article-dot ${a.isRead ? 'is-read' : 'is-unread'}`} aria-hidden="true" />
                          <span className="tags-page__article-title">{cleanTitle}</span>
                          <span className="tags-page__article-meta">
                            <span className="tags-page__article-feed">
                              {feedTitleById.get(a.feedId) ?? '未知'}
                            </span>
                            <span className="tags-page__article-time">
                              {formatRelative(a.publishedAt)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
