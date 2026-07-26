/**
 * Task 4.1.4 smoke — OPML 选择性导出子界面
 *
 * 验证（mock 模式 5 个 feeds）：
 *   1) 点"导出 OPML"按钮 → 跳转到 opml-export 页面
 *   2) 页面渲染：列表 + 全选 + 已选 N/N 计数
 *   3) 默认全选（N=5 → 5/5）
 *   4) 列表渲染 N 个 feed 项
 *   5) 点"取消全选" → 0/N（确认按钮 disabled）
 *   6) 点"全选" → N/N
 *   7) 取消勾选 1 项 → N-1/N
 *   8) 取消勾选 2 项 → N-2/N
 *   9) 拦截 window.api.opml.export 记录调用 → 点"确认导出" → 验证：
 *      - export 被调 1 次
 *      - 传入 feedIds 数组长度为 N-2
 *      - 回到 reader
 *
 * 用法：npm run smoke:opml-export-selection
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-4.1.4-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-4.1.4] out/main/index.js 不存在，请先跑 npm run build');
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
    JUHE_SHIVI_SMOKE_OPML_EXPORT_SELECTION: '1', // Phase 4.1.4 smoke
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
  console.error('[smoke-4.1.4] 超时（18s），强制结束');
  child.kill('SIGKILL');
}, 18000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-4.1.4] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-4.1.4] ✓ OPML 选择性导出子界面验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-4.1.4] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-4.1.4] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
