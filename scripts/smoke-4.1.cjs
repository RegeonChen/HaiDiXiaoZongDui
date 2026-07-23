/**
 * Phase 4 端到端 smoke — 专题演化图 MVP
 *
 * 验证项：
 *  - TopicsPage 列表：渲染 + "+ 新建专题" 按钮 + 空态
 *  - IPC 层 topic:list / create / get / update / delete 真实持久化
 *  - topic:getGraph 返回结构化方向、节点和边
 *  - 空专题的文章关联与脉络图可正常返回空数组
 *
 * 运行：npm run smoke:topic
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-4.1-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-4.1] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_UI: '1',
    JUHE_SHIVI_SMOKE_UI_REAL: '1',
    JUHE_SHIVI_SMOKE_TOPIC: '1',
    JUHE_SHIVI_USER_DATA: temporaryDirectory
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let out = '';
child.stdout.on('data', (c) => { out += c.toString(); process.stdout.write(c); });
child.stderr.on('data', (c) => process.stderr.write(c));
const timer = setTimeout(() => {
  console.error('[smoke-4.1] 超时 40s');
  child.kill('SIGKILL');
}, 40_000);
child.on('exit', (code) => {
  clearTimeout(timer);
  const passed = /SMOKE_REPORT_PASS/.test(out) && /"topic":\{"ok":true/.test(out);
  console.log(`[smoke-4.1] electron 退出 code=${code}`);
  console[passed ? 'log' : 'error'](
    passed
      ? '[smoke-4.1] ✓ Phase 4 专题持久化与演化图全部通过'
      : '[smoke-4.1] ✗ Phase 4 专题演化图验证失败'
  );
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
});
