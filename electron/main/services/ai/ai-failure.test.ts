import { describe, expect, it } from 'vitest';
import { classifyAiFailure } from './ai-failure';

describe('classifyAiFailure', () => {
  it.each([
    ['请求超时（60s）', 'AI_SUMMARY_TIMEOUT', '网络或系统代理'],
    ['HTTP 401: invalid api key', 'AI_SUMMARY_AUTH_FAILED', 'API Key'],
    ['HTTP 429: rate limit exceeded', 'AI_SUMMARY_RATE_LIMITED', '额度'],
    ['TypeError: fetch failed', 'AI_SUMMARY_NETWORK_FAILED', '无法连接'],
    ['ERR_PROXY_CONNECTION_FAILED', 'AI_SUMMARY_PROXY_FAILED', '系统代理']
  ])('classifies %s', (message, code, guidance) => {
    const result = classifyAiFailure(new Error(message), 'SUMMARY');
    expect(result.code).toBe(code);
    expect(result.message).toContain(guidance);
    expect(result.message).toMatch(/[\u3400-\u9fff]/u);
  });

  it('does not expose an unknown English-only provider error', () => {
    const result = classifyAiFailure(new Error('upstream exploded at internal node 42'), 'CHAT');
    expect(result.message).toBe('AI 服务调用失败。请检查网络、Base URL、模型名称和 API Key 后重试。');
  });
});
