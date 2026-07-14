/**
 * Task 2.3 烟雾测试
 *
 * 目的：验证
 *   1) feed CRUD 通过 IPC 正常（创建/列表/去重/更新/删除）
 *   2) article 列表查询正常
 *   3) 数据库持久化可行（通过环境变量 JUHE_SHIVI_SMOKE_V2 触发 v2 探头）
 *
 * 用法：
 *   npm run build && node scripts/smoke-2.3.cjs
 * 退出码 0 = 全过
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-2.3] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const env = {
  ...process.env,
  ELECTRON_DISABLE_GPU: '1',
  JUHE_SHIVI_SMOKE: '1',
  JUHE_SHIVI_SMOKE_V2: '1'
};

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (b) => { stdout += b.toString(); process.stdout.write(b); });
child.stderr.on('data', (b) => { stderr += b.toString(); process.stderr.write(b); });

const timer = setTimeout(() => {
  console.error('[smoke-2.3] 超时（10s）仍未完成，强制结束');
  child.kill('SIGKILL');
}, 10000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-2.3] electron 退出 code=${code} signal=${signal}`);

  const pass = /SMOKE_REPORT_PASS/.test(stdout);
  if (pass) {
    console.log('[smoke-2.3] ✓ Phase 2.3 验证全部通过');
    process.exit(0);
  } else {
    console.error('[smoke-2.3] ✗ 验证失败');
    // 打印报告行帮助调试
    const reportLine = stdout.split('\n').find(l => l.includes('SMOKE_REPORT_JSON'));
    if (reportLine) console.error(`[smoke-2.3] 报告: ${reportLine.trim()}`);
    process.exit(1);
  }
});
