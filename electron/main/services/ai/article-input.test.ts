import { describe, expect, it } from 'vitest';
import { compactArticleContent, stripMarkdownImages } from './article-input';

describe('compactArticleContent', () => {
  it('removes image URLs without changing short article text', () => {
    const result = compactArticleContent(
      '开头 ![示意图](https://example.com/a_(1).png) 结尾',
      1_000
    );

    expect(result).toBe('开头  结尾');
    expect(result).not.toContain('example.com');
  });

  it('keeps representative start, middle and end content within the budget', () => {
    const source = [
      `开头-${'甲'.repeat(3_000)}`,
      `中段-${'乙'.repeat(3_000)}`,
      `结尾-${'丙'.repeat(3_000)}`
    ].join('\n\n');
    const result = compactArticleContent(source, 4_000);

    expect(result.length).toBeLessThanOrEqual(4_000);
    expect(result).toContain('开头-');
    expect(result).toContain('乙');
    expect(result).toContain('结尾-');
    expect(result).toContain('因文章较长已省略');
  });
});

describe('stripMarkdownImages', () => {
  it('keeps ordinary links while removing linked images', () => {
    expect(stripMarkdownImages('[![图](https://img.test/a.png)](https://article.test) [正文](https://article.test)'))
      .toBe(' [正文](https://article.test)');
  });
});
