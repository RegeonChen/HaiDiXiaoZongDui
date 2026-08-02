import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import { chatCompletion } from './openai-client';
import {
  ARTICLE_CHAT_LIMITS,
  answerArticleQuestion,
  buildArticleChatMessages
} from './article-chat-agent';

vi.mock('./openai-client', () => ({ chatCompletion: vi.fn() }));

const provider = {
  id: 'provider-1',
  name: 'Test',
  baseUrl: 'https://example.test/v1',
  modelName: 'test-model',
  apiKeySet: true,
  isDefault: true,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  _apiKey: 'secret'
} as AIProvider & { _apiKey: string };

describe('article chat agent', () => {
  beforeEach(() => {
    vi.mocked(chatCompletion).mockReset();
  });

  it('把可信文章上下文与多轮历史交给模型', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('文章认为缓存可以降低延迟。');

    const reply = await answerArticleQuestion(
      provider,
      '缓存设计',
      '文章正文说明缓存能够降低重复请求的延迟。',
      [
        { role: 'user', content: '文章的核心结论是什么？' },
        { role: 'assistant', content: '核心结论与缓存有关。' },
        { role: 'user', content: '它具体解决什么问题？' }
      ]
    );

    expect(reply).toContain('降低延迟');
    const sent = vi.mocked(chatCompletion).mock.calls[0]?.[1] ?? [];
    expect(sent[0]).toMatchObject({ role: 'system' });
    expect(sent[0]?.content).toContain('文章标题：缓存设计');
    expect(sent[0]?.content).toContain('缓存能够降低重复请求');
    expect(sent.slice(1)).toEqual([
      { role: 'user', content: '文章的核心结论是什么？' },
      { role: 'assistant', content: '核心结论与缓存有关。' },
      { role: 'user', content: '它具体解决什么问题？' }
    ]);
    expect(vi.mocked(chatCompletion).mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      maxTokens: ARTICLE_CHAT_LIMITS.maxTokens,
      timeoutMs: ARTICLE_CHAT_LIMITS.timeoutMs
    }));
  });

  it('限制文章长度、历史条数和单条消息长度', () => {
    const messages = Array.from(
      { length: ARTICLE_CHAT_LIMITS.historyMessages + 4 },
      (_, index) => ({
        role: index % 2 === 0 ? 'assistant' as const : 'user' as const,
        content: `message-${index}-${'x'.repeat(ARTICLE_CHAT_LIMITS.messageCharacters + 20)}`
      })
    );
    messages[messages.length - 1] = { role: 'user', content: '最后的问题' };

    const result = buildArticleChatMessages(
      '超长文章',
      'a'.repeat(ARTICLE_CHAT_LIMITS.articleCharacters + 100),
      messages
    );

    expect(result).toHaveLength(ARTICLE_CHAT_LIMITS.historyMessages + 1);
    expect(result[0]?.content).not.toContain('a'.repeat(ARTICLE_CHAT_LIMITS.articleCharacters + 1));
    expect(result[1]?.content.length).toBeLessThanOrEqual(ARTICLE_CHAT_LIMITS.messageCharacters);
    expect(result.at(-1)).toEqual({ role: 'user', content: '最后的问题' });
  });

  it('拒绝没有用户问题或最后一条不是用户消息的请求', () => {
    expect(() => buildArticleChatMessages('标题', '正文', [])).toThrow('用户消息');
    expect(() => buildArticleChatMessages(
      '标题',
      '正文',
      [{ role: 'assistant', content: '旧回复' }]
    )).toThrow('用户消息');
  });
});
