/**
 * Summary Agent — AI 文章摘要生成
 * Task 3.3: Database and AI Services
 *
 * 职责：
 *  - 接收文章 cleanedMarkdown，按用户配置的 Prompt 模板生成摘要
 *  - 支持 brief / standard / detailed 三种详细程度
 *  - 内置默认 Prompt 模板（用户可在 AppSettings 中覆盖）
 */

import { chatCompletion } from './openai-client';
import type { AIProvider, SummaryDetailLevel, Language } from '../../../../shared/types';

// ============================================================
// 默认 Prompt 模板
// ============================================================

const DEFAULT_BRIEF_PROMPT = [
  'You are a helpful assistant. Summarize the following article in ONE concise sentence.',
  '',
  'Language: {{language}}',
  '',
  'Article:',
  '{{content}}'
].join('\n');

const DEFAULT_STANDARD_PROMPT = [
  'You are a professional editor. Write a structured summary of the following article in 3-5 paragraphs.',
  '',
  'Guidelines:',
  '- Capture the main argument, key evidence, and conclusion.',
  '- Keep technical accuracy; do not invent facts.',
  '- Language: {{language}}',
  '',
  'Article:',
  '{{content}}'
].join('\n');

const DEFAULT_DETAILED_PROMPT = [
  'You are an expert analyst. Create a comprehensive summary of the following article.',
  '',
  'Structure your response as:',
  '1. **Overview** (1-2 sentences)',
  '2. **Key Points** (bullet list)',
  '3. **Evidence / Data** (if any)',
  '4. **Conclusion / Implications**',
  '',
  'Language: {{language}}',
  'Be thorough but avoid fluff.',
  '',
  'Article:',
  '{{content}}'
].join('\n');

const PROMPTS: Record<SummaryDetailLevel, string> = {
  brief: DEFAULT_BRIEF_PROMPT,
  standard: DEFAULT_STANDARD_PROMPT,
  detailed: DEFAULT_DETAILED_PROMPT
};

// ============================================================
// 类型
// ============================================================

export interface SummaryOptions {
  language?: Language;
  detailLevel?: SummaryDetailLevel;
  /** 用户自定义 Prompt 模板（覆盖内置模板），null 时使用内置 */
  customPromptTemplate?: string | null;
  /** 自定义温度 */
  temperature?: number;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 根据文章内容和 AI Provider 生成摘要。
 *
 * @param provider - 已填充 _apiKey 的 AIProvider（由 AiProviderRepository.getById 返回并附上 apiKey）
 * @param articleTitle - 文章标题
 * @param articleContent - cleanedMarkdown 正文
 * @param options - 摘要选项
 * @returns 摘要文本
 */
export async function generateSummary(
  provider: AIProvider & { _apiKey: string },
  articleTitle: string,
  articleContent: string,
  options: SummaryOptions = {}
): Promise<string> {
  const {
    language = 'zh',
    detailLevel = 'standard',
    customPromptTemplate,
    temperature = 0.3
  } = options;

  const languageName = language === 'zh' ? 'Chinese (Simplified)' : 'English';

  const template = customPromptTemplate || PROMPTS[detailLevel];

  const prompt = template
    .replace(/\{\{title\}\}/g, articleTitle)
    .replace(/\{\{content\}\}/g, articleContent)
    .replace(/\{\{language\}\}/g, languageName)
    .replace(/\{\{detailLevel\}\}/g, detailLevel);

  const maxTokens = detailLevel === 'brief' ? 512 : detailLevel === 'standard' ? 2048 : 4096;

  return chatCompletion(
    provider,
    [{ role: 'user', content: prompt }],
    { temperature, maxTokens }
  );
}
