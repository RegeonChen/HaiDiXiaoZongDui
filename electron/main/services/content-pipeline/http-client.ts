import { ContentPipelineError } from './errors';

export interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  userAgent?: string;
  retries?: number;
}

const DEFAULT_USER_AGENT = 'JuheShiyi/0.1 (+local desktop RSS reader)';

export async function fetchText(
  urlValue: string,
  options: FetchTextOptions = {}
): Promise<string> {
  const url = assertHttpUrl(urlValue);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;

  const response = await fetchWithRetry(
    url,
    {
      redirect: 'follow',
      headers: {
        accept: options.accept ?? 'application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.1',
        'user-agent': options.userAgent ?? DEFAULT_USER_AGENT
      }
    },
    timeoutMs,
    options.retries ?? 1
  );

  if (!response.ok) {
    throw new ContentPipelineError(
      'HTTP_BAD_STATUS',
      `请求返回 HTTP ${response.status}：${url.hostname}`
    );
  }

  const finalUrl = assertHttpUrl(response.url || url.toString());
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ContentPipelineError(
      'HTTP_BODY_TOO_LARGE',
      `响应内容超过 ${maxBytes} 字节限制：${finalUrl.hostname}`
    );
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder(detectCharset(response.headers.get('content-type')));
  let byteCount = 0;
  let text = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel();
        throw new ContentPipelineError(
          'HTTP_BODY_TOO_LARGE',
          `响应内容超过 ${maxBytes} 字节限制：${finalUrl.hostname}`
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  retries: number
): Promise<Response> {
  let lastError: unknown;
  const attempts = Math.min(Math.max(Math.trunc(retries), 0), 3) + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!isRetryableStatus(response.status) || attempt === attempts - 1) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await delay(250 * (attempt + 1));
  }

  const code = lastError instanceof DOMException && lastError.name === 'TimeoutError'
    ? 'HTTP_TIMEOUT'
    : 'HTTP_REQUEST_FAILED';
  throw new ContentPipelineError(code, `请求失败：${url.hostname}`, lastError);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new ContentPipelineError('URL_INVALID', 'URL 格式无效', error);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ContentPipelineError('URL_PROTOCOL_UNSUPPORTED', '仅支持 http 和 https URL');
  }
  return url;
}

function detectCharset(contentType: string | null): string {
  const match = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  const charset = match?.[1]?.toLowerCase();
  if (!charset) return 'utf-8';

  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return 'utf-8';
  }
}
