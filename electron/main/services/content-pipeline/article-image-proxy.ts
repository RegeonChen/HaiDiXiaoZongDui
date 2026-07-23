import {
  ARTICLE_IMAGE_SCHEME,
  parseArticleImageUrl
} from '../../../../shared/article-image';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_CACHE_CONTROL = 'public, max-age=3600';
const IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

export type ArticleImageFetcher = (
  input: string,
  init: RequestInit & { bypassCustomProtocolHandlers?: boolean }
) => Promise<Response>;

export type ArticleImageProtocolHandler = (request: { url: string }) => Promise<Response>;

export type ArticleImageProtocolRegistrar = (
  scheme: string,
  handler: ArticleImageProtocolHandler
) => void;

/** Install one protocol handler shared by all feeds and article domains. */
export function registerArticleImageProtocol(
  register: ArticleImageProtocolRegistrar,
  fetcherOrFetchers: ArticleImageFetcher | ArticleImageFetcher[],
  userAgent: string
): void {
  const fetchers = Array.isArray(fetcherOrFetchers)
    ? fetcherOrFetchers
    : [fetcherOrFetchers];
  register(ARTICLE_IMAGE_SCHEME, async (request) => {
    const parsed = parseArticleImageUrl(request.url);
    if (!parsed) return emptyResponse(400);

    const targetOrigin = `${new URL(parsed.sourceUrl).origin}/`;
    const referrers = uniqueReferrers([
      parsed.referrerUrl,
      targetOrigin,
      null
    ]);

    for (const referrer of referrers) {
      for (const fetcher of fetchers) {
        let response: Response;
        try {
          const headers = new Headers({
            Accept: IMAGE_ACCEPT,
            'User-Agent': userAgent
          });
          if (referrer) headers.set('Referer', referrer);

          response = await fetcher(parsed.sourceUrl, {
            method: 'GET',
            headers,
            redirect: 'follow',
            cache: 'force-cache',
            signal: AbortSignal.timeout(15_000),
            bypassCustomProtocolHandlers: true
          });
        } catch {
          continue;
        }

        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          continue;
        }

        try {
          const body = await readBoundedBody(response, MAX_IMAGE_BYTES);
          const contentType = imageContentType(response.headers.get('content-type'), body);
          if (!contentType) continue;

          const headers = new Headers({
            'Content-Type': contentType,
            'Cache-Control': response.headers.get('cache-control') ?? DEFAULT_CACHE_CONTROL,
            'Content-Length': String(body.byteLength),
            'X-Content-Type-Options': 'nosniff'
          });
          const etag = response.headers.get('etag');
          const lastModified = response.headers.get('last-modified');
          if (etag) headers.set('ETag', etag);
          if (lastModified) headers.set('Last-Modified', lastModified);
          const responseBody = new Uint8Array(body).buffer;
          return new Response(responseBody, { status: 200, headers });
        } catch {
          // A bad response body should not prevent trying the next generic strategy.
        }
      }
    }

    return emptyResponse(502);
  });
}

function uniqueReferrers(values: Array<string | null>): Array<string | null> {
  const result: Array<string | null> = [];
  for (const value of values) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('IMAGE_TOO_LARGE');
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('IMAGE_TOO_LARGE');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function imageContentType(declaredValue: string | null, body: Uint8Array): string | null {
  const declared = declaredValue?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (declared.startsWith('image/')) return declared;

  if (startsWith(body, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(body, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii(body, 0, 6) === 'GIF87a' || ascii(body, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(body, 0, 4) === 'RIFF' && ascii(body, 8, 4) === 'WEBP') return 'image/webp';
  if (startsWith(body, [0x42, 0x4d])) return 'image/bmp';
  if (startsWith(body, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
  if (ascii(body, 4, 4) === 'ftyp') {
    const brand = ascii(body, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') return 'image/heic';
  }

  const prefix = new TextDecoder().decode(body.slice(0, 512)).trimStart().toLowerCase();
  if (prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg'))) {
    return 'image/svg+xml';
  }
  return null;
}

function startsWith(body: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => body[index] === value);
}

function ascii(body: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...body.slice(offset, offset + length));
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
