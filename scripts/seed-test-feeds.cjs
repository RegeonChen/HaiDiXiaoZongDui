/**
 * seed-test-feeds — 批量 seed 推荐 RSS/Atom/JSON Feed 真实数据
 *
 * 用途：填充 SQLite 一批可访问的真实 feed + 触发 sync，UI 启动后能立即看到内容
 *   - 用法：node scripts/seed-test-feeds.cjs [可选: --user-data=路径]
 *   - 失败条目会继续尝试其余 feed，最后报告成功/失败列表
 *   - 不会覆盖已存在的 feed（幂等）
 *
 * 写入 SQLite 路径：默认 {os.tmpdir()}/juhe-shivi-seed-<rand>/juhe-shivi.db
 *   - 与 dev 应用隔离，不会污染日常数据
 *   - 若要"看到这些数据"，启动 dev 时设 JUHE_SHIVI_USER_DATA=同一个路径
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');

// ============================================================
// 推荐 RSS / Atom / JSON Feed URL 列表
// ============================================================
// 中文（适合测试中文/GBK 编码 + 真实本地化场景）
// 英文（适合测试英文内容 + 不同 feed 格式）
// JSON Feed（适合测试 JSON Feed 1.1 解析路径）
const RECOMMENDED_FEEDS = [
  // === 中文 ===
  {
    url: 'https://www.ruanyifeng.com/blog/atom.xml',
    title: '阮一峰的网络日志',
    note: 'Atom 格式 / 中文 / 经常更新'
  },
  {
    url: 'https://sspai.com/feed',
    title: '少数派',
    note: 'RSS 2.0 / 中文 / 科技向'
  },

  // === 英文 ===
  {
    url: 'https://antirez.com/rss',
    title: 'antirez.com',
    note: 'RSS / 英文 / Redis 作者 + Mercury UI 参考站'
  },
  {
    url: 'https://hnrss.org/frontpage',
    title: 'Hacker News Frontpage',
    note: 'RSS / 英文 / 实时热点'
  },
  {
    url: 'https://simonwillison.net/atom/everything/',
    title: "Simon Willison's Weblog",
    note: 'Atom / 英文 / AI/Web 评论'
  },

  // === JSON Feed 1.1 ===
  {
    url: 'https://www.jsonfeed.org/feed.json',
    title: 'JSON Feed Spec',
    note: 'JSON Feed 1.1 / 英文 / 官方规范源'
  }
];

if (!fs.existsSync(mainEntry)) {
  console.error('[seed-feeds] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

// 自定义 user-data 路径（与 dev 隔离）
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-seed-'));
console.log(`[seed-feeds] userData = ${userData}`);

const seedListJson = JSON.stringify(RECOMMENDED_FEEDS);

const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: '1',
    JUHE_SHIVI_SEED: '1',
    JUHE_SHIVI_SEED_LIST: seedListJson,
    JUHE_SHIVI_USER_DATA: userData
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let out = '';
child.stdout.on('data', (c) => { out += c.toString(); process.stdout.write(c); });
child.stderr.on('data', (c) => process.stderr.write(c));

const timer = setTimeout(() => {
  console.error('[seed-feeds] 超时 90s');
  child.kill('SIGKILL');
}, 90_000);

child.on('exit', (code) => {
  clearTimeout(timer);
  const passed = /SEED_RESULT/.test(out) && /"ok":true/.test(out);
  console.log(`[seed-feeds] electron 退出 code=${code}`);
  console[passed ? 'log' : 'error'](
    passed
      ? `[seed-feeds] ✓ 批量 seed 完成（数据库保留在 ${userData}）`
      : '[seed-feeds] ✗ seed 失败，查看上面输出'
  );
  if (passed) {
    console.log('');
    console.log('=== 启动 dev 模式查看这些 feed ===');
    console.log('PowerShell:');
    console.log(`  $env:JUHE_SHIVI_USER_DATA="${userData}"`);
    console.log('  npm run dev');
    console.log('');
    console.log('cmd:');
    console.log(`  set JUHE_SHIVI_USER_DATA=${userData}`);
    console.log('  npm run dev');
  }
  // 保留 userData 目录，让 A 在 dev 模式中查看
  process.exit(passed ? 0 : 1);
});
