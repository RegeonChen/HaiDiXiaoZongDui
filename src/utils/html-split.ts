/**
 * html-split — UI 端 mock 切分 cleaned HTML（Phase 3.5.2 张晨阳 前期准备）
 *
 * 设计目标：
 *   - 把 Cleaned HTML 切分为独立"块"（每个 <p> / <h1-6> / <pre> / <ul> / <ol> / <blockquote> 为一块）
 *   - 与主进程 translation-agent 推送的 AITranslationProgressEvent.paragraphs[i].original 按 index 一一对应
 *   - 不破坏代码块/表格内部结构（按顶层块级元素切分）
 *   - 不引入第三方 DOM 解析库（用浏览器内置 DOMParser）
 *
 * 注意：
 *   - 这是 UI 端 mock，等张宇凡的 splitCleanedHtmlIntoBlocks 正式工具就位后可以替换实现
 *   - 切分边界：每个块级元素的开闭 tag 独立成块；空块（只含空白）会被合并到下一个非空块或丢弃
 *   - 嵌套块（如 <pre> 内含 <code>）保留整体不切分
 */

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'PRE', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'FIGURE'
]);

export interface HtmlBlock {
  /** 块索引（与 IPC paragraphs[i].index 对应） */
  index: number;
  /** 块的 outerHTML */
  html: string;
  /** 块类型（tag name） */
  tag: string;
}

export interface SplitResult {
  blocks: HtmlBlock[];
  /** 切分失败的 fallback（如果 HTML 无法解析，整体作为一个块） */
  fallback: boolean;
}

/**
 * 切分 cleaned HTML 为独立块。
 * @param html Cleaned HTML 字符串（必须可信：已经过 sanitize-html 白名单清洗）
 */
export function splitCleanedHtmlIntoBlocks(html: string): SplitResult {
  if (!html || !html.trim()) {
    return { blocks: [], fallback: false };
  }

  let doc: Document;
  try {
    const parser = new DOMParser();
    // 使用 text/html 让浏览器按 HTML 规范解析（不强制 XML 闭合）
    doc = parser.parseFromString(`<div id="__split_root__">${html}</div>`, 'text/html');
  } catch (e) {
    return { blocks: [{ index: 0, html, tag: 'DIV' }], fallback: true };
  }

  const root = doc.getElementById('__split_root__');
  if (!root) {
    return { blocks: [{ index: 0, html, tag: 'DIV' }], fallback: true };
  }

  const blocks: HtmlBlock[] = [];
  let pendingBuffer = '';

  for (const child of Array.from(root.childNodes)) {
    // 文本节点：累积到 pendingBuffer
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (text.trim()) {
        pendingBuffer += text;
      }
      continue;
    }

    // 注释节点：跳过
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const el = child as Element;
    const tagName = el.tagName.toUpperCase();

    if (BLOCK_TAGS.has(tagName)) {
      // 把之前累积的 buffer flush 成一个 P 块（如果有内容）
      if (pendingBuffer.trim()) {
        blocks.push({
          index: blocks.length,
          html: `<p>${escapeHtmlText(pendingBuffer)}</p>`,
          tag: 'P'
        });
        pendingBuffer = '';
      }
      // 块级元素独立成块
      blocks.push({
        index: blocks.length,
        html: el.outerHTML,
        tag: tagName
      });
    } else {
      // 行内元素（span / strong / em / a / code 等）：累积到 buffer
      pendingBuffer += el.outerHTML;
    }
  }

  // 末尾 buffer flush
  if (pendingBuffer.trim()) {
    blocks.push({
      index: blocks.length,
      html: `<p>${escapeHtmlText(pendingBuffer)}</p>`,
      tag: 'P'
    });
  }

  if (blocks.length === 0) {
    return { blocks: [{ index: 0, html, tag: 'DIV' }], fallback: true };
  }

  return { blocks, fallback: false };
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
