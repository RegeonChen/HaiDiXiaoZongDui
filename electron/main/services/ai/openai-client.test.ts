import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import {
  chatCompletion,
  extractMessageText,
  resetResponseFormatCompatibilityCache
} from './openai-client';

const provider = {
  id: 'provider-1', name: 'Qwen', baseUrl: 'https://example.com/v1',
  modelName: 'qwen3.6-plus', isDefault: true, createdAt: '', updatedAt: '',
  _apiKey: 'test-key'
} as AIProvider & { _apiKey: string };

afterEach(() => {
  vi.unstubAllGlobals();
  resetResponseFormatCompatibilityCache();
});

describe('OpenAI-compatible message content', () => {
  it('extracts strings, text objects and text-part arrays', () => {
    expect(extractMessageText(' answer ')).toBe('answer');
    expect(extractMessageText({ type: 'text', text: '译文' })).toBe('译文');
    expect(extractMessageText([
      { type: 'output_text', text: '第一部分' },
      { type: 'output_text', text: '第二部分' }
    ])).toBe('第一部分第二部分');
  });

  it('sends enable_thinking=false and accepts structured Qwen content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'qwen3.6-plus',
      choices: [{ message: { role: 'assistant', content: { type: 'text', text: '逐段译文' } } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await chatCompletion(provider, [{ role: 'user', content: 'Translate' }], {
      enableThinking: false
    });

    expect(result).toBe('逐段译文');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'qwen3.6-plus',
      enable_thinking: false
    });
  });

  it('does not expose reasoning_content as the formal answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'qwen3.6-plus',
      choices: [{ message: { content: null, reasoning_content: 'private reasoning' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(chatCompletion(provider, [{ role: 'user', content: 'Translate' }]))
      .rejects.toThrow(/只返回了 reasoning_content/);
  });

  it('accepts reasoning_content only for a structured JSON task', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'deepseek-v4-flash',
      choices: [{
        message: {
          content: null,
          reasoning_content: '{"suggestions":[{"name":"rss"}]}'
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(chatCompletion(provider, [{ role: 'user', content: 'Return JSON' }], {
      responseFormat: 'json_object'
    })).resolves.toBe('{"suggestions":[{"name":"rss"}]}');
  });

  it('retries once without response_format when a compatible provider rejects it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Unknown parameter: response_format' }
      }), { status: 400, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"suggestions":[]}' } }]
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"suggestions":[{"name":"cached"}]}' } }]
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const attempts: Array<{ responseFormatSent: boolean; downgrade: string | null }> = [];

    const result = await chatCompletion(provider, [{ role: 'user', content: 'Return JSON' }], {
      responseFormat: 'json_object',
      onRequestAttempt: (attempt) => attempts.push({
        responseFormatSent: attempt.responseFormatSent,
        downgrade: attempt.responseFormatDowngrade
      })
    });

    expect(result).toBe('{"suggestions":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(firstRequest.body))).toMatchObject({
      response_format: { type: 'json_object' }
    });
    expect(JSON.parse(String(secondRequest.body))).not.toHaveProperty('response_format');
    expect(attempts).toEqual([
      { responseFormatSent: true, downgrade: null },
      { responseFormatSent: false, downgrade: 'provider_rejected' }
    ]);

    const cachedResult = await chatCompletion(
      provider,
      [{ role: 'user', content: 'Return JSON again' }],
      {
        responseFormat: 'json_object',
        onRequestAttempt: (attempt) => attempts.push({
          responseFormatSent: attempt.responseFormatSent,
          downgrade: attempt.responseFormatDowngrade
        })
      }
    );
    expect(cachedResult).toContain('cached');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const cachedRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(cachedRequest.body))).not.toHaveProperty('response_format');
    expect(attempts.at(-1)).toEqual({
      responseFormatSent: false,
      downgrade: 'cached_unsupported'
    });
  });
});
