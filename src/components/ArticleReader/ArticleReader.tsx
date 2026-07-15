/**
 * 文章阅读区（Mercury 风格）
 *  - 顶部：URL 链接（带 link 图标）
 *  - 标题：serif 大字
 *  - 工具栏：星标 / 打开原文 / AI 占位
 *  - 正文：默认 sans-serif 字体，line-height 1.7
 *    （Mercury 截图用 monospace——可在设置页加切换；当前用 sans）
 *  - 底部：「摘要」折叠面板（Phase 3.1 落地）
 */
import { useEffect, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { EmptyView } from '../StatusView/EmptyView';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
import './ArticleReader.css';

export interface ArticleReaderProps {
  article: Article | null;
  feed: Feed | null;
  onToggleStar: (articleId: string, isStarred: boolean) => void;
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

export function ArticleReader({ article, feed, onToggleStar }: ArticleReaderProps) {
  const ds = useDataSource();
  const [content, setContent] = useState<ContentState>({ html: null, loading: false, error: null });
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!article) {
      setContent({ html: null, loading: false, error: null });
      return;
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
            {feed && (
              <span className="article-reader__feed">{feed.siteTitle || feed.title}</span>
            )}
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
            <button type="button" className="article-reader__btn" disabled>
              生成摘要
            </button>
            <button type="button" className="article-reader__btn" disabled>
              翻译
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
            <EmptyView
              title="此文章暂无正文"
              hint="可能还没有内容，或者源站返回为空。"
            />
          )}
        </div>
      </div>

      {/* 底部「摘要」折叠（Phase 3.1 落地） */}
      <div className="article-reader__summary" data-open={showSummary}>
        <button
          type="button"
          className="article-reader__summary-toggle"
          onClick={() => setShowSummary((s) => !s)}
          aria-expanded={showSummary}
        >
          <span>摘要</span>
          <span className="article-reader__summary-chevron">{showSummary ? '∧' : '∨'}</span>
        </button>
        {showSummary && (
          <div className="article-reader__summary-content">
            <p className="article-reader__summary-placeholder">
              摘要功能由 AI Agent 提供（Phase 3 落地）
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
