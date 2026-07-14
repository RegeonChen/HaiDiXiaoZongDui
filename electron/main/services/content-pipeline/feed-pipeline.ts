import { cleanArticleContent } from './content-cleaner';
import { errorMessage } from './errors';
import { parseFeed } from './feed-parser';
import { fetchText } from './http-client';
import type {
  CleanedContent,
  FeedPipelineOutput,
  ParsedArticle,
  PipelineArticle
} from './types';

export interface FeedPipelineInput {
  feedId: string;
  feedUrl: string;
}

export interface FeedPipelineOptions {
  fetchArticlePages?: boolean;
  articleConcurrency?: number;
  feedTimeoutMs?: number;
  articleTimeoutMs?: number;
}

export type TextFetcher = (url: string, options?: {
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
}) => Promise<string>;

export type ContentCleaner = (html: string, articleUrl: string) => CleanedContent;

/**
 * Fetches and normalizes one feed. Persistence is deliberately left to Task 2.3:
 * the database layer receives this output, performs GUID deduplication, and then
 * calculates SyncResult.newArticles / updatedArticles.
 */
export class FeedPipeline {
  constructor(
    private readonly textFetcher: TextFetcher = fetchText,
    private readonly contentCleaner: ContentCleaner = cleanArticleContent
  ) {}

  async syncFeed(
    input: FeedPipelineInput,
    options: FeedPipelineOptions = {}
  ): Promise<FeedPipelineOutput> {
    const startedAt = new Date().toISOString();
    const feedSource = await this.textFetcher(input.feedUrl, {
      timeoutMs: options.feedTimeoutMs ?? 15_000,
      maxBytes: 5 * 1024 * 1024
    });
    const feed = await parseFeed(feedSource, input.feedUrl);
    const warnings: string[] = [];
    const concurrency = clampConcurrency(options.articleConcurrency ?? 4);

    const articles = await mapWithConcurrency(
      feed.articles,
      concurrency,
      (article) => this.processArticle(
        article,
        options.fetchArticlePages ?? true,
        options.articleTimeoutMs ?? 20_000,
        warnings
      )
    );

    return {
      feedId: input.feedId,
      feedUrl: input.feedUrl,
      feed,
      articles,
      warnings,
      startedAt,
      finishedAt: new Date().toISOString()
    };
  }

  private async processArticle(
    article: ParsedArticle,
    fetchArticlePage: boolean,
    timeoutMs: number,
    warnings: string[]
  ): Promise<PipelineArticle> {
    let sourceHtml = article.rawHtml;

    if (fetchArticlePage) {
      try {
        sourceHtml = await this.textFetcher(article.url, {
          timeoutMs,
          maxBytes: 10 * 1024 * 1024,
          accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1'
        });
      } catch (error) {
        warnings.push(`文章页面抓取失败，回退 Feed 内容：${article.url}（${errorMessage(error)}）`);
      }
    }

    if (!sourceHtml.trim() && article.rawText) {
      sourceHtml = `<article><p>${escapeHtml(article.rawText)}</p></article>`;
    }

    if (!sourceHtml.trim()) {
      const message = 'Feed 与文章页面均未提供可清洗正文';
      warnings.push(`${message}：${article.url}`);
      return failedArticle(article, message);
    }

    try {
      const cleaned = this.contentCleaner(sourceHtml, article.url);
      return {
        ...article,
        cleanedHtml: cleaned.cleanedHtml,
        cleanedMarkdown: cleaned.cleanedMarkdown,
        cleaningStatus: 'done',
        cleaningError: null
      };
    } catch (error) {
      const message = errorMessage(error);
      warnings.push(`文章清洗失败：${article.url}（${message}）`);
      return failedArticle(article, message);
    }
  }
}

function failedArticle(article: ParsedArticle, message: string): PipelineArticle {
  return {
    ...article,
    cleanedHtml: null,
    cleanedMarkdown: null,
    cleaningStatus: 'failed',
    cleaningError: message
  };
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const value = values[currentIndex];
      if (value !== undefined) results[currentIndex] = await mapper(value);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(values.length, 1)) }, () => worker())
  );
  return results;
}

function clampConcurrency(value: number): number {
  if (!Number.isInteger(value)) return 4;
  return Math.min(Math.max(value, 1), 8);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
