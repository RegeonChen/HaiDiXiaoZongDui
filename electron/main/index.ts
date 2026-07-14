/**
 * 聚合拾遗 — Electron 主进程入口
 * Phase 2: Core Reading Workflow
 *
 * 职责边界：
 *  - 创建 BrowserWindow，配置安全选项
 *  - 注册 shared/ipc.ts 定义的 IPC 通道 handler
 *  - 统一返回 IpcResult<T> 结构
 *  - 不在 Renderer 暴露裸 Node 能力
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { initDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migration.js';
import { FeedRepository } from './db/feed-repository.js';
import { ArticleRepository } from './db/article-repository.js';
import { SqliteContentPipelineStore } from './db/content-pipeline-store.js';
import { ArticleContentService } from './services/content-pipeline/article-content-service.js';
import {
  installNavigationGuards,
  isTrustedRendererUrl,
  registerContentPipelineIpc
} from './services/content-pipeline/ipc-handlers.js';
import { OpmlApplicationService } from './services/content-pipeline/opml-service.js';
import { SyncService } from './services/content-pipeline/sync-service.js';
import { IPC_CHANNELS, type IpcResult } from '../../shared/ipc.js';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Feed,
  type FeedCreateInput,
  type FeedUpdateInput,
  type Article,
  type ArticleFilter
} from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let disposeContentPipelineIpc: (() => void) | null = null;

const configuredUserDataPath = process.env['JUHE_SHIVI_USER_DATA'];
if (process.env['JUHE_SHIVI_SMOKE'] === '1' && configuredUserDataPath) {
  app.setPath('userData', configuredUserDataPath);
}

// ============================================================
// 窗口创建
// ============================================================

function getTrustedRendererUrl(): string {
  return process.env['ELECTRON_RENDERER_URL'] ??
    pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString();
}

async function createMainWindow(trustedRendererUrl: string): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1f1f23',
    title: '聚合拾遗',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
      webviewTag: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  installNavigationGuards(win.webContents, trustedRendererUrl, (url) => {
    void shell.openExternal(url).catch(() => undefined);
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  if (process.env['JUHE_SHIVI_SMOKE'] === '1' || process.env['JUHE_SHIVI_SMOKE_UI'] === '1') {
    void runSmokeTest(win);
  }
}

// ============================================================
// 烟雾测试
// ============================================================

async function runSmokeTest(win: BrowserWindow): Promise<void> {
  // 等到 React 把 #root 渲染完 + mock dataSource 拉完
  await new Promise<void>((resolve) => setTimeout(resolve, 800));

  // Smoke mode — determined by env
  const smokePhase2 = process.env['JUHE_SHIVI_SMOKE_PHASE2'] === '1';
  const smokeV2 = process.env['JUHE_SHIVI_SMOKE_V2'] === '1';
  const smokeUI = process.env['JUHE_SHIVI_SMOKE_UI'] === '1';
  let probe: string;

  if (smokePhase2) {
    const feedUrl = process.env['JUHE_SHIVI_SMOKE_FEED_URL'] ?? '';
    probe = `
      (async () => {
        const report = { phase2: { ok: false, error: null, checks: {} } };
        const feedUrl = ${JSON.stringify(feedUrl)};

        try {
          const created = await window.api.feed.create({ url: feedUrl, title: 'Phase2 Feed' });
          report.phase2.checks.createFeed = created.success && !!created.data?.id;

          const firstSync = await window.api.sync.feed(created.data.id);
          const syncedFeed = await window.api.feed.get(created.data.id);
          report.phase2.checks.firstSync = firstSync.success && firstSync.data?.success === true &&
            firstSync.data?.newArticles === 1 && syncedFeed.success &&
            syncedFeed.data?.lastSyncSuccess === true &&
            syncedFeed.data?.siteTitle === 'Phase 2 Integration Feed';

          const firstList = await window.api.article.list({ feedId: created.data.id });
          const article = firstList.success ? firstList.data?.items[0] : null;
          report.phase2.checks.articleStored = firstList.success && firstList.data?.total === 1 &&
            !!article?.id && article.rawHtml.includes('Feed fallback');

          const cleanedHtml = await window.api.content.getCleanedHtml(article.id);
          const cleanedMarkdown = await window.api.content.getCleanedMarkdown(article.id);
          report.phase2.checks.lazyContent = cleanedHtml.success && cleanedMarkdown.success &&
            cleanedHtml.data.includes('Integration body') &&
            !cleanedHtml.data.includes('<script') &&
            cleanedMarkdown.data.includes('Integration body');

          const secondSync = await window.api.sync.feed(created.data.id);
          const secondList = await window.api.article.list({ feedId: created.data.id });
          report.phase2.checks.repeatSyncDedup = secondSync.success &&
            secondSync.data?.success === true && secondSync.data?.newArticles === 0 &&
            secondSync.data?.updatedArticles === 1 && secondList.success &&
            secondList.data?.total === 1;

          const failedFeed = await window.api.feed.create({
            url: feedUrl.replace('/feed.xml', '/missing.xml'),
            title: 'Failing Feed'
          });
          const failedSync = await window.api.sync.feed(failedFeed.data.id);
          const recordedFailure = await window.api.feed.get(failedFeed.data.id);
          const deletedFailedFeed = await window.api.feed.delete(failedFeed.data.id);
          report.phase2.checks.syncFailureState = failedSync.success &&
            failedSync.data?.success === false && recordedFailure.success &&
            recordedFailure.data?.lastSyncSuccess === false &&
            !!recordedFailure.data?.lastSyncError && deletedFailedFeed.success;

          const markedRead = await window.api.article.markRead(article.id, true);
          const markedStarred = await window.api.article.markStarred(article.id, true);
          const updatedArticle = await window.api.article.get(article.id);
          report.phase2.checks.articleState = markedRead.success && markedStarred.success &&
            updatedArticle.success && updatedArticle.data?.isRead === true &&
            updatedArticle.data?.isStarred === true &&
            updatedArticle.data?.cleaningStatus === 'done';

          const exported = await window.api.opml.export();
          const imported = await window.api.opml.import();
          report.phase2.checks.opmlRoundTrip = exported.success && exported.data === true &&
            imported.success && imported.data !== null &&
            imported.data?.feedsSkipped === 1 && imported.data?.feedsImported === 0;

          const deleted = await window.api.feed.delete(created.data.id);
          report.phase2.checks.deleteFeed = deleted.success;
          report.phase2.ok = Object.values(report.phase2.checks).every(function(value) {
            return value;
          });
        } catch (error) {
          report.phase2.error = String(error);
        }
        return JSON.stringify(report);
      })()
    `;
  } else if (smokeV2) {
    // Phase 2.3 smoke: test feed/article/sync CRUD via IPC
    probe = `
      (async () => {
        const report = { db: { ok: false, error: null, checks: {} } };

        try {
          // 1) create feed
          const f1 = await window.api.feed.create({ url: 'https://smoke-test.example.com/rss', title: 'SmokeFeed' });
          report.db.checks.createFeed = f1.success && !!f1.data?.id;

          // 2) list feeds
          const fl = await window.api.feed.list();
          report.db.checks.listFeeds = fl.success && fl.data?.length >= 1;

          // 3) duplicate feed (idempotent)
          const f2 = await window.api.feed.create({ url: 'https://smoke-test.example.com/rss' });
          report.db.checks.dupFeed = f2.success && f2.data?.id === f1.data?.id;

          // 4) get feed
          const fg = await window.api.feed.get(f1.data.id);
          report.db.checks.getFeed = fg.success && fg.data?.title === 'SmokeFeed';

          // 5) list articles (should be empty but success)
          const al = await window.api.article.list({});
          report.db.checks.listArticlesEmpty = al.success && Array.isArray(al.data?.items);

          // 6) settings still works
          const s = await window.api.settings.get();
          report.db.checks.settings = s.success;

          // 7) update feed
          const fu = await window.api.feed.update(f1.data.id, { title: 'SmokeFeedUpdated' });
          report.db.checks.updateFeed = fu.success && fu.data?.title === 'SmokeFeedUpdated';

          // 8) delete feed (also deletes its articles)
          const fd = await window.api.feed.delete(f1.data.id);
          report.db.checks.deleteFeed = fd.success;

          report.db.ok = Object.values(report.db.checks).every(function(v) { return v; });
        } catch(e) {
          report.db.error = String(e);
        }
        return JSON.stringify(report);
      })()
    `;
  } else if (smokeUI) {
    // Phase 2.1 smoke: verify three-pane layout + click interaction + theme switch
    probe = `
      (async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const report = { ui: { ok: false, error: null, checks: {} } };

        try {
          // 1) 三栏 layout 节点都存在
          const main = document.querySelector('.app-main');
          const sidebar = document.querySelector('.pane-feeds');
          const list = document.querySelector('.pane-list');
          const reader = document.querySelector('.pane-reader');
          report.ui.checks.layoutRendered = !!(main && sidebar && list && reader);

          // 2) 三栏宽度加起来约等于 main 宽度（容差 2px）
          if (main && sidebar && list && reader) {
            const sumW = sidebar.offsetWidth + list.offsetWidth + reader.offsetWidth;
            const mainW = main.offsetWidth;
            report.ui.checks.paneWidths = Math.abs(sumW - mainW) <= 2;
            report.ui.checks.paneSum = sumW;
            report.ui.checks.mainW = mainW;
          }

          // 3) 订阅源侧栏渲染了 ≥ 1 个 FeedList 按钮
          const feedButtons = document.querySelectorAll('.feed-list__item');
          report.ui.checks.feedButtonsCount = feedButtons.length;
          report.ui.checks.feedButtonsOk = feedButtons.length >= 5;

          // 4) 文章列表有 ≥ 1 个 article-list__item
          const articleButtons = document.querySelectorAll('.article-list__item');
          report.ui.checks.articleButtonsCount = articleButtons.length;
          report.ui.checks.articleButtonsOk = articleButtons.length >= 5;

          // 5) 点击第一篇文章
          const firstArticleTitle = articleButtons[0]?.querySelector('.article-list__article-title')?.textContent;
          if (articleButtons[0]) {
            articleButtons[0].click();
            await sleep(300);
            const readerTitle = document.querySelector('.article-reader__title')?.textContent;
            report.ui.checks.clickSelectsArticle = readerTitle && firstArticleTitle && readerTitle.trim() === firstArticleTitle.trim();
            report.ui.checks.readerTitle = readerTitle ?? null;
            report.ui.checks.clickedTitle = firstArticleTitle ?? null;
          } else {
            report.ui.checks.clickSelectsArticle = false;
          }

          // 6) 主题切换：找到 ☾ 按钮（dark）点击
          const themeButtons = document.querySelectorAll('.theme-toggle__btn');
          let darkBtn = null;
          themeButtons.forEach((b) => { if (b.title === '深色') darkBtn = b; });
          if (darkBtn) {
            darkBtn.click();
            await sleep(100);
            report.ui.checks.themeAfterDark = document.documentElement.getAttribute('data-theme');
          } else {
            report.ui.checks.themeAfterDark = 'no-button';
          }

          // 7) 点回 system
          let systemBtn = null;
          themeButtons.forEach((b) => { if (b.title === '跟随系统') systemBtn = b; });
          if (systemBtn) {
            systemBtn.click();
            await sleep(100);
            report.ui.checks.themeAfterSystem = document.documentElement.getAttribute('data-theme');
          }

          // OK 判定：列出要校验为 boolean 的字段
          const boolChecks = [
            'layoutRendered', 'paneWidths', 'feedButtonsOk', 'articleButtonsOk',
            'clickSelectsArticle'
          ];
          const themeChecks = ['themeAfterDark', 'themeAfterSystem'];
          const boolOk = boolChecks.every((k) => report.ui.checks[k] === true);
          const themeOk = themeChecks.every((k) => {
            const v = report.ui.checks[k];
            return v === 'light' || v === 'dark';
          });
          report.ui.ok = boolOk && themeOk;
        } catch (e) {
          report.ui.error = String(e);
        }
        return JSON.stringify(report);
      })()
    `;
  } else {
    // Phase 1.1 smoke: contextIsolation + minimal IPC
    probe = `
      (async () => {
        const out = {
          isolation: {
            hasRequire: typeof window.require !== 'undefined',
            hasProcess: typeof window.process !== 'undefined',
            hasModule:  typeof window.module  !== 'undefined',
            hasBuffer:  typeof window.Buffer  !== 'undefined'
          },
          ipc: { ok: false, error: null, sample: null }
        };
        try {
          const r = await window.api.settings.get();
          out.ipc.ok = r.success;
          out.ipc.sample = r.success ? { lang: r.data.language, theme: r.data.theme } : r.error;
        } catch (e) {
          out.ipc.error = String(e);
        }
        return JSON.stringify(out);
      })()
    `;
  }

  try {
    const raw = await win.webContents.executeJavaScript(probe);
    console.log(`SMOKE_REPORT_JSON ${raw}`);

    let pass: boolean;
    if (smokePhase2) {
      pass = raw.includes('"phase2":{"ok":true');
    } else if (smokeV2) {
      pass = raw.includes('"db":{"ok":true');
    } else if (smokeUI) {
      pass = raw.includes('"ui":{"ok":true');
    } else {
      pass =
        !raw.includes('"hasRequire":true') &&
        !raw.includes('"hasProcess":true') &&
        !raw.includes('"hasModule":true') &&
        !raw.includes('"hasBuffer":true') &&
        raw.includes('"ipc":{"ok":true');
    }

    console.log(pass ? 'SMOKE_REPORT_PASS' : 'SMOKE_REPORT_FAIL');
  } catch (err) {
    console.log(`SMOKE_REPORT_ERROR ${String(err)}`);
    console.log('SMOKE_REPORT_FAIL');
  } finally {
    setTimeout(() => app.quit(), 50);
  }
}

// ============================================================
// IPC handler 注册
// ============================================================

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function fail(code: string, message: string, detail?: string): IpcResult<never> {
  return { success: false, error: { code, message, detail } };
}

type MainIpcHandler = Parameters<typeof ipcMain.handle>[1];

function registerTrustedHandler(
  channel: string,
  trustedRendererUrl: string,
  handler: MainIpcHandler
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedRendererUrl(event.senderFrame?.url ?? '', trustedRendererUrl)) {
      return fail('UNTRUSTED_IPC_SENDER', '拒绝来自非应用页面的请求');
    }
    return handler(event, ...args);
  });
}

function registerIpcHandlers(trustedRendererUrl: string): void {
  const trustedIpcMain = {
    handle: (channel: string, handler: MainIpcHandler): void => {
      registerTrustedHandler(channel, trustedRendererUrl, handler);
    }
  };

  // ============= Feed =============

  trustedIpcMain.handle(IPC_CHANNELS.FEED_LIST, async (): Promise<IpcResult<Feed[]>> => {
    try {
      return ok(FeedRepository.list());
    } catch (e) {
      return fail('FEED_LIST_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.FEED_GET, async (_, args): Promise<IpcResult<Feed>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const feed = FeedRepository.getById(args.id);
      if (!feed) return fail('NOT_FOUND', `订阅源 ${args.id} 不存在`);
      return ok(feed);
    } catch (e) {
      return fail('FEED_GET_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.FEED_CREATE, async (_, args): Promise<IpcResult<Feed>> => {
    try {
      const input = args?.input as FeedCreateInput | undefined;
      if (!input?.url) return fail('INVALID_PARAMS', '缺少 url');
      return ok(FeedRepository.create(input));
    } catch (e) {
      return fail('FEED_CREATE_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.FEED_UPDATE, async (_, args): Promise<IpcResult<Feed>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const input = args?.input as FeedUpdateInput | undefined;
      if (!input) return fail('INVALID_PARAMS', '缺少 input');
      const feed = FeedRepository.update(args.id, input);
      if (!feed) return fail('NOT_FOUND', `订阅源 ${args.id} 不存在`);
      return ok(feed);
    } catch (e) {
      return fail('FEED_UPDATE_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.FEED_DELETE, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      FeedRepository.delete(args.id);
      return ok(undefined);
    } catch (e) {
      return fail('FEED_DELETE_FAILED', String(e));
    }
  });

  // ============= Article =============

  trustedIpcMain.handle(IPC_CHANNELS.ARTICLE_LIST, async (_, args): Promise<IpcResult<{ items: Article[]; total: number }>> => {
    try {
      const filter = (args?.filter ?? {}) as ArticleFilter;
      return ok(ArticleRepository.list(filter));
    } catch (e) {
      return fail('ARTICLE_LIST_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.ARTICLE_GET, async (_, args): Promise<IpcResult<Article>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const article = ArticleRepository.getById(args.id);
      if (!article) return fail('NOT_FOUND', `文章 ${args.id} 不存在`);
      return ok(article);
    } catch (e) {
      return fail('ARTICLE_GET_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.ARTICLE_MARK_READ, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      ArticleRepository.markRead(args.id, !!args.isRead);
      return ok(undefined);
    } catch (e) {
      return fail('ARTICLE_MARK_READ_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.ARTICLE_MARK_STARRED, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      ArticleRepository.markStarred(args.id, !!args.isStarred);
      return ok(undefined);
    } catch (e) {
      return fail('ARTICLE_MARK_STARRED_FAILED', String(e));
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.ARTICLE_BATCH_MARK_READ, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.ids?.length) return fail('INVALID_PARAMS', '缺少 ids');
      ArticleRepository.batchMarkRead(args.ids, !!args.isRead);
      return ok(undefined);
    } catch (e) {
      return fail('ARTICLE_BATCH_MARK_READ_FAILED', String(e));
    }
  });

  // ============= Settings (Phase 1.1 已有，保持兼容) =============

  trustedIpcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<IpcResult<AppSettings>> => {
    return ok(DEFAULT_SETTINGS);
  });

  trustedIpcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, args): Promise<IpcResult<AppSettings>> => {
    // Phase 3 接入 SQLite 持久化设置
    const partial = args?.settings as Partial<AppSettings> | undefined;
    return ok({ ...DEFAULT_SETTINGS, ...partial });
  });
}

function smokeOpmlPath(): string | null {
  if (process.env['JUHE_SHIVI_SMOKE_PHASE2'] !== '1') return null;
  const value = process.env['JUHE_SHIVI_SMOKE_OPML_PATH']?.trim();
  return value || null;
}

async function selectOpmlImportPath(event: IpcMainInvokeEvent): Promise<string | null> {
  if (process.env['JUHE_SHIVI_SMOKE_PHASE2'] === '1') return smokeOpmlPath();

  const options: OpenDialogOptions = {
    title: '导入 OPML 订阅',
    properties: ['openFile'],
    filters: [
      { name: 'OPML', extensions: ['opml', 'xml'] }
    ]
  };
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function selectOpmlExportPath(event: IpcMainInvokeEvent): Promise<string | null> {
  if (process.env['JUHE_SHIVI_SMOKE_PHASE2'] === '1') return smokeOpmlPath();

  const options: SaveDialogOptions = {
    title: '导出 OPML 订阅',
    defaultPath: path.join(app.getPath('documents'), 'subscriptions.opml'),
    filters: [
      { name: 'OPML', extensions: ['opml'] }
    ]
  };
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? null : result.filePath ?? null;
}

// ============================================================
// App 生命周期
// ============================================================

app.whenReady().then(async () => {
  await initDatabase();
  runMigrations();

  const trustedRendererUrl = getTrustedRendererUrl();
  registerIpcHandlers(trustedRendererUrl);
  const contentPipelineStore = new SqliteContentPipelineStore();
  disposeContentPipelineIpc = registerContentPipelineIpc({
    sync: new SyncService(contentPipelineStore),
    content: new ArticleContentService(contentPipelineStore),
    opml: new OpmlApplicationService(contentPipelineStore)
  }, {
    trustedRendererUrl,
    selectOpmlImportPath,
    selectOpmlExportPath
  });
  await createMainWindow(trustedRendererUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(trustedRendererUrl);
    }
  });
});

app.on('will-quit', () => {
  disposeContentPipelineIpc?.();
  disposeContentPipelineIpc = null;
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
