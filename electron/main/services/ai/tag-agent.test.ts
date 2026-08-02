import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import { chatCompletion } from './openai-client';
import { parseTagSuggestions, suggestTags, TAG_SUGGESTION_LIMITS } from './tag-agent';

vi.mock('./openai-client', () => ({ chatCompletion: vi.fn() }));

const provider = {
  id: 'provider-1',
  name: 'Test',
  baseUrl: 'https://example.test/v1',
  modelName: 'deepseek-v4-flash',
  apiKeySet: true,
  isDefault: true,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  _apiKey: 'secret'
} as AIProvider & { _apiKey: string };

describe('tag suggestion agent', () => {
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  it('requests structured output with thinking disabled', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({
      suggestions: [
        { name: 'Machine Learning', confidence: 0.92, reason: 'Article discusses ML.' }
      ]
    }));

    const result = await suggestTags(provider, 'Article body');

    expect(result).toEqual([
      { name: 'machine-learning', confidence: 0.92, reason: 'Article discusses ML.' }
    ]);
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledWith(
      provider,
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' })
      ]),
      expect.objectContaining({
        enableThinking: false,
        responseFormat: 'json_object',
        maxTokens: TAG_SUGGESTION_LIMITS.primaryMaxTokens,
        timeoutMs: TAG_SUGGESTION_LIMITS.primaryTimeoutMs
      })
    );
  });

  it('compacts oversized article input before requesting suggestions', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"suggestions":[{"name":"rss","confidence":0.9}]}');
    await suggestTags(provider, `开头\n\n${'正文'.repeat(10_000)}\n\n结尾`);

    const prompt = vi.mocked(chatCompletion).mock.calls[0]?.[1][1]?.content ?? '';
    expect(prompt).toContain('因文章较长已省略');
    expect(prompt.length).toBeLessThan(TAG_SUGGESTION_LIMITS.articleCharacters + 1_000);
  });

  it('extracts embedded JSON, accepts legacy arrays, removes trailing commas and deduplicates names', () => {
    expect(parseTagSuggestions(`analysis before output
      \`\`\`json
      {"suggestions":[
        {"name":"AI Safety","confidence":1.4,"reason":"First line.\\nSecond line."},
        {"name":"ai safety","confidence":0.2,"reason":"duplicate"},
      ]}
      \`\`\`
    `)).toEqual([
      { name: 'ai-safety', confidence: 1, reason: 'First line. Second line.' }
    ]);

    expect(parseTagSuggestions('[{"name":"RSS","reason":"Feed format"}]'))
      .toEqual([{ name: 'rss', confidence: 0.5, reason: 'Feed format' }]);
  });

  it('repairs one malformed response and validates the repaired suggestions', async () => {
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('I returned prose instead of JSON.')
      .mockResolvedValueOnce('{"suggestions":[{"name":"RSS Reader","confidence":0.8,"reason":"Core topic"}]}');

    const result = await suggestTags(provider, 'Article body');

    expect(result[0]?.name).toBe('rss-reader');
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledTimes(2);
    const repairMessages = vi.mocked(chatCompletion).mock.calls[1]?.[1];
    expect(repairMessages?.[0]?.content).toContain('untrusted data');
    expect(repairMessages?.[1]?.content).toContain('I returned prose');
  });

  it('rejects valid JSON that contains no usable tag suggestions', () => {
    expect(() => parseTagSuggestions('{"suggestions":[{"name":""}]}'))
      .toThrow('模型未生成可用的标签建议');
  });
});
