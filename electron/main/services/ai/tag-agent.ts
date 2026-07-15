/**
 * Tag Agent — AI 标签推荐
 * Task 3.3: Database and AI Services
 *
 * 职责：
 *  - 根据文章 cleanedMarkdown 自动推荐标签
 *  - 返回标签名、置信度和推荐理由
 *  - 内置默认 Prompt 模板（用户可在 AppSettings 中覆盖）
 */

import { chatCompletion } from './openai-client';
import type { AIProvider, TagSuggestion } from '../../../../shared/types';

// ============================================================
// 默认 Prompt 模板
// ============================================================

const DEFAULT_TAG_PROMPT = [
  'Analyze the following article and suggest 5-10 relevant tags.',
  '',
  'Output ONLY a JSON array of objects, each with keys:',
  '"name" (lowercase, kebab-case, 1-3 words, e.g. "large-language-models")',
  '"confidence" (number 0-1, how confident you are this tag fits)',
  '"reason" (one short sentence explaining WHY this tag fits)',
  '',
  'Tags should cover:',
  '- Technical domain / field (e.g. machine-learning, web-development)',
  '- Specific technology / framework (e.g. react, pytorch)',
  '- Topic / concept (e.g. prompt-engineering, scalability)',
  '- If applicable: company/organization name',
  '',
  'Do NOT output anything other than the JSON array. No markdown fences, no explanation.',
  '',
  'Article:',
  '{{content}}'
].join('\n');

// ============================================================
// 公共 API
// ============================================================

export async function suggestTags(
  provider: AIProvider & { _apiKey: string },
  articleContent: string,
  customPromptTemplate?: string | null
): Promise<TagSuggestion[]> {
  const template = customPromptTemplate || DEFAULT_TAG_PROMPT;

  const prompt = template
    .replace(/\{\{title\}\}/g, '')
    .replace(/\{\{content\}\}/g, articleContent);

  const output = await chatCompletion(
    provider,
    [{ role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: 1024 }
  );

  return parseTagSuggestions(output);
}

// ============================================================
// 内部解析
// ============================================================

function parseTagSuggestions(text: string): TagSuggestion[] {
  // 尝试从文本中提取 JSON 数组（兼容模型可能包裹在 ```json ... ``` 中）
  let jsonText = text.trim();

  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  }

  try {
    const arr = JSON.parse(jsonText) as unknown[];
    const suggestions: TagSuggestion[] = [];
    for (const item of arr) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.name !== 'string' || !obj.name.trim()) continue;
      suggestions.push({
        name: String(obj.name).trim().toLowerCase().replace(/\s+/g, '-'),
        confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5,
        reason: typeof obj.reason === 'string' ? obj.reason : ''
      });
    }
    return suggestions.slice(0, 10);
  } catch {
    // 解析失败返回空列表
    return [];
  }
}
