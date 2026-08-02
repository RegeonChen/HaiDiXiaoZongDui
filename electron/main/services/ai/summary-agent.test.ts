import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import { chatCompletion } from './openai-client';
import { generateSummary, SUMMARY_LIMITS } from './summary-agent';

vi.mock('./openai-client', () => ({ chatCompletion: vi.fn() }));

const provider = {
  id: 'provider-1', name: 'Fixture', baseUrl: 'https://example.com', modelName: 'fixture',
  isDefault: true, createdAt: '', updatedAt: '', _apiKey: 'test-key'
} as AIProvider & { _apiKey: string };

describe('generateSummary', () => {
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  it('enforces the stable Markdown contract and returns fixture output unchanged', async () => {
    const fixture = await readFile(fileURLToPath(new URL('./__fixtures__/summary-output.md', import.meta.url)), 'utf8');
    vi.mocked(chatCompletion).mockResolvedValue(fixture.trim());

    const result = await generateSummary(provider, 'RSS', '正文第一段。\n\n正文第二段。');

    expect(result).toBe(fixture.trim());
    expect(result).toContain('## Key Points');
    expect(result).toContain('- **自主选择**');
    const prompt = vi.mocked(chatCompletion).mock.calls[0]?.[1][0]?.content ?? '';
    expect(prompt).toContain('## Overview');
    expect(prompt).toContain('Markdown bullet list');
    expect(prompt).toContain('Do not wrap the response in a code fence');
    expect(vi.mocked(chatCompletion).mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      maxTokens: SUMMARY_LIMITS.maxTokens.standard,
      timeoutMs: SUMMARY_LIMITS.timeoutMs
    }));
  });

  it('does not send image URLs or an unbounded long article to the provider', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('摘要');
    const body = `开头 ![图](https://cdn.example.com/large.png)\n\n${'正文'.repeat(20_000)}\n\n结尾`;

    await generateSummary(provider, '长文', body);

    const prompt = vi.mocked(chatCompletion).mock.calls[0]?.[1][0]?.content ?? '';
    expect(prompt).not.toContain('cdn.example.com');
    expect(prompt).toContain('因文章较长已省略');
    expect(prompt.length).toBeLessThan(SUMMARY_LIMITS.articleCharacters + 1_000);
  });
});
