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
  const timeoutMs = positiveInteger(options.timeoutMs, 15_000, 'timeoutMs');
  const maxBytes = positiveInteger(options.maxBytes, 5 * 1024 * 1024, 'maxBytes');

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
    boundedRetries(options.retries)
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
  let byteCount = 0;
  const chunks: Uint8Array[] = [];

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
      chunks.push(chunk.value);
    }
    const bytes = joinChunks(chunks, byteCount);
    return new TextDecoder(detectCharset(response.headers.get('content-type'), bytes)).decode(bytes);
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
  const attempts = retries + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!isRetryableStatus(response.status) || attempt === attempts - 1) return response;
      const retryDelay = retryDelayMs(response.headers.get('retry-after'), attempt);
      await response.body?.cancel();
      await delay(retryDelay);
      continue;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await delay(250 * (attempt + 1));
  }

  const code = isTimeoutError(lastError)
    ? 'HTTP_TIMEOUT'
    : 'HTTP_REQUEST_FAILED';
  throw new ContentPipelineError(code, `请求失败：${url.hostname}`, lastError);
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ContentPipelineError('HTTP_OPTIONS_INVALID', `${name} 必须是正数`);
  }
  return Math.trunc(value);
}

function boundedRetries(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 0), 3);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  }
  return 250 * (attempt + 1);
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

function joinChunks(chunks: Uint8Array[], byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function detectCharset(contentType: string | null, bytes: Uint8Array): string {
  const match = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  const headerCharset = normalizeCharset(match?.[1]);
  if (headerCharset && supportsCharset(headerCharset)) return headerCharset;

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

  // HTML/XML 的编码声明本身使用 ASCII，可先按 latin1 查看头部而不破坏字节。
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const declared = head.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1]
    ?? head.match(/<\?xml[^>]+encoding\s*=\s*["']([^"']+)/i)?.[1];
  const declaredCharset = normalizeCharset(declared);
  if (declaredCharset && supportsCharset(declaredCharset)) return declaredCharset;

  return 'utf-8';
}

function normalizeCharset(charset: string | undefined): string | null {
  if (!charset) return null;
  const normalized = charset.trim().toLowerCase();
  if (normalized === 'gb2312' || normalized === 'gb_2312-80') return 'gbk';
  return normalized;
}

function supportsCharset(charset: string): boolean {
  try {
    new TextDecoder(charset);
    return true;
  } catch {
    return false;
  }
}
