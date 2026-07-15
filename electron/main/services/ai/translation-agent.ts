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
  'You are a professional translator. Translate the following article.',
  '',
  'Target language: {{targetLanguage}}',
  '',
  'IMPORTANT — output format:',
  'Split the article into logical paragraphs (preserve the original paragraph boundaries).',
  'For each paragraph, output:',
  '---',
  'ORIGINAL: <original text>',
  'TRANSLATED: <translated text>',
  '---',
  '',
  'Rules:',
  '- Preserve markdown formatting (links, bold, italic, code, lists, etc.).',
  '- Do not translate code blocks or URLs.',
  '- Keep technical terms accurate.',
  '- Output ONLY the --- delimited blocks, no preamble or postamble.',
  '',
  'Article:',
  '{{content}}'
].join('\n');

// ============================================================
// 类型
// ============================================================

export interface TranslationOptions {
  targetLanguage?: Language;
  /** 用户自定义 Prompt 模板，null 时使用内置 */
  customPromptTemplate?: string | null;
  temperature?: number;
}

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
    temperature = 0.3
  } = options;

  const languageName = targetLanguage === 'zh' ? 'Simplified Chinese' : 'English';

  const template = customPromptTemplate || DEFAULT_TRANSLATION_PROMPT;

  const prompt = template
    .replace(/\{\{title\}\}/g, '')
    .replace(/\{\{content\}\}/g, articleContent)
    .replace(/\{\{targetLanguage\}\}/g, languageName);

  const output = await chatCompletion(
    provider,
    [{ role: 'user', content: prompt }],
    { temperature, maxTokens: 8192 }
  );

  return parseBilingualOutput(output, articleContent);
}

// ============================================================
// 内部解析
// ============================================================

/**
 * 解析模型输出的 --- ORIGINAL / TRANSLATED --- 格式。
 * 解析失败时回退为整篇原文 + 整篇译文（一段）。
 */
function parseBilingualOutput(text: string, fallbackOriginal: string): TranslatedParagraph[] {
  const blocks = text.split(/\n---+\n?/).filter((s) => s.trim());
  const result: TranslatedParagraph[] = [];
  let index = 0;

  for (const block of blocks) {
    // 匹配 ORIGINAL: 和 TRANSLATED: 段
    const origMatch = block.match(/^ORIGINAL:\s*([\s\S]*?)(?=\nTRANSLATED:|\n?$)/m);
    const transMatch = block.match(/TRANSLATED:\s*([\s\S]*?)$/m);

    if (origMatch && transMatch) {
      result.push({
        index,
        original: origMatch[1].trim(),
        translated: transMatch[1].trim()
      });
      index++;
    }
  }

  // 回退：解析失败时整篇作为一个段落
  if (result.length === 0) {
    result.push({
      index: 0,
      original: fallbackOriginal,
      translated: text.trim()
    });
  }

  return result;
}
