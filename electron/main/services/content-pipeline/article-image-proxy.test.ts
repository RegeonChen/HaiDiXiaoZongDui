import { describe, expect, it, vi } from 'vitest';
import {
  ARTICLE_IMAGE_SCHEME,
  buildArticleImageUrl,
  parseArticleImageUrl
} from '../../../../shared/article-image';
import {
  registerArticleImageProtocol,
  type ArticleImageProtocolHandler
} from './article-image-proxy';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('article image URL', () => {
  it('round-trips public image and article URLs without credentials or fragments', () => {
    const proxied = buildArticleImageUrl(
      'https://cdn.example.com/image.png?size=large#ignored',
      'https://news.example.com/posts/1#section'
    );

    expect(proxied).toMatch(/^juhe-image:\/\/cdn\.example\.com\/image\?/);
    expect(parseArticleImageUrl(proxied!)).toEqual({
      sourceUrl: 'https://cdn.example.com/image.png?size=large',
      referrerUrl: 'https://news.example.com/posts/1'
    });
  });

  it('rejects non-public schemes, credentials and tampered proxy hosts', () => {
    expect(buildArticleImageUrl('data:image/png;base64,AA==', 'https://news.example')).toBeNull();
    expect(buildArticleImageUrl('https://user:secret@cdn.example/a.png', 'https://news.example'))
      .toBeNull();

    const tampered = new URL(
      buildArticleImageUrl('https://cdn.example/a.png', 'https://news.example')!
    );
    tampered.hostname = 'attacker.example';
    expect(parseArticleImageUrl(tampered.toString())).toBeNull();
  });
});

describe('article image protocol', () => {
  it('retries generic referrer strategies and returns a verified image response', async () => {
    let handler: ArticleImageProtocolHandler | null = null;
    const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
      const referrer = new Headers(init.headers).get('referer');
      if (referrer === 'https://news.example/posts/1') {
        return new Response('forbidden', { status: 403 });
      }
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    });

    registerArticleImageProtocol(
      (scheme, registered) => {
        expect(scheme).toBe(ARTICLE_IMAGE_SCHEME);
        handler = registered;
      },
      fetcher,
      'Article image test agent'
    );

    const url = buildArticleImageUrl(
      'https://cdn.example/image.png',
      'https://news.example/posts/1'
    )!;
    const response = await handler!({ url });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('referer'))
      .toBe('https://news.example/posts/1');
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('referer'))
      .toBe('https://cdn.example/');
  });

  it('does not turn an HTML error page into an image', async () => {
    let handler: ArticleImageProtocolHandler | null = null;
    const fetcher = vi.fn(async () => new Response('<html>blocked</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
    registerArticleImageProtocol(
      (_scheme, registered) => { handler = registered; },
      fetcher,
      'Article image test agent'
    );

    const url = buildArticleImageUrl(
      'https://cdn.example/image.png',
      'https://news.example/posts/1'
    )!;
    const response = await handler!({ url });

    expect(response.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed custom-protocol requests before fetching', async () => {
    let handler: ArticleImageProtocolHandler | null = null;
    const fetcher = vi.fn();
    registerArticleImageProtocol(
      (_scheme, registered) => { handler = registered; },
      fetcher,
      'Article image test agent'
    );

    const response = await handler!({ url: 'juhe-image://cdn.example/not-image?url=https://cdn.example/a.png' });
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
