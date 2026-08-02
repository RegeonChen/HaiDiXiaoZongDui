/**
 * Task 3.3 验收脚本
 *
 * 覆盖 PLAN.md Task 3.3 Verification 全部点：
 *  - provider CRUD + test (连通性校验)
 *  - tag CRUD + article 关联
 *  - note CRUD + digest CRUD + export
 *  - ai:chat 文章上下文多轮问答（使用本地 OpenAI-compatible mock）
 *  - 专题推荐在 Provider 拒绝 response_format 时自动降级并完成真实 IPC
 *  - ai:generateSummary / ai:generateTranslation / ai:suggestTags (需真实 API Key，跳过若未配置)
 *  - ai 结果缓存 (ai:getSummary / ai:getTranslation / ai:getTagSuggestions)
 *  - 字体/视觉主题 + 三栏宽度 settings 持久化 (重启验证)
 *
 * 运行：npm run smoke:task33
 *
 * AI 生成测试需要环境变量 JUHE_SHIVI_AI_API_KEY。
 * 未设置时，AI 生成部分标记为 skipped 而非 fail。
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const mainEntry = path.join(root, 'out', 'main', 'index.js');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-shivi-smoke33-'));

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke-3.3] out/main/index.js 不存在，请先跑 npm run build');
  process.exit(2);
}

let topicResponseFormatRejected = false;
let tagReasoningFallbackExercised = false;

// Mock OpenAI-compatible server 作为 AI 后端
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://127.0.0.1:${server.address()?.port || 0}`);

  // 模拟一个 RSS feed 用于 seed
  if (parsedUrl.pathname === '/feed.xml') {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const guid = parsedUrl.searchParams.has('chat')
      ? 'smoke33-chat'
      : parsedUrl.searchParams.has('n')
        ? 'smoke33-note'
        : 'smoke33-1';
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(`<rss version="2.0"><channel><title>Task 3.3 Test Feed</title><link>${baseUrl}/</link>
      <item><title>Test Article</title><link>${baseUrl}/a</link><guid>${guid}</guid><pubDate>Tue, 15 Jul 2026 06:00:00 GMT</pubDate></item>
    </channel></rss>`);
    return;
  }
  if (parsedUrl.pathname === '/a') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body><article><h1>AI Test Article</h1><p>This is a test article about machine learning and artificial intelligence. Large language models have transformed NLP tasks.</p></article></body></html>');
    return;
  }

  // Mock OpenAI API
  if (parsedUrl.pathname === '/chat/completions') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch { payload = {}; }
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const userMessages = messages.filter((m) => m.role === 'user');
      const userMsg = (userMessages[userMessages.length - 1] || {}).content || '';
      const isTranslation = userMsg.includes('ORIGINAL:') || userMsg.includes('TRANSLATED:');
      const isTag = userMsg.includes('suggest') && userMsg.includes('tags');
      const isArticleChat =
        userMsg.includes('article chat smoke') ||
        userMsg.includes('follow-up smoke');
      const isTopicRecommendation =
        userMsg.includes('Generate RSS tracking topic recommendations');

      if (isTopicRecommendation) {
        if (payload.response_format && !topicResponseFormatRejected) {
          topicResponseFormatRejected = true;
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: 'Unknown parameter: response_format' }
          }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            suggestions: [
              {
                name: 'Large Language Model Development',
                description: 'Track model capabilities, evaluations, and applications across releases.',
                keywords: ['large language models', 'LLM', 'machine learning', 'AI models'],
                reason: 'This scope can connect future model releases and evaluations.'
              },
              {
                name: 'Machine Learning Applications',
                description: 'Track practical uses and integrations of machine learning systems.',
                keywords: ['machine learning', 'ML applications', 'AI integration'],
                reason: 'This scope connects product and deployment reports.'
              },
              {
                name: 'Natural Language Processing Models',
                description: 'Track language model capabilities and NLP benchmarks.',
                keywords: ['natural language processing', 'NLP', 'language models'],
                reason: 'This scope focuses on a stable technical field.'
              },
              {
                name: 'AI Model Evaluation',
                description: 'Track benchmarks and independent comparisons of AI models.',
                keywords: ['AI evaluation', 'benchmark', 'model performance', 'artificial intelligence'],
                reason: 'This scope supports cross-source comparisons.'
              }
            ]
          }) } }]
        }));
      } else if (isTag) {
        tagReasoningFallbackExercised =
          payload.response_format?.type === 'json_object' &&
          payload.enable_thinking === false;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          model: 'deepseek-v4-flash',
          choices: [{ message: {
            content: null,
            reasoning_content: [
              'I will now return the requested structured result.',
              '```json',
              '{"suggestions":[',
              '{"name":"machine-learning","confidence":0.95,"reason":"Article discusses ML concepts"},',
              '{"name":"large-language-models","confidence":0.9,"reason":"Mentions LLMs"},',
              '{"name":"ai","confidence":0.85,"reason":"Core topic is AI"},',
              ']}',
              '```'
            ].join('\n')
          } }]
        }));
      } else if (isTranslation) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: '---\nORIGINAL: This is a test article about machine learning.\nTRANSLATED: 这是一篇关于机器学习的测试文章。\n---\nORIGINAL: Large language models have transformed NLP.\nTRANSLATED: 大型语言模型已经改变了自然语言处理。\n---' } }]
        }));
      } else if (isArticleChat) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: 'Article chat smoke reply grounded in the current article.' } }]
        }));
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: 'Summary: This article introduces AI and machine learning concepts, focusing on how large language models have revolutionized natural language processing.' } }]
        }));
      }
    });
    return;
  }

  res.writeHead(404).end();
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const aiBaseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(electron, [mainEntry, '--no-sandbox', '--disable-gpu'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      JUHE_SHIVI_SMOKE: '1',
      JUHE_SHIVI_SMOKE_TASK33: '1',
      JUHE_SHIVI_SMOKE_FEED_URL: `http://127.0.0.1:${port}/feed.xml`,
      JUHE_SHIVI_USER_DATA: temporaryDirectory,
      JUHE_SHIVI_SMOKE_AI_BASE_URL: aiBaseUrl,
      JUHE_SHIVI_SMOKE_AI_KEY: 'smoke-test-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let out = '';
  child.stdout.on('data', (c) => { out += c.toString(); process.stdout.write(c); });
  child.stderr.on('data', (c) => process.stderr.write(c));

  const timer = setTimeout(() => {
    console.error('[smoke-3.3] 超时 60s');
    child.kill('SIGKILL');
  }, 60_000);

  child.on('exit', async (code) => {
    clearTimeout(timer);
    const reportMatch = out.match(/SMOKE_REPORT_JSON\s+({[\s\S]*?})\n/);
    const report = reportMatch ? JSON.parse(reportMatch[1]) : null;

    let passed = /SMOKE_REPORT_PASS/.test(out);
    try {
      const credentialCheck = await inspectPersistedCredential();
      console.log(`[smoke-3.3] credential storage: ${JSON.stringify(credentialCheck)}`);
      passed = passed && credentialCheck.encrypted && credentialCheck.plaintextAbsent;
      passed = passed && topicResponseFormatRejected;
      console.log(`[smoke-3.3] response_format fallback exercised: ${topicResponseFormatRejected}`);
      passed = passed && tagReasoningFallbackExercised;
      console.log(`[smoke-3.3] tag reasoning_content fallback exercised: ${tagReasoningFallbackExercised}`);
    } catch (error) {
      console.error(`[smoke-3.3] credential storage 检查失败: ${String(error)}`);
      passed = false;
    }
    console.log(`[smoke-3.3] electron 退出 code=${code}`);

    if (report) {
      console.log('[smoke-3.3] 验收报告:');
      printChecks('base', report.base);
      printChecks('settingsPersist', report.settingsPersist);
      printChecks('provider', report.provider);
      printChecks('tag', report.tag);
      printChecks('note', report.note);
      printChecks('digest', report.digest);
      printChecks('ai_summary', report.ai_summary);
      printChecks('ai_translation', report.ai_translation);
      printChecks('ai_tags', report.ai_tags);
      printChecks('ai_cache', report.ai_cache);
    }

    console[passed ? 'log' : 'error'](
      passed
        ? '[smoke-3.3] Task 3.3 全部验收通过'
        : '[smoke-3.3] Task 3.3 验收失败'
    );

    server.close(() => {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      process.exit(passed ? 0 : 1);
    });
  });
});

async function inspectPersistedCredential() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const databasePath = path.join(temporaryDirectory, 'juhe-shivi.db');
  const database = new SQL.Database(fs.readFileSync(databasePath));
  const rows = database.exec(
    `SELECT api_key FROM ai_providers
     WHERE name = 'Credential Storage Smoke' LIMIT 1`
  );
  const stored = String(rows[0]?.values[0]?.[0] ?? '');
  database.close();
  return {
    encrypted: stored.startsWith('safe-storage:v1:'),
    plaintextAbsent: !stored.includes('smoke-test-key-persisted')
  };
}

function printChecks(label, obj) {
  if (!obj) return;
  const { ok, error, skipped, checks } = obj;
  if (skipped) {
    console.log(`  [${label}] skipped: ${skipped}`);
    return;
  }
  if (error) {
    console.log(`  [${label}] error: ${error}`);
    return;
  }
  if (!ok) {
    console.log(`  [${label}] FAILED`);
    if (checks) {
      for (const [k, v] of Object.entries(checks)) {
        console.log(`    ${k}: ${v}`);
      }
    }
    return;
  }
  console.log(`  [${label}] ok`);
  if (checks) {
    for (const [k, v] of Object.entries(checks)) {
      if (typeof v === 'boolean') {
        console.log(`    ${k}: ${v ? 'PASS' : 'FAIL'}`);
      } else {
        console.log(`    ${k}: ${JSON.stringify(v)}`);
      }
    }
  }
}
