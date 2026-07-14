/**
 * Task 1.1 一次性烟雾测试
 *
 * 目的：在不依赖 GUI 会话的前提下，验证
 *   1) Electron 主进程能起来
 *   2) BrowserWindow 能加载 production 产物
 *   3) contextIsolation 生效（require/process/module/Buffer 在 Renderer 不可见）
 *   4) preload 桥接的 IPC 通道能调通（settings.get 返回 IpcResult<AppSettings>）
 *
 * 用法：node scripts/smoke-1.1.cjs
 * 退出码 0 = 全过，非 0 = 失败
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

if (!fs.existsSync(electron)) {
  console.error('[smoke] electron 二进制不存在');
  process.exit(2);
}

// 临时覆盖 main 进程入口的 window load 后行为
// 我们用 ELECTRON_DISABLE_GPU / ELECTRON_RUN_AS_NODE=0 直接跑 .js
const env = {
  ...process.env,
  ELECTRON_DISABLE_GPU: '1',
  JUHE_SHIVI_SMOKE: '1'
};

// 启动 electron
const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (b) => { stdout += b.toString(); process.stdout.write(b); });
child.stderr.on('data', (b) => { stderr += b.toString(); process.stderr.write(b); });

// 8 秒超时（窗口加载 + 自检 IPC 通信）
const timer = setTimeout(() => {
  console.error('[smoke] 超时（8s）仍未完成，强制结束');
  child.kill('SIGKILL');
}, 8000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke] electron 退出 code=${code} signal=${signal}`);

  // 期望的 SMOKE_REPORT 行
  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke] ✓ 全部验证项通过');
    process.exit(0);
  } else {
    console.error('[smoke] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    process.exit(1);
  }
});
