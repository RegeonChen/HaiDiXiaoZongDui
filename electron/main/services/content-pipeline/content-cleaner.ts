import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ContentPipelineError } from './errors';
import type { CleanedContent } from './types';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'img', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote',
  'pre', 'code', 'table', 'caption', 'colgroup', 'col',
  'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
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
  'UL', 'OL', 'DL',
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
    if (tag === 'TABLE') {
      const caption = directTableCaption(element);
      if (caption?.textContent?.trim()) {
        flushInlineNodes();
        const paragraph = fragment.ownerDocument.createElement('p');
        for (const child of Array.from(caption.childNodes)) {
          paragraph.appendChild(child.cloneNode(true));
        }
        appendBlock(paragraph.outerHTML, 'P');

        const table = element.cloneNode(true) as Element;
        directTableCaption(table)?.remove();
        appendBlock(table.outerHTML, 'TABLE');
        return;
      }
    }
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
  normalizeTaskCheckboxes(document);
  normalizeProsePreformattedBlocks(document);

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
      ol: ['start', 'reversed', 'type'],
      ul: ['type'],
      li: ['value'],
      table: ['aria-label'],
      colgroup: ['span'],
      col: ['span'],
      th: ['colspan', 'rowspan', 'scope', 'headers', 'abbr', 'align'],
      td: ['colspan', 'rowspan', 'headers', 'align'],
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

/**
 * Readability removes form controls before sanitize-html sees them. Convert
 * task-list checkboxes to inert GFM markers first so checked state survives in
 * both Cleaned HTML and Cleaned Markdown without retaining interactive input.
 */
function normalizeTaskCheckboxes(document: Document): void {
  for (const input of Array.from(document.querySelectorAll('li input'))) {
    if (input.getAttribute('type')?.toLowerCase() !== 'checkbox') continue;
    const marker = input.hasAttribute('checked') ? '[x] ' : '[ ] ';
    input.replaceWith(document.createTextNode(marker));
  }
}

/**
 * Some publishing systems put the entire article in a `<pre>` and use CSS
 * `white-space: pre-wrap` to make it look like prose. Treating those blocks as
 * source code creates one giant code fence and prevents paragraph translation.
 *
 * Only normalize long, sentence-heavy blocks without code semantics. The
 * conservative checks keep ordinary `<pre>` snippets and `<pre><code>` blocks
 * untouched.
 */
function normalizeProsePreformattedBlocks(document: Document): void {
  for (const pre of Array.from(document.querySelectorAll('pre'))) {
    if (!isLikelyProsePre(pre)) continue;

    const container = document.createElement('div');
    const serialized = pre.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    const parts = serialized.split(/\r?\n[ \t]*\r?\n+/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const template = document.createElement('template');
      template.innerHTML = trimmed;
      foldSoftLineBreaks(template.content);

      const text = template.content.textContent?.trim() ?? '';
      const markdownHeading = text.match(/^(#{1,6})[ \t]+(.+)$/);
      if (markdownHeading && template.content.childElementCount === 0) {
        const heading = document.createElement(`h${markdownHeading[1].length}`);
        heading.textContent = markdownHeading[2].trim();
        container.appendChild(heading);
        continue;
      }

      const paragraph = document.createElement('p');
      paragraph.appendChild(template.content);
      if (paragraph.textContent?.trim() || paragraph.querySelector('a, img, br')) {
        container.appendChild(paragraph);
      }
    }

    if (container.childElementCount > 0) pre.replaceWith(container);
  }
}

function isLikelyProsePre(pre: Element): boolean {
  if (pre.querySelector('code, kbd, samp')) return false;

  const semanticHint = [
    pre.getAttribute('class'),
    pre.getAttribute('id'),
    pre.getAttribute('data-language'),
    pre.getAttribute('data-lang')
  ].filter(Boolean).join(' ');
  if (/(?:code|source|syntax|highlight|prettyprint|language|lang)/i.test(semanticHint)) {
    return false;
  }

  const unsupportedChild = Array.from(pre.querySelectorAll('*')).some((element) =>
    !['A', 'EM', 'STRONG', 'B', 'I', 'SPAN', 'BR'].includes(element.tagName)
  );
  if (unsupportedChild) return false;

  const text = pre.textContent?.replace(/\r\n?/g, '\n').trim() ?? '';
  if (text.length < 400) return false;

  const compact = text.replace(/\s/g, '');
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (compact.length === 0 || letters / compact.length < 0.55) return false;

  const sentenceMarks = text.match(/[.!?。！？](?=\s|$|["')\]}»”’])/g)?.length ?? 0;
  if (sentenceMarks < 3) return false;

  const lines = text.split('\n').filter((line) => line.trim());
  const indentedLines = lines.filter((line) => /^\s{2,}\S/.test(line)).length;
  const codeLikeLines = lines.filter((line) =>
    /(?:[{};]\s*$|^(?:import|export|const|let|var|function|class|def|if|for|while|return|#include)\b|=>)/
      .test(line.trim())
  ).length;
  if (lines.length >= 4 && indentedLines / lines.length > 0.25) return false;
  if (codeLikeLines / lines.length > 0.2) return false;

  return true;
}

function foldSoftLineBreaks(fragment: DocumentFragment): void {
  const walker = fragment.ownerDocument.createTreeWalker(
    fragment,
    fragment.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4
  );
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    node.data = node.data.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
  }
}

function directTableCaption(table: Element): Element | null {
  return Array.from(table.children).find((child) => child.tagName === 'CAPTION') ?? null;
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
  turndown.addRule('complexTableAsHtml', {
    filter: (node) =>
      node.nodeName === 'TABLE' &&
      Boolean(node.querySelector('[rowspan], [colspan]')),
    replacement: (_content, node) =>
      `\n\n${(node as Element).outerHTML}\n\n`
  });
  turndown.addRule('complexOrderedListAsHtml', {
    filter: (node) => {
      if (node.nodeName !== 'OL') return false;
      const element = node as Element;
      const type = element.getAttribute('type');
      return element.hasAttribute('reversed') ||
        Boolean(element.querySelector('li[value]')) ||
        (type !== null && type !== '1');
    },
    replacement: (_content, node) =>
      `\n\n${(node as Element).outerHTML}\n\n`
  });
  turndown.addRule('descriptionListAsHtml', {
    filter: 'dl',
    replacement: (_content, node) =>
      `\n\n${(node as Element).outerHTML}\n\n`
  });
  turndown.addRule('tableWithCaption', {
    filter: (node) =>
      node.nodeName === 'TABLE' &&
      directTableCaption(node as Element) !== null,
    replacement: (_content, node) => {
      const table = (node as Element).cloneNode(true) as Element;
      const caption = directTableCaption(table);
      caption?.remove();

      const captionMarkdown = caption
        ? turndown.turndown(caption.innerHTML).trim()
        : '';
      const tableMarkdown = turndown.turndown(table.outerHTML).trim();
      return `\n\n${captionMarkdown}\n\n${tableMarkdown}\n\n`;
    }
  });
  turndown.addRule('fencedCodeWithLanguage', {
    filter: 'pre',
    replacement: (_content, node) => {
      const element = node as Element;
      const codeNode = element.firstElementChild;
      const className = codeNode?.getAttribute('class') ?? element.getAttribute('class') ?? '';
      const languageMatch = className.match(/(?:language|lang)-([a-z0-9_+-]+)/i);
      const language = languageMatch?.[1] ?? 'text';
      const code = (node.textContent ?? '').replace(/^\n+|\n+$/g, '');
      const longestBacktickRun = Math.max(
        0,
        ...(code.match(/`+/g) ?? []).map((run) => run.length)
      );
      const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    }
  });

  return turndown
    .turndown(html)
    .replace(
      /^([ \t]*(?:[-+*]|\d+\.)[ \t]+)\\\[([xX ])\\\](?=[ \t])/gm,
      '$1[$2]'
    )
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
