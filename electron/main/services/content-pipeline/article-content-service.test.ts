import { describe, expect, it, vi } from 'vitest';
import type { ArticleContentPipeline } from './article-content-pipeline';
import { ContentPipelineError } from './errors';
import {
  ArticleContentService,
  type ArticleContentStore
} from './article-content-service';
import type { ArticleContentOutput, ArticleContentTarget } from './types';

function target(overrides: Partial<ArticleContentTarget> = {}): ArticleContentTarget {
  return {
    articleId: 'article-1',
    articleUrl: 'https://example.com/article-1',
    feedRawHtml: '<p>Feed content</p>',
    feedRawText: null,
    sourceHtml: null,
    sourceKind: null,
    contentTitle: null,
    contentByline: null,
    contentExcerpt: null,
    cleanedHtml: null,
    cleanedMarkdown: null,
    cleaningStatus: 'pending',
    ...overrides
  };
}

function output(): ArticleContentOutput {
  return {
    articleId: 'article-1',
    articleUrl: 'https://example.com/article-1',
    sourceHtml: '<article>source</article>',
    sourceKind: 'article_page',
    title: 'Article',
    byline: null,
    excerpt: null,
    cleanedHtml: '<p>cleaned</p>',
    cleanedMarkdown: 'cleaned'
  };
}

function storeFor(value: ArticleContentTarget): ArticleContentStore {
  return {
    getArticleContentTarget: vi.fn(async () => value),
    markArticleContentInProgress: vi.fn(async () => undefined),
    saveArticleContent: vi.fn(async () => undefined),
    markArticleContentFailed: vi.fn(async () => undefined)
  };
}

describe('ArticleContentService', () => {
  it('returns persisted cleaned content without rebuilding', async () => {
    const store = storeFor(target({
      sourceHtml: '<article>cached</article>',
      sourceKind: 'article_page',
      contentTitle: 'Cached',
      cleanedHtml: '<p>cached</p>',
      cleanedMarkdown: 'cached',
      cleaningStatus: 'done'
    }));
    const pipeline = { build: vi.fn(async () => output()) } as unknown as ArticleContentPipeline;

    const result = await new ArticleContentService(store, pipeline).getOrBuild('article-1');

    expect(result.fromCache).toBe(true);
    expect(result.content.cleanedMarkdown).toBe('cached');
    expect(pipeline.build).not.toHaveBeenCalled();
  });

  it('rebuilds a cached Feed excerpt so opening the article retries the full page', async () => {
    const store = storeFor(target({
      sourceHtml: '<p>Feed excerpt <a href="https://example.com/article-1">查看全文</a></p>',
      sourceKind: 'feed_html',
      contentTitle: 'Excerpt',
      cleanedHtml: '<p>Feed excerpt 查看全文</p>',
      cleanedMarkdown: 'Feed excerpt 查看全文',
      cleaningStatus: 'done'
    }));
    const pipeline = { build: vi.fn(async () => output()) } as unknown as ArticleContentPipeline;

    const result = await new ArticleContentService(store, pipeline).getOrBuild('article-1');

    expect(result.fromCache).toBe(false);
    expect(pipeline.build).toHaveBeenCalledOnce();
    expect(store.markArticleContentInProgress).toHaveBeenCalledWith('article-1');
    expect(store.saveArticleContent).toHaveBeenCalledOnce();
  });

  it('builds once, persists the result and shares concurrent requests', async () => {
    const store = storeFor(target());
    const pipeline = { build: vi.fn(async () => output()) } as unknown as ArticleContentPipeline;
    const service = new ArticleContentService(store, pipeline);

    const [first, second] = await Promise.all([
      service.getOrBuild('article-1'),
      service.getOrBuild('article-1')
    ]);

    expect(first.fromCache).toBe(false);
    expect(second.content).toEqual(first.content);
    expect(pipeline.build).toHaveBeenCalledOnce();
    expect(store.markArticleContentInProgress).toHaveBeenCalledOnce();
    expect(store.saveArticleContent).toHaveBeenCalledOnce();
  });

  it('records a failed lazy build', async () => {
    const store = storeFor(target());
    const pipeline = {
      build: vi.fn(async () => { throw new Error('clean failed'); })
    } as unknown as ArticleContentPipeline;

    await expect(new ArticleContentService(store, pipeline).getOrBuild('article-1'))
      .rejects.toThrow('clean failed');
    expect(store.markArticleContentFailed).toHaveBeenCalledWith('article-1', 'clean failed');
  });

  it('persists stable error codes for failed content cleaning', async () => {
    const store = storeFor(target());
    const pipeline = {
      build: vi.fn(async () => {
        throw new ContentPipelineError('CONTENT_EMPTY', '正文为空');
      })
    } as unknown as ArticleContentPipeline;

    await expect(new ArticleContentService(store, pipeline).getOrBuild('article-1'))
      .rejects.toThrow('正文为空');
    expect(store.markArticleContentFailed).toHaveBeenCalledWith(
      'article-1',
      '[CONTENT_EMPTY] 正文为空'
    );
  });
});
