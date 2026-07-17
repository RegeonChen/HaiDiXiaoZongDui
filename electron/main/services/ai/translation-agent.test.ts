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
    const translations = fixture.trim().split(/\n---\n/);
    translations.forEach((translation) => {
      vi.mocked(chatCompletion).mockResolvedValueOnce(translation);
    });
    const source = [
      '## Why RSS Still Matters',
      'RSS gives readers control over what they follow, without an algorithm deciding what appears next.',
      'It also keeps subscriptions portable between applications.'
    ].join('\n\n');

    const result = await generateTranslation(provider, source);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.index)).toEqual([0, 1, 2]);
    expect(result.map((item) => item.original)).toEqual(source.split('\n\n'));
    expect(result[1]?.translated).toContain('算法');
    expect(chatCompletion).toHaveBeenCalledTimes(3);
    const prompt = vi.mocked(chatCompletion).mock.calls[0]?.[1][0]?.content ?? '';
    expect(prompt).toContain('Translate this paragraph completely');
    expect(prompt).toContain('## Why RSS Still Matters');
    expect(prompt).not.toContain('RSS gives readers control');
  });

  it('keeps the local source paragraph when a legacy custom prompt repeats it', async () => {
    vi.mocked(chatCompletion).mockResolvedValue([
      '---',
      'ORIGINAL: model-rewritten source',
      'TRANSLATED: 这是译文。',
      '---'
    ].join('\n'));

    const result = await generateTranslation(provider, 'Exact local source paragraph.', {
      customPromptTemplate: 'Translate {{content}} to {{targetLanguage}}'
    });

    expect(result).toEqual([{
      index: 0,
      original: 'Exact local source paragraph.',
      translated: '这是译文。'
    }]);
  });

  it('publishes all pending paragraphs before completing them one by one', async () => {
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('第一段译文。')
      .mockResolvedValueOnce('第二段译文。');
    const progress: Array<{ type: string; count: number; translated?: string }> = [];

    await generateTranslation(provider, 'First paragraph.\n\nSecond paragraph.', {
      onProgress: (event) => {
        progress.push(event.type === 'started'
          ? { type: event.type, count: event.paragraphs.length }
          : { type: event.type, count: 1, translated: event.paragraph.translated });
      }
    });

    expect(progress).toEqual([
      { type: 'started', count: 2 },
      { type: 'segmentCompleted', count: 1, translated: '第一段译文。' },
      { type: 'segmentCompleted', count: 1, translated: '第二段译文。' }
    ]);
  });

  it('bounds long input chunks and preserves all source text', () => {
    const source = `第一段。${'甲'.repeat(80)}\n\n第二段。${'乙'.repeat(80)}`;
    const chunks = splitMarkdownIntoChunks(source, 50);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
    expect(chunks.join('').replace(/\s/g, '')).toBe(source.replace(/\s/g, ''));
  });

  it('keeps fenced code with blank lines in one source block', () => {
    const source = ['Before.', '```ts', 'const a = 1;', '', 'const b = 2;', '```', 'After.'].join('\n\n');
    const chunks = splitMarkdownIntoChunks(source, 500);

    expect(chunks).toHaveLength(3);
    expect(chunks[1]).toContain('const a = 1;');
    expect(chunks[1]).toContain('const b = 2;');
  });
});
