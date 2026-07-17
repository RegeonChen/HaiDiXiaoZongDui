import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import type { Article, Feed, IsoTimestamp } from '../../../../shared/types';

export type TopicContentSource = 'cleaned_markdown' | 'raw_text' | 'raw_html' | 'unavailable';
export type TopicPublishedAtSource = 'published_at' | 'fetched_at' | 'created_at';

/** Stable, source-attributed article input consumed by Phase 4 topic analysis. */
export interface TopicAnalysisInput {
  articleId: string;
  feedId: string;
  title: string;
  articleUrl: string;
  canonicalUrl: string;
  author: string | null;
  publishedAt: IsoTimestamp;
  publishedAtSource: TopicPublishedAtSource;
  sourceTitle: string;
  sourceFeedUrl: string;
  sourceSiteUrl: string | null;
  content: string;
  contentSource: TopicContentSource;
  summary: string | null;
  contentFingerprint: string | null;
  duplicateOfArticleId: string | null;
}

export interface TopicDuplicateGroup {
  primaryArticleId: string;
  articleIds: string[];
}

export interface TopicAnalysisBatch {
  /** All normalized articles, including duplicates for source traceability. */
  items: TopicAnalysisInput[];
  /** One representative per exact URL/content duplicate group. */
  uniqueItems: TopicAnalysisInput[];
  duplicateGroups: TopicDuplicateGroup[];
}

const TRACKING_PARAMETERS = new Set([
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'source'
]);
const MIN_CONTENT_FINGERPRINT_CHARACTERS = 80;

export function prepareTopicAnalysisInputs(articles: Article[], feeds: Feed[]): TopicAnalysisBatch {
  const feedsById = new Map(feeds.map((feed) => [feed.id, feed]));
  const items = articles.map((article) => normalizeTopicAnalysisInput(
    article,
    feedsById.get(article.feedId)
  ));
  const parents = items.map((_, index) => index);
  const firstIndexByKey = new Map<string, number>();
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const primary = Math.min(leftRoot, rightRoot);
    const duplicate = Math.max(leftRoot, rightRoot);
    parents[duplicate] = primary;
  };

  items.forEach((item, index) => {
    for (const key of duplicateKeys(item)) {
      const previousIndex = firstIndexByKey.get(key);
      if (previousIndex === undefined) firstIndexByKey.set(key, index);
      else union(index, previousIndex);
    }
  });

  const articleIdsByRoot = new Map<number, string[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const articleIds = articleIdsByRoot.get(root) ?? [];
    articleIds.push(item.articleId);
    articleIdsByRoot.set(root, articleIds);
    if (root !== index) item.duplicateOfArticleId = items[root].articleId;
  });
  const duplicateGroups: TopicDuplicateGroup[] = [];
  for (const [root, articleIds] of articleIdsByRoot) {
    if (articleIds.length > 1) {
      duplicateGroups.push({ primaryArticleId: items[root].articleId, articleIds });
    }
  }

  return {
    items,
    uniqueItems: items.filter((item) => item.duplicateOfArticleId === null),
    duplicateGroups
  };
}

export function normalizeTopicAnalysisInput(article: Article, feed?: Feed): TopicAnalysisInput {
  const canonicalUrl = canonicalizeArticleUrl(article.url);
  const { value: publishedAt, source: publishedAtSource } = stablePublishedAt(article);
  const { content, source: contentSource } = bestAvailableContent(article);
  const title = normalizedTitle(article.title, canonicalUrl);
  const sourceFeedUrl = feed?.url.trim() || '';
  const sourceSiteUrl = validHttpUrl(feed?.link) ?? validHttpUrl(sourceFeedUrl);

  return {
    articleId: article.id,
    feedId: article.feedId,
    title,
    articleUrl: article.url.trim(),
    canonicalUrl,
    author: normalizeOptionalText(article.author),
    publishedAt,
    publishedAtSource,
    sourceTitle: normalizedSourceTitle(feed, canonicalUrl),
    sourceFeedUrl,
    sourceSiteUrl,
    content,
    contentSource,
    summary: normalizeOptionalMarkdown(article.summary),
    contentFingerprint: createContentFingerprint(content),
    duplicateOfArticleId: null
  };
}

export function canonicalizeArticleUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return trimmed;
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    for (const name of [...url.searchParams.keys()]) {
      if (name.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(name.toLowerCase())) {
        url.searchParams.delete(name);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return trimmed;
  }
}

function duplicateKeys(item: TopicAnalysisInput): string[] {
  const keys: string[] = [];
  if (item.canonicalUrl) keys.push(`url:${item.canonicalUrl}`);
  if (item.contentFingerprint) keys.push(`content:${item.contentFingerprint}`);
  return keys;
}

function bestAvailableContent(article: Article): { content: string; source: TopicContentSource } {
  const cleanedMarkdown = normalizeMarkdown(article.cleanedMarkdown);
  if (cleanedMarkdown) return { content: cleanedMarkdown, source: 'cleaned_markdown' };
  const rawText = normalizePlainText(article.rawText);
  if (rawText) return { content: rawText, source: 'raw_text' };
  const rawHtmlText = htmlToPlainText(article.rawHtml);
  if (rawHtmlText) return { content: rawHtmlText, source: 'raw_html' };
  return { content: '', source: 'unavailable' };
}

function stablePublishedAt(article: Article): {
  value: IsoTimestamp;
  source: TopicPublishedAtSource;
} {
  const publishedAt = normalizeTimestamp(article.publishedAt);
  if (publishedAt) return { value: publishedAt, source: 'published_at' };
  const fetchedAt = normalizeTimestamp(article.fetchedAt);
  if (fetchedAt) return { value: fetchedAt, source: 'fetched_at' };
  return {
    value: normalizeTimestamp(article.createdAt) ?? new Date(0).toISOString(),
    source: 'created_at'
  };
}

function normalizedTitle(value: string, canonicalUrl: string): string {
  const normalized = normalizeOptionalText(value);
  if (normalized) return normalized;
  const hostname = hostnameFromUrl(canonicalUrl);
  return hostname ? `Untitled article (${hostname})` : 'Untitled article';
}

function normalizedSourceTitle(feed: Feed | undefined, articleUrl: string): string {
  const title = normalizeOptionalText(feed?.siteTitle) ?? normalizeOptionalText(feed?.title);
  if (title) return title;
  return hostnameFromUrl(feed?.url ?? articleUrl) ?? 'Unknown source';
}

function createContentFingerprint(content: string): string | null {
  const comparableContent = content.toLowerCase()
    .replace(/[`*_#>\[\]()|~-]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (comparableContent.length < MIN_CONTENT_FINGERPRINT_CHARACTERS) return null;
  return crypto.createHash('sha256')
    .update(comparableContent)
    .digest('hex');
}

function normalizeMarkdown(value: string | null | undefined): string {
  return value?.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim() ?? '';
}

function normalizeOptionalMarkdown(value: string | null | undefined): string | null {
  return normalizeMarkdown(value) || null;
}

function normalizePlainText(value: string | null | undefined): string {
  return value?.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim() ?? '';
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function normalizeTimestamp(value: string | null | undefined): IsoTimestamp | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function validHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function htmlToPlainText(value: string): string {
  if (!value.trim()) return '';
  try {
    const document = new JSDOM(value).window.document;
    for (const element of document.querySelectorAll('script, style, noscript, nav, aside')) {
      element.remove();
    }
    return normalizePlainText(document.body.textContent);
  } catch {
    return '';
  }
}
