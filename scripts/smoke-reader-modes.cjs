/**
 * 阅读模式 UI smoke：覆盖模式切换、字号隔离、窄屏分栏和宽内容滚动。
 *
 * 用法：npm run smoke:reader-modes
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-reader-modes-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-reader-modes] out/main/index.js 不存在，请先跑 npm run build');
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
    JUHE_SHIVI_SMOKE_READER_MODES: '1',
    JUHE_SHIVI_USER_DATA: temporaryDirectory
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let finished = false;
child.stdout.on('data', (buffer) => {
  stdout += buffer.toString();
  process.stdout.write(buffer);
});
child.stderr.on('data', (buffer) => process.stderr.write(buffer));

const timer = setTimeout(() => {
  console.error('[smoke-reader-modes] 超时（20s），强制结束');
  child.kill('SIGKILL');
}, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-reader-modes] electron 退出 code=${code} signal=${signal}`);
  if (/SMOKE_REPORT_PASS/.test(stdout)) {
    console.log('[smoke-reader-modes] ✓ 阅读模式与内容兼容性验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-reader-modes] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-reader-modes] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
