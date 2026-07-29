/**
 * Phase 4.2.1 smoke: Navbar 图标(AI 粗体字母 / 专题多源聚合 SVG)
 *   + 系统字号滑块(独立于正文字号) + 阅读功能键三级目录循环
 *
 * 走 mock 模式（MOCK_ARTICLES 10 篇 + 5 个 feeds）：
 *   1) AI 入口图标 = 粗体字母 "AI"（<strong class="app-header__nav-icon--ai">）
 *   2) 专题入口图标 = SVG 多源聚合（<svg class="app-header__nav-icon--topics">）
 *   3) 顶部小三角已移除；阅读功能键初始为两级目录全开
 *   4) 第一次再点阅读 → 收起一级目录，只剩 1 个 ResizeHandle
 *   5) 第二次再点阅读 → 收起二级目录，只剩灵活窗口且无 ResizeHandle
 *   6) 第三次再点阅读 → 两级目录同时恢复
 *   6) 打开通用设置弹窗 → 系统字号滑块存在 + 当前值=14（默认）
 *   7) 改系统字号到 20 → <html> --ui-font-size="20px" + FeedList + ArticleList 根 fontSize=20px
 *   8) 子元素 em 缩放：.feed-list__item 实际 ≈ 18.6px（20 * 0.93）
 *   9) ArticleReader 不引用 --ui-font-size（--font-size 仍 16px + reader 根不继承 20px）
 *  10) 持久化：settings.systemFontSize = 20（IPC settings.get 读回）
 *
 * 用法：npm run smoke:phase4.2
 * 退出码 0 = 全过
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-4.2-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-4.2] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1', // 触发 runSmokeTest
    // 注意:不要设 JUHE_SHIVI_SMOKE_UI=1,否则 smokeUI 探针会先命中(smokePhase42 在 if/else 链后面)
    // Phase 4.2.1:createMainWindow 的 useMock 已扩展支持 smokePhase42 走 mock 模式
    JUHE_SHIVI_SMOKE_PHASE42: '1',
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
  console.error('[smoke-4.2] 超时（45s），强制结束');
  child.kill('SIGKILL');
}, 45000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`[smoke-4.2] electron 退出 code=${code} signal=${signal}`);

  const reportJsonMatch = stdout.match(/SMOKE_REPORT_JSON\s+(\{[\s\S]*\})/);
  if (reportJsonMatch) {
    try {
      const report = JSON.parse(reportJsonMatch[1]);
      console.log('[smoke-4.2] 报告字段:', JSON.stringify(report.phase42?.checks ?? {}, null, 2));
    } catch (e) {
      console.error(`[smoke-4.2] 解析 SMOKE_REPORT_JSON 失败: ${String(e)}`);
    }
  } else {
    console.error('[smoke-4.2] 未找到 SMOKE_REPORT_JSON');
  }

  const ok = /SMOKE_REPORT_PASS/.test(stdout);
  if (ok) {
    console.log('[smoke-4.2] ✓ Navbar 图标 + 系统字号 + 阅读键三级目录循环验证全部通过');
    finish(0);
  } else {
    console.error('[smoke-4.2] ✗ 验证失败，未见 SMOKE_REPORT_PASS');
    finish(1);
  }
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`[smoke-4.2] Electron 启动失败：${String(error)}`);
  finish(1);
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
