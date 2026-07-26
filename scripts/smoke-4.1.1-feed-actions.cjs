/**
 * Task 4.1.1 smoke — 订阅源操作按钮 + 标签渲染 + TagsPage 双栏
 *
 * 验证（mock 模式 MOCK_ARTICLES 10 篇 + 5 个 feeds）：
 *   1) 切到具体 feed → 中栏顶部 action bar 出现"同步" + "全部已读"两个按钮
 *   2) 切到 all → action bar 不出现（避免误操作）
 *   3) 点击文章 → reader 显示 + title chip 渲染逻辑
 *   4) tagAddToArticle → article.title 同步嵌入 tag prefix
 *   5) 切到 tags 页面 → 双栏布局 → 左栏标签列表 + 右栏文章列表
 *   6) 选中标签 → 右栏 article 列表显示
 *   7) 删除标签 → 左栏移除 + 右栏清空
 *
 * 用法：npm run smoke:feed-actions
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-4.1.1-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-4.1.1] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1', // mock 模式
    JUHE_SHIVI_SMOKE_UI_REAL: '0',
    JUHE_SHIVI_SMOKE_FEED_ACTIONS: '1', // Phase 4.1.1 smoke
    JUHE_SHIVI_USER_DATA: temporaryDirectory
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
let finished = false;
child.stdout.on('data', (b) => { stdout += b.toString(); process.stdout.write(b); });
child.stderr.on('data', (b) => { stderr += b.toString(); process.stderr.write(b); });

const timer = setTimeout(() => {
  console.error('[smoke-4.1.1] 超时（18s），强制结束');
  child.kill('SIGKILL');
}, 18000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-4.1.1] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-4.1.1] ✓ 订阅源操作按钮 + 标签渲染 + TagsPage 双栏验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-4.1.1] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-4.1.1] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
