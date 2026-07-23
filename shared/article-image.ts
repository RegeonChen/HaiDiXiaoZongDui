/**
 * Cleaned article images are loaded through one application-owned protocol.
 *
 * The persisted Cleaned HTML keeps the original public URL. Renderer rewrites
 * it only for display, so Markdown export and stored source attribution remain
 * portable outside Electron.
 */
export const ARTICLE_IMAGE_SCHEME = 'juhe-image';
export const ARTICLE_IMAGE_PATH = '/image';

export interface ArticleImageRequest {
  sourceUrl: string;
  referrerUrl: string | null;
}

/**
 * Build a cross-origin custom-protocol URL for one public article image.
 * Non-HTTP(S) sources intentionally stay outside the proxy.
 */
export function buildArticleImageUrl(
  sourceValue: string,
  articleValue: string
): string | null {
  const source = normalizePublicUrl(sourceValue);
  if (!source) return null;

  const referrer = normalizePublicUrl(articleValue);
  const proxy = new URL(`${ARTICLE_IMAGE_SCHEME}://${source.hostname}${ARTICLE_IMAGE_PATH}`);
  proxy.searchParams.set('url', source.toString());
  if (referrer) proxy.searchParams.set('referrer', referrer.toString());
  return proxy.toString();
}

/** Parse and validate an incoming custom-protocol request in the Main process. */
export function parseArticleImageUrl(value: string): ArticleImageRequest | null {
  let proxy: URL;
  try {
    proxy = new URL(value);
  } catch {
    return null;
  }

  if (
    proxy.protocol !== `${ARTICLE_IMAGE_SCHEME}:` ||
    proxy.pathname !== ARTICLE_IMAGE_PATH ||
    proxy.username ||
    proxy.password
  ) {
    return null;
  }

  const source = normalizePublicUrl(proxy.searchParams.get('url') ?? '');
  if (!source || proxy.hostname !== source.hostname) return null;

  const referrerValue = proxy.searchParams.get('referrer');
  const referrer = referrerValue ? normalizePublicUrl(referrerValue) : null;
  return {
    sourceUrl: source.toString(),
    referrerUrl: referrer?.toString() ?? null
  };
}

function normalizePublicUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}
