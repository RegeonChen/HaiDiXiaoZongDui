/**
 * Phase 4.3.1 smoke: 新手引导浮层（OnboardingOverlay）
 *
 * 走 mock 模式（Mock 5 feeds + 10 articles）：
 *   1) 首次启动自动弹引导 → overlay 存在 + step-1 命中"订阅源"镂空
 *   2) 8 个步骤按顺序推进 → 镂空位置和目标元素 querySelector 命中
 *   3) 跳过引导（点 skip）→ 遮罩消失 + onboardingCompleted=true 持久化
 *   4) 走完最后一步（点 8 次 next）→ "开始使用" 按钮文案 + overlay 消失 + 持久化
 *   5) 设置页"新手引导"入口 → 从 step 0 重新打开
 *   6) 拖窗口 resize 事件 → 镂空位置实时跟随
 *   7) 语言切换（en/zh）→ 卡片文案同步
 *   8) 三主题（light+classic / light+paper / dark）→ 卡片背景非透明 + 可读
 *   9) 每步目标元素 querySelector + boundingRect 实测位置（≥8×8）
 *
 * 用法：npm run smoke:onboarding
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-431-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-4.3.1] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    // 不设 JUHE_SHIVI_SMOKE_UI,避免 smokeUI 探针优先命中(if/else 链前面)
    // Phase 4.3.1:createMainWindow 的 useMock 已扩展支持 smokeOnboarding 走 mock 模式
    JUHE_SHIVI_SMOKE_ONBOARDING: '1',
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
  console.error('[smoke-4.3.1] 超时（60s），强制结束');
  child.kill('SIGKILL');
}, 60000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-4.3.1] electron 退出 code=${code} signal=${signal}`);

  const reportJsonMatch = stdout.match(/SMOKE_REPORT_JSON\s+(\{[\s\S]*\})/);
  if (reportJsonMatch) {
    try {
      const report = JSON.parse(reportJsonMatch[1]);
      console.log('[smoke-4.3.1] 报告字段:', JSON.stringify(report.onboarding?.checks ?? {}, null, 2));
      if (report.onboarding?.text) {
        console.log('[smoke-4.3.1] 文本字段:', JSON.stringify(report.onboarding.text, null, 2));
      }
    } catch (e) {
      console.error(`[smoke-4.3.1] 解析 SMOKE_REPORT_JSON 失败: ${String(e)}`);
    }
  } else {
    console.error('[smoke-4.3.1] 未找到 SMOKE_REPORT_JSON');
  }

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-4.3.1] ✓ Onboarding 9 项验收全部通过');
    finish(0);
  } else {
    console.error('[smoke-4.3.1] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-4.3.1] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
