/**
 * 摘要端到端 smoke — 阅读区粘性底部栏
 *
 * 验证项：
 *  - 摘要与标签共用 StickyBottomPanel，不再创建悬浮窗
 *  - 首次打开立即显示 Loading，完成后渲染 Markdown 摘要
 *  - 上方工具按钮和底部 tab 都能打开缓存摘要
 *  - 面板可拉伸、切换到标签并收起
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
      ? '[smoke-3.5.1] ✓ 摘要底部栏（生成/缓存/tab/拉伸/收起）全部通过'
      : '[smoke-3.5.1] ✗ 摘要底部栏验证失败'
  );
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
});
