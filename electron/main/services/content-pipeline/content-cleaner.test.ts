import { describe, expect, it } from 'vitest';
import { cleanArticleContent } from './content-cleaner';

const articleHtml = `
<!doctype html>
<html><head><title>Cleaning Test</title><style>.ad { color: red }</style></head>
<body>
  <nav>Navigation should disappear</nav>
  <main>
    <article>
      <h1>Cleaning Test</h1>
      <p>This is a sufficiently long opening paragraph describing the article and giving Readability enough meaningful text to identify the main content correctly.</p>
      <p>Second paragraph with <strong>bold text</strong>, <a href="/source">a source link</a>, and an unsafe <a href="javascript:alert(1)">link</a>.</p>
      <img src="/image.png" alt="diagram" onerror="alert(1)">
      <ul><li>First item</li><li>Second item</li></ul>
      <pre><code class="language-typescript">const answer = 42;</code></pre>
      <table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table>
      <script>alert('removed')</script>
      <iframe src="https://evil.example"></iframe>
    </article>
  </main>
</body></html>`;

describe('cleanArticleContent', () => {
  it('extracts, sanitizes and converts article content to GFM', () => {
    const result = cleanArticleContent(articleHtml, 'https://example.com/posts/1');

    expect(result.cleanedHtml).toContain('https://example.com/image.png');
    expect(result.cleanedHtml).toContain('https://example.com/source');
    expect(result.cleanedHtml).not.toContain('<script');
    expect(result.cleanedHtml).not.toContain('<iframe');
    expect(result.cleanedHtml).not.toContain('onerror');
    expect(result.cleanedHtml).not.toContain('javascript:');
    expect(result.cleanedHtml).not.toContain('Navigation should disappear');
    expect(result.cleanedMarkdown).toContain('![diagram](https://example.com/image.png)');
    expect(result.cleanedMarkdown).toContain('```typescript');
    expect(result.cleanedMarkdown).toContain('| Name | Value |');
    expect(result.cleanedMarkdown).toMatch(/-\s+First item/);
  });

  it('rejects empty content and non-http article URLs', () => {
    expect(() => cleanArticleContent('', 'https://example.com')).toThrowError(/内容为空/);
    expect(() => cleanArticleContent('<p>text</p>', 'file:///tmp/a.html')).toThrowError(
      /http 或 https/
    );
  });

  it('preserves mixed-language text and complex structures for narrow readers and AI input', () => {
    const result = cleanArticleContent(`
      <article>
        <h1>中文与 English 混排测试</h1>
        <p>正文包含中文、English words、数字 2026，以及足够长的语义内容，确保正文提取器能够识别这一段落。</p>
        <blockquote>引用内容 source quote</blockquote>
        <ol><li>第一项</li><li>Second item</li></ol>
        <pre><code class="language-python">print("你好, world")</code></pre>
        <table><tr><th>名称</th><th>Value</th></tr><tr><td>超长字段</td><td>https://example.com/a/very/long/path/that/must/remain-readable</td></tr></table>
      </article>
    `, 'https://example.com/mixed');

    expect(result.cleanedHtml).toContain('中文与 English');
    expect(result.cleanedHtml).toContain('<blockquote>');
    expect(result.cleanedHtml).toContain('<table>');
    expect(result.cleanedMarkdown).toContain('```python');
    expect(result.cleanedMarkdown).toContain('| 名称 | Value |');
    expect(result.cleanedMarkdown).toMatch(/1\.\s+第一项/);
  });
});
