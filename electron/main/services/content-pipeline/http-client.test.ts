import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchText } from './http-client';

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
});
