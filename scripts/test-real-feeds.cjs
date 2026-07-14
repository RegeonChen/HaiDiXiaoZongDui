const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitest, 'run', 'real-feeds.integration.test.ts'],
  {
    cwd: root,
    env: { ...process.env, JUHE_REAL_FEEDS: '1' },
    stdio: 'inherit'
  }
);

process.exit(result.status ?? 1);
