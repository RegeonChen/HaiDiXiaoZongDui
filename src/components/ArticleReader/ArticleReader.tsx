/**
 * 文章阅读区(Mercury 风格 + AI 工具栏)
 *  - 顶部:URL 链接(带 link 图标)
 *  - 标题:serif 大字
 *  - 工具栏:星标 / 打开原文 / AI(摘要 / 翻译 / 标签建议 / 笔记 / 专题)
 *  - 正文:默认显示 Cleaned HTML;翻译后切换为逐段原文 + 译文流
 *  - 底部:摘要 / 标签 / 笔记结果区
 *
 * Phase 3 Integration:
 *  - 摘要:先 aiGenerateSummary 触发 AI 写入缓存,再 aiGetSummary 读取(带缓存)
 *  - 翻译:同上
 *  - 标签建议:aiSuggestTags + aiGetTagSuggestions(按 articleId 缓存)
 *  - 笔记:noteCreate 写入 notes 表
 *  - 专题:topicCreate 占位(Phase 4 接入后真正生效)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article, Feed, NoteCreateInput } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { EmptyView } from '../StatusView/EmptyView';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
import { renderMarkdown } from '../../utils/markdown';
import { SummaryFloatingPanel } from '../SummaryFloatingPanel/SummaryFloatingPanel';
import { TranslatedArticleView } from '../TranslatedArticleView/TranslatedArticleView';
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

type AiPanel = 'summary' | 'translation' | 'tags' | 'note';
type ActivePanels = Set<AiPanel>;

type TranslationParagraphStatus = 'pending' | 'ready' | 'failed';

interface TranslationDisplayParagraph {
  index: number;
  original: string;
  translated: string;
  status: TranslationParagraphStatus;
}

export function ArticleReader({ article, feed, onToggleStar, onToast }: ArticleReaderProps) {
  const ds = useDataSource();
  const [content, setContent] = useState<ContentState>({ html: null, loading: false, error: null });
  // Phase 3.6.x 修复:activePanel 改为 Set,支持摘要和翻译等 panel 同时显示
  // (之前是单值 string|null,body 渲染 if-else 互斥,摘要占用 panel 时切不到翻译视图)
  const [activePanels, setActivePanels] = useState<ActivePanels>(new Set());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [translationParagraphs, setTranslationParagraphs] = useState<TranslationDisplayParagraph[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ name: string; confidence: number; reason: string }>>([]);
  const [noteMarkdown, setNoteMarkdown] = useState('');
  const currentArticleIdRef = useRef<string | null>(article?.id ?? null);
  currentArticleIdRef.current = article?.id ?? null;

  // 工具:添加 / 移除 / 切换 panel
  const addPanel = useCallback((p: AiPanel) => {
    setActivePanels((prev) => {
      if (prev.has(p)) return prev;
      const next = new Set(prev);
      next.add(p);
      return next;
    });
  }, []);
  const removePanel = useCallback((p: AiPanel) => {
    setActivePanels((prev) => {
      if (!prev.has(p)) return prev;
      const next = new Set(prev);
      next.delete(p);
      return next;
    });
  }, []);
  const togglePanel = useCallback((p: AiPanel) => {
    setActivePanels((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);
  const isActive = useCallback((p: AiPanel) => activePanels.has(p), [activePanels]);

  useEffect(() => {
    if (!article) {
      setContent({ html: null, loading: false, error: null });
      setActivePanels(new Set());
      setSummary('');
      setTranslationParagraphs([]);
      setTagSuggestions([]);
      setNoteMarkdown('');
      return;
    }
    // Phase 3.5.3:检查文章是否已有缓存的 AI 结果,有则自动加载
    setActivePanels(new Set());
    setBusy(false);
    setTagSuggestions([]);
    setNoteMarkdown('');

    if (article.summary) {
      setSummary(article.summary);
    } else {
      setSummary('');
    }

    if (article.translatedParagraphs && article.translatedParagraphs.length > 0) {
      setTranslationParagraphs(
        article.translatedParagraphs.map((p) => ({ ...p, status: 'ready' as const }))
      );
    } else {
      setTranslationParagraphs([]);
    }

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
    const summaryOpen = isActive('summary');
    // 1) 已打开 → 关闭(toggle)
    if (summaryOpen) {
      removePanel('summary');
      return;
    }
    // 2) 已有缓存(本地 state 或 article.summary)→ 只切显示,不重复调 AI
    if (summary || (article.summary && article.summary.length > 0)) {
      if (article.summary && !summary) setSummary(article.summary);
      addPanel('summary');
      return;
    }
    // 3) 首次生成
    addPanel('summary');
    setBusy(true);
    try {
      const gen = await ds.aiGenerateSummary(article.id);
      if (!gen.ok) {
        onToast(`摘要失败:${gen.message}`, 'error');
        // 生成失败时关闭悬浮窗,避免一直显示空 loading
        removePanel('summary');
        return;
      }
      const r = await ds.aiGetSummary(article.id);
      if (r.kind === 'ready') {
        setSummary(r.data);
        onToast('摘要已生成', 'success');
      } else {
        onToast(`读取摘要失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
        removePanel('summary');
      }
    } finally {
      setBusy(false);
    }
  }, [article, ds, onToast, summary, isActive, addPanel, removePanel]);

  const handleTranslation = useCallback(async () => {
    if (!article) return;
    const translationOpen = isActive('translation');
    // 1) 已打开 → 关闭(toggle)
    if (translationOpen) {
      removePanel('translation');
      return;
    }
    // 2) 已有本地缓存时只切换显示,不重新请求模型
    if (translationParagraphs.length > 0) {
      addPanel('translation');
      return;
    }
    if (busy) return;

    const requestedArticleId = article.id;
    const isCurrentArticle = (): boolean => currentArticleIdRef.current === requestedArticleId;
    setBusy(true);
    addPanel('translation');
    setTranslationParagraphs([]);
    let activeRunId = '';
    let receivedInitialParagraphs = false;
    const unsubscribe = ds.aiSubscribeTranslationProgress(article.id, (event) => {
      if (!isCurrentArticle()) return;
      if (event.type === 'started') {
        activeRunId = event.runId;
        receivedInitialParagraphs = true;
        setTranslationParagraphs(event.paragraphs.map((paragraph) => ({
          ...paragraph,
          status: 'pending'
        })));
        return;
      }

      if (event.runId !== activeRunId) return;

      if (event.type === 'segmentCompleted') {
        setTranslationParagraphs((current) => current.map((paragraph) => (
          paragraph.index === event.paragraph.index
            ? { ...event.paragraph, status: 'ready' }
            : paragraph
        )));
        return;
      }

      setTranslationParagraphs((current) => current.map((paragraph) => (
        paragraph.status === 'ready' ? paragraph : { ...paragraph, status: 'failed' }
      )));
    });
    try {
      const gen = await ds.aiGenerateTranslation(article.id);
      if (!isCurrentArticle()) return;
      if (!gen.ok) {
        onToast(`翻译失败:${gen.message}`, 'error');
        // 在模型请求之前就失败(例如未配置 Provider)时没有段落状态框可保留,
        // 关闭翻译面板,不能留下一个永远显示"正在按段落翻译"的加载提示。
        if (!receivedInitialParagraphs) removePanel('translation');
        return;
      }
      const r = await ds.aiGetTranslation(article.id);
      if (!isCurrentArticle()) return;
      if (r.kind === 'ready') {
        setTranslationParagraphs(r.data.map((paragraph) => ({ ...paragraph, status: 'ready' })));
        onToast('翻译已生成', 'success');
      } else {
        onToast(`读取翻译失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    } finally {
      unsubscribe();
      if (isCurrentArticle()) setBusy(false);
    }
  }, [article, busy, ds, onToast, translationParagraphs.length, isActive, addPanel, removePanel]);

  const handleSuggestTags = useCallback(async () => {
    if (!article) return;
    const tagsOpen = isActive('tags');
    if (tagsOpen) {
      removePanel('tags');
      return;
    }
    setBusy(true);
    addPanel('tags');
    setTagSuggestions([]);
    try {
      const gen = await ds.aiSuggestTags(article.id);
      if (!gen.ok) {
        onToast(`标签建议失败:${gen.message}`, 'error');
        removePanel('tags');
        return;
      }
      const r = await ds.aiGetTagSuggestions(article.id);
      if (r.kind === 'ready') {
        setTagSuggestions(r.data);
        onToast(`生成 ${r.data.length} 条标签建议`, 'success');
      } else {
        onToast(`读取标签建议失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
        removePanel('tags');
      }
    } finally {
      setBusy(false);
    }
  }, [article, ds, onToast, isActive, addPanel, removePanel]);

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
          onToast(`添加失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
        }
      } catch (err) {
        onToast(`添加失败:${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [article, noteMarkdown, ds, onToast]
  );

  const handleAddToTopic = useCallback(async () => {
    if (!article) return;
    // Phase 4 接入前的占位行为
    const name = window.prompt('输入专题名称(创建新专题)', article.title.slice(0, 30));
    if (!name) return;
    const r = await ds.topicCreate({ name, description: `由「${article.title}」触发创建`, keywords: [] });
    if (r.kind === 'ready') {
      onToast(`专题「${name}」已创建(Phase 4 接入后可关联文章)`, 'success');
    } else {
      onToast(`创建失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
    }
  }, [article, ds, onToast]);

  if (!article) {
    return (
      <div className="article-reader">
        <EmptyView
          title="选择一篇文章开始阅读"
          hint="从中间列表中选一篇文章,正文会显示在这里。"
        />
      </div>
    );
  }

  const articleUrl = article.url;
  // 内容尚未就绪的判断:
  // - article.cleanedMarkdown 非空 → 之前已清洗过(来自 DB 快照)
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
              className={`article-reader__btn ${isActive('summary') ? 'is-active' : ''}`}
              onClick={() => void handleSummary()}
              disabled={needsContent || (busy && !isActive('summary'))}
              aria-pressed={isActive('summary')}
              title={needsContent
                ? '正文未清洗'
                : isActive('summary')
                  ? '隐藏摘要面板'
                  : summary || (article.summary && article.summary.length > 0)
                    ? '显示已保存的摘要(不会重新调用模型)'
                    : '生成 AI 摘要'}
            >
              {busy && isActive('summary') && !summary
                ? '⏳ 生成中...'
                : isActive('summary')
                  ? '🙈 隐藏摘要'
                  : summary || (article.summary && article.summary.length > 0)
                    ? '✨ 显示摘要'
                    : '✨ 摘要'}
            </button>
            <button
              type="button"
              className={`article-reader__btn ${isActive('translation') ? 'is-active' : ''}`}
              onClick={() => void handleTranslation()}
              disabled={needsContent || (busy && !isActive('translation'))}
              aria-pressed={isActive('translation')}
              title={needsContent
                ? '正文未清洗'
                : isActive('translation')
                  ? '隐藏翻译并返回原文'
                  : translationParagraphs.length > 0
                    ? '显示已生成的翻译(不会重新调用模型)'
                    : '生成双语翻译'}
            >
              {busy && isActive('translation') && translationParagraphs.length === 0
                ? '⏳ 翻译中...'
                : isActive('translation')
                  ? '🙈 隐藏翻译'
                  : translationParagraphs.length > 0
                    ? '🌐 显示翻译'
                    : '🌐 翻译'}
            </button>
            <button
              type="button"
              className={`article-reader__btn ${isActive('tags') ? 'is-active' : ''}`}
              onClick={() => void handleSuggestTags()}
              disabled={needsContent || (busy && !isActive('tags'))}
              aria-pressed={isActive('tags')}
              title={needsContent ? '正文未清洗' : 'AI 推荐标签'}
            >
              {busy && isActive('tags') ? '⏳ 建议中...' : isActive('tags') ? '🙈 隐藏标签建议' : '🏷 标签建议'}
            </button>
            <button
              type="button"
              className={`article-reader__btn ${isActive('note') ? 'is-active' : ''}`}
              onClick={() => togglePanel('note')}
              aria-pressed={isActive('note')}
            >
              {isActive('note') ? '🙈 关闭笔记' : '✎ 笔记'}
            </button>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => void handleAddToTopic()}
              title="加入专题(Phase 4 接入)"
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
          ) : isActive('translation') ? (
            // Phase 3.5.2：段落内翻译（原文 + 翻译插槽交替）。
            // 点完翻译按钮立即切到段渲染，每段挂一个 pending 插槽（不依赖 IPC 返回）。
            <TranslatedArticleView
              cleanedHtml={content.html ?? ''}
              paragraphs={translationParagraphs}
              onClose={() => removePanel('translation')}
            />
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
        {/* Phase 3.5.1：摘要从文末折叠区 → 可拖拽悬浮窗（SummaryFloatingPanel）。
            打开条件：activePanels.has('summary')。与翻译等 panel 互不冲突（Set 状态）。 */}
        <SummaryFloatingPanel
          open={isActive('summary')}
          onClose={() => removePanel('summary')}
          content={summary ? renderMarkdown(summary) : ''}
          loading={busy && isActive('summary') && !summary}
        />

        {isActive('tags') && (
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

        {isActive('note') && (
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
