import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import type { OpmlImportResult } from '../../../../shared/types';
import { ContentPipelineError, errorMessage } from './errors';
import type { OpmlFeedEntry, ParsedOpml } from './types';

const MAX_OPML_BYTES = 5 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
});

/** Implemented by Task 2.3; OPML code never reaches into SQLite directly. */
export interface OpmlFeedStore {
  importFeedEntries(feeds: OpmlFeedEntry[]): Promise<{
    feedsImported: number;
    feedsSkipped: number;
    errors: string[];
  }>;
  listFeedEntriesForExport(): Promise<OpmlFeedEntry[]>;
}

export class OpmlApplicationService {
  constructor(private readonly store: OpmlFeedStore) {}

  async importFile(filePath: string): Promise<OpmlImportResult> {
    const parsed = await importOpmlFile(filePath);
    const stored = await this.store.importFeedEntries(parsed.feeds);
    return {
      feedsImported: stored.feedsImported,
      feedsSkipped: parsed.feedsSkipped + stored.feedsSkipped,
      errors: [...parsed.errors, ...stored.errors]
    };
  }

  async exportFile(filePath: string): Promise<void> {
    await exportOpmlFile(filePath, await this.store.listFeedEntriesForExport());
  }
}

export function parseOpml(source: string): ParsedOpml {
  let parsed: unknown;
  try {
    parsed = parser.parse(source) as unknown;
  } catch (error) {
    throw new ContentPipelineError('OPML_PARSE_FAILED', 'OPML XML 解析失败', error);
  }

  if (!isRecord(parsed) || !isRecord(parsed['opml'])) {
    throw new ContentPipelineError('OPML_PARSE_FAILED', '文件缺少 OPML 根节点');
  }

  const opml = parsed['opml'];
  const head = isRecord(opml['head']) ? opml['head'] : {};
  const body = isRecord(opml['body']) ? opml['body'] : null;
  if (!body) {
    throw new ContentPipelineError('OPML_PARSE_FAILED', 'OPML 文件缺少 body 节点');
  }

  const result: ParsedOpml = {
    title: stringValue(head['title']) ?? 'Subscriptions',
    feeds: [],
    feedsSkipped: 0,
    errors: []
  };
  const seen = new Set<string>();

  for (const outline of asArray(body['outline'])) {
    visitOutline(outline, null, result, seen);
  }
  return result;
}

export function exportOpml(feeds: OpmlFeedEntry[], title = '聚合拾遗订阅'): string {
  const grouped = new Map<string | null, OpmlFeedEntry[]>();
  for (const feed of feeds) {
    const existing = grouped.get(feed.groupName) ?? [];
    existing.push(feed);
    grouped.set(feed.groupName, existing);
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>'
  ];

  for (const feed of grouped.get(null) ?? []) {
    lines.push(outlineXml(feed, 4));
  }

  for (const [groupName, groupFeeds] of grouped) {
    if (groupName === null) continue;
    lines.push(`    <outline text="${escapeXml(groupName)}" title="${escapeXml(groupName)}">`);
    for (const feed of groupFeeds) lines.push(outlineXml(feed, 6));
    lines.push('    </outline>');
  }

  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
}

export async function importOpmlFile(filePath: string): Promise<ParsedOpml> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new ContentPipelineError('OPML_NOT_FILE', '所选 OPML 路径不是文件');
  }
  if (fileStat.size > MAX_OPML_BYTES) {
    throw new ContentPipelineError('OPML_TOO_LARGE', 'OPML 文件超过 5 MB 限制');
  }
  return parseOpml(await readFile(filePath, 'utf8'));
}

export async function exportOpmlFile(
  filePath: string,
  feeds: OpmlFeedEntry[],
  title?: string
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, exportOpml(feeds, title), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new ContentPipelineError(
      'OPML_EXPORT_FAILED',
      `OPML 导出失败：${errorMessage(error)}`,
      error
    );
  }
}

function visitOutline(
  value: unknown,
  parentGroup: string | null,
  result: ParsedOpml,
  seen: Set<string>
): void {
  if (!isRecord(value)) return;

  const xmlUrl = stringValue(value['xmlUrl']);
  const outlineTitle = stringValue(value['title']) ?? stringValue(value['text']);
  const children = asArray(value['outline']);

  if (xmlUrl) {
    let url: string;
    try {
      url = normalizeFeedUrl(xmlUrl);
    } catch (error) {
      result.feedsSkipped += 1;
      result.errors.push(`${outlineTitle ?? xmlUrl}: ${errorMessage(error)}`);
      return;
    }

    const key = canonicalFeedKey(url);
    if (seen.has(key)) {
      result.feedsSkipped += 1;
      return;
    }
    seen.add(key);

    result.feeds.push({
      title: outlineTitle ?? new URL(url).hostname,
      url,
      siteUrl: optionalHttpUrl(stringValue(value['htmlUrl'])),
      groupName: parentGroup
    });
    return;
  }

  const nextGroup = children.length > 0 && outlineTitle ? outlineTitle : parentGroup;
  for (const child of children) visitOutline(child, nextGroup, result, seen);
}

function outlineXml(feed: OpmlFeedEntry, indentation: number): string {
  const attributes = [
    'type="rss"',
    `text="${escapeXml(feed.title)}"`,
    `title="${escapeXml(feed.title)}"`,
    `xmlUrl="${escapeXml(feed.url)}"`
  ];
  if (feed.siteUrl) attributes.push(`htmlUrl="${escapeXml(feed.siteUrl)}"`);
  return `${' '.repeat(indentation)}<outline ${attributes.join(' ')} />`;
}

function normalizeFeedUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ContentPipelineError('URL_PROTOCOL_UNSUPPORTED', '订阅地址仅支持 http 和 https');
  }
  url.hash = '';
  return url.toString();
}

function optionalHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeFeedUrl(value);
  } catch {
    return null;
  }
}

function canonicalFeedKey(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
