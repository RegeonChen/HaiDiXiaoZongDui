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
});
