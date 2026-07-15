/**
 * Task 2.5.1 端到端 smoke
 *
 * 三个子任务：
 *  - a) 删除订阅源：seed feed → UI 显示 → IPC feed.delete + refresh → UI 不再显示
 *  - b) OPML 导入自动同步：seed feed + 导出 OPML → 删 feed → 重新 import → 自动 sync
 *  - c) 三栏拖拽：调 ResizeHandle mousedown + mousemove，看 grid-template-columns 变化
 *
 * 运行：npm run smoke:phase2.5
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-phase25-'));
const opmlPath = path.join(temporaryDirectory, 'subscriptions.opml');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-2.5] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  if (req.url === '/feed.xml') {
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(`<rss version="2.0"><channel><title>Phase 2.5 Feed</title><link>${baseUrl}/</link>
      <item><title>Test Article</title><link>${baseUrl}/a</link><guid>phase25-1</guid><pubDate>Tue, 14 Jul 2026 06:00:00 GMT</pubDate></item>
    </channel></rss>`);
    return;
  }
  if (req.url === '/a') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body><article>
      <p>Body，包含中文与 English mixed text。</p>
      <pre><code class="language-typescript">const veryLongValue = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";</code></pre>
      <table><thead><tr><th>名称</th><th>Value</th></tr></thead><tbody><tr><td>长链接</td><td>https://example.com/a/very/long/path/for/narrow/reader/verification</td></tr></tbody></table>
    </article></body></html>`);
    return;
  }
  res.writeHead(404).end();
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      JUHE_SHIVI_SMOKE: '1',
      JUHE_SHIVI_SMOKE_UI: '1',
      JUHE_SHIVI_SMOKE_UI_REAL: '1',
      JUHE_SHIVI_SMOKE_FEED_URL: `http://127.0.0.1:${port}/feed.xml`,
      JUHE_SHIVI_SMOKE_OPML_PATH: opmlPath,
      JUHE_SHIVI_USER_DATA: temporaryDirectory
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c.toString(); process.stdout.write(c); });
  child.stderr.on('data', (c) => process.stderr.write(c));
  const timer = setTimeout(() => {
    console.error('[smoke-2.5] 超时 35s');
    child.kill('SIGKILL');
  }, 35_000);
  child.on('exit', (code) => {
    clearTimeout(timer);
    const passed = /SMOKE_REPORT_PASS/.test(out) && /"uiIpc":\{"ok":true/.test(out);
    console.log(`[smoke-2.5] electron 退出 code=${code}`);
    console[passed ? 'log' : 'error'](
      passed
        ? '[smoke-2.5] ✓ Phase 2.5 (删除 + OPML 自动同步 + 拖拽) 全部通过'
        : '[smoke-2.5] ✗ Phase 2.5 验证失败'
    );
    server.close(() => {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      process.exit(passed ? 0 : 1);
    });
  });
});
