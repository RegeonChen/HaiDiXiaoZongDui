/**
 * Task 3.5.1 端到端 smoke — 摘要悬浮窗
 *
 * 验证项：
 *  - 点 ✨ 摘要按钮 → SummaryFloatingPanel 立即渲染
 *  - 悬浮窗可拖拽（标题栏 mousedown + mousemove + mouseup）
 *  - 悬浮窗可调大小（8 个 resize handle）
 *  - 边界检测：拖出 viewport 自动 clamp 到视口内
 *  - 关闭按钮 + Esc 都能关闭
 *  - 位置/大小持久化到 localStorage
 *
 * 运行：npm run smoke:summary
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-3.5.1-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.5.1] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1',          // 启用 useMock（MockDataSource 有 demo 文章）
    JUHE_SHIVI_SMOKE_UI_REAL: '0',     // 不需要 IPC seed，mock 模式直接有数据
    JUHE_SHIVI_SMOKE_SUMMARY: '1',
    JUHE_SHIVI_USER_DATA: temporaryDirectory
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let out = '';
child.stdout.on('data', (c) => { out += c.toString(); process.stdout.write(c); });
child.stderr.on('data', (c) => process.stderr.write(c));
const timer = setTimeout(() => {
  console.error('[smoke-3.5.1] 超时 40s');
  child.kill('SIGKILL');
}, 40_000);
child.on('exit', (code) => {
  clearTimeout(timer);
  const passed = /SMOKE_REPORT_PASS/.test(out) && /"summary":\{"ok":true/.test(out);
  console.log(`[smoke-3.5.1] electron 退出 code=${code}`);
  console[passed ? 'log' : 'error'](
    passed
      ? '[smoke-3.5.1] ✓ Phase 3.5.1 摘要悬浮窗（拖拽/边界/持久化）全部通过'
      : '[smoke-3.5.1] ✗ Phase 3.5.1 摘要悬浮窗验证失败'
  );
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
});
