import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import { chatCompletion } from './openai-client';
import { generateTranslation, splitMarkdownIntoChunks } from './translation-agent';

vi.mock('./openai-client', () => ({ chatCompletion: vi.fn() }));

const provider = {
  id: 'provider-1', name: 'Fixture', baseUrl: 'https://example.com', modelName: 'fixture',
  isDefault: true, createdAt: '', updatedAt: '', _apiKey: 'test-key'
} as AIProvider & { _apiKey: string };

describe('generateTranslation', () => {
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  it('requests and parses every heading and body paragraph', async () => {
    const fixture = await readFile(fileURLToPath(new URL('./__fixtures__/translation-output.txt', import.meta.url)), 'utf8');
    vi.mocked(chatCompletion).mockResolvedValue(fixture);
    const source = [
      '## Why RSS Still Matters',
      'RSS gives readers control over what they follow, without an algorithm deciding what appears next.',
      'It also keeps subscriptions portable between applications.'
    ].join('\n\n');

    const result = await generateTranslation(provider, source);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.index)).toEqual([0, 1, 2]);
    expect(result[1]?.translated).toContain('算法');
    const prompt = vi.mocked(chatCompletion).mock.calls[0]?.[1][0]?.content ?? '';
    expect(prompt).toContain('Translate every paragraph completely');
    expect(prompt).toContain('Never translate only the title or headings');
    expect(prompt).toContain(source);
  });

  it('bounds long input chunks and preserves all source text', () => {
    const source = `第一段。${'甲'.repeat(80)}\n\n第二段。${'乙'.repeat(80)}`;
    const chunks = splitMarkdownIntoChunks(source, 50);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
    expect(chunks.join('').replace(/\s/g, '')).toBe(source.replace(/\s/g, ''));
  });
});
