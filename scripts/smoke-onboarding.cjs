/**
 * Phase 4.3 onboarding smoke：
 * 1) 全新 userData 首次启动自动打开 8 步教程；
 * 2) 完成后设置持久化，设置页可重新打开并跳过；
 * 3) 复用同一 userData 重启，教程不再自动弹出。
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'juhe-shivi-smoke-onboarding-')
);

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-onboarding] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

void run();

async function run() {
  try {
    await runStage('first');
    await runStage('restart');
    console.log('[smoke-onboarding] ✓ 首次启动、完成/跳过、设置重开与重启持久化全部通过');
  } catch (error) {
    console.error(`[smoke-onboarding] ✗ ${String(error)}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function runStage(stage) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_DISABLE_GPU: '1',
        JUHE_SHIVI_SMOKE: '1',
        JUHE_SHIVI_SMOKE_ONBOARDING: '1',
        JUHE_SHIVI_SMOKE_ONBOARDING_STAGE: stage,
        JUHE_SHIVI_USER_DATA: temporaryDirectory
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${stage} 阶段超时`));
    }, 45000);

    child.stdout.on('data', (buffer) => {
      const text = buffer.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (buffer) => {
      const text = buffer.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      const passed = /SMOKE_REPORT_PASS/.test(stdout);
      if (code === 0 && passed) {
        resolve();
        return;
      }
      reject(new Error(
        `${stage} 阶段失败（code=${code}, signal=${signal}）\n${stdout}\n${stderr}`
      ));
    });
  });
}
