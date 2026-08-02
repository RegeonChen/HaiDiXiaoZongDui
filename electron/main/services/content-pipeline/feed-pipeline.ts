import { parseFeed } from './feed-parser';
import { fetchText } from './http-client';
import type { TextFetcher } from './http-client';
import type { CleanedContent, FeedPipelineOutput } from './types';

export interface FeedPipelineInput {
  feedId: string;
  feedUrl: string;
}

export interface FeedPipelineOptions {
  feedTimeoutMs?: number;
  onStage?: (stage: 'fetching' | 'parsing') => void;
}

export type { TextFetcher } from './http-client';

export type ContentCleaner = (html: string, articleUrl: string) => CleanedContent;

/**
 * Fetches and normalizes feed metadata only. Article pages are intentionally not
 * fetched here: full content is built lazily by ArticleContentPipeline when the
 * Reader or an AI feature first requests it.
 */
export class FeedPipeline {
  constructor(private readonly textFetcher: TextFetcher = fetchText) {}

  async syncFeed(
    input: FeedPipelineInput,
    options: FeedPipelineOptions = {}
  ): Promise<FeedPipelineOutput> {
    const startedAt = new Date().toISOString();
    options.onStage?.('fetching');
    const feedSource = await this.textFetcher(input.feedUrl, {
      timeoutMs: options.feedTimeoutMs ?? 15_000,
      maxBytes: 5 * 1024 * 1024
    });
    options.onStage?.('parsing');
    const feed = await parseFeed(feedSource, input.feedUrl);

    return {
      feedId: input.feedId,
      feedUrl: input.feedUrl,
      feed,
      articles: feed.articles,
      warnings: [],
      startedAt,
      finishedAt: new Date().toISOString()
    };
  }
}
