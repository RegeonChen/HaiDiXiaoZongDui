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

export interface FeedPipelineOutput {
  feedId: string;
  feedUrl: string;
  feed: ParsedFeed;
  articles: ParsedArticle[];
  warnings: string[];
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
}

export type ArticleContentSourceKind = 'article_page' | 'feed_html' | 'feed_text';

/** Input loaded from Task 2.3 when content is requested by Reader or AI. */
export interface ArticleContentTarget {
  articleId: string;
  articleUrl: string;
  feedRawHtml: string;
  feedRawText: string | null;
  sourceHtml: string | null;
  sourceKind: ArticleContentSourceKind | null;
  contentTitle: string | null;
  contentByline: string | null;
  contentExcerpt: string | null;
  cleanedHtml: string | null;
  cleanedMarkdown: string | null;
  cleaningStatus: 'pending' | 'in_progress' | 'done' | 'failed';
}

/** Persisted result of the on-demand article content pipeline. */
export interface ArticleContentOutput extends CleanedContent {
  articleId: string;
  articleUrl: string;
  sourceHtml: string;
  sourceKind: ArticleContentSourceKind;
}

export interface ArticleContentResult {
  content: ArticleContentOutput;
  fromCache: boolean;
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
