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

const NOISE_SELECTORS = [
  'nav',
  'aside',
  '[role="navigation"]',
  '.toc',
  '.table-of-contents',
  '.ox-hugo-toc',
  '#TableOfContents',
  '#table-of-contents'
];

const CONTENT_BLOCK_TAGS = new Set([
  'P',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'PRE',
  'UL', 'OL',
  'BLOCKQUOTE',
  'TABLE',
  'FIGURE',
  'HR'
]);

const TRANSPARENT_CONTAINER_TAGS = new Set([
  'ARTICLE', 'MAIN', 'SECTION', 'DIV'
]);

/** A top-level cleaned HTML block that can own one inline translation slot. */
export interface HtmlBlock {
  /** Stable zero-based position used to match a translation paragraph. */
  index: number;
  /** Complete HTML for this block, including its outer tag. */
  html: string;
  /** Uppercase HTML tag name, for example `P`, `H2`, or `PRE`. */
  tag: string;
}

/**
 * Split sanitized article HTML into top-level semantic blocks.
 *
 * Lists, block quotes, code blocks, tables, and figures remain atomic so their
 * internal Markdown/HTML structure is never fragmented. Top-level text and
 * inline elements are collected into a synthetic paragraph instead of being
 * dropped. Sanitizer-style wrapper elements are transparent.
 */
export function splitCleanedHtmlIntoBlocks(html: string): HtmlBlock[] {
  if (!html.trim()) return [];

  const fragment = JSDOM.fragment(html);
  const blocks: HtmlBlock[] = [];
  let inlineNodes: Node[] = [];

  const appendBlock = (htmlContent: string, tag: string): void => {
    blocks.push({ index: blocks.length, html: htmlContent, tag });
  };

  const flushInlineNodes = (): void => {
    if (inlineNodes.length === 0) return;

    const paragraph = fragment.ownerDocument.createElement('p');
    for (const node of inlineNodes) paragraph.appendChild(node.cloneNode(true));
    inlineNodes = [];

    const hasText = !!paragraph.textContent?.trim();
    const hasVisibleElement = paragraph.querySelector('img, br, hr') !== null;
    if (hasText || hasVisibleElement) appendBlock(paragraph.outerHTML, 'P');
  };

  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      if (text.trim() || inlineNodes.length > 0) inlineNodes.push(node);
      return;
    }
    if (node.nodeType !== 1) return;

    const element = node as Element;
    const tag = element.tagName.toUpperCase();
    if (CONTENT_BLOCK_TAGS.has(tag)) {
      flushInlineNodes();
      appendBlock(element.outerHTML, tag);
      return;
    }

    if (TRANSPARENT_CONTAINER_TAGS.has(tag)) {
      for (const child of Array.from(element.childNodes)) visit(child);
      return;
    }

    inlineNodes.push(node);
  };

  for (const node of Array.from(fragment.childNodes)) visit(node);
  flushInlineNodes();
  return blocks;
}

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

  removeKnownNoise(document);

  // Normalize common browser-side image formats before Readability. JSDOM does
  // not run lazy-loading scripts or evaluate <picture> source selection.
  unwrapLazyImages(document);
  absolutizeContentUrls(document, articleUrl);

  // Keep normalized images as semantic content blocks without flattening the
  // whole page (which would turn avatars/navigation icons into article images).
  promoteImagesToParagraphs(document);

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

function removeKnownNoise(document: Document): void {
  for (const selector of NOISE_SELECTORS) {
    for (const element of document.querySelectorAll(selector)) {
      element.remove();
    }
  }
}

/** Common lazy-loader attributes used across CMS and publishing platforms. */
const LAZY_SRC_ATTRS = [
  'data-src',
  'data-original',
  'data-original-src',
  'data-lazy-src',
  'data-url',
  'data-img'
];
const LAZY_SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset', 'srcset'];
const PLACEHOLDER_IMAGE = /placeholder|loading|spacer|(?:^|[/_-])1x1(?:[./?_-]|$)|blank|transparent/i;

/**
 * Resolve image sources that a browser would normally choose with JavaScript or
 * responsive-image layout. This is domain-independent and runs before sanitize.
 */
function unwrapLazyImages(document: Document): void {
  for (const image of Array.from(document.querySelectorAll('img'))) {
    normalizeImageSource(image);
  }

  // A <picture> can contain only <source srcset> plus an empty fallback <img>.
  for (const picture of Array.from(document.querySelectorAll('picture'))) {
    let image = picture.querySelector('img');
    if (!image) {
      image = document.createElement('img');
      picture.appendChild(image);
    }
    normalizeImageSource(image);
    if (isUsableImageSource(image.getAttribute('src'))) continue;

    for (const source of Array.from(picture.querySelectorAll('source'))) {
      const candidate = bestSrcsetCandidate(
        source.getAttribute('srcset') ?? source.getAttribute('data-srcset')
      );
      if (candidate) {
        image.setAttribute('src', candidate);
        break;
      }
    }
  }

  // <noscript> is a fallback for the adjacent lazy image. Keep all fallback
  // images only when there is no usable sibling, otherwise it would duplicate.
  for (const noscript of Array.from(document.querySelectorAll('noscript'))) {
    const hasAdjacentImage = [noscript.previousElementSibling, noscript.nextElementSibling]
      .some((element) => elementContainsUsableImage(element));
    if (hasAdjacentImage) {
      noscript.remove();
      continue;
    }

    const fallbackImages = Array.from(noscript.querySelectorAll('img'))
      .map((image) => image.cloneNode(true) as HTMLImageElement);
    for (const image of fallbackImages) normalizeImageSource(image);
    const usableImages = fallbackImages.filter((image) =>
      isUsableImageSource(image.getAttribute('src'))
    );
    if (usableImages.length === 0) {
      noscript.remove();
      continue;
    }

    const fragment = document.createDocumentFragment();
    for (const image of usableImages) {
      const paragraph = document.createElement('p');
      paragraph.appendChild(image);
      fragment.appendChild(paragraph);
    }
    noscript.replaceWith(fragment);
  }
}

/**
 * Promote images only inside the most likely article-body container. Figures
 * keep every image plus their caption, and responsive pictures keep the
 * normalized fallback image selected above.
 */
function promoteImagesToParagraphs(document: Document): void {
  const root = likelyArticleBody(document);

  for (const picture of Array.from(root.querySelectorAll('picture'))) {
    const image = picture.querySelector('img[src]');
    if (image) picture.replaceWith(image.cloneNode(true));
  }

  for (const figure of Array.from(root.querySelectorAll('figure'))) {
    const images = Array.from(figure.querySelectorAll('img[src]'));
    if (images.length === 0) continue;

    const replacements: Node[] = images.map((image) => {
      const paragraph = document.createElement('p');
      paragraph.appendChild(image.cloneNode(true));
      return paragraph;
    });
    const caption = figure.querySelector('figcaption');
    if (caption?.textContent?.trim()) {
      const paragraph = document.createElement('p');
      const emphasis = document.createElement('em');
      for (const child of Array.from(caption.childNodes)) {
        emphasis.appendChild(child.cloneNode(true));
      }
      paragraph.appendChild(emphasis);
      replacements.push(paragraph);
    }
    figure.replaceWith(...replacements);
  }

  const BLOCK_CONTENT = new Set(['P', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  for (const img of Array.from(root.querySelectorAll('img[src]'))) {
    let parent = img.parentElement;
    let needsWrap = true;
    while (parent && parent !== root) {
      if (BLOCK_CONTENT.has(parent.tagName)) {
        needsWrap = false;
        break;
      }
      parent = parent.parentElement;
    }
    if (needsWrap && img.parentElement) {
      const p = document.createElement('p');
      img.replaceWith(p);
      p.appendChild(img);
    }
  }
}

function normalizeImageSource(image: Element): void {
  const current = image.getAttribute('src');
  if (isUsableImageSource(current)) return;

  for (const attribute of LAZY_SRC_ATTRS) {
    const candidate = image.getAttribute(attribute);
    if (isUsableImageSource(candidate)) {
      image.setAttribute('src', candidate!.trim());
      return;
    }
  }

  for (const attribute of LAZY_SRCSET_ATTRS) {
    const candidate = bestSrcsetCandidate(image.getAttribute(attribute));
    if (candidate) {
      image.setAttribute('src', candidate);
      return;
    }
  }
}

function isUsableImageSource(value: string | null): boolean {
  const source = value?.trim() ?? '';
  return source.length > 0 &&
    !PLACEHOLDER_IMAGE.test(source) &&
    !/^(?:about:|javascript:|data:)/i.test(source);
}

function bestSrcsetCandidate(value: string | null): string | null {
  if (!value?.trim()) return null;

  let best: { url: string; score: number } | null = null;
  for (const entry of value.split(',')) {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0] ?? '';
    if (!isUsableImageSource(url)) continue;

    const descriptor = parts[1] ?? '1x';
    const match = descriptor.match(/^(\d+(?:\.\d+)?)(w|x)$/i);
    const amount = match ? Number(match[1]) : 1;
    const score = match?.[2]?.toLowerCase() === 'w' ? amount : amount * 10_000;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

function elementContainsUsableImage(element: Element | null): boolean {
  if (!element) return false;
  if (element.matches('img')) {
    return isUsableImageSource(element.getAttribute('src'));
  }
  return Array.from(element.querySelectorAll('img')).some((image) =>
    isUsableImageSource(image.getAttribute('src'))
  );
}

function likelyArticleBody(document: Document): Element {
  const preferredSelectors = [
    '[itemprop="articleBody"]',
    '[class*="article__main__content"]',
    '[class*="article-content"]',
    '[class*="article_content"]',
    '[class*="post-content"]',
    '[class*="post_content"]',
    '[class*="entry-content"]',
    '[class*="entry_content"]',
    '[class*="story-body"]',
    '[class*="post-body"]',
    '[class*="article-body"]'
  ];

  for (const selector of preferredSelectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const best = largestContentCandidate(candidates);
    if (best) return best;
  }
  return largestContentCandidate(Array.from(document.querySelectorAll('article, main, [role="main"]')))
    ?? document.body;
}

function largestContentCandidate(candidates: Element[]): Element | null {
  let best: { element: Element; score: number } | null = null;
  for (const element of candidates) {
    const textLength = element.textContent?.replace(/\s+/g, ' ').trim().length ?? 0;
    const imageCount = element.querySelectorAll('img, picture, figure').length;
    const score = textLength + imageCount * 500;
    if (!best || score > best.score) best = { element, score };
  }
  return best?.element ?? null;
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
