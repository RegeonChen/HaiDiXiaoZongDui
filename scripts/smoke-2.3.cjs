/**
 * Task 2.3 烟雾测试
 *
 * 目的：验证
 *   1) feed CRUD 通过 IPC 正常（创建/列表/去重/更新/删除）
 *   2) article 列表查询正常
 *   3) 数据库使用隔离的临时 userData，二次启动后仍能读取 Feed 与 settings
 *   4) 空库首次启动只写入一次默认订阅源，二次启动不重复
 *
 * 用法：
 *   npm run build && node scripts/smoke-2.3.cjs
 * 退出码 0 = 全过
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke-2.3-'));
const databasePath = path.join(temporaryDirectory, 'juhe-shivi.db');
const persistenceMarkerId = 'smoke-persistence-feed';

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-2.3] out/main/index.js 不存在，请先跑 npm run build');
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exit(2);
}

const env = {
  ...process.env,
  ELECTRON_DISABLE_GPU: '1',
  JUHE_SHIVI_SMOKE: '1',
  JUHE_SHIVI_SMOKE_V2: '1',
  JUHE_SHIVI_USER_DATA: temporaryDirectory
};

void run().catch((error) => {
  console.error(`[smoke-2.3] ✗ 验证异常：${String(error)}`);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function run() {
  const firstRun = await runElectron('首次启动');
  assertSmokePassed(firstRun, '首次启动');
  await seedPersistenceMarker();

  const secondRun = await runElectron('二次启动');
  assertSmokePassed(secondRun, '二次启动');
  const secondReport = readSmokeReport(secondRun.stdout);

  if (!await hasPersistenceMarker()) {
    throw new Error('二次启动后未找到持久化标记');
  }
  if (secondReport?.db?.settingsSidebarBeforeUpdate !== 23) {
    throw new Error('二次启动后未恢复 settings:update 写入的栏宽');
  }

  console.log('[smoke-2.3] ✓ CRUD / IPC、Feed 与 settings 跨重启持久化验证全部通过');
}

function runElectron(label) {
  return new Promise((resolve, reject) => {
    console.log(`[smoke-2.3] ${label}`);
    const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    const timer = setTimeout(() => {
      console.error(`[smoke-2.3] ${label}超时（10s），强制结束`);
      child.kill('SIGKILL');
    }, 10000);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(`[smoke-2.3] ${label} electron 退出 code=${code} signal=${signal}`);
      resolve({ stdout, stderr, code, signal });
    });
  });
}

function assertSmokePassed(result, label) {
  if (result.code === 0 && /SMOKE_REPORT_PASS/.test(result.stdout)) return;
  const reportLine = result.stdout.split('\n').find((line) => line.includes('SMOKE_REPORT_JSON'));
  if (reportLine) console.error(`[smoke-2.3] ${label}报告: ${reportLine.trim()}`);
  throw new Error(`${label}未通过 CRUD / IPC 探测`);
}

function readSmokeReport(stdout) {
  const line = stdout.split('\n').find((value) => value.includes('SMOKE_REPORT_JSON'));
  if (!line) return null;
  return JSON.parse(line.slice(line.indexOf('SMOKE_REPORT_JSON') + 'SMOKE_REPORT_JSON'.length).trim());
}

async function seedPersistenceMarker() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const database = new SQL.Database(fs.readFileSync(databasePath));
  const timestamp = new Date().toISOString();
  database.run(
    `INSERT INTO feeds (id, title, url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      persistenceMarkerId,
      'Persistence Marker',
      'https://persistence-smoke.example.com/feed',
      timestamp,
      timestamp
    ]
  );
  fs.writeFileSync(databasePath, Buffer.from(database.export()));
  database.close();
}

async function hasPersistenceMarker() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const database = new SQL.Database(fs.readFileSync(databasePath));
  const rows = database.exec('SELECT title FROM feeds WHERE id = ?', [persistenceMarkerId]);
  const found = rows[0]?.values[0]?.[0] === 'Persistence Marker';
  database.close();
  return found;
}
