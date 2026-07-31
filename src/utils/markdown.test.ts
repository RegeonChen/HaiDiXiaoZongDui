import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings, nested lists, quotes and fenced code as block markup', () => {
    const html = renderMarkdown([
      '# 一级标题',
      '## 二级标题',
      '',
      '正文包含 **重点**。',
      '',
      '- 第一项',
      '- 第二项',
      '  - 子项',
      '',
      '1. 步骤一',
      '2. 步骤二',
      '',
      '> 引用内容',
      '',
      '```ts',
      'const value = "<unsafe>";',
      '```'
    ].join('\n'));

    expect(html).toContain('<h1>一级标题</h1>');
    expect(html).toContain('<h2>二级标题</h2>');
    expect(html).toContain('<p>正文包含 <strong>重点</strong>。</p>');
    expect(html).toContain(
      '<ul><li>第一项</li><li>第二项<ul><li>子项</li></ul></li></ul>'
    );
    expect(html).toContain('<ol><li>步骤一</li><li>步骤二</li></ol>');
    expect(html).toContain('<blockquote><p>引用内容</p></blockquote>');
    expect(html).toContain(
      '<pre><code class="language-ts">const value = &quot;&lt;unsafe&gt;&quot;;</code></pre>'
    );
  });

  it('renders all ATX heading levels and keeps unsafe HTML and URLs inert', () => {
    const html = renderMarkdown([
      '# H1',
      '## H2',
      '### H3',
      '#### H4',
      '##### H5',
      '###### H6',
      '',
      '<script>alert(1)</script>',
      '[危险链接](javascript:alert(1))'
    ].join('\n'));

    for (let level = 1; level <= 6; level += 1) {
      expect(html).toContain(`<h${level}>H${level}</h${level}>`);
    }
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});
