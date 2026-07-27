import { describe, expect, it } from 'vitest';
import { cleanArticleContent, splitCleanedHtmlIntoBlocks } from './content-cleaner';

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

  it('preserves ordered-list numbering and safe task-list states', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <ol start="3">
          <li>Third item</li>
          <li>Fourth item<ul><li>Nested bullet</li></ul></li>
        </ol>
        <ol reversed type="A">
          <li value="7">Special numbering</li>
        </ol>
        <ul>
          <li><input type="checkbox" checked onclick="alert(1)">Finished task</li>
          <li><input type="checkbox">Pending task</li>
          <li><input type="text" value="must disappear">Ordinary item</li>
        </ul>
      </article>
    `, 'https://example.com/lists');

    expect(result.cleanedHtml).toContain('<ol start="3">');
    expect(result.cleanedHtml).toMatch(/<ol reversed(?:="")? type="A">/);
    expect(result.cleanedHtml).toContain('<li value="7">');
    expect(result.cleanedHtml).toContain('[x] Finished task');
    expect(result.cleanedHtml).toContain('[ ] Pending task');
    expect(result.cleanedHtml).not.toContain('type="text"');
    expect(result.cleanedHtml).not.toContain('onclick');
    expect(result.cleanedMarkdown).toMatch(/3\.\s+Third item/);
    expect(result.cleanedMarkdown).toMatch(/4\.\s+Fourth item/);
    expect(result.cleanedMarkdown).toMatch(/-\s+\[x\]\s+Finished task/i);
    expect(result.cleanedMarkdown).toMatch(/-\s+\[ \]\s+Pending task/);
    expect(result.cleanedMarkdown).toMatch(/<ol reversed(?:="")? type="A">/);
    expect(result.cleanedMarkdown).toContain('<li value="7">Special numbering</li>');
  });

  it('keeps complex table semantics without generating malformed GFM rows', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <table aria-label="Quarterly totals">
          <caption>Quarterly totals</caption>
          <thead>
            <tr><th scope="col">Region</th><th scope="col">Q1</th><th scope="col">Q2</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row" rowspan="2">East</th><td colspan="2">20</td></tr>
            <tr><td>9</td><td>11</td></tr>
          </tbody>
          <tfoot><tr><th>Total</th><td>9</td><td>11</td></tr></tfoot>
        </table>
      </article>
    `, 'https://example.com/complex-table');

    expect(result.cleanedHtml).toContain('<caption>Quarterly totals</caption>');
    expect(result.cleanedHtml).toContain('<tfoot>');
    expect(result.cleanedHtml).toContain('scope="col"');
    expect(result.cleanedHtml).toContain('rowspan="2"');
    expect(result.cleanedHtml).toContain('colspan="2"');
    expect(result.cleanedMarkdown).toContain('Quarterly totals\n\n<table');
    expect(result.cleanedMarkdown).toContain('<table aria-label="Quarterly totals">');
    expect(result.cleanedMarkdown).not.toContain('<caption>');
    expect(result.cleanedMarkdown).toContain('rowspan="2"');
    expect(result.cleanedMarkdown).not.toContain('| East | 20 |');

    const blocks = splitCleanedHtmlIntoBlocks(result.cleanedHtml);
    expect(blocks.map((block) => block.tag)).toEqual(['P', 'P', 'TABLE']);
    expect(blocks[1].html).toBe('<p>Quarterly totals</p>');
    expect(blocks[2].html).not.toContain('<caption>');
  });

  it('uses a longer Markdown fence when source code contains backtick fences', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <pre><code class="language-markdown">Before
\`\`\`js
console.log("nested");
\`\`\`
After</code></pre>
      </article>
    `, 'https://example.com/code-fence');

    expect(result.cleanedHtml).toContain('<code class="language-markdown">');
    expect(result.cleanedMarkdown).toContain('````markdown');
    expect(result.cleanedMarkdown).toContain('```js');
    expect(result.cleanedMarkdown).toContain('\n````');
  });

  it('turns long prose stored in a pre element into paragraphs and headings', () => {
    const opening = 'This publishing system stores an ordinary essay inside a pre element. '
      .repeat(12);
    const ending = 'Readers should see normal paragraphs, and translation should receive separate blocks. '
      .repeat(10);
    const result = cleanArticleContent(`
      <article>
        <h1>Pre-wrapped essay</h1>
        <pre>${opening}

## A prose heading

${ending} Read the <a href="/source">original source</a>.</pre>
      </article>
    `, 'https://example.com/pre-wrapped-essay');

    expect(result.cleanedHtml).not.toContain('<pre>');
    expect(result.cleanedHtml).toContain('<h2>A prose heading</h2>');
    expect(result.cleanedHtml).toContain('<p>This publishing system');
    expect(result.cleanedHtml).toContain('href="https://example.com/source"');
    expect(result.cleanedMarkdown).not.toContain('```text');
    expect(splitCleanedHtmlIntoBlocks(result.cleanedHtml).map((block) => block.tag))
      .toEqual(['P', 'H2', 'P']);
  });

  it('keeps long preformatted source code as code when it lacks a code child', () => {
    const sourceLines = Array.from(
      { length: 30 },
      (_, index) => `const value${index} = computeValue(${index});`
    ).join('\n');
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <pre>${sourceLines}</pre>
      </article>
    `, 'https://example.com/plain-pre-code');

    expect(result.cleanedHtml).toContain('<pre>');
    expect(result.cleanedMarkdown).toContain('```text');
    expect(result.cleanedMarkdown).toContain('const value29');
  });

  it('removes generated table-of-contents blocks before Readability extraction', () => {
    const result = cleanArticleContent(`
      <article>
        <blockquote><p>现代化、可以灵活定制的自然叫牌法。</p></blockquote>
        <div class="ox-hugo-toc toc">
          <div class="heading">Table of Contents</div>
          <ul>
            <li><a href="#basics">基本概念</a></li>
            <li><a href="#principles">基本原则</a></li>
          </ul>
        </div>
        <h2 id="basics">基本概念</h2>
        <p>这是文章真正的正文内容，包含足够长的中文说明，用于确保正文提取器能够稳定识别主要内容而不是目录导航。</p>
        <h2 id="principles">基本原则</h2>
        <p>这里继续解释文章的基本原则；章节标题与正文必须保留，但前面的重复目录链接应当被清除。</p>
      </article>
    `, 'https://soulhacker.me/posts/bridge-17/');

    expect(result.cleanedHtml).not.toContain('Table of Contents');
    expect(result.cleanedHtml).not.toContain('href="#basics"');
    expect(result.cleanedHtml).toContain('<h2>基本概念</h2>');
    expect(result.cleanedHtml).toContain('文章真正的正文内容');
  });

  it('normalizes lazy image attributes without keeping placeholders', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <img src="/images/placeholder.png" data-src="/images/real-photo.jpg" alt="photo">
      </article>
    `, 'https://news.example.com/posts/1');

    expect(result.cleanedHtml).toContain('https://news.example.com/images/real-photo.jpg');
    expect(result.cleanedHtml).not.toContain('placeholder.png');
  });

  it('selects a responsive picture source when the fallback image has no src', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <picture>
          <source srcset="/images/small.webp 1x, /images/large.webp 2x">
          <img alt="responsive">
        </picture>
      </article>
    `, 'https://news.example.com/posts/1');

    expect(result.cleanedHtml).toContain('https://news.example.com/images/large.webp');
    expect(result.cleanedHtml).not.toContain('small.webp');
  });

  it('keeps every figure image and its caption', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <figure>
          <img src="/images/one.png" alt="one">
          <img src="/images/two.png" alt="two">
          <figcaption>Both screenshots belong to this explanation.</figcaption>
        </figure>
      </article>
    `, 'https://news.example.com/posts/1');

    expect(result.cleanedHtml).toContain('https://news.example.com/images/one.png');
    expect(result.cleanedHtml).toContain('https://news.example.com/images/two.png');
    expect(result.cleanedHtml).toContain('Both screenshots belong to this explanation.');
  });

  it('does not duplicate a lazy image that already has a noscript fallback', () => {
    const result = cleanArticleContent(`
      <article>
        <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
        <img src="" data-src="/images/photo.png" alt="photo">
        <noscript><img src="/images/photo.png" alt="photo fallback"></noscript>
      </article>
    `, 'https://news.example.com/posts/1');

    expect(result.cleanedHtml.match(/images\/photo\.png/g)).toHaveLength(1);
  });

  it('does not promote decorative page chrome into article content', () => {
    const result = cleanArticleContent(`
      <header><img src="/images/avatar.png" alt="avatar"></header>
      <article>
        <div class="article-content">
          <p>${'A sufficiently long article paragraph. '.repeat(12)}</p>
          <img src="/images/body.png" alt="body">
        </div>
      </article>
    `, 'https://news.example.com/posts/1');

    expect(result.cleanedHtml).toContain('https://news.example.com/images/body.png');
    expect(result.cleanedHtml).not.toContain('avatar.png');
  });
});

describe('splitCleanedHtmlIntoBlocks', () => {
  it('splits five paragraphs, two headings, and one code block into eight blocks', () => {
    const blocks = splitCleanedHtmlIntoBlocks(`
      <h1>Article title</h1>
      <p>Paragraph one.</p>
      <p>Paragraph two with <strong>formatting</strong>.</p>
      <h2>Second section</h2>
      <p>Paragraph three.</p>
      <pre><code class="language-typescript">const answer = 42;\nconsole.log(answer);</code></pre>
      <p>Paragraph four.</p>
      <p>Paragraph five.</p>
    `);

    expect(blocks).toHaveLength(8);
    expect(blocks.map((block) => block.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(blocks.map((block) => block.tag)).toEqual([
      'H1', 'P', 'P', 'H2', 'P', 'PRE', 'P', 'P'
    ]);
    expect(blocks[2].html).toContain('<strong>formatting</strong>');
    expect(blocks[5].html).toContain('console.log(answer);');
  });

  it('keeps lists, block quotes, and tables intact as atomic blocks', () => {
    const blocks = splitCleanedHtmlIntoBlocks(`
      <ul><li>First item</li><li>Second item</li></ul>
      <blockquote><p>A quoted paragraph.</p><p>Another quoted paragraph.</p></blockquote>
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>A</td><td>1</td></tr></tbody>
      </table>
    `);

    expect(blocks.map((block) => block.tag)).toEqual(['UL', 'BLOCKQUOTE', 'TABLE']);
    expect(blocks[0].html.match(/<li>/g)).toHaveLength(2);
    expect(blocks[1].html.match(/<p>/g)).toHaveLength(2);
    expect(blocks[2].html).toContain('<tbody><tr><td>A</td><td>1</td></tr></tbody>');
  });

  it('keeps description lists intact as atomic blocks', () => {
    const blocks = splitCleanedHtmlIntoBlocks(
      '<dl><dt>Term</dt><dd>Definition</dd></dl>'
    );

    expect(blocks).toEqual([{
      index: 0,
      tag: 'DL',
      html: '<dl><dt>Term</dt><dd>Definition</dd></dl>'
    }]);
  });

  it('unwraps layout containers and preserves top-level inline markup', () => {
    const blocks = splitCleanedHtmlIntoBlocks(`
      <article>
        Intro <strong>bold text</strong><br>continued.
        <h2>Heading</h2>
        <span>Trailing <em>inline text</em>.</span>
      </article>
    `);

    expect(blocks.map((block) => block.tag)).toEqual(['P', 'H2', 'P']);
    expect(blocks[0].html).toContain('Intro <strong>bold text</strong><br>continued.');
    expect(blocks[2].html).toContain('<span>Trailing <em>inline text</em>.</span>');
  });

  it('returns no blocks for empty input', () => {
    expect(splitCleanedHtmlIntoBlocks('  \n  ')).toEqual([]);
  });
});
