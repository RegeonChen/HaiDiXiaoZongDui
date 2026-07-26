import type { Tag } from '../../../shared/types';

/**
 * Phase 4.1 约定的文章标题标签前缀。
 * 只识别标题开头连续出现的标记，避免误删正文标题中的普通文本。
 */
const TAG_TITLE_PREFIX_RE = /^(?:\[tag:[^\]\r\n]+\]\s*)+/;

export function stripArticleTitleTags(title: string): string {
  return title.replace(TAG_TITLE_PREFIX_RE, '').trim();
}

export function buildTaggedArticleTitle(title: string, tags: Tag[]): string {
  const cleanTitle = stripArticleTitleTags(title);
  if (tags.length === 0) return cleanTitle;
  const prefix = tags
    .map((tag) => `[tag:${tag.name}|${tag.color ?? 'inherit'}]`)
    .join(' ');
  return `${prefix} ${cleanTitle}`;
}

/**
 * Feed 重同步会带回来源标题；保留数据库中已有标签前缀，同时采用最新来源标题。
 * 来源自身伪装成内部标签标记的前缀会被剥离。
 */
export function preserveArticleTitleTags(
  existingTitle: string,
  incomingTitle: string
): string {
  const prefix = existingTitle.match(TAG_TITLE_PREFIX_RE)?.[0]?.trim() ?? '';
  const cleanIncomingTitle = stripArticleTitleTags(incomingTitle);
  return prefix ? `${prefix} ${cleanIncomingTitle}` : cleanIncomingTitle;
}
