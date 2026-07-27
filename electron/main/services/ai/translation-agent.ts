/**
 * Translation Agent — AI 双语翻译
 * Task 3.3: Database and AI Services
 *
 * 职责：
 *  - 接收文章 cleanedMarkdown，按段落翻译
 *  - 输出 bilingual（原文 + 译文按段落对照）
 *  - 内置默认 Prompt 模板（用户可在 AppSettings 中覆盖）
 */

import { chatCompletion } from './openai-client';
import type { AIProvider, Language, TranslatedParagraph } from '../../../../shared/types';

// ============================================================
// 默认 Prompt 模板
// ============================================================

const DEFAULT_TRANSLATION_PROMPT = [
  'You are a professional translator. Translate the ONE source paragraph below.',
  '',
  'Target language: {{targetLanguage}}',
  '',
  'Rules:',
  '- Translate this paragraph completely. Do not summarize, omit, merge, or shorten it.',
  '- Preserve markdown formatting (links, bold, italic, code, lists, etc.).',
  '- Do not translate code blocks or URLs.',
  '- Keep technical terms accurate.',
  '- Output ONLY the translated paragraph. Do not repeat the source and do not add labels or commentary.',
  '',
  'Source paragraph:',
  '{{content}}'
].join('\n');

// Character-based chunking keeps requests bounded across providers whose token
// accounting differs. Long individual paragraphs are split as a last resort.
const MAX_CHUNK_CHARACTERS = 12_000;

// ============================================================
// 类型
// ============================================================

export interface TranslationOptions {
  targetLanguage?: Language;
  /** 用户自定义 Prompt 模板，null 时使用内置 */
  customPromptTemplate?: string | null;
  temperature?: number;
  /** 每个段落完成时通知调用方，用于阅读器原地替换占位框。 */
  onProgress?: (event: TranslationGenerationProgressEvent) => void;
}

/** 仅供主进程翻译运行时使用的逐段进度事件。 */
export type TranslationGenerationProgressEvent =
  | { type: 'started'; paragraphs: TranslatedParagraph[] }
  | { type: 'segmentCompleted'; paragraph: TranslatedParagraph };

// ============================================================
// 公共 API
// ============================================================

/**
 * 翻译文章，返回逐段对照结果。
 */
export async function generateTranslation(
  provider: AIProvider & { _apiKey: string },
  articleContent: string,
  options: TranslationOptions = {}
): Promise<TranslatedParagraph[]> {
  const {
    targetLanguage = 'zh',
    customPromptTemplate,
    temperature = 0.3,
    onProgress
  } = options;

  const languageName = targetLanguage === 'zh' ? 'Simplified Chinese' : 'English';

  const template = customPromptTemplate || DEFAULT_TRANSLATION_PROMPT;

  const chunks = splitMarkdownIntoChunks(articleContent, MAX_CHUNK_CHARACTERS)
    .map((original, index) => ({
      index,
      original: stripMarkdownImages(original).trim()
    }))
    .filter((chunk) => chunk.original.length > 0);
  const translated: TranslatedParagraph[] = [];

  // 先发布完整的原文段落快照。这样在第一个模型请求完成前，阅读器就能给每段
  // 原文后插入“翻译中”框，而不是等到整篇翻完才开始渲染双语内容。
  onProgress?.({
    type: 'started',
    paragraphs: chunks.map((chunk) => ({
      index: chunk.index,
      original: chunk.original,
      translated: ''
    }))
  });

  for (const chunk of chunks) {
    const prompt = template
      .replace(/\{\{title\}\}/g, '')
      .replace(/\{\{content\}\}/g, chunk.original)
      .replace(/\{\{targetLanguage\}\}/g, languageName);

    const output = await chatCompletion(
      provider,
      [{ role: 'user', content: prompt }],
      {
        temperature,
        maxTokens: 8192,
        enableThinking: /^qwen3(?:[.\-]|$)/i.test(provider.modelName) ? false : undefined
      }
    );

    const paragraph = {
      // 保留清洗后 Markdown 的原始块索引。图片独占块会被跳过，因此这里
      // 不能再用 translated.length，否则后续译文会错挂到下一张图片下面。
      index: chunk.index,
      original: chunk.original,
      translated: extractTranslatedText(output)
    };
    translated.push(paragraph);
    onProgress?.({ type: 'segmentCompleted', paragraph });
  }

  return translated;
}

/**
 * 删除 Markdown/HTML 图片，只把真正需要翻译的文字发给模型。
 *
 * 独占图片的段落会因此变成空字符串并被 generateTranslation 跳过；混合段落
 * 则保留图片前后的说明文字。扫描圆括号而不是只靠正则，以兼容 URL 中的括号。
 */
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
      // 不是内联图片语法，保守保留原内容。
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
    // 链接图片会在移除内部 ![](...) 后留下 [](...)，一并清掉。
    .replace(/\[\s*\]\([^\n)]*\)/g, '');
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

// ============================================================
// 内部解析
// ============================================================

/**
 * 兼容用户旧自定义 Prompt 可能返回的 ORIGINAL / TRANSLATED 格式。
 * 新默认 Prompt 只返回译文本身。
 */
function extractTranslatedText(text: string): string {
  const legacyBlocks = text.split(/\n---+\n?/).map((block) => block.trim()).filter(Boolean);
  const legacyTranslations = legacyBlocks.flatMap((block) => {
    const match = block.match(/(?:^|\n)(?:TRANSLATED|TRANSLATION|译文)\s*[:：]\s*([\s\S]*?)$/i);
    return match?.[1]?.trim() ? [match[1].trim()] : [];
  });
  if (legacyTranslations.length > 0) return legacyTranslations.join('\n\n');

  return text
    .replace(/^\s*(?:TRANSLATED|TRANSLATION|译文)\s*[:：]\s*/i, '')
    .trim();
}

export function splitMarkdownIntoChunks(
  content: string,
  maxCharacters = MAX_CHUNK_CHARACTERS
): string[] {
  if (!content.trim()) return [''];
  if (!Number.isFinite(maxCharacters) || maxCharacters <= 0) {
    throw new Error('maxCharacters must be a positive number');
  }

  return splitMarkdownParagraphs(content).flatMap((paragraph) =>
    splitLongParagraph(paragraph.trim(), Math.trunc(maxCharacters))
  ).filter(Boolean);
}

function splitMarkdownParagraphs(content: string): string[] {
  const paragraphs: string[] = [];
  const current: string[] = [];
  let fence: { character: '`' | '~'; length: number } | null = null;
  const flush = (): void => {
    const paragraph = current.join('\n').trim();
    if (paragraph) paragraphs.push(paragraph);
    current.length = 0;
  };

  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const character = marker[0] as '`' | '~';
      if (fence === null) {
        fence = { character, length: marker.length };
      } else {
        const suffix = line.slice(line.indexOf(marker) + marker.length);
        if (
          character === fence.character &&
          marker.length >= fence.length &&
          suffix.trim() === ''
        ) {
          fence = null;
        }
      }
      current.push(line);
      continue;
    }
    if (!fence && line.trim() === '') flush();
    else current.push(line);
  }
  flush();
  return paragraphs;
}

function splitLongParagraph(paragraph: string, maxCharacters: number): string[] {
  if (paragraph.length <= maxCharacters) return [paragraph];
  const parts: string[] = [];
  let remaining = paragraph;

  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters + 1);
    const sentenceBoundary = Math.max(
      window.lastIndexOf('。'),
      window.lastIndexOf('！'),
      window.lastIndexOf('？'),
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('\n')
    );
    const splitAt = sentenceBoundary >= Math.floor(maxCharacters * 0.5)
      ? sentenceBoundary + 1
      : maxCharacters;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
