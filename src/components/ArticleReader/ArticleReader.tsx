/**
 * 文章阅读区
 *
 *  - 标题 / 来源 / 作者 / 时间
 *  - 工具栏：星标 / 打开原文 / AI 占位按钮
 *  - 正文：
 *    - 优先用 article.cleanedHtml（mock 模式或文章已清洗）
 *    - 否则通过 useDataSource().getCleanedHtml(articleId) 按需拉取（IPC 模式）
 *    - 拉取过程中显示 LoadingView
 *    - 失败时显示 ErrorView 并提供重试
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
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

interface ContentState {
  html: string | null;
  loading: boolean;
  error: string | null;
}

export function ArticleReader({ article, feed, onToggleStar }: ArticleReaderProps) {
  const ds = useDataSource();
  const [content, setContent] = useState<ContentState>({ html: null, loading: false, error: null });

  // article 切换时决定如何取正文
  useEffect(() => {
    if (!article) {
      setContent({ html: null, loading: false, error: null });
      return;
    }
    // 已有 cleanedHtml（mock / 同步时已清洗）
    if (article.cleanedHtml) {
      setContent({ html: article.cleanedHtml, loading: false, error: null });
      return;
    }
    // cleaningStatus === 'pending' 或 null —— 按需拉
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
      } else {
        setContent({ html: null, loading: true, error: null });
      }
    })();
  };

  if (!article) {
    return (
      <div className="article-reader">
        <EmptyView
          title="选择一篇文章开始阅读"
          hint="从左侧列表中选一篇文章，正文会显示在这里。"
        />
      </div>
    );
  }

  return (
    <div className="article-reader">
      <header className="article-reader__header">
        <h1 className="article-reader__title">{article.title}</h1>
        <div className="article-reader__meta">
          {feed && <span className="article-reader__feed">{feed.title}</span>}
          {article.author && <span>· {article.author}</span>}
          <span>· {formatAbsolute(article.publishedAt)}</span>
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
            // 安全说明：html 来自后端 IPC content.getCleanedHtml
            // （已经 Readability + DOMPurify 清洗），或者 mock 模式下的 mockData。
            // eslint-disable-next-line react/no-danger
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
  );
}
