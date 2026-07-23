import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArticleImageUrl } from '@shared/article-image';
import { prepareArticleHtmlForDisplay } from './article-images';

describe('prepareArticleHtmlForDisplay', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new JSDOM('<!doctype html>').window.document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes every HTTP(S) image through the application protocol', () => {
    const displayed = prepareArticleHtmlForDisplay(`
      <p><img src="https://cdn-a.example/a.png" alt="A"></p>
      <p><img src="http://cdn-b.example/b.jpg" alt="B"></p>
    `, 'https://news.example/posts/1');
    const fragment = JSDOM.fragment(displayed);
    const images = Array.from(fragment.querySelectorAll('img'));

    expect(images).toHaveLength(2);
    expect(images.every((image) => image.getAttribute('src')?.startsWith('juhe-image:')))
      .toBe(true);
    expect(images.map((image) => parseArticleImageUrl(image.getAttribute('src')!)))
      .toEqual([
        {
          sourceUrl: 'https://cdn-a.example/a.png',
          referrerUrl: 'https://news.example/posts/1'
        },
        {
          sourceUrl: 'http://cdn-b.example/b.jpg',
          referrerUrl: 'https://news.example/posts/1'
        }
      ]);
    expect(images.every((image) =>
      image.getAttribute('loading') === 'lazy' && image.getAttribute('decoding') === 'async'
    )).toBe(true);
  });

  it('leaves data images and non-image markup unchanged', () => {
    const displayed = prepareArticleHtmlForDisplay(
      '<p>Hello <strong>world</strong><img src="data:image/png;base64,AA=="></p>',
      'https://news.example/posts/1'
    );

    expect(displayed).toContain('<strong>world</strong>');
    expect(displayed).toContain('src="data:image/png;base64,AA=="');
    expect(displayed).not.toContain('juhe-image:');
  });
});
