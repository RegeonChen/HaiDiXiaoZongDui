import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import type { FeedType, IsoTimestamp } from '../../../../shared/types';
import { ContentPipelineError } from './errors';
import type { ParsedArticle, ParsedFeed } from './types';

interface XmlFeedExtension {
  generator?: string;
}

interface XmlItemExtension {
  'content:encoded'?: string;
  author?: string;
  id?: string;
}

const xmlParser = new Parser<XmlFeedExtension, XmlItemExtension>({
  customFields: {
    feed: ['generator'],
    item: ['content:encoded', 'author', 'id']
  }
});

export async function parseFeed(source: string, feedUrl: string): Promise<ParsedFeed> {
  const normalizedFeedUrl = normalizeHttpUrl(feedUrl);
  const trimmed = source.trim();

  if (!trimmed) {
    throw new ContentPipelineError('FEED_EMPTY', 'Feed 内容为空');
  }

  if (trimmed.startsWith('{')) {
    return parseJsonFeed(trimmed, normalizedFeedUrl);
  }

  return parseXmlFeed(trimmed, normalizedFeedUrl);
}

async function parseXmlFeed(source: string, feedUrl: string): Promise<ParsedFeed> {
  const feedType = detectXmlFeedType(source);

  try {
    const parsed = await xmlParser.parseString(source);
    const title = cleanText(parsed.title) ?? new URL(feedUrl).hostname;
    const seenGuids = new Set<string>();
    const articles: ParsedArticle[] = [];

    for (const item of parsed.items) {
      const candidateUrl = firstNonEmpty(item.link, isHttpUrl(item.guid) ? item.guid : undefined);
      if (!candidateUrl) continue;

      const url = resolveHttpUrl(candidateUrl, feedUrl);
      if (!url) continue;

      const guid = cleanText(item.guid) ?? cleanText(item.id) ?? fallbackGuid(url);
      if (seenGuids.has(guid)) continue;
      seenGuids.add(guid);

      const encodedContent = cleanString(item['content:encoded']);
      const regularContent = cleanString(item.content);
      const htmlContent = encodedContent ??
        (regularContent && looksLikeHtml(regularContent) ? regularContent : '');
      const textContent = cleanText(item.contentSnippet) ??
        (!looksLikeHtml(regularContent) ? cleanText(regularContent) : null);

      articles.push({
        title: cleanText(item.title) ?? 'Untitled',
        url,
        author: cleanText(item.creator) ?? cleanText(item.author),
        publishedAt: toIsoTimestamp(item.isoDate ?? item.pubDate),
        rawHtml: htmlContent,
        rawText: textContent,
        guid
      });
    }

    return {
      title,
      siteTitle: title,
      description: cleanText(parsed.description) ?? '',
      link: resolveHttpUrl(parsed.link, feedUrl) ?? feedUrl,
      feedType,
      iconUrl: parsed.image?.url ? resolveHttpUrl(parsed.image.url, feedUrl) : null,
      articles
    };
  } catch (error) {
    if (error instanceof ContentPipelineError) throw error;
    throw new ContentPipelineError('FEED_PARSE_FAILED', 'RSS/Atom 解析失败', error);
  }
}

function parseJsonFeed(source: string, feedUrl: string): ParsedFeed {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new ContentPipelineError('FEED_PARSE_FAILED', 'JSON Feed 不是有效的 JSON', error);
  }

  if (!isRecord(value)) {
    throw new ContentPipelineError('FEED_PARSE_FAILED', 'JSON Feed 根节点必须是对象');
  }

  const version = getString(value, 'version');
  if (!version?.startsWith('https://jsonfeed.org/version/')) {
    throw new ContentPipelineError('FEED_UNSUPPORTED', 'JSON Feed version 字段无效或不受支持');
  }

  const title = cleanText(getString(value, 'title')) ?? new URL(feedUrl).hostname;
  const rawItems = Array.isArray(value['items']) ? value['items'] : [];
  const seenGuids = new Set<string>();
  const articles: ParsedArticle[] = [];

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) continue;

    const candidateUrl = firstNonEmpty(
      getString(rawItem, 'url'),
      getString(rawItem, 'external_url')
    );
    if (!candidateUrl) continue;

    const url = resolveHttpUrl(candidateUrl, feedUrl);
    if (!url) continue;

    const guid = cleanText(getString(rawItem, 'id')) ?? fallbackGuid(url);
    if (seenGuids.has(guid)) continue;
    seenGuids.add(guid);

    articles.push({
      title: cleanText(getString(rawItem, 'title')) ?? 'Untitled',
      url,
      author: jsonFeedAuthor(rawItem),
      publishedAt: toIsoTimestamp(
        getString(rawItem, 'date_published') ?? getString(rawItem, 'date_modified')
      ),
      rawHtml: cleanString(getString(rawItem, 'content_html')) ?? '',
      rawText: cleanText(getString(rawItem, 'content_text')),
      guid
    });
  }

  return {
    title,
    siteTitle: title,
    description: cleanText(getString(value, 'description')) ?? '',
    link: resolveHttpUrl(getString(value, 'home_page_url'), feedUrl) ?? feedUrl,
    feedType: 'jsonfeed',
    iconUrl: resolveHttpUrl(
      getString(value, 'icon') ?? getString(value, 'favicon'),
      feedUrl
    ),
    articles
  };
}

function jsonFeedAuthor(item: Record<string, unknown>): string | null {
  const authors = item['authors'];
  if (Array.isArray(authors)) {
    for (const author of authors) {
      if (!isRecord(author)) continue;
      const name = cleanText(getString(author, 'name'));
      if (name) return name;
    }
  }

  const author = item['author'];
  return isRecord(author) ? cleanText(getString(author, 'name')) : null;
}

function detectXmlFeedType(source: string): FeedType {
  const withoutProlog = source
    .replace(/^\uFEFF/, '')
    // XML feeds may contain more than the declaration before the root node,
    // for example `<?xml-stylesheet ...?>`. Skip all leading processing
    // instructions and comments instead of only handling `<?xml ...?>`.
    .replace(/^(?:\s*(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->))+\s*/i, '')
    .trimStart();

  if (/^<feed(?:\s|>)/i.test(withoutProlog)) return 'atom';
  if (/^<(?:rss|rdf:RDF)(?:\s|>)/i.test(withoutProlog)) return 'rss';
  throw new ContentPipelineError('FEED_UNSUPPORTED', '无法识别 Feed 格式');
}

export function normalizeHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ContentPipelineError('URL_PROTOCOL_UNSUPPORTED', '仅支持 http 和 https URL');
  }
  url.hash = '';
  return url.toString();
}

function resolveHttpUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return normalizeHttpUrl(new URL(value, baseUrl).toString());
  } catch {
    return null;
  }
}

function fallbackGuid(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function toIsoTimestamp(value: string | undefined): IsoTimestamp | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function looksLikeHtml(value: string | null): boolean {
  return value !== null && /<\/?[a-z][\s\S]*>/i.test(value);
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() ? value : null;
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.replace(/\s+/g, ' ').trim() : null;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim() !== '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}
