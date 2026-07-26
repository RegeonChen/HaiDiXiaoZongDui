/**
 * Offline Phase 2 integration smoke.
 *
 * Starts a local Feed/article HTTP server and verifies the full Electron path:
 * feed create -> staged single sync -> SQLite -> lazy cleaning -> state changes
 * -> selective OPML export/import.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-phase2-'));
const opmlPath = path.join(temporaryDirectory, 'subscriptions.opml');
const requests = { feed: 0, article: 0 };

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-phase2] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const server = http.createServer((request, response) => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  if (request.url === '/feed.xml') {
    requests.feed += 1;
    response.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
    response.end(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Phase 2 Integration Feed</title>
          <link>${baseUrl}/</link>
          <description>Offline integration fixture</description>
          <item>
            <title>Integration Article</title>
            <link>${baseUrl}/article</link>
            <guid isPermaLink="false">phase2-article-1</guid>
            <pubDate>Tue, 14 Jul 2026 06:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>Feed fallback content</p>]]></content:encoded>
          </item>
        </channel>
      </rss>`);
    return;
  }

  if (request.url === '/article') {
    requests.article += 1;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
      <html><head><title>Integration Article</title></head><body>
        <nav>Navigation noise</nav>
        <article>
          <h1>Integration Article</h1>
          <p>Integration body with <a href="/source">a retained link</a>.</p>
          <pre><code class="language-js">const integrated = true;</code></pre>
          <script>window.bad = true;</script>
        </article>
      </body></html>`);
    return;
  }

  response.writeHead(404).end('not found');
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    finish(false, '[smoke-phase2] 无法取得本地测试服务器端口');
    return;
  }

  const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      JUHE_SHIVI_SMOKE: '1',
      JUHE_SHIVI_SMOKE_PHASE2: '1',
      JUHE_SHIVI_SMOKE_FEED_URL: `http://127.0.0.1:${address.port}/feed.xml`,
      JUHE_SHIVI_SMOKE_OPML_PATH: opmlPath,
      JUHE_SHIVI_USER_DATA: temporaryDirectory
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const timer = setTimeout(() => {
    console.error('[smoke-phase2] 超过 15 秒，强制结束');
    child.kill('SIGKILL');
  }, 15_000);

  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    console.log(`[smoke-phase2] electron 退出 code=${code} signal=${signal}`);

    const databaseExists = fs.existsSync(path.join(temporaryDirectory, 'juhe-shivi.db'));
    const opmlExists = fs.existsSync(opmlPath);
    const lazyFetchCached = requests.article === 1;
    const syncedTwice = requests.feed === 2;
    console.log(`[smoke-phase2] 数据库=${databaseExists} OPML=${opmlExists} Feed请求=${requests.feed} 正文请求=${requests.article}`);

    const passed = stdout.includes('SMOKE_REPORT_PASS') && databaseExists && opmlExists &&
      lazyFetchCached && syncedTwice;
    finish(passed, passed
      ? '[smoke-phase2] ✓ 单源同步阶段、稳定错误与选择性 OPML 离线端到端验证全部通过'
      : '[smoke-phase2] ✗ Phase 2 离线端到端验证失败');
  });
});

function finish(passed, message) {
  console[passed ? 'log' : 'error'](message);
  server.close(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    process.exit(passed ? 0 : 1);
  });
}
