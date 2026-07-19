/**
 * Task 3.5.2 UI 端到端 smoke — 段落内翻译插槽
 *
 * 验证项：
 *  - 点 🌐 翻译按钮 → 立即切到 TranslatedArticleView 段渲染
 *  - 每段都有 TranslationSlot 插槽（至少 1 个）
 *  - 所有 slot 初始 status=pending
 *  - 每个 slot 显示 "Waiting for AI response…"
 *  - 原文块按 [data-block-index] 渲染
 *  - slot 与 block 按 index 一一对应
 *
 * 运行：npm run smoke:translation
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-3.5.2-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.5.2] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1',          // mock 模式（demo 文章有数据）
    JUHE_SHIVI_SMOKE_UI_REAL: '0',
    JUHE_SHIVI_SMOKE_INLINE_TRANS: '1',
    JUHE_SHIVI_USER_DATA: temporaryDirectory
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let out = '';
child.stdout.on('data', (c) => { out += c.toString(); process.stdout.write(c); });
child.stderr.on('data', (c) => process.stderr.write(c));
const timer = setTimeout(() => {
  console.error('[smoke-3.5.2] 超时 40s');
  child.kill('SIGKILL');
}, 40_000);
child.on('exit', (code) => {
  clearTimeout(timer);
  const passed = /SMOKE_REPORT_PASS/.test(out) && /"inlineTrans":\{"ok":true/.test(out);
  console.log(`[smoke-3.5.2] electron 退出 code=${code}`);
  console[passed ? 'log' : 'error'](
    passed
      ? '[smoke-3.5.2] ✓ Phase 3.5.2 UI 段落内翻译插槽（切段渲染 + pending 占位）全部通过'
      : '[smoke-3.5.2] ✗ Phase 3.5.2 UI 段落内翻译插槽验证失败'
  );
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
});
