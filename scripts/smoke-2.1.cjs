/**
 * Task 2.1 烟雾测试 — UI Shell
 *
 * 验证项（headless 下靠 probe 注入 + DOM 探测）：
 *  1) 四段式工作台与 .pane-feeds/.pane-list/.pane-reader 渲染完成
 *  2) 一级目录 + 外层手柄 + 编辑区 = 工作台宽度；文章目录 + 内层手柄 + 阅读区 = 编辑区宽度
 *  3) 订阅源侧栏 ≥ 5 项
 *  4) 文章列表 ≥ 5 项
 *  5) 点击第一篇文章后阅读区标题更新
 *  6) 主题切换：dark 按钮点完 <html data-theme="dark">
 *  7) 切回 system 后 data-theme 跟随
 *  8) 搜索框位于顶栏左侧扩展位之前
 *
 * 用法：npm run smoke:ui
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-ui] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-2.1-'));

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1',
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
  console.error('[smoke-ui] 超时（12s），强制结束');
  child.kill('SIGKILL');
}, 12000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-ui] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-ui] ✓ UI Shell 验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-ui] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-ui] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
