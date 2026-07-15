/**
 * Phase 3 Integration 端到端 smoke
 *
 * 验证项：
 *  - 顶栏 6 个页面入口按钮（设置/标签/笔记/文摘/专题/日志）
 *  - 页面切换：reader → settings/tags/notes/digests/topics/logs → reader
 *  - SettingsPage：AI Provider + 字体主题 + 视觉主题 入口齐全
 *  - 切换字体主题 + 视觉主题后 <html data-font-theme> / data-visual-theme 改变
 *  - TagsPage：列出 tag + 新建 + 删除
 *  - NotesPage：选文章 + 添加笔记
 *  - DigestsPage：列出 + 导出按钮存在
 *  - TopicsPage：显示 Phase 4 占位
 *  - LogsPage：显示 Phase 4 占位
 *  - 回到 reader：ArticleReader 工具栏有 5 个 AI 按钮（摘要/翻译/标签/笔记/专题）
 *
 * 运行：npm run smoke:integration
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-integration-'));
const opmlPath = path.join(temporaryDirectory, 'subscriptions.opml');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-integration] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  if (req.url === '/feed.xml') {
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(`<rss version="2.0"><channel><title>Integration Feed</title><link>${baseUrl}/</link>
      <item><title>Integration Article Alpha</title><link>${baseUrl}/a</link><guid>integration-1</guid><pubDate>Mon, 14 Jul 2026 06:00:00 GMT</pubDate></item>
      <item><title>Integration Article Beta</title><link>${baseUrl}/b</link><guid>integration-2</guid><pubDate>Sun, 13 Jul 2026 06:00:00 GMT</pubDate></item>
    </channel></rss>`);
    return;
  }
  if (req.url === '/a' || req.url === '/b') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body><article><h1>Body</h1><p>Integration test content with English mixed 中文测试.</p></article></body></html>');
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
      JUHE_SHIVI_SMOKE_INTEGRATION: '1',
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
    console.error('[smoke-integration] 超时 40s');
    child.kill('SIGKILL');
  }, 40_000);
  child.on('exit', (code) => {
    clearTimeout(timer);
    const passed = /SMOKE_REPORT_PASS/.test(out) && /"integration":\{"ok":true/.test(out);
    console.log(`[smoke-integration] electron 退出 code=${code}`);
    console[passed ? 'log' : 'error'](
      passed
        ? '[smoke-integration] ✓ Phase 3 Integration (6 页面 + AI 工具栏) 全部通过'
        : '[smoke-integration] ✗ Phase 3 Integration 验证失败'
    );
    server.close(() => {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      process.exit(passed ? 0 : 1);
    });
  });
});
