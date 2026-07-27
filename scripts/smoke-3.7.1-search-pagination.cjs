/**
 * Task 3.7.1 搜索解耦 + 列表分页 smoke
 *
 * 验证（mock 模式 MOCK_ARTICLES 10 篇）：
 *   1) article-list__count testid 存在 + 显示 "10"（mock total=10, articles.length=10,不显示斜杠）
 *   2) hasMore=false 时滚动哨兵不在 DOM（mock PAGE_SIZE=50 > 10）
 *   3) 切到"星标文章"虚拟分类 → count = 3（mock 3 篇 isStarred=true）
 *   4) 切回"所有订阅源" → count = 10（验证 articleOffsetRef 重置 + offset=0）
 *   5) 搜索解耦：SearchBar 输入"Rust" → 等下拉 → 点第一项 → reader 打开
 *      验证 reader 标题 === 下拉项标题（核心修复：传 Article 完整对象,不再依赖内存数组查找）
 *
 * 用法：npm run smoke:search-pagination
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-3.7.1-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.7.1] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1', // mock 模式（demo 文章 + mock AI）
    JUHE_SHIVI_SMOKE_UI_REAL: '0',
    JUHE_SHIVI_SMOKE_SEARCH_PAGINATION: '1', // Phase 3.7.1 search + pagination smoke
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
  console.error('[smoke-3.7.1] 超时（18s），强制结束');
  child.kill('SIGKILL');
}, 18000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-3.7.1] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-3.7.1] ✓ 搜索解耦 + 列表分页验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-3.7.1] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-3.7.1] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
