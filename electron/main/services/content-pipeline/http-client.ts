import { ContentPipelineError } from './errors';

export interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
  userAgent?: string;
  retries?: number;
}

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type TextFetcher = (url: string, options?: FetchTextOptions) => Promise<string>;

const DEFAULT_USER_AGENT = 'JuheShiyi/0.1 (+local desktop RSS reader)';

/**
 * Creates a text fetcher backed by a caller-selected network stack. Production
 * injects Electron net.fetch so Feed and article requests inherit Chromium's
 * system proxy handling; unit tests and non-Electron callers retain Node fetch.
 */
export function createTextFetcher(request: HttpFetch): TextFetcher {
  return (urlValue, options = {}) => fetchTextWith(request, urlValue, options);
}

export async function fetchText(
  urlValue: string,
  options: FetchTextOptions = {}
): Promise<string> {
  return fetchTextWith((input, init) => globalThis.fetch(input, init), urlValue, options);
}

async function fetchTextWith(
  request: HttpFetch,
  urlValue: string,
  options: FetchTextOptions
): Promise<string> {
  const url = assertHttpUrl(urlValue);
  const timeoutMs = positiveInteger(options.timeoutMs, 15_000, 'timeoutMs');
  const maxBytes = positiveInteger(options.maxBytes, 5 * 1024 * 1024, 'maxBytes');

  const response = await fetchWithRetry(
    request,
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
  request: HttpFetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  retries: number
): Promise<Response> {
  let lastError: unknown;
  const attempts = retries + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request(url.toString(), {
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
  const baseMessage = code === 'HTTP_TIMEOUT'
    ? `请求超时：${url.hostname}`
    : `请求失败：${url.hostname}`;
  const hint = networkErrorHint(lastError);
  throw new ContentPipelineError(
    code,
    hint ? `${baseMessage}（${hint}）` : baseMessage,
    lastError
  );
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
  return errorSignals(error).some((signal) =>
    /(?:^|\b)(?:TimeoutError|AbortError|ETIMEDOUT|ERR_TIMED_OUT)(?:\b|$)/i.test(signal)
  );
}

function networkErrorHint(error: unknown): string | null {
  const signals = errorSignals(error).join(' ');
  const hints: Array<[RegExp, string]> = [
    [/ERR_PROXY_CONNECTION_FAILED|ECONNREFUSED.*proxy/i, '代理服务器连接失败'],
    [/ERR_TUNNEL_CONNECTION_FAILED/i, '代理隧道连接失败'],
    [/ERR_INTERNET_DISCONNECTED|ENETDOWN|ENETUNREACH/i, '网络连接不可用'],
    [/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/i, '域名解析失败'],
    [/CERT_HAS_EXPIRED|ERR_CERT_DATE_INVALID/i, '服务器证书已过期或系统时间异常'],
    [
      /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_CERT_AUTHORITY_INVALID/i,
      '无法验证服务器证书'
    ],
    [/ECONNREFUSED|ERR_CONNECTION_REFUSED/i, '连接被拒绝'],
    [/ECONNRESET|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/i, '连接被重置'],
    [/ETIMEDOUT|ERR_TIMED_OUT|TimeoutError|AbortError/i, '连接超时'],
    [/ERR_NETWORK_CHANGED/i, '网络环境发生变化']
  ];
  return hints.find(([pattern]) => pattern.test(signals))?.[1] ?? null;
}

function errorSignals(error: unknown): string[] {
  const signals: string[] = [];
  let current: unknown = error;
  const visited = new Set<object>();

  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const candidate = current as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
    if (typeof candidate.name === 'string') signals.push(candidate.name);
    if (typeof candidate.message === 'string') signals.push(candidate.message);
    if (typeof candidate.code === 'string') signals.push(candidate.code);
    current = candidate.cause;
  }

  return signals;
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
