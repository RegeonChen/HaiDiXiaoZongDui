/**
 * Task 2.1 烟雾测试 — UI Shell
 *
 * 验证项（headless 下靠 probe 注入 + DOM 探测）：
 *  1) .app-main 与三栏 .pane-feeds/.pane-list/.pane-reader 渲染完成
 *  2) 三栏宽度加起来 = main 宽度（容差 2px）
 *  3) 订阅源侧栏 ≥ 5 项
 *  4) 文章列表 ≥ 5 项
 *  5) 点击第一篇文章后阅读区标题更新
 *  6) 主题切换：dark 按钮点完 <html data-theme="dark">
 *  7) 切回 system 后 data-theme 跟随
 *
 * 用法：npm run smoke:ui
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-ui] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE_UI: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
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
    process.exit(0);
  } else {
    console.error('[smoke-ui] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    process.exit(1);
  }
});
