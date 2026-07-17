/**
 * 文章阅读区（Mercury 风格 + AI 工具栏）
 *  - 顶部：URL 链接（带 link 图标）
 *  - 标题：serif 大字
 *  - 工具栏：星标 / 打开原文 / AI（摘要 / 翻译 / 标签建议 / 笔记 / 专题）
 *  - 正文：按需清洗的 Cleaned HTML
 *  - 底部：摘要 / 翻译结果折叠区
 *
 * Phase 3 Integration：
 *  - 摘要：先 aiGenerateSummary 触发 AI 写入缓存，再 aiGetSummary 读取（带缓存）
 *  - 翻译：同上
 *  - 标签建议：aiSuggestTags + aiGetTagSuggestions（按 articleId 缓存）
 *  - 笔记：noteCreate 写入 notes 表
 *  - 专题：topicCreate 占位（Phase 4 接入后真正生效）
 */
import { useCallback, useEffect, useState } from 'react';
import type { Article, Feed, NoteCreateInput } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { EmptyView } from '../StatusView/EmptyView';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
import { renderMarkdown } from '../../utils/markdown';
import './ArticleReader.css';

export interface ArticleReaderProps {
  article: Article | null;
  feed: Feed | null;
  onToggleStar: (articleId: string, isStarred: boolean) => void;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

interface ContentState {
  html: string | null;
  loading: boolean;
  error: string | null;
}

type AiPanel = 'summary' | 'translation' | 'tags' | 'note' | null;

export function ArticleReader({ article, feed, onToggleStar, onToast }: ArticleReaderProps) {
  const ds = useDataSource();
  const [content, setContent] = useState<ContentState>({ html: null, loading: false, error: null });
  const [activePanel, setActivePanel] = useState<AiPanel>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [translationParagraphs, setTranslationParagraphs] = useState<Array<{ index: number; original: string; translated: string }>>([]);
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ name: string; confidence: number; reason: string }>>([]);
  const [noteMarkdown, setNoteMarkdown] = useState('');

  useEffect(() => {
    // Phase 3.4.1.3：切换文章时无条件清空 AI 结果区 + 折叠面板
    // —— 不论 cleanedHtml 是否已存在，都要先 reset 4 个 AI 字段，
    // 否则切换后旧文章的 summary / translation / tagSuggestions 仍残留。
    if (!article) {
      setContent({ html: null, loading: false, error: null });
      setActivePanel(null);
      setSummary('');
      setTranslationParagraphs([]);
      setTagSuggestions([]);
      setNoteMarkdown('');
      return;
    }
    // 切换文章：清空 AI 字段（不依赖 content 状态）
    setActivePanel(null);
    setSummary('');
    setTranslationParagraphs([]);
    setTagSuggestions([]);
    setNoteMarkdown('');

    if (article.cleanedHtml) {
      setContent({ html: article.cleanedHtml, loading: false, error: null });
      return;
    }
    setContent({ html: null, loading: true, error: null });
    let cancelled = false;
    void (async () => {
      const r = await ds.getCleanedHtml(article.id);
      if (cancelled) return;
      if (r.kind === 'ready') {
        setContent({ html: r.data, loading: false, error: null });
      } else if (r.kind === 'error') {
        setContent({ html: null, loading: false, error: r.error });
      } else {
        setContent({ html: null, loading: true, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [article?.id, article?.cleanedHtml, ds]);

  const retry = () => {
    if (!article) return;
    setContent({ html: null, loading: true, error: null });
    void (async () => {
      const r = await ds.getCleanedHtml(article.id);
      if (r.kind === 'ready') {
        setContent({ html: r.data, loading: false, error: null });
      } else if (r.kind === 'error') {
        setContent({ html: null, loading: false, error: r.error });
      }
    })();
  };

  // === AI 操作 ===

  const handleSummary = useCallback(async () => {
    if (!article) return;
    setBusy(true);
    setActivePanel('summary');
    setSummary('');
    try {
      const gen = await ds.aiGenerateSummary(article.id);
      if (!gen.ok) {
        onToast(`摘要失败：${gen.message}`, 'error');
        return;
      }
      const r = await ds.aiGetSummary(article.id);
      if (r.kind === 'ready') {
        setSummary(r.data);
        onToast('摘要已生成', 'success');
      } else {
        onToast(`读取摘要失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [article, ds, onToast]);

  const handleTranslation = useCallback(async () => {
    if (!article) return;
    setBusy(true);
    setActivePanel('translation');
    setTranslationParagraphs([]);
    try {
      const gen = await ds.aiGenerateTranslation(article.id);
      if (!gen.ok) {
        onToast(`翻译失败：${gen.message}`, 'error');
        return;
      }
      const r = await ds.aiGetTranslation(article.id);
      if (r.kind === 'ready') {
        setTranslationParagraphs(r.data);
        onToast('翻译已生成', 'success');
      } else {
        onToast(`读取翻译失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [article, ds, onToast]);

  const handleSuggestTags = useCallback(async () => {
    if (!article) return;
    setBusy(true);
    setActivePanel('tags');
    setTagSuggestions([]);
    try {
      const gen = await ds.aiSuggestTags(article.id);
      if (!gen.ok) {
        onToast(`标签建议失败：${gen.message}`, 'error');
        return;
      }
      const r = await ds.aiGetTagSuggestions(article.id);
      if (r.kind === 'ready') {
        setTagSuggestions(r.data);
        onToast(`生成 ${r.data.length} 条标签建议`, 'success');
      } else {
        onToast(`读取标签建议失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [article, ds, onToast]);

  const handleAddNote = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!article || !noteMarkdown.trim()) return;
      const input: NoteCreateInput = {
        articleId: article.id,
        markdownContent: noteMarkdown.trim()
      };
      try {
        const r = await ds.noteCreate(input);
        if (r.kind === 'ready') {
          onToast('笔记已添加', 'success');
          setNoteMarkdown('');
        } else {
          onToast(`添加失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
        }
      } catch (err) {
        onToast(`添加失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [article, noteMarkdown, ds, onToast]
  );

  const handleAddToTopic = useCallback(async () => {
    if (!article) return;
    // Phase 4 接入前的占位行为
    const name = window.prompt('输入专题名称（创建新专题）', article.title.slice(0, 30));
    if (!name) return;
    const r = await ds.topicCreate({ name, description: `由「${article.title}」触发创建`, keywords: [] });
    if (r.kind === 'ready') {
      onToast(`专题「${name}」已创建（Phase 4 接入后可关联文章）`, 'success');
    } else {
      onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
    }
  }, [article, ds, onToast]);

  if (!article) {
    return (
      <div className="article-reader">
        <EmptyView
          title="选择一篇文章开始阅读"
          hint="从中间列表中选一篇文章，正文会显示在这里。"
        />
      </div>
    );
  }

  const articleUrl = article.url;
  // 内容尚未就绪的判断：
  // - article.cleanedMarkdown 非空 → 之前已清洗过（来自 DB 快照）
  // - content.html 非空 → 本次刚通过 getCleanedHtml 触发清洗并成功返回
  // 两者都不满足时才禁用 AI 按钮
  const needsContent = !article.cleanedMarkdown && !content.html;

  return (
    <div className="article-reader">
      {/* 顶部 URL 链接 */}
      <div className="article-reader__topbar">
        <a
          className="article-reader__sourcelink"
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={articleUrl}
        >
          <span className="article-reader__link-icon" aria-hidden="true">🔗</span>
          <span className="article-reader__sourcelink-text">{articleUrl}</span>
        </a>
      </div>

      <div className="article-reader__scroll">
        <header className="article-reader__header">
          <h1 className="article-reader__title">{article.title}</h1>
          <div className="article-reader__meta">
            {feed && <span className="article-reader__feed">{feed.siteTitle || feed.title}</span>}
            {article.author && <span className="article-reader__sep">·</span>}
            {article.author && <span>{article.author}</span>}
            <span className="article-reader__sep">·</span>
            <span>{formatAbsolute(article.publishedAt)}</span>
          </div>
          <div className="article-reader__toolbar">
            <button
              type="button"
              className={`article-reader__btn ${article.isStarred ? 'is-active' : ''}`}
              onClick={() => onToggleStar(article.id, !article.isStarred)}
              aria-pressed={article.isStarred}
            >
              {article.isStarred ? '★ 已星标' : '☆ 加星标'}
            </button>
            <a
              className="article-reader__btn"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              打开原文 ↗
            </a>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => void handleSummary()}
              disabled={busy || needsContent}
              title={needsContent ? '正文未清洗' : '生成 AI 摘要'}
            >
              {busy && activePanel === 'summary' ? '⏳ 生成中…' : '✨ 摘要'}
            </button>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => void handleTranslation()}
              disabled={busy || needsContent}
              title={needsContent ? '正文未清洗' : '生成双语翻译'}
            >
              {busy && activePanel === 'translation' ? '⏳ 翻译中…' : '🌐 翻译'}
            </button>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => void handleSuggestTags()}
              disabled={busy || needsContent}
              title={needsContent ? '正文未清洗' : 'AI 推荐标签'}
            >
              {busy && activePanel === 'tags' ? '⏳ 建议中…' : '🏷 标签建议'}
            </button>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => setActivePanel((p) => (p === 'note' ? null : 'note'))}
            >
              ✎ 笔记
            </button>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => void handleAddToTopic()}
              title="加入专题（Phase 4 接入）"
            >
              ★ 专题
            </button>
          </div>
        </header>

        <div className="article-reader__body">
          {content.loading ? (
            <LoadingView message="正在清洗正文…" />
          ) : content.error ? (
            <ErrorView message={content.error} onRetry={retry} />
          ) : content.html ? (
            <div
              className="article-reader__content"
              dangerouslySetInnerHTML={{ __html: content.html }}
            />
          ) : (
            <EmptyView title="此文章暂无正文" hint="可能还没有内容，或者源站返回为空。" />
          )}
        </div>

        {/* AI 结果区 */}
        {activePanel === 'summary' && (
          <div className="article-reader__ai-panel">
            <h3>✨ 摘要</h3>
            {summary ? (
              // Phase 3.4.1.5：简易 Markdown 渲染（**bold** / *italic* / `code` / 链接 / 段落）
              <div
                className="article-reader__ai-text"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
              />
            ) : (
              <LoadingView message="正在生成摘要…" />
            )}
          </div>
        )}

        {activePanel === 'translation' && (
          <div className="article-reader__ai-panel">
            <h3>🌐 双语翻译</h3>
            {translationParagraphs.length > 0 ? (
              <ol className="article-reader__translation">
                {translationParagraphs.map((p) => (
                  <li key={p.index} className="article-reader__translation-item">
                    {/* Phase 3.4.1.4：原文/译文都做简易 Markdown 渲染 */}
                    <div
                      className="article-reader__translation-original"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(p.original) }}
                    />
                    <div
                      className="article-reader__translation-translated"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(p.translated) }}
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <LoadingView message="正在翻译…" />
            )}
          </div>
        )}

        {activePanel === 'tags' && (
          <div className="article-reader__ai-panel">
            <h3>🏷 标签建议</h3>
            {tagSuggestions.length > 0 ? (
              <ul className="article-reader__tag-suggestions">
                {tagSuggestions.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="article-reader__tag-suggestion">
                    <span className="article-reader__tag-name">{s.name}</span>
                    <span className="article-reader__tag-confidence">
                      置信度 {Math.round(s.confidence * 100)}%
                    </span>
                    <span className="article-reader__tag-reason">{s.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="article-reader__ai-empty">暂无标签建议。</p>
            )}
          </div>
        )}

        {activePanel === 'note' && (
          <form className="article-reader__ai-panel" onSubmit={handleAddNote}>
            <h3>✎ 笔记</h3>
            <textarea
              className="article-reader__note-input"
              value={noteMarkdown}
              onChange={(e) => setNoteMarkdown(e.target.value)}
              placeholder="Markdown 笔记（GFM：标题、代码块、列表）"
              rows={5}
            />
            <div className="article-reader__note-actions">
              <button
                type="submit"
                className="article-reader__btn article-reader__btn--primary"
                disabled={!noteMarkdown.trim()}
              >
                添加笔记
              </button>
              <button
                type="button"
                className="article-reader__btn"
                onClick={() => setNoteMarkdown('')}
              >
                清空
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
