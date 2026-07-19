/**
 * Task 3.5.2 split 异常 fallback smoke
 *
 * 验证：htmlBlockSplit 抛错时 UI 不卡在"正在切分段落…"，fallback 到单块 ready
 * 场景：Phase 3.5.2 dev 真实使用中，TranslatedArticleView 的 useEffect async
 * 块在 ds.htmlBlockSplit 抛异常时没有 try/catch，setSplit({ready}) 永远不触发，
 * 翻译完成后 UI 还卡在"正在切分段落…"
 *
 * 验证项：
 *   1. 打开文章 → content.html 加载完成
 *   2. 注入 mock split 异常标志
 *   3. 点 🌐 翻译 → setActivePanel('translation') → 渲染 TranslatedArticleView
 *   4. 翻译流式推送开始/段完成事件 → setTranslationParagraphs 更新每段
 *   5. useEffect async 块 throw → catch 触发 fallback setSplit({ready, blocks: [fallback]})
 *   6. UI 切到 data-split-state="ready"（不是 "loading"）
 *   7. fallback 单块渲染，slot 能找到对应段落译文
 *
 * 用法：npm run smoke:inline-trans:split-error
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-3.5.2-split-error-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.5.2-split-error] out/main/index.js 不存在，请先跑 npm run build');
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
    JUHE_SHIVI_SMOKE_FEED_URL: 'http://127.0.0.1:0/seed.xml',
    JUHE_SHIVI_SMOKE_INLINE_TRANS: '0',
    JUHE_SHIVI_SMOKE_INLINE_TRANS_SPLIT_ERROR: '1',
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
  console.error('[smoke-3.5.2-split-error] 超时（18s），强制结束');
  child.kill('SIGKILL');
}, 18000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-3.5.2-split-error] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-3.5.2-split-error] ✓ split 异常 fallback 验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-3.5.2-split-error] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-3.5.2-split-error] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
