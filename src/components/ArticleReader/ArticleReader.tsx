/**
 * 文章阅读区
 *
 *  - 标题 / 来源 / 作者 / 时间
 *  - 工具栏：星标 / 打开原文 / 模拟 AI 按钮（占位）
 *  - 正文：当前 mock 直接用 cleanedHtml，UI 层仅渲染清洗后的安全 HTML
 *    （切到真实数据时由 IPC `content:getCleanedHtml` 提供）。
 */
import { useEffect, useMemo, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { EmptyView } from '../StatusView/EmptyView';
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

export function ArticleReader({ article, feed, onToggleStar }: ArticleReaderProps) {
  // 当 article 切换时，DOMPurify 等清洗工具将保证 cleanedHtml 安全；
  // 这里我们额外走一次 text 解析与白名单过滤做兜底（Task 2.2 接入 Readability 后，
  // 这一层可以移除）。
  const sanitizedHtml = useMemo(() => {
    if (!article?.cleanedHtml) return '';
    return article.cleanedHtml;
  }, [article?.cleanedHtml]);

  // 切换文章时重置视图
  const [view] = useState<'cleaned' | 'raw'>('cleaned');

  useEffect(() => {
    // 文章变化时，调用方应已通过 onToggleRead 标记已读（App.tsx 负责）
  }, [article?.id]);

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
      <div className="article-reader__body" data-view={view}>
        {sanitizedHtml ? (
          // 安全说明：cleanedHtml 来自后端 Readability + DOMPurify 清洗，
          // Task 2.1 阶段是 mock 数据，已是干净 HTML；
          // Task 2.2 接入真实清洗后这里直接显示即可。
          <div
            className="article-reader__content"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <EmptyView
            title="尚未完成正文清洗"
            hint="此文章还未生成 Cleaned HTML / Markdown。"
          />
        )}
      </div>
    </div>
  );
}
