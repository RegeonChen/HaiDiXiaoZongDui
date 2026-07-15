import { ArticleContentPipeline } from './article-content-pipeline';
import { diagnosticErrorMessage } from './errors';
import type {
  ArticleContentOutput,
  ArticleContentResult,
  ArticleContentTarget
} from './types';

/** Implemented by Task 2.3 without exposing database internals. */
export interface ArticleContentStore {
  getArticleContentTarget(articleId: string): Promise<ArticleContentTarget | null>;
  markArticleContentInProgress(articleId: string): Promise<void>;
  saveArticleContent(content: ArticleContentOutput): Promise<void>;
  markArticleContentFailed(articleId: string, error: string): Promise<void>;
}

export class ArticleContentService {
  private readonly inFlight = new Map<string, Promise<ArticleContentResult>>();

  constructor(
    private readonly store: ArticleContentStore,
    private readonly pipeline = new ArticleContentPipeline()
  ) {}

  async getOrBuild(articleId: string): Promise<ArticleContentResult> {
    const existingBuild = this.inFlight.get(articleId);
    if (existingBuild) return existingBuild;

    const build = this.loadOrBuild(articleId).finally(() => {
      this.inFlight.delete(articleId);
    });
    this.inFlight.set(articleId, build);
    return build;
  }

  private async loadOrBuild(articleId: string): Promise<ArticleContentResult> {
    const target = await this.store.getArticleContentTarget(articleId);
    if (!target) throw new Error(`未找到文章：${articleId}`);

    if (
      target.cleaningStatus === 'done' &&
      target.cleanedHtml !== null &&
      target.cleanedMarkdown !== null &&
      target.sourceHtml !== null
    ) {
      return {
        content: cachedContent(target),
        fromCache: true
      };
    }

    try {
      await this.store.markArticleContentInProgress(articleId);
      const content = await this.pipeline.build(target);
      await this.store.saveArticleContent(content);
      return { content, fromCache: false };
    } catch (error) {
      await this.store.markArticleContentFailed(articleId, diagnosticErrorMessage(error));
      throw error;
    }
  }
}

function cachedContent(target: ArticleContentTarget): ArticleContentOutput {
  return {
    articleId: target.articleId,
    articleUrl: target.articleUrl,
    sourceHtml: target.sourceHtml ?? '',
    sourceKind: target.sourceKind ?? 'article_page',
    title: target.contentTitle,
    byline: target.contentByline,
    excerpt: target.contentExcerpt,
    cleanedHtml: target.cleanedHtml ?? '',
    cleanedMarkdown: target.cleanedMarkdown ?? ''
  };
}
