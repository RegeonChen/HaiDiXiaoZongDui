const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-real-'));
const feedUrl = process.argv[2] || 'https://www.ruanyifeng.com/blog/atom.xml';

console.log(`[real-feed] 测试源: ${feedUrl}`);
console.log(`[real-feed] 隔离目录: ${tmpDir}`);

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SMOKE: '1',
    JUHE_SHIVI_SMOKE_REAL_FEED: '1',
    JUHE_SHIVI_SMOKE_FEED_URL: feedUrl,
    JUHE_SHIVI_USER_DATA: tmpDir
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
child.stdout.on('data', (b) => { stdout += b.toString(); process.stdout.write(b); });
child.stderr.on('data', (b) => process.stderr.write(b));

const timer = setTimeout(() => {
  console.error('[real-feed] 超时 30s');
  child.kill('SIGKILL');
}, 30_000);

child.on('exit', (code) => {
  clearTimeout(timer);
  console.log(`[real-feed] 进程退出 code=${code}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(/SMOKE_REPORT_PASS/.test(stdout) ? 0 : 1);
});
