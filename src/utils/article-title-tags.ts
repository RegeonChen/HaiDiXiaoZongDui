/**
 * 解析文章标题中的标签前缀
 * Phase 4.1.3：标签-标题深度绑定，后端把 tag 信息嵌到 article.title 前缀
 *   格式：`[tag:标签名|颜色hex] [tag:标签名|颜色hex] ...  原标题`
 * 前端用本工具解析，让 ArticleList / ArticleReader 直接从 article.title
 * 渲染彩色标签 chips，无需每次拉 IPC。
 */

const TAG_TITLE_PREFIX_RE = /^(?:\[tag:([^\]|]+)\|([^\]]+)\]\s*)+/;

function decodeTagName(value: string): string {
  // 与主进程的最小转义一一对应；先还原分隔符，最后还原百分号，
  // 避免把旧标签名里本来就存在的 "%20" 等文本误解码。
  return value
    .replace(/%7C/gi, '|')
    .replace(/%5D/gi, ']')
    .replace(/%25/gi, '%');
}

export interface ParsedTitleTag {
  name: string;
  /** 颜色，'inherit' 表示用前端默认色。null/undefined 同义 */
  color: string | null;
}

export interface ParsedArticleTitle {
  /** 解析出的标签（name + color，id 留空：title prefix 不存 id） */
  tags: ParsedTitleTag[];
  /** 去掉标签前缀后的真实标题 */
  cleanTitle: string;
}

/**
 * 解析文章标题前缀中的 tag 标记。
 * - 标题无前缀 → 返回 { tags: [], cleanTitle: title }
 * - 颜色为 "inherit"（后端未传 color 的默认值）时降级为 undefined，UI 用 var(--accent)
 */
export function parseArticleTitleTags(title: string): ParsedArticleTitle {
  const match = title.match(TAG_TITLE_PREFIX_RE);
  if (!match) return { tags: [], cleanTitle: title };

  // 遍历所有 [tag:...] 块（match[0] 是整段连续前缀）
  const prefix = match[0];
  const tags: ParsedTitleTag[] = [];
  const singleTagRe = /\[tag:([^|]+)\|([^\]]+)\]/g;
  let m: RegExpExecArray | null = singleTagRe.exec(prefix);
  while (m !== null) {
    const name = decodeTagName(m[1].trim());
    const colorRaw = m[2].trim();
    // 'inherit' 是后端在 color 为 null 时存的占位符；前端解析为 null（用 var(--accent) 兜底）
    const color: string | null = colorRaw && colorRaw !== 'inherit' ? colorRaw : null;
    if (name) tags.push({ name, color });
    m = singleTagRe.exec(prefix);
  }
  return { tags, cleanTitle: title.slice(prefix.length).trim() };
}
