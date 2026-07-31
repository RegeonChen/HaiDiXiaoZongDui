/**
 * 简易 Markdown 渲染（Phase 3.4.1.4 + 3.4.1.5）
 *
 * 设计目标：
 *   - AI 摘要/翻译结果用简易 Markdown 写（GFM 子集）
 *   - 不引入 marked/markdown-it 等重型依赖
 *   - 安全：先 escape HTML，再做有限的语法转换
 *
 * 支持语法：
 *   - ATX 标题（# ～ ######）
 *   - 有序 / 无序列表及缩进嵌套
 *   - 引用、分隔线和 fenced code block
 *   - **bold** 或 __bold__
 *   - *italic* 或 _italic_
 *   - `code`
 *   - [text](url) （链接：仅允许 http/https/mailto 协议）
 *   - 段落
 *   - 行内换行：单个 \n 转为 <br>
 *
 * 图片仍按普通文本保留，避免 AI 结果静默加载外部资源。
 */
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/** 仅放行安全的 URL scheme（防 javascript: 等 XSS） */
function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

interface InlineRule {
  regex: RegExp;
  /** 返回 null 表示该位置不匹配（跳过） */
  replace: (match: RegExpMatchArray) => string | null;
}

const INLINE_RULES: InlineRule[] = [
  // 链接：[text](url) —— 必须先于 bold/italic 处理，避免被吃掉
  {
    regex: /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    replace: (m) => {
      const text = m[1];
      const href = m[2];
      const safeHref = sanitizeHref(href);
      if (!safeHref) {
        // 不安全 URL：保留原文（已经被 escape 过）
        return `[${text}](${href})`;
      }
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
  },
  // 行内代码：`code`
  {
    regex: /`([^`\n]+)`/g,
    replace: (m) => `<code>${m[1]}</code>`
  },
  // 加粗：**bold** 或 __bold__
  {
    regex: /\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,
    replace: (m) => `<strong>${m[1] ?? m[2]}</strong>`
  },
  // 斜体：*italic* 或 _italic_（不能跨 **/__）
  {
    regex: /(?<![*\w])\*([^*\n]+)\*(?!\w)|(?<![_\w])_([^_\n]+)_(?!\w)/g,
    replace: (m) => `<em>${m[1] ?? m[2]}</em>`
  }
];

/**
 * 渲染单行（无段落）Markdown → HTML（已 escape HTML 危险字符）
 */
function renderInline(text: string): string {
  let out = escapeHtml(text);
  for (const rule of INLINE_RULES) {
    out = out.replace(rule.regex, (...args) => {
      const match = args as unknown as RegExpMatchArray;
      const result = rule.replace(match);
      return result ?? match[0];
    });
  }
  return out;
}

interface ParsedListLine {
  indent: number;
  ordered: boolean;
  content: string;
}

function parseListLine(line: string): ParsedListLine | null {
  const match = line.match(/^([ \t]*)([-+*]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  return {
    indent: match[1].replace(/\t/g, '    ').length,
    ordered: /^\d/.test(match[2]),
    content: match[3]
  };
}

function renderList(
  lines: string[],
  start: number,
  baseIndent: number,
  ordered: boolean
): { html: string; next: number } {
  const tag = ordered ? 'ol' : 'ul';
  let html = `<${tag}>`;
  let index = start;
  let itemOpen = false;

  while (index < lines.length) {
    const parsed = parseListLine(lines[index]);
    if (!parsed || parsed.indent < baseIndent) break;

    if (parsed.indent > baseIndent) {
      if (!itemOpen) break;
      const nested = renderList(lines, index, parsed.indent, parsed.ordered);
      html += nested.html;
      index = nested.next;
      continue;
    }

    if (parsed.ordered !== ordered) break;
    if (itemOpen) html += '</li>';
    html += `<li>${renderInline(parsed.content)}`;
    itemOpen = true;
    index += 1;
  }

  if (itemOpen) html += '</li>';
  html += `</${tag}>`;
  return { html, next: index };
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line);
}

function startsBlock(line: string): boolean {
  return /^\s{0,3}(#{1,6})\s+/.test(line) ||
    /^\s{0,3}(`{3,}|~{3,})/.test(line) ||
    /^\s{0,3}>/.test(line) ||
    parseListLine(line) !== null ||
    isHorizontalRule(line);
}

/**
 * 渲染完整 Markdown → HTML。
 * 使用安全的 GFM 子集，先识别块级结构，再对文本执行 escape + 行内语法转换。
 */
export function renderMarkdown(input: string): string {
  if (!input) return '';
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const markerChar = marker[0];
      const closing = new RegExp(`^\\s{0,3}${markerChar}{${marker.length},}\\s*$`);
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !closing.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = /^[a-z0-9_-]+$/i.test(fence[2]) ? fence[2] : '';
      const className = language ? ` class="language-${language}"` : '';
      blocks.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      const content = heading[2].replace(/\s+#+\s*$/, '');
      blocks.push(`<h${level}>${renderInline(content)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    const listLine = parseListLine(line);
    if (listLine) {
      const rendered = renderList(lines, index, listLine.indent, listLine.ordered);
      blocks.push(rendered.html);
      index = rendered.next;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !startsBlock(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${paragraphLines.map(renderInline).join('<br>')}</p>`);
  }

  return blocks.join('');
}

/**
 * Phase 3.6.1：翻译专用 Markdown 过滤。
 * 仅保留粗体（** **）、斜体（* *）、下划线（__ __）三种内联格式；
 * 移除标题、列表、代码块、引用、行内代码、链接等块级/复杂 Markdown。
 * 段落分割和换行保留，保证译文的可读性。
 */
export function filterInlineMarkdown(input: string): string {
  if (!input) return '';
  let out = escapeHtml(input);

  // 移除代码块（```...```）
  out = out.replace(/```[\s\S]*?```/g, '');
  // 移除行内代码（`code`）
  out = out.replace(/`([^`\n]+)`/g, '$1');
  // 链接 → 纯文本（[text](url) → text）
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // 粗体：**bold** 或 __bold__
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<u>$1</u>');
  // 斜体：*italic* 或 _italic_
  out = out.replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>');
  out = out.replace(/(?<![_\w])_([^_\n]+)_(?!\w)/g, '<em>$1</em>');

  // 段落分割
  const paragraphs = out.split(/\n{2,}/);
  return paragraphs
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
