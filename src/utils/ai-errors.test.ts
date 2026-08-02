import { describe, expect, it } from 'vitest';
import { formatTagSuggestionError } from './ai-errors';

describe('formatTagSuggestionError', () => {
  it('hides internal response fields and error codes', () => {
    const message = formatTagSuggestionError(
      'AI_TAG_SUGGEST_FAILED: 模型返回空内容，模型只返回了 reasoning_content，未返回正式答案'
    );

    expect(message).toBe('当前模型没有返回可用的标签建议，请重试；若仍失败，请在 AI 设置中更换模型。');
    expect(message).not.toContain('AI_TAG_SUGGEST_FAILED');
    expect(message).not.toContain('reasoning_content');
  });

  it('provides actionable provider and authentication guidance', () => {
    expect(formatTagSuggestionError('NO_PROVIDER: 未设置默认 AI Provider'))
      .toBe('请先在 AI 设置中配置并启用默认模型。');
    expect(formatTagSuggestionError('AI_TAG_SUGGEST_FAILED: HTTP 401: invalid api key'))
      .toBe('AI 服务拒绝了请求，请检查 API Key 和模型权限。');
  });

  it('removes an internal code while preserving a useful provider message', () => {
    expect(formatTagSuggestionError('AI_TAG_SUGGEST_FAILED: 上游服务暂时不可用'))
      .toBe('上游服务暂时不可用。请检查 AI 设置和网络后重试。');
  });
});
