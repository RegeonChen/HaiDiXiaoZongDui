import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextFetcher, fetchText } from './http-client';

const openServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('fetchText', () => {
  it('downloads UTF-8 text and rejects HTTP errors', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/ok') {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('中文内容');
      } else {
        response.writeHead(503);
        response.end('unavailable');
      }
    });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await expect(fetchText(`${baseUrl}/ok`)).resolves.toBe('中文内容');
    await expect(fetchText(`${baseUrl}/error`)).rejects.toMatchObject({
      code: 'HTTP_BAD_STATUS'
    });
  });

  it('enforces the response size limit', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('0123456789');
    });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    await expect(fetchText(`http://127.0.0.1:${address.port}`, { maxBytes: 5 }))
      .rejects.toMatchObject({ code: 'HTTP_BODY_TOO_LARGE' });
  });

  it('detects legacy Chinese encoding from an HTML meta declaration', async () => {
    const server = createServer((_request, response) => {
      const prefix = Buffer.from('<meta charset="gb2312"><p>', 'ascii');
      const chinese = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); // “中文”的 GBK 字节
      const suffix = Buffer.from('</p>', 'ascii');
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(Buffer.concat([prefix, chinese, suffix]));
    });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    await expect(fetchText(`http://127.0.0.1:${address.port}`))
      .resolves.toContain('<p>中文</p>');
  });

  it('retries transient responses and honors Retry-After', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(503, { 'retry-after': '0' });
        response.end('retry');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('recovered');
    });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    await expect(fetchText(`http://127.0.0.1:${address.port}`, { retries: 1 }))
      .resolves.toBe('recovered');
    expect(requests).toBe(2);
  });

  it('rejects invalid resource limits before issuing a request', async () => {
    await expect(fetchText('https://example.com', { timeoutMs: 0 }))
      .rejects.toMatchObject({ code: 'HTTP_OPTIONS_INVALID' });
    await expect(fetchText('https://example.com', { maxBytes: -1 }))
      .rejects.toMatchObject({ code: 'HTTP_OPTIONS_INVALID' });
  });

  it('uses an injected network stack for Chromium-compatible production requests', async () => {
    const request = vi.fn(async () => new Response('proxy-aware', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    }));
    const textFetcher = createTextFetcher(request);

    await expect(textFetcher('https://example.com/feed', { retries: 0 }))
      .resolves.toBe('proxy-aware');
    expect(request).toHaveBeenCalledWith(
      'https://example.com/feed',
      expect.objectContaining({
        redirect: 'follow',
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('turns safe nested transport codes into actionable diagnostics', async () => {
    const dnsError = Object.assign(new Error('lookup failed for a private hostname'), {
      code: 'ENOTFOUND'
    });
    const request = vi.fn(async (): Promise<Response> => {
      throw new TypeError('fetch failed', { cause: dnsError });
    });
    const textFetcher = createTextFetcher(request);

    await expect(textFetcher('https://example.com/feed', { retries: 0 }))
      .rejects.toMatchObject({
        code: 'HTTP_REQUEST_FAILED',
        message: '请求失败：example.com（域名解析失败）'
      });
  });

  it('keeps timeouts distinct from other connection failures', async () => {
    const request = vi.fn(async (): Promise<Response> => {
      throw Object.assign(new Error('net::ERR_TIMED_OUT'), { code: 'ERR_TIMED_OUT' });
    });
    const textFetcher = createTextFetcher(request);

    await expect(textFetcher('https://example.com/feed', { retries: 0 }))
      .rejects.toMatchObject({
        code: 'HTTP_TIMEOUT',
        message: '请求超时：example.com（连接超时）'
      });
  });
});
