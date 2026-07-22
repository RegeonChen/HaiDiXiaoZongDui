/**
 * Phase 3.5.x 修复 smoke — 侧栏 tab=tags 真按 tag 分类 + AI 标签建议 toggle 修复
 *
 * 验证:
 *  A) 切到 tab=tags → 渲染占位("还没有任何标签")或已有 tag 列表
 *  B) handleSuggestTags toggle 修复:
 *     1) 初始 stickyTab=null + tagSuggestions=[]
 *     2) 点 🪄 标签建议 → stickyTab='tag-suggest' + tagSuggestions.length>0
 *     3) 第二次点(显示"🙈 关闭标签建议")→ stickyTab=null, tagSuggestions 长度不变(不重调 AI)
 *     4) 第三次点(显示"🪄 显示标签建议")→ stickyTab='tag-suggest', tagSuggestions 长度仍不变(不重调 AI)
 *
 * 用法:npm run smoke:taglist
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-taglist-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-taglist] out/main/index.js 不存在,请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1', // mock 模式(demo 文章 + mock AI)
    JUHE_SHIVI_SMOKE_UI_REAL: '0',
    JUHE_SHIVI_SMOKE_TAGLIST: '1', // Phase 3.5.x 修复 smoke
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
  console.error('[smoke-taglist] 超时(20s),强制结束');
  child.kill('SIGKILL');
}, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-taglist] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-taglist] ✓ 侧栏 tag 分类 + AI 标签建议 toggle 修复 验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-taglist] ✗ 验证失败,未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-taglist] Electron 启动失败:${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
