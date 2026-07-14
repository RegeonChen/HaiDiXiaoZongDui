import type { FeedType, IsoTimestamp } from '../../../../shared/types';

/** Feed parser output before persistence assigns database IDs. */
export interface ParsedFeed {
  title: string;
  siteTitle: string;
  description: string;
  link: string;
  feedType: FeedType;
  iconUrl: string | null;
  articles: ParsedArticle[];
}

/** Article data normalized across RSS, Atom and JSON Feed. */
export interface ParsedArticle {
  title: string;
  url: string;
  author: string | null;
  publishedAt: IsoTimestamp | null;
  rawHtml: string;
  rawText: string | null;
  guid: string;
}

export interface CleanedContent {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  cleanedHtml: string;
  cleanedMarkdown: string;
}

export interface PipelineArticle extends ParsedArticle {
  cleanedHtml: string | null;
  cleanedMarkdown: string | null;
  cleaningStatus: 'done' | 'failed';
  cleaningError: string | null;
}

export interface FeedPipelineOutput {
  feedId: string;
  feedUrl: string;
  feed: ParsedFeed;
  articles: PipelineArticle[];
  warnings: string[];
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
}

export interface OpmlFeedEntry {
  title: string;
  url: string;
  siteUrl: string | null;
  groupName: string | null;
}

export interface ParsedOpml {
  title: string;
  feeds: OpmlFeedEntry[];
  feedsSkipped: number;
  errors: string[];
}
