/**
 * Task 4.1.1 smoke — 订阅源操作按钮 + 标签渲染 + TagsPage 双栏
 *
 * 验证（mock 模式 MOCK_ARTICLES 10 篇 + 5 个 feeds）：
 *   1) 切到具体 feed → 中栏顶部 action bar 出现"同步" + "全部已读"两个按钮
 *   2) 切到 all → action bar 显示全局“同步 / 全部已读”
 *   3) 点击同步 → 真实完成 + fetching/parsing/saving 阶段反馈
 *   4) 点击全部已读 → 精确确认数 + mock 数据全部变为已读
 *   5) 同步期间切换订阅源 → 旧请求不能覆盖新选择
 *   6) 失败同步 → 侧栏刷新红点与错误信息
 *   7) 点击文章 → reader 显示
 *   8) 在阅读器创建并应用含 |、] 的标签 → 标题 chip 显示
 *   9) 切到 tags 页面 → 真实关联文章 + 精确 1/1 计数
 *  10) 删除标签 → 左栏移除 + 右栏清空
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
  console.error('[smoke-4.1.1] 超时（30s），强制结束');
  child.kill('SIGKILL');
}, 30000);

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
