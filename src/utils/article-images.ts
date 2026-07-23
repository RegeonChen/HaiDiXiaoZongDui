import { buildArticleImageUrl } from '@shared/article-image';

/**
 * Route every public image in already-sanitized Cleaned HTML through the
 * application image protocol. Stored HTML remains unchanged.
 */
export function prepareArticleHtmlForDisplay(
  cleanedHtml: string,
  articleUrl: string
): string {
  if (!cleanedHtml.trim()) return cleanedHtml;

  const template = document.createElement('template');
  template.innerHTML = cleanedHtml;

  for (const image of Array.from(template.content.querySelectorAll('img[src]'))) {
    const source = image.getAttribute('src')?.trim() ?? '';
    const proxied = buildArticleImageUrl(source, articleUrl);
    if (!proxied) continue;

    image.setAttribute('src', proxied);
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
  }

  return template.innerHTML;
}
