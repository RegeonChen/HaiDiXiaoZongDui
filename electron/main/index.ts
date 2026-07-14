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
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migration.js';
import { FeedRepository } from './db/feed-repository.js';
import { ArticleRepository } from './db/article-repository.js';
import { IPC_CHANNELS, type IpcResult } from '../../shared/ipc.js';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Feed,
  type FeedCreateInput,
  type FeedUpdateInput,
  type Article,
  type ArticleFilter,
  type SyncResult,
  type SyncProgress
} from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 窗口创建
// ============================================================

async function createMainWindow(): Promise<void> {
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  if (process.env['JUHE_SHIVI_SMOKE'] === '1') {
    void runSmokeTest(win);
  }
}

// ============================================================
// 烟雾测试
// ============================================================

async function runSmokeTest(win: BrowserWindow): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  // Smoke mode 2.3 or 1.1 — determined by env
  const smokeV2 = process.env['JUHE_SHIVI_SMOKE_V2'] === '1';
  let probe: string;

  if (smokeV2) {
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
    if (smokeV2) {
      pass = raw.includes('"db":{"ok":true');
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

function registerIpcHandlers(): void {
  // ============= Feed =============

  ipcMain.handle(IPC_CHANNELS.FEED_LIST, async (): Promise<IpcResult<Feed[]>> => {
    try {
      return ok(FeedRepository.list());
    } catch (e) {
      return fail('FEED_LIST_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.FEED_GET, async (_, args): Promise<IpcResult<Feed>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const feed = FeedRepository.getById(args.id);
      if (!feed) return fail('NOT_FOUND', `订阅源 ${args.id} 不存在`);
      return ok(feed);
    } catch (e) {
      return fail('FEED_GET_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.FEED_CREATE, async (_, args): Promise<IpcResult<Feed>> => {
    try {
      const input = args?.input as FeedCreateInput | undefined;
      if (!input?.url) return fail('INVALID_PARAMS', '缺少 url');
      return ok(FeedRepository.create(input));
    } catch (e) {
      return fail('FEED_CREATE_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.FEED_UPDATE, async (_, args): Promise<IpcResult<Feed>> => {
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

  ipcMain.handle(IPC_CHANNELS.FEED_DELETE, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      FeedRepository.delete(args.id);
      return ok(undefined);
    } catch (e) {
      return fail('FEED_DELETE_FAILED', String(e));
    }
  });

  // ============= Article =============

  ipcMain.handle(IPC_CHANNELS.ARTICLE_LIST, async (_, args): Promise<IpcResult<{ items: Article[]; total: number }>> => {
    try {
      const filter = (args?.filter ?? {}) as ArticleFilter;
      return ok(ArticleRepository.list(filter));
    } catch (e) {
      return fail('ARTICLE_LIST_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARTICLE_GET, async (_, args): Promise<IpcResult<Article>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const article = ArticleRepository.getById(args.id);
      if (!article) return fail('NOT_FOUND', `文章 ${args.id} 不存在`);
      return ok(article);
    } catch (e) {
      return fail('ARTICLE_GET_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARTICLE_MARK_READ, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      ArticleRepository.markRead(args.id, !!args.isRead);
      return ok(undefined);
    } catch (e) {
      return fail('ARTICLE_MARK_READ_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARTICLE_MARK_STARRED, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      ArticleRepository.markStarred(args.id, !!args.isStarred);
      return ok(undefined);
    } catch (e) {
      return fail('ARTICLE_MARK_STARRED_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARTICLE_BATCH_MARK_READ, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.ids?.length) return fail('INVALID_PARAMS', '缺少 ids');
      ArticleRepository.batchMarkRead(args.ids, !!args.isRead);
      return ok(undefined);
    } catch (e) {
      return fail('ARTICLE_BATCH_MARK_READ_FAILED', String(e));
    }
  });

  // ============= Sync =============

  ipcMain.handle(IPC_CHANNELS.SYNC_FEED, async (_, args): Promise<IpcResult<SyncResult>> => {
    try {
      if (!args?.feedId) return fail('INVALID_PARAMS', '缺少 feedId');
      // 当前阶段：Sync 的实际拉取逻辑由张宇凡在 Task 2.2 实现。
      // 这里只提供一个占位 handler，让 feed:* 和 article:* 通道先行可用。
      // 张宇凡完成 Task 2.2 后可以注入 SyncService 替换此逻辑。
      const now = new Date().toISOString();
      FeedRepository.recordSync(args.feedId, false, '同步服务尚未实现（Task 2.2 待完成）');
      const result: SyncResult = {
        feedId: args.feedId,
        success: false,
        error: '同步服务尚未实现（Task 2.2 待完成）',
        newArticles: 0,
        updatedArticles: 0,
        startedAt: now,
        finishedAt: now
      };
      return ok(result);
    } catch (e) {
      return fail('SYNC_FEED_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_ALL, async (): Promise<IpcResult<SyncResult[]>> => {
    try {
      return ok([]);
    } catch (e) {
      return fail('SYNC_ALL_FAILED', String(e));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_PROGRESS, async (): Promise<IpcResult<SyncProgress>> => {
    try {
      return ok({ totalFeeds: 0, completedFeeds: 0, results: [] });
    } catch (e) {
      return fail('SYNC_PROGRESS_FAILED', String(e));
    }
  });

  // ============= Settings (Phase 1.1 已有，保持兼容) =============

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<IpcResult<AppSettings>> => {
    return ok(DEFAULT_SETTINGS);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, args): Promise<IpcResult<AppSettings>> => {
    // Phase 3 接入 SQLite 持久化设置
    const partial = args?.settings as Partial<AppSettings> | undefined;
    return ok({ ...DEFAULT_SETTINGS, ...partial });
  });
}

// ============================================================
// App 生命周期
// ============================================================

app.whenReady().then(async () => {
  await initDatabase();
  runMigrations();

  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
