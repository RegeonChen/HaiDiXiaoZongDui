/**
 * Article Chat Agent — 基于当前文章的多轮问答。
 *
 * Renderer 只提交 user / assistant 历史；可信的 system prompt 与文章正文
 * 始终由主进程拼装，避免 Renderer 注入 system 角色或绕过文章上下文。
 */

import type { AIChatMessage, AIProvider } from '../../../../shared/types';
import { chatCompletion, type ChatMessage } from './openai-client';
import { compactArticleContent } from './article-input';

export const ARTICLE_CHAT_LIMITS = {
  articleCharacters: 20_000,
  historyMessages: 16,
  messageCharacters: 6_000,
  maxTokens: 1_200,
  timeoutMs: 60_000
} as const;

export function buildArticleChatMessages(
  articleTitle: string,
  articleContent: string,
  messages: AIChatMessage[]
): ChatMessage[] {
  const history = messages
    .slice(-ARTICLE_CHAT_LIMITS.historyMessages)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, ARTICLE_CHAT_LIMITS.messageCharacters)
    }))
    .filter((message) => message.content.length > 0);

  if (history.length === 0 || history[history.length - 1]?.role !== 'user') {
    throw new Error('对话必须以一条非空用户消息结束');
  }

  const title = articleTitle.trim().slice(0, 500) || '未命名文章';
  const content = compactArticleContent(
    articleContent,
    ARTICLE_CHAT_LIMITS.articleCharacters
  );
  const systemPrompt = [
    '你是 RSS 阅读器中的文章 AI 助手。',
    '请优先依据下方文章内容回答，并结合当前对话理解用户的追问。',
    '如果文章没有提供足够信息，请明确说明，不要编造文章中不存在的事实。',
    '默认使用简体中文，除非用户明确要求其他语言。',
    '回答可使用简洁 Markdown；翻译请求只输出准确译文，不额外总结。',
    '',
    `文章标题：${title}`,
    '',
    '文章正文：',
    content
  ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    ...history
  ];
}

export async function answerArticleQuestion(
  provider: AIProvider & { _apiKey: string },
  articleTitle: string,
  articleContent: string,
  messages: AIChatMessage[]
): Promise<string> {
  return chatCompletion(
    provider,
    buildArticleChatMessages(articleTitle, articleContent, messages),
    {
      temperature: 0.35,
      maxTokens: ARTICLE_CHAT_LIMITS.maxTokens,
      timeoutMs: ARTICLE_CHAT_LIMITS.timeoutMs,
      enableThinking: /^qwen3(?:[.\-]|$)/i.test(provider.modelName) ? false : undefined
    }
  );
}
