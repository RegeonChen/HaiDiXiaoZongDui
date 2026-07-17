import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import { chatCompletion } from './openai-client';
import { generateSummary } from './summary-agent';

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
  });
});
