import { cleanArticleContent } from './content-cleaner';
import { ContentPipelineError } from './errors';
import { fetchText } from './http-client';
import type { ContentCleaner, TextFetcher } from './feed-pipeline';
import type {
  ArticleContentOutput,
  ArticleContentSourceKind,
  ArticleContentTarget
} from './types';

export interface ArticleContentPipelineOptions {
  articleTimeoutMs?: number;
}

/** Builds full reader content only when an article is opened or needed by AI. */
export class ArticleContentPipeline {
  constructor(
    private readonly textFetcher: TextFetcher = fetchText,
    private readonly contentCleaner: ContentCleaner = cleanArticleContent
  ) {}

  async build(
    target: ArticleContentTarget,
    options: ArticleContentPipelineOptions = {}
  ): Promise<ArticleContentOutput> {
    // Feed 内容只是降级预览，绝不能当成正文缓存永久复用。否则一次网络失败就会
    // 把「查看全文」之类的 RSS 摘要固化为阅读器正文，之后再也没有机会抓取原文。
    const hasPersistedArticlePage =
      target.sourceKind === 'article_page' && target.sourceHtml?.trim() !== '';
    const fetched = hasPersistedArticlePage
      ? null
      : await this.fetchArticlePage(target.articleUrl, options.articleTimeoutMs ?? 20_000);
    const source = selectSource(fetched, target);
    const cleaned = this.contentCleaner(source.html, target.articleUrl);

    return {
      articleId: target.articleId,
      articleUrl: target.articleUrl,
      sourceHtml: source.html,
      sourceKind: source.kind,
      ...cleaned
    };
  }

  private async fetchArticlePage(url: string, timeoutMs: number): Promise<string | null> {
    try {
      const html = await this.textFetcher(url, {
        timeoutMs,
        maxBytes: 10 * 1024 * 1024,
        accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1'
      });
      return html.trim() ? html : null;
    } catch {
      return null;
    }
  }
}

function selectSource(
  fetchedHtml: string | null,
  target: ArticleContentTarget
): { html: string; kind: ArticleContentSourceKind } {
  // Only a successfully fetched article page is authoritative persisted source.
  // `feed_html` / `feed_text` may contain a shortened description plus a
  // "read more" link, so a newly fetched page must take precedence over them.
  if (target.sourceKind === 'article_page' && target.sourceHtml?.trim()) {
    return { html: target.sourceHtml, kind: target.sourceKind ?? 'article_page' };
  }
  if (fetchedHtml) return { html: fetchedHtml, kind: 'article_page' };
  if (target.feedRawHtml.trim()) {
    return { html: target.feedRawHtml, kind: 'feed_html' };
  }
  if (target.feedRawText?.trim()) {
    return {
      html: `<article><p>${escapeHtml(target.feedRawText)}</p></article>`,
      kind: 'feed_text'
    };
  }
  throw new ContentPipelineError('CONTENT_EMPTY', '文章页面和 Feed 均未提供可清洗正文');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
