/**
 * Task 2.4 — UI 端到端 IPC smoke
 *
 * 与 smoke-phase2 的区别：
 *  - smoke-phase2: 验证后端数据流（解析 → 存库）
 *  - smoke-2.4:    验证 UI 组件在 IPC 模式下能拿到真实数据并展示
 *
 * 流程：
 *  1) 起本地 HTTP fixture 模拟 Feed/article
 *  2) 隔离 userData 启动 Electron（不走 ?mock=1，走默认 IPC）
 *  3) 探针：通过 window.api 创建一个 feed 并 sync
 *  4) 等待 React 重渲染
 *  5) 验证 .article-list__item 数量 >= 1（UI 真从 IPC 拿数据并渲染）
 *  6) 点击第一篇
 *  7) 验证 .article-reader__title 与点击项标题一致（ArticleReader 也走 IPC getCleanedHtml）
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-ui-ipc-'));
const opmlPath = path.join(temporaryDirectory, 'subscriptions.opml');

console.log(`[smoke-ui-ipc] START temporaryDirectory = ${temporaryDirectory}`);
console.log(`[smoke-ui-ipc] opmlPath = ${opmlPath}`);

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-ui-ipc] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const server = http.createServer((request, response) => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  if (request.url === '/feed.xml') {
    response.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' });
    response.end(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>UI IPC Smoke Feed</title>
          <link>${baseUrl}/</link>
          <description>UI end-to-end fixture</description>
          <item>
            <title>UI Smoke Article Alpha</title>
            <link>${baseUrl}/article</link>
            <guid isPermaLink="false">ui-ipc-alpha</guid>
            <pubDate>Tue, 14 Jul 2026 06:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>Alpha fallback</p>]]></content:encoded>
          </item>
          <item>
            <title>UI Smoke Article Beta</title>
            <link>${baseUrl}/article</link>
            <guid isPermaLink="false">ui-ipc-beta</guid>
            <pubDate>Tue, 14 Jul 2026 05:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>Beta fallback</p>]]></content:encoded>
          </item>
        </channel>
      </rss>`);
    return;
  }

  if (request.url === '/article') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
      <html><head><title>UI Smoke Article</title></head><body>
        <nav>Noise</nav>
        <article>
          <h1>UI Smoke Article</h1>
          <p>Cleaned body from HTTP fixture，包含中文与 English mixed text。</p>
          <pre><code class="language-typescript">const veryLongValue = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";</code></pre>
          <table><thead><tr><th>名称</th><th>Value</th></tr></thead><tbody><tr><td>长链接</td><td>https://example.com/a/very/long/path/for/narrow/reader/verification</td></tr></tbody></table>
        </article>
      </body></html>`);
    return;
  }

  response.writeHead(404).end('not found');
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    finish(false, '[smoke-ui-ipc] 无法取得本地测试服务器端口');
    return;
  }

  const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      JUHE_SHIVI_SMOKE: '1',
      JUHE_SHIVI_SMOKE_UI: '1',
      JUHE_SHIVI_SMOKE_UI_REAL: '1',
      JUHE_SHIVI_SMOKE_FEED_URL: `http://127.0.0.1:${address.port}/feed.xml`,
      JUHE_SHIVI_SMOKE_OPML_PATH: opmlPath,
      JUHE_SHIVI_USER_DATA: temporaryDirectory
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const timer = setTimeout(() => {
    console.error('[smoke-ui-ipc] 超过 30 秒，强制结束');
    child.kill('SIGKILL');
  }, 30_000);

  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    console.log(`[smoke-ui-ipc] electron 退出 code=${code} signal=${signal}`);

    const opmlExported = fs.existsSync(opmlPath);
    const passed = stdout.includes('SMOKE_REPORT_PASS') && /"uiListHasData":true/.test(stdout) &&
      /"uiClickWorks":true/.test(stdout) && /"uiContentLoaded":true/.test(stdout) &&
      /"uiHasAddBtn":true/.test(stdout) && /"uiAddDialogOpens":true/.test(stdout) &&
      /"uiHasOpmlButtons":true/.test(stdout) && /"uiOpmlExportWorks":true/.test(stdout) &&
      opmlExported;
    console.log(`[smoke-ui-ipc] OPML 导出文件=${opmlExported}`);
    finish(passed, passed
      ? '[smoke-ui-ipc] ✓ UI 端到端 IPC + P1/P2 验证全部通过'
      : '[smoke-ui-ipc] ✗ UI 端到端 IPC + P1/P2 验证失败');
  });
});

function finish(passed, message) {
  console[passed ? 'log' : 'error'](message);
  server.close(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    process.exit(passed ? 0 : 1);
  });
}
