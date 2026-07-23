/**
 * Generic packaged-renderer image smoke.
 *
 * The fixture rejects requests without the original article URL as Referer.
 * Passing therefore proves the whole path:
 * juhe-image:// URL -> Main protocol -> generic referrer fetch -> decoded image.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-image-smoke-'));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-images] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

let child = null;
let finished = false;
const server = http.createServer((request, response) => {
  if (request.url === '/image.png') {
    const expectedReferrer = `http://127.0.0.1:${server.address().port}/article`;
    if (request.headers.referer !== expectedReferrer) {
      response.writeHead(403, { 'Content-Type': 'text/plain' });
      response.end('missing article referrer');
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': png.byteLength,
      'Cache-Control': 'no-store'
    });
    response.end(png);
    return;
  }
  response.writeHead(404);
  response.end();
});

const timer = setTimeout(() => {
  console.error('[smoke-images] 超时（20s），强制结束');
  child?.kill('SIGKILL');
  finish(1);
}, 20_000);

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      JUHE_SHIVI_SMOKE: '1',
      JUHE_SHIVI_SMOKE_UI: '1',
      JUHE_SHIVI_SMOKE_ARTICLE_IMAGES: '1',
      JUHE_SHIVI_SMOKE_IMAGE_SOURCE_URL: `http://127.0.0.1:${port}/image.png`,
      JUHE_SHIVI_SMOKE_IMAGE_ARTICLE_URL: `http://127.0.0.1:${port}/article`,
      JUHE_SHIVI_USER_DATA: temporaryDirectory
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  child.stdout.on('data', (buffer) => {
    stdout += buffer.toString();
    process.stdout.write(buffer);
  });
  child.stderr.on('data', (buffer) => process.stderr.write(buffer));
  child.on('error', (error) => {
    console.error(`[smoke-images] Electron 启动失败：${String(error)}`);
    finish(1);
  });
  child.on('exit', (code, signal) => {
    console.log(`[smoke-images] electron 退出 code=${code} signal=${signal}`);
    if (/SMOKE_REPORT_PASS/.test(stdout)) {
      console.log('[smoke-images] ✓ 通用文章图片加载链路通过');
      finish(0);
    } else {
      console.error('[smoke-images] ✗ 未见 SMOKE_REPORT_PASS');
      finish(1);
    }
  });
});

function finish(exitCode) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  server.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
