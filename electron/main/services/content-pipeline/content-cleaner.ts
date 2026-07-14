import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ContentPipelineError } from './errors';
import type { CleanedContent } from './types';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'img', 'a', 'ul', 'ol', 'li', 'blockquote',
  'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'em', 'strong', 'br', 'hr'
];

export function cleanArticleContent(sourceHtml: string, articleUrl: string): CleanedContent {
  assertHttpUrl(articleUrl);
  if (!sourceHtml.trim()) {
    throw new ContentPipelineError('CONTENT_EMPTY', '待清洗的文章内容为空');
  }

  let document: Document;
  try {
    document = new JSDOM(sourceHtml, { url: articleUrl }).window.document;
  } catch (error) {
    throw new ContentPipelineError('CONTENT_PARSE_FAILED', '文章 HTML 解析失败', error);
  }

  absolutizeContentUrls(document, articleUrl);

  const readable = new Readability(document.cloneNode(true) as Document, {
    keepClasses: true
  }).parse();
  const extractedHtml = readable?.content?.trim() || document.body.innerHTML.trim();
  if (!extractedHtml) {
    throw new ContentPipelineError('CONTENT_EXTRACTION_FAILED', '没有提取到可阅读正文');
  }

  const cleanedHtml = sanitizeHtml(extractedHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      img: ['src', 'alt', 'title'],
      a: ['href', 'title'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      pre: ['class'],
      code: ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      a: ['http', 'https', 'mailto']
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript']
  }).trim();

  if (!cleanedHtml) {
    throw new ContentPipelineError('CONTENT_SANITIZE_FAILED', '正文清洗后没有剩余内容');
  }

  return {
    title: normalizeMetadata(readable?.title),
    byline: normalizeMetadata(readable?.byline),
    excerpt: normalizeMetadata(readable?.excerpt),
    cleanedHtml,
    cleanedMarkdown: htmlToMarkdown(cleanedHtml)
  };
}

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**'
  });

  turndown.use(gfm);
  turndown.addRule('fencedCodeWithLanguage', {
    filter: 'pre',
    replacement: (_content, node) => {
      const element = node as Element;
      const codeNode = element.firstElementChild;
      const className = codeNode?.getAttribute('class') ?? element.getAttribute('class') ?? '';
      const languageMatch = className.match(/(?:language|lang)-([a-z0-9_+-]+)/i);
      const language = languageMatch?.[1] ?? 'text';
      const code = (node.textContent ?? '').replace(/^\n+|\n+$/g, '');
      return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    }
  });

  return turndown
    .turndown(html)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function absolutizeContentUrls(document: Document, baseUrl: string): void {
  for (const image of document.querySelectorAll('img[src]')) {
    const resolved = resolveUrl(image.getAttribute('src'), baseUrl, ['http:', 'https:']);
    if (resolved) image.setAttribute('src', resolved);
    else image.removeAttribute('src');
  }

  for (const anchor of document.querySelectorAll('a[href]')) {
    const resolved = resolveUrl(anchor.getAttribute('href'), baseUrl, [
      'http:', 'https:', 'mailto:'
    ]);
    if (resolved) anchor.setAttribute('href', resolved);
    else anchor.removeAttribute('href');
  }
}

function resolveUrl(
  value: string | null,
  baseUrl: string,
  allowedProtocols: string[]
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return allowedProtocols.includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function assertHttpUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return;
  } catch {
    // Handled by the common error below.
  }
  throw new ContentPipelineError('URL_PROTOCOL_UNSUPPORTED', '文章 URL 必须使用 http 或 https');
}

function normalizeMetadata(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || null;
}
