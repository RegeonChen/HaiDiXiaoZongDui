/**
 * Phase 3.5.x 订阅源分组 smoke — 新建组 / 空白处右键 / 移动到组 / 删除组 / "未分组"兜底
 *
 * 验证关键探针:
 *  - 初始 listGroups 返回 MOCK_FEEDS 预填的组
 *  - 侧栏按 groupName 渲染分组
 *  - "+" 菜单显示"新建订阅源组"，AddGroupDialog + input + submit → 新组立即渲染
 *  - 分组空白处右键显示同名选项并打开同一个新建对话框
 *  - 移动订阅源到新组 → 重新渲染显示在新组
 *  - 移回 null → "未分组" 组出现
 *  - 删组 IPC + 按钮存在
 *  - 非法 updateFeed 返回 error
 *
 * 用法:npm run smoke:feeds-group
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-feeds-group-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-feeds-group] out/main/index.js 不存在,请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    // 走真 IPC 模式(不用 mock):smokeUiReal 让 renderer 不带 ?mock=1,
    // 探针在主进程直接 seed 真实 feeds + 调真实 IPC,验证后端持久化 + UI 渲染。
    JUHE_SHIVI_SMOKE_UI: '0',
    JUHE_SHIVI_SMOKE_UI_REAL: '1',
    JUHE_SHIVI_SMOKE_FEEDS_GROUP: '1',
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
  console.error('[smoke-feeds-group] 超时(20s),强制结束');
  child.kill('SIGKILL');
}, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-feeds-group] electron 退出 code=${code} signal=${signal}`);

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-feeds-group] ✓ 订阅源分组(新建组/空白处右键/移动到组/删除组)验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-feeds-group] ✗ 验证失败,未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-feeds-group] Electron 启动失败:${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
