/**
 * 简易 Markdown 渲染（Phase 3.4.1.4 + 3.4.1.5）
 *
 * 设计目标：
 *   - AI 摘要/翻译结果用简易 Markdown 写（GFM 子集）
 *   - 不引入 marked/markdown-it 等重型依赖
 *   - 安全：先 escape HTML，再做有限的语法转换
 *
 * 支持语法：
 *   - **bold** 或 __bold__
 *   - *italic* 或 _italic_
 *   - `code`
 *   - [text](url) （链接：仅允许 http/https/mailto 协议）
 *   - 段落（双换行）
 *   - 行内换行：单个 \n 转为 <br>
 *
 * 不支持（Phase 4 再扩）：
 *   - 列表（- item / 1. item）—— 保留原文
 *   - 标题（# / ##）—— 保留原文
 *   - 引用（>）—— 保留原文
 *   - 代码块（```）—— 保留原文
 *   - 图片（![alt](url)）—— 保留原文
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

/**
 * 渲染完整 Markdown → HTML。
 *  - 双换行分段
 *  - 单换行变 <br>
 *  - 行内做有限语法（bold/italic/code/link）
 */
export function renderMarkdown(input: string): string {
  if (!input) return '';
  // 段落分割：双换行
  const paragraphs = input.split(/\n{2,}/);
  return paragraphs
    .map((para) => {
      // 段落内单换行 → <br>
      const html = renderInline(para).replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('');
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
