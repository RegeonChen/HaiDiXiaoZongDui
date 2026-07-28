/**
 * 文章阅读区(Mercury 风格 + AI 工具栏)
 *  - 顶部:URL 链接(带 link 图标)
 *  - 标题:serif 大字
 *  - 工具栏:星标 / 打开原文 / AI(摘要 / 翻译 / 标签 / 标签建议 / 笔记 / 专题)
 *  - 正文:默认显示 Cleaned HTML;翻译后切换为逐段原文 + 译文流
 *  - 粘性底部面板:标签管理 / 标签建议 / 笔记(可拉伸 + 收起)
 *  - 摘要:可拖拽悬浮窗(独立于底部面板)
 *
 * Phase 3 Integration:
 *  - 摘要:先 aiGenerateSummary 触发 AI 写入缓存,再 aiGetSummary 读取(带缓存)
 *  - 翻译:同上
 *  - 标签管理:tagList + tagAddToArticle / tagRemoveFromArticle 手动分类
 *  - 标签建议:aiSuggestTags + aiGetTagSuggestions,可一键应用
 *  - 笔记:noteCreate 写入 notes 表
 *  - 专题:打开专题表单，以当前文章作为种子创建关联图
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIChatMessage, Article, Feed, NoteCreateInput, Tag } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { EmptyView } from '../StatusView/EmptyView';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
import { renderMarkdown } from '../../utils/markdown';
import { SummaryFloatingPanel } from '../SummaryFloatingPanel/SummaryFloatingPanel';
import { TranslatedArticleView } from '../TranslatedArticleView/TranslatedArticleView';
import { StickyBottomPanel } from '../StickyBottomPanel/StickyBottomPanel';
import { WebArticleView } from '../WebArticleView/WebArticleView';
import { TopicFormDialog, type TopicFormValue } from '../TopicFormDialog/TopicFormDialog';
import { ArticleAiChatPanel } from '../ArticleAiChatPanel/ArticleAiChatPanel';
import { useReaderMode, type ReaderMode } from '../../hooks/useReaderMode';
import { prepareArticleHtmlForDisplay } from '../../utils/article-images';
import { parseArticleTitleTags } from '../../utils/article-title-tags';
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

/** StickyBottomPanel 的 tab id(标签管理 / 标签建议 / 笔记) */
type StickyTabId = 'tag-manage' | 'tag-suggest' | 'note';

type TranslationParagraphStatus = 'pending' | 'ready' | 'failed';

interface TranslationDisplayParagraph {
  index: number;
  original: string;
  translated: string;
  status: TranslationParagraphStatus;
}

interface SelectionActionMenu {
  x: number;
  y: number;
  text: string;
}

const READER_MODE_OPTIONS: ReadonlyArray<{
  mode: ReaderMode;
  label: string;
  icon: string;
  title: string;
}> = [
  { mode: 'reader', label: '阅读', icon: '▤', title: '只显示清洗后的阅读版' },
  { mode: 'web', label: '网页', icon: '◎', title: '只显示原站网页' },
  { mode: 'dual', label: '分栏', icon: '◫', title: '左侧 Markdown，右侧原站网页' }
];

export function ArticleReader({ article, feed, onToggleStar, onToast }: ArticleReaderProps) {
  const ds = useDataSource();
  const [readerMode, setReaderMode] = useReaderMode();
  const [content, setContent] = useState<ContentState>({ html: null, loading: false, error: null });
  // Phase 3.6.x 修复:activePanel 改为 Set,支持摘要和翻译等 panel 同时显示
  // (之前是单值 string|null,body 渲染 if-else 互斥,摘要占用 panel 时切不到翻译视图)
  const [activePanels, setActivePanels] = useState<ActivePanels>(new Set());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [translationParagraphs, setTranslationParagraphs] = useState<TranslationDisplayParagraph[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ name: string; confidence: number; reason: string }>>([]);
  const [noteMarkdown, setNoteMarkdown] = useState('');
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<SelectionActionMenu | null>(null);
  // Phase 3.5.x 落地标签管理:当前文章已应用 tag + 全局 tag 列表
  const [articleTags, setArticleTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const displayHtml = useMemo(
    () => article && content.html
      ? prepareArticleHtmlForDisplay(content.html, article.url)
      : null,
    [article?.url, content.html]
  );
  // StickyBottomPanel 当前 tab(null = 完全收起)
  const [stickyTab, setStickyTab] = useState<StickyTabId | null>(null);
  // Phase 3.5.x toggle 修复:用 ref 跟踪最新 stickyTab 值,
  // 避免 handleSuggestTags 的 useCallback 闭包陈旧(连点或快速切换时
  // 闭包内的 stickyTab 还没更新,导致 toggle 失灵并误触 AI)。
  const stickyTabRef = useRef<StickyTabId | null>(stickyTab);
  stickyTabRef.current = stickyTab;
  const currentArticleIdRef = useRef<string | null>(article?.id ?? null);
  currentArticleIdRef.current = article?.id ?? null;

  useEffect(() => {
    setChatOpen(false);
    setChatMessages([]);
    setChatDraft('');
    setChatBusy(false);
    setChatError(null);
    setSelectionMenu(null);
  }, [article?.id]);

  useEffect(() => {
    if (!selectionMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-ai-selection-menu]')) return;
      setSelectionMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectionMenu(null);
    };
    const handleScroll = () => setSelectionMenu(null);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [selectionMenu]);

  // 工具：添加 / 移除 / 切换 panel
  // Debug: 暴露 articleTags / allTags / tagSuggestions 到 window 供 smoke 探针读取
  useEffect(() => {
    (window as unknown as { __JUHE_ARTICLE_DEBUG__?: Record<string, unknown> }).__JUHE_ARTICLE_DEBUG__ = {
      articleTags: articleTags.map((t) => t.id),
      allTags: allTags.map((t) => t.id),
      tagSuggestions: tagSuggestions.map((s) => s.name),
      stickyTab
    };
  }, [articleTags, allTags, tagSuggestions, stickyTab]);
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
  const isActive = useCallback((p: AiPanel) => activePanels.has(p), [activePanels]);

  useEffect(() => {
    if (!article) {
      setContent({ html: null, loading: false, error: null });
      setActivePanels(new Set());
      setSummary('');
      setTranslationParagraphs([]);
      setTagSuggestions([]);
      setNoteMarkdown('');
      setArticleTags([]);
      setStickyTab(null);
      setTopicDialogOpen(false);
      return;
    }
    // Phase 3.5.3:检查文章是否已有缓存的 AI 结果,有则自动加载
    setActivePanels(new Set());
    setBusy(false);
    setTagSuggestions([]);
    setNoteMarkdown('');
    setTopicDialogOpen(false);

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

    // 拉当前文章已应用的 tag(落地标签管理的关键数据)
    let cancelled = false;
    void (async () => {
      const r = await ds.tagGetByArticle(article.id);
      if (cancelled) return;
      if (r.kind === 'ready') setArticleTags(r.data);
      else setArticleTags([]);
    })();

    // 拉全局 tag 列表(如果还没拉过)
    if (allTags.length === 0) {
      void (async () => {
        const r = await ds.tagList();
        if (cancelled) return;
        if (r.kind === 'ready') setAllTags(r.data);
      })();
    }

    if (article.cleanedHtml) {
      setContent({ html: article.cleanedHtml, loading: false, error: null });
      return;
    }
    setContent({ html: null, loading: true, error: null });
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

  const sendChatMessage = useCallback(async (questionOverride?: string) => {
    if (!article || chatBusy) return;
    const question = (questionOverride ?? chatDraft).trim();
    if (!question) return;

    const userMessage: AIChatMessage = { role: 'user', content: question };
    const requestMessages = [...chatMessages, userMessage];
    setChatOpen(true);
    setChatMessages(requestMessages);
    setChatDraft('');
    setChatError(null);
    setChatBusy(true);
    try {
      const result = await ds.aiChat(article.id, requestMessages);
      if (currentArticleIdRef.current !== article.id) return;
      if (result.kind === 'ready') {
        setChatMessages((current) => [
          ...current,
          { role: 'assistant', content: result.data.message }
        ]);
      } else {
        const message = result.kind === 'error' ? result.error : 'AI 尚未返回结果';
        setChatError(message);
        onToast(`AI 对话失败：${message}`, 'error');
      }
    } finally {
      if (currentArticleIdRef.current === article.id) setChatBusy(false);
    }
  }, [article, chatBusy, chatDraft, chatMessages, ds, onToast]);

  const handleReaderContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const contentRoot = target.closest(
      '.article-reader__content, .translated-article-view__block'
    );
    if (!contentRoot) return;
    const readerBody = target.closest('.article-reader__body');
    if (!readerBody) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!readerBody.contains(range.commonAncestorContainer)) return;
    const rawText = selection.toString().replace(/\s+/g, ' ').trim();
    if (!rawText) return;

    event.preventDefault();
    const text = rawText.slice(0, 5_000);
    if (rawText.length > text.length) {
      onToast('选中内容较长，已截取前 5000 个字符', 'info');
    }
    setSelectionMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 104)),
      text
    });
  }, [onToast]);

  const handleAskSelection = useCallback(() => {
    if (!selectionMenu) return;
    const selectedText = selectionMenu.text;
    setSelectionMenu(null);
    void sendChatMessage([
      '请根据文章上下文解释下面这段选中内容的含义、作用以及相关背景：',
      '',
      selectedText
    ].join('\n'));
  }, [selectionMenu, sendChatMessage]);

  const handleTranslateSelection = useCallback(() => {
    if (!selectionMenu) return;
    const selectedText = selectionMenu.text;
    setSelectionMenu(null);
    void sendChatMessage([
      '请将下面选中的内容翻译成简体中文。只输出译文，保留原意和专业术语：',
      '',
      selectedText
    ].join('\n'));
  }, [selectionMenu, sendChatMessage]);

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
    // Phase 3.5.x toggle 修复:用 ref 读最新 stickyTab,避免 useCallback
    // 闭包陈旧导致"点关闭却再次建议"或"点显示却再次调 AI"。
    const suggestOpen = stickyTabRef.current === 'tag-suggest';
    // 1) 已打开 → 关闭（toggle, 不调 AI）
    if (suggestOpen) {
      setStickyTab(null);
      return;
    }
    // 2) 已有建议 → 只切显示, 不重新调 AI
    if (tagSuggestions.length > 0) {
      setStickyTab('tag-suggest');
      return;
    }
    // 3) 首次生成
    setStickyTab('tag-suggest');
    setBusy(true);
    try {
      const gen = await ds.aiSuggestTags(article.id);
      if (!gen.ok) {
        onToast(`标签建议失败:${gen.message}`, 'error');
        // 失败时关闭面板，避免一直显示空 loading
        setStickyTab(null);
        return;
      }
      const r = await ds.aiGetTagSuggestions(article.id);
      if (r.kind === 'ready') {
        setTagSuggestions(r.data);
        onToast(`生成 ${r.data.length} 条标签建议`, 'success');
      } else {
        onToast(`读取标签建议失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
        setStickyTab(null);
      }
    } finally {
      setBusy(false);
    }
    // tagSuggestions.length 仍在 deps(用于分支 2 判断);
    // stickyTab 不再需要(use ref 替代, 避免 deps 频繁变化)。
  }, [article, ds, onToast, tagSuggestions.length]);

  /** 把 tag 加到当前文章(手动添加) */
  const handleAddTagToArticle = useCallback(
    async (tag: Tag) => {
      if (!article) return;
      if (articleTags.some((t) => t.id === tag.id)) return; // 已存在
      try {
        await ds.tagAddToArticle(article.id, tag.id);
        setArticleTags((prev) => [...prev, tag]);
        onToast(`已添加标签「${tag.name}」`, 'success');
      } catch (err) {
        onToast(`添加失败:${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [article, ds, articleTags, onToast]
  );

  /** 移除非当前文章 tag */
  const handleRemoveTagFromArticle = useCallback(
    async (tagId: string) => {
      if (!article) return;
      try {
        await ds.tagRemoveFromArticle(article.id, tagId);
        setArticleTags((prev) => prev.filter((t) => t.id !== tagId));
      } catch (err) {
        onToast(`移除失败:${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [article, ds, onToast]
  );

  /** 新建 tag + 加到当前文章 */
  const handleCreateAndAddTag = useCallback(
    async (name: string) => {
      if (!article) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const r = await ds.tagCreate({ name: trimmed });
        if (r.kind === 'ready') {
          const newTag = r.data;
          setAllTags((prev) => {
            if (prev.some((t) => t.name === newTag.name)) return prev;
            return [...prev, newTag];
          });
          await handleAddTagToArticle(newTag);
        } else {
          onToast(`创建失败:${r.kind === 'error' ? r.error : '未知'}`, 'error');
        }
      } catch (err) {
        onToast(`创建失败:${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [article, ds, handleAddTagToArticle, onToast]
  );

  /** 应用 AI 标签建议(建议 name → 查/建 tag → 加到文章) */
  const handleApplyTagSuggestion = useCallback(
    async (suggestionName: string) => {
      if (!article) return;
      const trimmed = suggestionName.trim();
      if (!trimmed) return;
      // 已应用的检查
      if (articleTags.some((t) => t.name === trimmed)) {
        onToast(`标签「${trimmed}」已存在`, 'info');
        return;
      }
      // 先查全量 tag 是否已有同名
      const existing = allTags.find((t) => t.name === trimmed);
      if (existing) {
        await handleAddTagToArticle(existing);
      } else {
        await handleCreateAndAddTag(trimmed);
      }
    },
    [article, allTags, articleTags, handleAddTagToArticle, handleCreateAndAddTag, onToast]
  );

  /** 一次性应用所有 AI 建议 */
  const handleApplyAllSuggestions = useCallback(async () => {
    if (!article || tagSuggestions.length === 0) return;
    let applied = 0;
    let skipped = 0;
    for (const s of tagSuggestions) {
      const name = s.name.trim();
      if (!name) continue;
      if (articleTags.some((t) => t.name === name)) {
        skipped += 1;
        continue;
      }
      const existing = allTags.find((t) => t.name === name);
      if (existing) {
        await handleAddTagToArticle(existing);
        applied += 1;
      } else {
        // 串行避免重复 toast
        try {
          const r = await ds.tagCreate({ name });
          if (r.kind === 'ready') {
            setAllTags((prev) => (prev.some((t) => t.name === r.data.name) ? prev : [...prev, r.data]));
            await ds.tagAddToArticle(article.id, r.data.id);
            setArticleTags((prev) => (prev.some((t) => t.id === r.data.id) ? prev : [...prev, r.data]));
            applied += 1;
          }
        } catch {
          // 忽略单条失败,继续
        }
      }
    }
    onToast(`已应用 ${applied} 个建议${skipped > 0 ? `(跳过 ${skipped} 个已存在)` : ''}`, 'success');
  }, [article, tagSuggestions, articleTags, allTags, ds, handleAddTagToArticle, onToast]);

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

  /** 打开粘性底部面板到指定 tab(如果当前是同一 tab,则收起为 null) */
  const toggleStickyTab = useCallback((tab: StickyTabId) => {
    setStickyTab((prev) => (prev === tab ? null : tab));
  }, []);

  const handleCreateTopic = useCallback(async (value: TopicFormValue) => {
    if (!article) return;
    const r = await ds.topicCreate({
      name: value.name,
      description: value.description,
      keywords: value.keywords,
      seedArticleId: article.id
    });
    if (r.kind === 'ready') {
      setTopicDialogOpen(false);
      onToast(`专题「${value.name}」已创建，相关文章会在脉络图中自动关联`, 'success');
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
        <div
          className="article-reader__mode-switch"
          role="group"
          aria-label="阅读显示模式"
          data-reader-mode={readerMode}
        >
          {READER_MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`article-reader__mode-btn ${readerMode === option.mode ? 'is-active' : ''}`}
              onClick={() => setReaderMode(option.mode)}
              aria-pressed={readerMode === option.mode}
              data-reader-mode-option={option.mode}
              title={option.title}
            >
              <span aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="article-reader__workspace" data-reader-workspace={readerMode}>
        {readerMode !== 'web' && (
          <section
            className={`article-reader__pane ${readerMode === 'dual' ? 'article-reader__pane--dual' : ''}`}
            data-reader-pane="markdown"
            aria-label="Markdown 阅读版"
          >
            <div className="article-reader__scroll">
        <header className="article-reader__header">
          <h1 className="article-reader__title">
            {/* Phase 4.1.1:标题前彩色标签 chips
                - 优先用 articleTags state(ds.tagGetByArticle 拉取,增删实时同步)
                - 兜底用 parseArticleTitleTags(article.title) 解析 tag prefix(后端存储),
                  处理 articleTags 异步未到位的 150ms 空窗期
                - 按 name 去重,确保不重复渲染 */}
            {(() => {
              const titleTags = parseArticleTitleTags(article.title).tags;
              const seen = new Set<string>();
              // Tag.color 是 string | null，parsed tags 的 color 是 string | undefined；统一为 string | null | undefined
              const merged: Array<{ name: string; color: string | null | undefined; key: string }> = [];
              for (const t of articleTags) {
                if (!seen.has(t.name)) {
                  seen.add(t.name);
                  merged.push({ name: t.name, color: t.color, key: t.id });
                }
              }
              for (const t of titleTags) {
                if (!seen.has(t.name)) {
                  seen.add(t.name);
                  merged.push({ name: t.name, color: t.color, key: `title-${t.name}` });
                }
              }
              if (merged.length === 0) return null;
              return (
                <span className="article-reader__title-tags" data-testid="article-reader__title-tags">
                  {merged.map((t) => (
                    <span
                      key={t.key}
                      className="article-reader__title-tag"
                      style={{ background: t.color ?? 'var(--accent)' }}
                      title={`标签：${t.name}`}
                    >
                      {t.name}
                    </span>
                  ))}
                </span>
              );
            })()}
            <span className="article-reader__title-text">{parseArticleTitleTags(article.title).cleanTitle}</span>
          </h1>
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
              className={`article-reader__btn ${chatOpen ? 'is-active' : ''}`}
              onClick={() => {
                setSelectionMenu(null);
                setChatOpen((open) => !open);
              }}
              disabled={needsContent}
              aria-pressed={chatOpen}
              title={needsContent ? '正文未清洗' : '基于当前文章与 AI 连续对话'}
              data-tool="ai-chat"
            >
              {chatOpen ? '🙈 关闭 AI' : '💬 询问 AI'}
            </button>
            <button
              type="button"
              className={`article-reader__btn ${stickyTab === 'tag-manage' ? 'is-active' : ''}`}
              onClick={() => setStickyTab((p) => (p === 'tag-manage' ? null : 'tag-manage'))}
              aria-pressed={stickyTab === 'tag-manage'}
              title="手动管理标签:添加 / 移除当前文章的标签"
              data-tool="tag-manage"
            >
              {stickyTab === 'tag-manage' ? '🙈 关闭标签' : '🏷 标签'}
            </button>
            <button
              type="button"
              className={`article-reader__btn ${stickyTab === 'tag-suggest' ? 'is-active' : ''}`}
              onClick={() => void handleSuggestTags()}
              disabled={needsContent}
              aria-pressed={stickyTab === 'tag-suggest'}
              title={needsContent ? '正文未清洗' : 'AI 推荐标签(可一键应用)'}
              data-tool="tag-suggest"
            >
              {busy && stickyTab === 'tag-suggest' && tagSuggestions.length === 0
                ? '⏳ 建议中...'
                : stickyTab === 'tag-suggest'
                  ? '🙈 关闭标签建议'
                  : tagSuggestions.length > 0
                    ? '🪄 显示标签建议'
                    : '🪄 标签建议'}
            </button>
            <button
              type="button"
              className={`article-reader__btn ${stickyTab === 'note' ? 'is-active' : ''}`}
              onClick={() => toggleStickyTab('note')}
              aria-pressed={stickyTab === 'note'}
              title="添加 Markdown 笔记(GFM:标题、代码块、列表)"
              data-tool="note"
            >
              {stickyTab === 'note' ? '🙈 关闭笔记' : '✎ 笔记'}
            </button>
            <button
              type="button"
              className="article-reader__btn"
              onClick={() => setTopicDialogOpen(true)}
              title="以当前文章新建专题"
              data-tool="topic"
            >
              ★ 专题
            </button>
          </div>
        </header>

        <div className="article-reader__body" onContextMenu={handleReaderContextMenu}>
          {content.loading ? (
            <LoadingView message="正在清洗正文..." />
          ) : content.error ? (
            <ErrorView message={content.error} onRetry={retry} />
          ) : isActive('translation') ? (
            // Phase 3.5.2:段落内翻译(原文 + 翻译插槽交替)。
            // 点完翻译按钮立即切到段渲染,每段挂一个 pending 插槽(不依赖 IPC 返回)。
            <TranslatedArticleView
              cleanedHtml={displayHtml ?? ''}
              paragraphs={translationParagraphs}
              onClose={() => removePanel('translation')}
            />
          ) : displayHtml ? (
            <div
              className="article-reader__content"
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          ) : (
            <EmptyView title="这篇文章还没有正文" hint="可能还没有内容,或者源站返回为空。点 ↗ 打开原文试试。" />
          )}
        </div>

        {/* 摘要:可拖拽悬浮窗,独立于粘性底部面板 */}
        <SummaryFloatingPanel
          open={isActive('summary')}
          onClose={() => removePanel('summary')}
          content={summary ? renderMarkdown(summary) : ''}
          loading={busy && isActive('summary') && !summary}
        />

        {/* 粘性底部面板:标签管理 / 标签建议 / 笔记(可拉伸 + 收起) */}
        <StickyBottomPanel
          activeTab={stickyTab}
          tabs={[
            { id: 'tag-manage', label: '标签', icon: '🏷', badge: articleTags.length },
            {
              id: 'tag-suggest',
              label: 'AI 建议',
              icon: '🪄',
              badge: tagSuggestions.length
            },
            { id: 'note', label: '笔记', icon: '✎' }
          ]}
          onTabChange={(id) => {
            // tab 切换不收起面板;点同一 tab 也不会自动收起(由 onClose 控制)
            // Phase 3.5.x toggle 修复: 不在此处自动调 handleSuggestTags —
            // AI 触发入口是工具栏 🪄 标签建议 按钮的 onClick(onClick → handleSuggestTags 走完整 toggle 逻辑),
            // 这里若再触发,会和按钮 onClick 形成双调,导致"点显示却调 AI"或"点关闭却再次建议"。
            setStickyTab(id as StickyTabId);
          }}
          onClose={() => setStickyTab(null)}
          renderContent={(tabId) => {
            if (tabId === 'tag-manage') {
              return (
                <TagManagePanel
                  articleTags={articleTags}
                  allTags={allTags}
                  onAdd={handleAddTagToArticle}
                  onRemove={handleRemoveTagFromArticle}
                  onCreate={handleCreateAndAddTag}
                />
              );
            }
            if (tabId === 'tag-suggest') {
              return (
                <TagSuggestPanel
                  busy={busy}
                  suggestions={tagSuggestions}
                  articleTagNames={new Set(articleTags.map((t) => t.name))}
                  onApply={handleApplyTagSuggestion}
                  onApplyAll={handleApplyAllSuggestions}
                />
              );
            }
            if (tabId === 'note') {
              return (
                <form className="sticky-note" onSubmit={handleAddNote}>
                  <textarea
                    className="sticky-note__input"
                    value={noteMarkdown}
                    onChange={(e) => setNoteMarkdown(e.target.value)}
                    placeholder="Markdown 笔记(GFM:标题、代码块、列表)"
                    rows={4}
                  />
                  <div className="sticky-note__actions">
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
              );
            }
            return null;
          }}
        />
            </div>
            <ArticleAiChatPanel
              open={chatOpen}
              articleTitle={parseArticleTitleTags(article.title).cleanTitle}
              messages={chatMessages}
              draft={chatDraft}
              busy={chatBusy}
              error={chatError}
              onDraftChange={setChatDraft}
              onSend={() => void sendChatMessage()}
              onClear={() => {
                setChatMessages([]);
                setChatDraft('');
                setChatError(null);
              }}
              onClose={() => setChatOpen(false)}
            />
          </section>
        )}

        {readerMode === 'dual' && (
          <div className="article-reader__pane-divider" role="separator" aria-orientation="vertical" />
        )}

        {readerMode !== 'reader' && (
          <WebArticleView articleId={article.id} sourceUrl={articleUrl} />
        )}
      </div>
      {selectionMenu && (
        <div
          className="article-reader__selection-menu"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          role="menu"
          aria-label="选中文字操作"
          data-ai-selection-menu
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="article-reader__selection-preview" title={selectionMenu.text}>
            {selectionMenu.text}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleTranslateSelection}
            disabled={chatBusy}
            data-ai-selection-action="translate"
          >
            🌐 翻译选中内容
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleAskSelection}
            disabled={chatBusy}
            data-ai-selection-action="ask"
          >
            💬 询问 AI
          </button>
        </div>
      )}
      {topicDialogOpen && (
        <TopicFormDialog
          mode="create"
          initialValue={{
            name: article.title.slice(0, 30),
            description: `由「${article.title}」触发创建`,
            keywords: []
          }}
          onSubmit={handleCreateTopic}
          onClose={() => setTopicDialogOpen(false)}
        />
      )}
    </div>
  );
}

/* ============================================================
 * StickyBottomPanel 的子组件(标签管理 / 标签建议)
 * ============================================================ */

interface TagManagePanelProps {
  articleTags: Tag[];
  allTags: Tag[];
  onAdd: (tag: Tag) => void;
  onRemove: (tagId: string) => void;
  onCreate: (name: string) => void;
}

function TagManagePanel({ articleTags, allTags, onAdd, onRemove, onCreate }: TagManagePanelProps) {
  const [newName, setNewName] = useState('');
  const appliedIds = new Set(articleTags.map((t) => t.id));
  const available = allTags.filter((t) => !appliedIds.has(t.id));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
  };

  return (
    <div className="sticky-tag-manage">
      <div className="sticky-tag-manage__section">
        <h4 className="sticky-tag-manage__heading">已应用({articleTags.length})</h4>
        {articleTags.length === 0 ? (
          <p className="sticky-tag-manage__empty">还没有标签。点上方 ✏ 添加。</p>
        ) : (
          <ul className="sticky-tag-manage__chips" data-sticky-section="applied">
            {articleTags.map((t) => (
              <li
                key={t.id}
                className="sticky-tag-manage__chip"
                style={{ borderColor: t.color ?? 'var(--accent)' }}
                data-sticky-chip-id={t.id}
              >
                <span
                  className="sticky-tag-manage__chip-dot"
                  style={{ background: t.color ?? 'var(--accent)' }}
                  aria-hidden="true"
                />
                <span className="sticky-tag-manage__chip-name">{t.name}</span>
                <button
                  type="button"
                  className="sticky-tag-manage__chip-remove"
                  onClick={() => onRemove(t.id)}
                  aria-label={`移除标签 ${t.name}`}
                  title="移除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky-tag-manage__section">
        <h4 className="sticky-tag-manage__heading">已有标签({available.length})</h4>
        {available.length === 0 ? (
          <p className="sticky-tag-manage__empty">所有标签都已应用到此文章。</p>
        ) : (
          <ul className="sticky-tag-manage__chips" data-sticky-section="available">
            {available.map((t) => (
              <li
                key={t.id}
                className="sticky-tag-manage__chip sticky-tag-manage__chip--add"
                style={{ borderColor: t.color ?? 'var(--border)' }}
                data-sticky-chip-id={t.id}
              >
                <span
                  className="sticky-tag-manage__chip-dot"
                  style={{ background: t.color ?? 'var(--border)' }}
                  aria-hidden="true"
                />
                <span className="sticky-tag-manage__chip-name">{t.name}</span>
                <button
                  type="button"
                  className="sticky-tag-manage__chip-add-btn"
                  onClick={() => onAdd(t)}
                  title="应用到当前文章"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="sticky-tag-manage__create" onSubmit={submit}>
        <input
          type="text"
          className="sticky-tag-manage__create-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新建标签并应用..."
          maxLength={32}
        />
        <button
          type="submit"
          className="article-reader__btn article-reader__btn--primary"
          disabled={!newName.trim()}
        >
          + 新建
        </button>
      </form>
    </div>
  );
}

interface TagSuggestPanelProps {
  busy: boolean;
  suggestions: Array<{ name: string; confidence: number; reason: string }>;
  articleTagNames: Set<string>;
  onApply: (name: string) => void;
  onApplyAll: () => void;
}

function TagSuggestPanel({ busy, suggestions, articleTagNames, onApply, onApplyAll }: TagSuggestPanelProps) {
  return (
    <div className="sticky-tag-suggest">
      {busy && suggestions.length === 0 ? (
        <div className="sticky-tag-suggest__loading">
          <div className="sticky-tag-suggest__spinner" aria-hidden="true" />
          <span>AI 正在分析文章...</span>
        </div>
      ) : suggestions.length === 0 ? (
        <p className="sticky-tag-suggest__empty">点 🪄 标签建议 按钮触发 AI 推荐。</p>
      ) : (
        <>
          <div className="sticky-tag-suggest__header">
            <span className="sticky-tag-suggest__count">共 {suggestions.length} 条建议</span>
            <button
              type="button"
              className="article-reader__btn article-reader__btn--primary"
              onClick={onApplyAll}
              data-sticky-action="apply-all"
            >
              一键全部应用
            </button>
          </div>
          <ul className="sticky-tag-suggest__list" data-sticky-section="suggestions">
            {suggestions.map((s, i) => {
              const applied = articleTagNames.has(s.name.trim());
              return (
                <li key={`${s.name}-${i}`} className="sticky-tag-suggest__item">
                  <div className="sticky-tag-suggest__main">
                    <span className="sticky-tag-suggest__name">{s.name}</span>
                    <span className="sticky-tag-suggest__confidence">
                      置信度 {Math.round(s.confidence * 100)}%
                    </span>
                    <span className="sticky-tag-suggest__reason">{s.reason}</span>
                  </div>
                  <button
                    type="button"
                    className={`article-reader__btn ${applied ? 'is-applied' : ''}`}
                    onClick={() => onApply(s.name)}
                    disabled={applied}
                    data-sticky-suggestion={s.name}
                  >
                    {applied ? '✓ 已应用' : '应用'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
