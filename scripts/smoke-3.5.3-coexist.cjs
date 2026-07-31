/**
 * 摘要底部栏 smoke — 摘要 toggle + 摘要/翻译并存
 *
 * 验证：
 *   1) 点摘要 → 按钮文字仍为“摘要”，通过选中颜色表示状态
 *   2) 再点同一个“摘要”按钮 → 底部栏收起，文字保持不变
 *   3) 第三次点摘要 → 底部栏重新出现，复用缓存
 *   4) 摘要打开时点翻译 → 底部摘要栏 + 翻译视图同时存在
 *   5) 关掉翻译 → 底部摘要栏仍保留
 *
 * 用法：npm run smoke:coexist
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-3.5.3-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.5.3] out/main/index.js 不存在，请先跑 npm run build');
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
    JUHE_SHIVI_SMOKE_COEXIST: '1', // Phase 3.5.x 修复 smoke
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
  console.error('[smoke-3.5.3] 超时（18s），强制结束');
  child.kill('SIGKILL');
}, 18000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-3.5.3] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-3.5.3] ✓ 摘要 toggle + 摘要/翻译并存验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-3.5.3] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-3.5.3] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
