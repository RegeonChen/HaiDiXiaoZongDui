/**
 * AI 输入正文预处理。
 *
 * 模型不需要图片 URL，本模块先移除图片语法，再在超长文章中保留开头、
 * 中段和结尾的代表性内容，避免把几十万字符原样发送给 Provider。
 */

const OMITTED_MARKER = '\n\n[中间部分因文章较长已省略]\n\n';

export function compactArticleContent(content: string, maxCharacters: number): string {
  if (!Number.isFinite(maxCharacters) || maxCharacters <= 0) {
    throw new Error('maxCharacters must be a positive number');
  }

  const normalized = stripMarkdownImages(content)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  const limit = Math.trunc(maxCharacters);
  if (normalized.length <= limit) return normalized;

  const markerBudget = OMITTED_MARKER.length;
  if (limit <= markerBudget + 32) return normalized.slice(0, limit);

  // 只略超预算时保留连续的开头和结尾，避免三个窗口互相重叠。
  if (normalized.length < limit * 1.5) {
    const available = limit - markerBudget;
    const head = takeStartAtBoundary(normalized, Math.floor(available * 0.68));
    const tail = takeEndAtBoundary(normalized, available - head.length);
    return `${head}${OMITTED_MARKER}${tail}`;
  }

  // 很长的文章同时保留中段样本，摘要和标签不至于只看到导语与结尾。
  const available = limit - markerBudget * 2;
  const headBudget = Math.floor(available * 0.45);
  const middleBudget = Math.floor(available * 0.25);
  const tailBudget = available - headBudget - middleBudget;
  const head = takeStartAtBoundary(normalized, headBudget);
  const tail = takeEndAtBoundary(normalized, tailBudget);
  const middleStart = Math.max(
    head.length,
    Math.floor((normalized.length - middleBudget) / 2)
  );
  const middle = takeWindowAtBoundary(normalized, middleStart, middleBudget);
  return `${head}${OMITTED_MARKER}${middle}${OMITTED_MARKER}${tail}`;
}

/** 删除 Markdown/HTML 图片，只保留真正需要模型阅读的文字。 */
export function stripMarkdownImages(content: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < content.length) {
    const imageStart = content.indexOf('![', cursor);
    if (imageStart < 0) {
      result += content.slice(cursor);
      break;
    }

    result += content.slice(cursor, imageStart);
    const altEnd = findUnescapedClosing(content, imageStart + 2, '[', ']');
    if (altEnd < 0) {
      result += content.slice(imageStart);
      break;
    }

    let destinationStart = altEnd + 1;
    while (/\s/.test(content[destinationStart] ?? '')) destinationStart += 1;
    if (content[destinationStart] !== '(') {
      result += content.slice(imageStart, altEnd + 1);
      cursor = altEnd + 1;
      continue;
    }

    const destinationEnd = findUnescapedClosing(
      content,
      destinationStart + 1,
      '(',
      ')'
    );
    if (destinationEnd < 0) {
      result += content.slice(imageStart);
      break;
    }
    cursor = destinationEnd + 1;
  }

  return result
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\[\s*\]\([^\n)]*\)/g, '');
}

function takeStartAtBoundary(content: string, budget: number): string {
  if (content.length <= budget) return content;
  const boundary = content.lastIndexOf('\n\n', budget);
  const end = boundary >= Math.floor(budget * 0.6) ? boundary : budget;
  return content.slice(0, end).trimEnd();
}

function takeEndAtBoundary(content: string, budget: number): string {
  if (content.length <= budget) return content;
  const roughStart = content.length - budget;
  const boundary = content.indexOf('\n\n', roughStart);
  if (boundary >= 0 && boundary - roughStart <= Math.floor(budget * 0.4)) {
    return content.slice(boundary + 2).trimStart();
  }

  // 结尾落在一个超长段落内部时，同时保留该段开头的标题/主题词和真正结尾。
  const previousBoundary = content.lastIndexOf('\n\n', roughStart);
  const paragraphStart = previousBoundary >= 0 ? previousBoundary + 2 : 0;
  if (roughStart - paragraphStart > Math.floor(budget * 0.4)) {
    const separator = '\n[…]\n';
    const prefixBudget = Math.min(160, Math.floor(budget * 0.15));
    const prefix = content.slice(paragraphStart, paragraphStart + prefixBudget).trimEnd();
    const suffixBudget = Math.max(1, budget - prefix.length - separator.length);
    return `${prefix}${separator}${content.slice(-suffixBudget).trimStart()}`;
  }

  const start = roughStart;
  return content.slice(start).trimStart();
}

function takeWindowAtBoundary(content: string, start: number, budget: number): string {
  const roughEnd = Math.min(content.length, start + budget);
  const startBoundary = content.indexOf('\n\n', start);
  const safeStart = startBoundary >= 0 && startBoundary < roughEnd
    ? startBoundary + 2
    : start;
  const endBoundary = content.lastIndexOf('\n\n', roughEnd);
  const safeEnd = endBoundary > safeStart ? endBoundary : roughEnd;
  return content.slice(safeStart, safeEnd).trim();
}

function findUnescapedClosing(
  content: string,
  from: number,
  opening: '[' | '(',
  closing: ']' | ')'
): number {
  let depth = 1;
  for (let index = from; index < content.length; index += 1) {
    const character = content[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
