/**
 * Phase 3.5.4 smoke — 粘性底部面板 + 标签管理 + AI 建议应用
 *
 * 验证：
 *  1) FeedList 侧栏不包含"添加订阅源"内联表单（只剩顶栏 dialog 入口）
 *  2) 工具栏出现 🏷 标签 + 🪄 标签建议 + ✎ 笔记 三个按钮
 *  3) 点 🏷 标签 → StickyBottomPanel 展开，显示"已应用（0）"占位
 *  4) 点 ▾ 收起 → 面板折叠为只显示 tab bar
 *  5) 重新点 🏷 标签 → 面板重新展开（高度可拉伸）
 *  6) 拖拽手柄 → 面板高度变化
 *  7) 切到 🪄 标签建议 → 调 mock AI（mock 模式 50ms 延迟），出现 1+ 条建议
 *  8) 点"应用"按钮 → 已应用 tag 出现在 🏷 标签 tab 的"已应用"列表
 *  9) 切回 🏷 标签 → 看到刚刚应用的 tag
 * 10) 切到 ✎ 笔记 → textarea 出现，输入文字后点添加笔记 → toast
 *
 * 用法：npm run smoke:tagmanage
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-3.5.4-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.5.4] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1',
    JUHE_SHIVI_SMOKE_UI_REAL: '0',
    JUHE_SHIVI_SMOKE_TAGMANAGE: '1', // Phase 3.5.4 粘性底部面板 + 标签管理 smoke
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
  console.error('[smoke-3.5.4] 超时（20s），强制结束');
  child.kill('SIGKILL');
}, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-3.5.4] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-3.5.4] ✓ 粘性底部面板 + 标签管理 + AI 应用 验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-3.5.4] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-3.5.4] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
