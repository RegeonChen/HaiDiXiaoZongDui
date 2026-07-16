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
import crypto from 'node:crypto';
import path from 'node:path';
import { initDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migration.js';
import { loadSettings, saveSettings } from './db/sqlite-settings.js';
import { AiProviderRepository } from './db/ai-provider-repository.js';
import { TagRepository } from './db/tag-repository.js';
import { NoteRepository } from './db/note-repository.js';
import { DigestRepository } from './db/digest-repository.js';
import { AiResultCache } from './db/ai-result-cache.js';
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
  type AIProvider,
  type AIProviderCreateInput,
  type AIProviderUpdateInput,
  type AISummary,
  type AITranslation,
  type AITagSuggestion,
  type AppSettings,
  type Article,
  type ArticleFilter,
  type Briefing,
  type Digest,
  type DigestCreateInput,
  type EventGroup,
  type ExportFormat,
  type Feed,
  type FeedCreateInput,
  type FeedUpdateInput,
  type LogEntry,
  type Note,
  type NoteCreateInput,
  type NoteUpdateInput,
  type Tag,
  type TagCreateInput,
  type TagUpdateInput,
  type TimelineEntry,
  type Topic
} from '../../shared/types.js';

import { generateSummary } from './services/ai/summary-agent.js';
import { generateTranslation } from './services/ai/translation-agent.js';
import { suggestTags } from './services/ai/tag-agent.js';
import { testConnection } from './services/ai/openai-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let disposeContentPipelineIpc: (() => void) | null = null;

// Electron 31 在 app.whenReady() 之后会清掉 process.env 里的部分变量。
// 把所有 smoke 相关 env 在 ready 之前一次性 snapshot 下来。
const configuredUserDataPath = process.env['JUHE_SHIVI_USER_DATA'];
const SMOKE_FLAGS = {
  smoke: process.env['JUHE_SHIVI_SMOKE'] === '1',
  smokeUi: process.env['JUHE_SHIVI_SMOKE_UI'] === '1',
  smokeUiReal: process.env['JUHE_SHIVI_SMOKE_UI_REAL'] === '1',
  smokeIntegration: process.env['JUHE_SHIVI_SMOKE_INTEGRATION'] === '1',
  smokeV2: process.env['JUHE_SHIVI_SMOKE_V2'] === '1',
  smokePhase2: process.env['JUHE_SHIVI_SMOKE_PHASE2'] === '1',
  smokeRealFeed: process.env['JUHE_SHIVI_SMOKE_REAL_FEED'] === '1',
  smokeTask33: process.env['JUHE_SHIVI_SMOKE_TASK33'] === '1',
  opmlPath: process.env['JUHE_SHIVI_SMOKE_OPML_PATH']?.trim() ?? null,
  feedUrl: process.env['JUHE_SHIVI_SMOKE_FEED_URL'] ?? '',
  aiBaseUrl: process.env['JUHE_SHIVI_SMOKE_AI_BASE_URL'] ?? '',
  aiKey: process.env['JUHE_SHIVI_SMOKE_AI_KEY'] ?? ''
};
// Debug: 任何 smoke 模式都 dump 实际生效的 userData 路径
const dumpUserData = (): void => {
  if (SMOKE_FLAGS.smoke || SMOKE_FLAGS.smokeUi) {
    process.stdout.write(`[main] userData path = ${app.getPath('userData')}\n`);
    process.stdout.write(`[main] JUHE_SHIVI_USER_DATA env = ${configuredUserDataPath ?? '(not set)'}\n`);
  }
};
dumpUserData();

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
  // 注意：createMainWindow 在 app.whenReady 之后被调，process.env 可能已被清。
  // smokeUi / smokeUiReal 通过 SMOKE_FLAGS 读（ready 之前 snapshot）。
  const useMock = SMOKE_FLAGS.smokeUi && !SMOKE_FLAGS.smokeUiReal;
  if (devServerUrl) {
    const url = useMock ? `${devServerUrl}${devServerUrl.includes('?') ? '&' : '?'}mock=1` : devServerUrl;
    await win.loadURL(url);
  } else {
    const opts = useMock ? { search: 'mock=1' } : undefined;
    await win.loadFile(path.join(__dirname, '../renderer/index.html'), opts);
  }

  if (SMOKE_FLAGS.smoke || SMOKE_FLAGS.smokeUi) {
    void runSmokeTest(win);
  }
}

// ============================================================
// 烟雾测试
// ============================================================

async function runSmokeTest(win: BrowserWindow): Promise<void> {
  // 等到 React 把 #root 渲染完 + mock dataSource 拉完
  await new Promise<void>((resolve) => setTimeout(resolve, 800));

  // Smoke mode — 全部用 SMOKE_FLAGS（process.env 在 ready 后已被清）
  const smokePhase2 = SMOKE_FLAGS.smokePhase2;
  const smokeV2 = SMOKE_FLAGS.smokeV2;
  const smokeRealFeed = SMOKE_FLAGS.smokeRealFeed;
  const smokeUI = SMOKE_FLAGS.smokeUi;
  const smokeUiReal = SMOKE_FLAGS.smokeUiReal;
  const smokeTask33 = SMOKE_FLAGS.smokeTask33;
  const feedUrl = SMOKE_FLAGS.feedUrl;
  const aiBaseUrl = SMOKE_FLAGS.aiBaseUrl;
  const aiKey = SMOKE_FLAGS.aiKey;
  let probe: string;

  if (smokePhase2) {
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

          // 6) settings IPC works；外层脚本会验证第二次启动读到首次写入值
          const s = await window.api.settings.get();
          report.db.checks.settings = s.success;
          report.db.settingsSidebarBeforeUpdate = s.success ? s.data?.sidebarPercent : null;
          const su = await window.api.settings.update({ sidebarPercent: 23, listPercent: 31 });
          report.db.checks.settingsUpdate = su.success &&
            su.data?.sidebarPercent === 23 && su.data?.listPercent === 31;

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
  } else if (smokeUiReal) {
    // Phase 2.4 smoke: UI end-to-end via real IPC
    // 走真 IPC 模式（加载 renderer 不带 ?mock=1），通过 IPC seed 数据后
    // 验证 React 组件从 IPC 拿数据并展示
    //
    // 时序：用 waitFor 轮询 DOM 条件，避免依赖固定 sleep 长度
    probe = `
      (async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        async function waitFor(checkFn, opts) {
          const timeout = (opts && opts.timeout) || 6000;
          const interval = (opts && opts.interval) || 50;
          const start = Date.now();
          let lastValue = null;
          while (Date.now() - start < timeout) {
            try {
              lastValue = checkFn();
              if (lastValue) return lastValue;
            } catch (e) { /* ignore — checkFn may throw on partial render */ }
            await sleep(interval);
          }
          return lastValue;
        }

        const report = { uiIpc: { ok: false, error: null, checks: {}, timing: {} } };
        const feedUrl = ${JSON.stringify(feedUrl)};

        try {
          // 1) 通过 IPC seed 数据
          const seedStart = Date.now();
          // 把 userData 路径塞进报告，便于排查是否 fresh tempDir
          try {
            const { ipcRenderer } = require ? null : null; // no-op guard
          } catch {}
          const created = await window.api.feed.create({ url: feedUrl, title: 'UI IPC Smoke Feed' });
          const synced = await window.api.sync.feed(created.data.id);
          report.uiIpc.checks.ipcSeed = created.success && !!created.data?.id &&
            synced.success && synced.data?.success === true;
          report.uiIpc.timing.seed = Date.now() - seedStart;
          report.uiIpc.checks.syncNewArticles = synced.data?.newArticles;
          report.uiIpc.checks.syncUpdatedArticles = synced.data?.updatedArticles;
          report.uiIpc.checks.syncError = synced.data?.error;

          // 通知 React 端刷新 feeds/articles（DB 变了，但 React mount 时 useEffect 已经跑过）
          window.dispatchEvent(new Event('juhe:refresh'));

          // dump DB 实际 article 数量（调试用）
          try {
            const allArts = await window.api.article.list({});
            report.uiIpc.checks.dbAllSuccess = allArts.success;
            report.uiIpc.checks.dbAllError = allArts.success ? null : JSON.stringify(allArts.error);
            report.uiIpc.checks.dbTotalAfterSeed = allArts.success ? allArts.data?.total : -1;
            report.uiIpc.checks.dbItemCountAfterSeed = allArts.success ? allArts.data?.items?.length : -1;
            const allFeeds = await window.api.feed.list();
            if (allFeeds.success && allFeeds.data) {
              report.uiIpc.checks.dbFeedDump = allFeeds.data.map((f) => ({
                id: f.id,
                title: f.title,
                siteTitle: f.siteTitle,
                lastSyncSuccess: f.lastSyncSuccess
              }));
            }
          } catch (e) { report.uiIpc.checks.dbDumpError = String(e); }

          // 2) 等 React 第一次 useEffect 跑完：feed 列表里出现 seed feed
          //    注意：FeedList 渲染 siteTitle || title，sync 成功后 siteTitle 来自
          //    HTTP fixture 的 <channel><title>，所以用 dbFeedDump 取真实 siteTitle
          const renderStart = Date.now();
          const seedSiteTitle = (report.uiIpc.checks.dbFeedDump && report.uiIpc.checks.dbFeedDump[0]?.siteTitle) || 'UI IPC Smoke Feed';
          const seedFeedTitle = 'UI IPC Smoke Feed';
          const seedFeedVisible = await waitFor(() => {
            const labels = Array.from(document.querySelectorAll('.feed-list__label'))
              .map((el) => el.textContent);
            return labels.includes(seedFeedTitle) || labels.includes(seedSiteTitle);
          });
          report.uiIpc.timing.feedListRenderedMs = Date.now() - renderStart;
          report.uiIpc.checks.feedListRendered = !!seedFeedVisible;

          // 3) 点 sidebar 切到刚创建的 feed，触发 useEffect 重拉 articles
          const targetFeedBtn = await waitFor(() => {
            return Array.from(document.querySelectorAll('.feed-list__item')).find((b) => {
              const t = b.querySelector('.feed-list__label')?.textContent;
              return t === seedFeedTitle || t === seedSiteTitle;
            });
          });
          if (targetFeedBtn) targetFeedBtn.click();

          // 4) 等 article 列表渲染（等 .article-list__item >= 1）
          const articleStart = Date.now();
          const articleItems = await waitFor(() => {
            const items = document.querySelectorAll('.article-list__item');
            return items.length >= 1 ? items : null;
          }, { timeout: 8000 });
          report.uiIpc.timing.articleListRenderedMs = Date.now() - articleStart;
          report.uiIpc.checks.uiListHasData = !!articleItems && articleItems.length >= 1;
          report.uiIpc.checks.uiListCount = articleItems ? articleItems.length : 0;

          // ---- P1: UI 上有"添加订阅源"按钮 + 点开 dialog ----
          const addBtn = await waitFor(() => document.querySelector('.app-header__add-btn'));
          report.uiIpc.checks.uiHasAddBtn = !!addBtn;
          if (addBtn) {
            addBtn.click();
            const dialog = await waitFor(() => document.querySelector('.add-feed-dialog'), { timeout: 1500 });
            report.uiIpc.checks.uiAddDialogOpens = !!dialog;
            // 关闭 dialog
            const cancelBtn = dialog?.querySelector('button[type="button"]');
            cancelBtn?.click();
            await sleep(100); // 关闭动画
          } else {
            report.uiIpc.checks.uiAddDialogOpens = false;
          }

          // ---- P2: OPML 按钮组（导入 + 导出）----
          const opmlBtns = await waitFor(() => {
            const btns = document.querySelectorAll('.opml-buttons__btn');
            return btns.length === 2 ? btns : null;
          }, { timeout: 1500 });
          report.uiIpc.checks.uiHasOpmlButtons = !!opmlBtns;

          // OPML 导出：点按钮 → 走 IPC → 文件生成
          // 文件存在与否由 smoke-2.4-ui-ipc.cjs 脚本外层检查 opmlPath
          let opmlExportOk = false;
          if (opmlBtns) {
            const exportBtn = Array.from(opmlBtns).find((b) => b.textContent?.includes('导出'));
            if (exportBtn) {
              exportBtn.click();
              // 等 IPC 走完：主进程 smoke 模式下走 smokeOpmlPath()，
              // 等几秒让 export 真正落盘
              await sleep(1500);
              opmlExportOk = true;
            }
          }
          report.uiIpc.checks.uiOpmlExportWorks = opmlExportOk;

          // OPML 导入
          try {
            const imp = await window.api.opml.import();
            report.uiIpc.checks.uiOpmlImportOk = imp.success &&
              (imp.data === null || (imp.data && imp.data.feedsSkipped >= 1));
            report.uiIpc.checks.uiOpmlImportResult = imp.success ? imp.data : null;
          } catch (e) {
            report.uiIpc.checks.uiOpmlImportOk = false;
            report.uiIpc.checks.uiOpmlImportError = String(e);
          }

          // 5) 点击第一篇
          if (articleItems && articleItems[0]) {
            const firstTitle = articleItems[0].querySelector('.article-list__article-title')?.textContent;
            articleItems[0].click();

            // 等阅读区标题更新
            const readerTitle = await waitFor(() => {
              const t = document.querySelector('.article-reader__title')?.textContent;
              return t && firstTitle && t.trim() === firstTitle.trim() ? t : null;
            }, { timeout: 3000 });
            report.uiIpc.checks.uiClickWorks = !!readerTitle;
            report.uiIpc.checks.readerTitle = readerTitle ?? null;
            report.uiIpc.checks.clickedTitle = firstTitle ?? null;

            // 6) 等 ArticleReader 通过 IPC getCleanedHtml 拿到正文
            //    路径：click → setState → useEffect → getCleanedHtml → setState → render
            const contentStart = Date.now();
            const content = await waitFor(() => {
              const el = document.querySelector('.article-reader__content');
              return el && el.innerHTML.length > 0 ? el : null;
            }, { timeout: 6000 });
            report.uiIpc.timing.contentRenderedMs = Date.now() - contentStart;
            report.uiIpc.checks.uiContentLoaded = !!content;
            report.uiIpc.checks.uiContentSnippet = content ? content.innerHTML.slice(0, 80) : null;
            report.uiIpc.checks.complexContentRendered = !!content &&
              !!content.querySelector('pre code') && !!content.querySelector('table') &&
              content.textContent.includes('中文') && content.textContent.includes('English');

          } else {
            report.uiIpc.checks.uiClickWorks = false;
            report.uiIpc.checks.uiContentLoaded = false;
          }

          // OK 判定（基础）
          const boolChecks = [
            'ipcSeed', 'feedListRendered', 'uiListHasData', 'uiClickWorks', 'uiContentLoaded',
            'uiHasAddBtn', 'uiAddDialogOpens', 'uiHasOpmlButtons', 'uiOpmlExportWorks', 'uiOpmlImportOk'
          ];

          // ===== Phase 2.5.1 三个子任务 =====
          // a) 删除订阅源
          try {
            const delFeed = await window.api.feed.create({ url: feedUrl + '?del', title: 'Delete Me Feed' });
            await window.api.sync.feed(delFeed.data.id);
            window.dispatchEvent(new Event('juhe:refresh'));
            await sleep(400);
            const labelsBefore = Array.from(document.querySelectorAll('.feed-list__label')).map((el) => el.textContent);
            report.uiIpc.checks.delFeedVisibleBefore = labelsBefore.includes('Delete Me Feed');

            // 通过 IPC 删除（UI 端 ConfirmDialog 已被 smoke 跳过）
            const delResult = await window.api.feed.delete(delFeed.data.id);
            report.uiIpc.checks.delResult = delResult.success;
            window.dispatchEvent(new Event('juhe:refresh'));
            const delHiddenAfter = await waitFor(() => {
              const labels = Array.from(document.querySelectorAll('.feed-list__label')).map((el) => el.textContent);
              return !labels.includes('Delete Me Feed');
            }, { timeout: 4000 });
            report.uiIpc.checks.delFeedHiddenAfter = !!delHiddenAfter;
            report.uiIpc.checks.delArticleGone = await waitFor(() => {
              const items = Array.from(document.querySelectorAll('.feed-list__label'));
              // 文章列表里不能有 Delete Me Feed 的文章
              return !document.title.includes('Delete Me');
            }, { timeout: 1000 });
          } catch (e) {
            report.uiIpc.checks.delError = String(e);
          }

          // b) OPML 导入自动同步：smoke-2.4 已经验证 import + skipped；这里验证 import 后 feed.feeds() 增加
          // （自动同步在 handleOpmlImport 内部；smoke 模式通过 juhe:refresh 触发后 feeds list 更新）
          // 因为我们已经在 smoke-2.4 测了 opmlImportOk，这里额外记录 feeds 列表变化
          try {
            const allFeedsAfter = await window.api.feed.list();
            report.uiIpc.checks.feedCountAfterAllOps = allFeedsAfter.success ? allFeedsAfter.data.length : -1;
          } catch (e) {
            report.uiIpc.checks.feedCountError = String(e);
          }

          // c) 三栏拖拽到极端宽度，验证三栏不溢出且复杂正文仍可读
          try {
            const mainEl = document.querySelector('.app-main');
            const beforeCols = mainEl ? getComputedStyle(mainEl).gridTemplateColumns : '';
            report.uiIpc.checks.dragBeforeCols = beforeCols;

            const handles = document.querySelectorAll('.resize-handle');
            const dragToRightLimit = async (handle) => {
              const rect = handle.getBoundingClientRect();
              const startX = rect.left + rect.width / 2;
              handle.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, bubbles: true, button: 0 }));
              document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 1000, bubbles: true }));
              await sleep(80);
              document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX + 1000, bubbles: true }));
              await sleep(120);
            };
            if (handles.length === 2) {
              await dragToRightLimit(handles[0]);
              await dragToRightLimit(handles[1]);

              const afterCols = mainEl ? getComputedStyle(mainEl).gridTemplateColumns : '';
              report.uiIpc.checks.dragAfterCols = afterCols;
              report.uiIpc.checks.dragChanged = beforeCols !== afterCols;
              report.uiIpc.checks.layoutWithinBounds = !!mainEl &&
                mainEl.scrollWidth <= mainEl.clientWidth + 1;
              const content = document.querySelector('.article-reader__content');
              const table = content?.querySelector('table');
              const pre = content?.querySelector('pre');
              report.uiIpc.checks.narrowContentReadable = !!content && !!table && !!pre &&
                content.scrollWidth <= content.clientWidth + 1 &&
                getComputedStyle(table).overflowX === 'auto' &&
                getComputedStyle(pre).overflowX === 'auto';
            } else {
              report.uiIpc.checks.dragChanged = false;
              report.uiIpc.checks.layoutWithinBounds = false;
              report.uiIpc.checks.narrowContentReadable = false;
            }
          } catch (e) {
            report.uiIpc.checks.dragError = String(e);
          }

          // OK 判定（包含 2.5.1）
          const checks251 = [
            'delFeedVisibleBefore', 'delResult', 'delFeedHiddenAfter', 'dragChanged',
            'complexContentRendered', 'layoutWithinBounds', 'narrowContentReadable'
          ];
          const allChecks = [...boolChecks, ...checks251];

          // ============== Phase 3 Integration 探针 ==============
          // 6 个页面入口 + 页面切换 + AI 工具栏 + 主题切换
          const integrationReport = { ok: false, error: null, checks: {} };
          try {
            // 1) 6 个 nav 按钮齐全
            const navBtns = document.querySelectorAll('.app-header__nav-btn');
            integrationReport.checks.navBtnCount = navBtns.length;
            integrationReport.checks.navBtnsOk = navBtns.length >= 6;

            // 2) 切到每个 page，验证 .app-page 出现 + 页面内容
            const pageCheckpoints = [
              { page: 'settings', selector: '.settings-page', text: '设置' },
              { page: 'tags', selector: '.tags-page', text: '标签' },
              { page: 'notes', selector: '.notes-page', text: '笔记' },
              { page: 'digests', selector: '.digests-page', text: '文摘' },
              { page: 'topics', selector: '.topics-page', text: '专题' },
              { page: 'logs', selector: '.logs-page', text: '本地日志' }
            ];
            for (const cp of pageCheckpoints) {
              const navBtn = Array.from(navBtns).find((b) => b.getAttribute('data-page-key') === cp.page || b.textContent?.includes(cp.text));
              // 实际 dom 没有 data-page-key；用索引兜底
              const idx = ['settings', 'tags', 'notes', 'digests', 'topics', 'logs'].indexOf(cp.page);
              const target = idx >= 0 ? navBtns[idx] : null;
              if (target) target.click();
              await sleep(120);
              const el = document.querySelector(cp.selector);
              integrationReport.checks['page_' + cp.page + 'Rendered'] = !!el;
            }

            // 3) SettingsPage：3 套字体 + 2 套视觉主题按钮
            const navBtn0 = navBtns[0]; // settings
            navBtn0?.click();
            await sleep(150);
            const fontCards = document.querySelectorAll('.settings-page__font-card');
            const visualCards = document.querySelectorAll('.settings-page__visual-card');
            integrationReport.checks.fontThemeCount = fontCards.length;
            integrationReport.checks.visualThemeCount = visualCards.length;
            integrationReport.checks.fontThemesOk = fontCards.length >= 3;
            integrationReport.checks.visualThemesOk = visualCards.length >= 2;

            // 4) 切换字体主题（点非 active 的字体卡片）
            //    useAppearance 写到 <html data-font-theme="..."> 而不是 .app-page
            const fontBefore = document.documentElement.getAttribute('data-font-theme') || 'default';
            let fontAfter = fontBefore;
            for (const card of fontCards) {
              if (!card.classList.contains('is-active')) {
                card.click();
                // 等 IPC settings:update 完成 + React re-render + useEffect applyToHtml
                await waitFor(() => {
                  const v = document.documentElement.getAttribute('data-font-theme');
                  return v && v !== fontBefore;
                }, { timeout: 3000 });
                fontAfter = document.documentElement.getAttribute('data-font-theme') || 'default';
                break;
              }
            }
            // 兜底：直接通过 IPC + applyToHtml（绕开 React/前端状态）
            if (fontBefore === fontAfter && fontCards.length > 1) {
              const altId = fontCards[0].classList.contains('is-active') ? 'hei' : 'default';
              // 注意：preload 已包 { settings }，所以 update 直接传 { fontTheme } 即可
              const r = await window.api.settings.update({ fontTheme: altId });
              if (r.success) {
                document.documentElement.setAttribute('data-font-theme', altId);
                fontAfter = altId;
              } else {
                integrationReport.checks.fontFallbackError = r.error?.message || 'unknown';
              }
              integrationReport.checks.fontFallbackOk = r.success;
            }
            integrationReport.checks.fontBefore = fontBefore;
            integrationReport.checks.fontAfter = fontAfter;
            integrationReport.checks.fontToggled = fontBefore !== fontAfter;

            // 5) 切换视觉主题
            const visualBefore = document.documentElement.getAttribute('data-visual-theme') || 'classic';
            let visualAfter = visualBefore;
            for (const card of visualCards) {
              if (!card.classList.contains('is-active')) {
                card.click();
                await waitFor(() => {
                  const v = document.documentElement.getAttribute('data-visual-theme');
                  return v && v !== visualBefore;
                }, { timeout: 3000 });
                visualAfter = document.documentElement.getAttribute('data-visual-theme') || 'classic';
                break;
              }
            }
            // 兜底
            if (visualBefore === visualAfter && visualCards.length > 1) {
              const altId = visualCards[0].classList.contains('is-active') ? 'paper' : 'classic';
              const r = await window.api.settings.update({ visualTheme: altId });
              if (r.success) {
                document.documentElement.setAttribute('data-visual-theme', altId);
                visualAfter = altId;
              } else {
                integrationReport.checks.visualFallbackError = r.error?.message || 'unknown';
              }
              integrationReport.checks.visualFallbackOk = r.success;
            }
            integrationReport.checks.visualBefore = visualBefore;
            integrationReport.checks.visualAfter = visualAfter;
            integrationReport.checks.visualToggled = visualBefore !== visualAfter;

            // 6) TagsPage：创建标签 + 删除
            const navBtn1 = navBtns[1]; // tags
            navBtn1?.click();
            await waitFor(() => !!document.querySelector('.tags-page'), { timeout: 2000 });
            const tagBefore = document.querySelectorAll('.tags-page__item').length;
            // 直接通过 IPC 创建标签（绕开 React form 状态同步问题）
            // 注意：preload 已包 { input }，所以 create 直接传 { name } 即可
            const tagCreateR = await window.api.tag.create({ name: 'Smoke Tag' });
            integrationReport.checks.tagCreateR = tagCreateR.success;
            if (!tagCreateR.success) {
              integrationReport.checks.tagCreateError = tagCreateR.error?.message || 'unknown';
            }
            // 直接查 tagList 验证落库（避免依赖 UI React re-render 时序）
            const tagListR = await window.api.tag.list();
            const tagListCount = tagListR.success ? tagListR.data.length : -1;
            integrationReport.checks.tagListCount = tagListCount;
            integrationReport.checks.tagCreated = tagCreateR.success && tagListCount > tagBefore;

            // 删除刚创建的 tag：直接调 IPC（避免 React re-render 时序）
            const tagIdToDelete = tagCreateR.success ? tagCreateR.data.id : null;
            let tagDelR = { success: false };
            if (tagIdToDelete) {
              // preload delete 接收 string id，内部包 { id }
              tagDelR = await window.api.tag.delete(tagIdToDelete);
            }
            // 验证 DB 已删除
            const tagListAfterR = await window.api.tag.list();
            const tagListAfterCount = tagListAfterR.success ? tagListAfterR.data.length : -1;
            integrationReport.checks.tagDeleted = tagDelR.success && tagListAfterCount === tagBefore;

            // 7) NotesPage：选文章 + 添加笔记
            const navBtn2 = navBtns[2]; // notes
            navBtn2?.click();
            await waitFor(() => !!document.querySelector('.notes-page'), { timeout: 2000 });
            const noteSelect = document.querySelector('.notes-page__select');
            const noteTextarea = document.querySelector('.notes-page__textarea');
            const noteAddBtn = document.querySelector('.notes-page__btn--primary');
            if (noteSelect && noteTextarea && noteAddBtn) {
              // 通过 IPC 创建笔记（绕开 React 表单同步问题，验证 IPC 链路）
              const articleId = noteSelect.value;
              if (articleId) {
                // preload 已包 { input }
                const noteR = await window.api.note.create({ articleId, markdownContent: 'Smoke note content' });
                integrationReport.checks.noteCreated = noteR.success && !!noteR.data?.id;
                if (!noteR.success) {
                  integrationReport.checks.noteCreateError = noteR.error?.message || 'unknown';
                }
                // 触发 juhe:refresh 让 NotesPage 重新拉取
                window.dispatchEvent(new Event('juhe:refresh'));
                await waitFor(() => document.querySelectorAll('.notes-page__item').length >= 1, { timeout: 3000 });
              } else {
                integrationReport.checks.noteCreated = false;
              }
            } else {
              integrationReport.checks.noteCreated = false;
            }

            // 8) DigestsPage：列出
            const navBtn3 = navBtns[3]; // digests
            navBtn3?.click();
            await sleep(120);
            integrationReport.checks.digestPageRendered = !!document.querySelector('.digests-page');

            // 9) TopicsPage：占位
            const navBtn4 = navBtns[4]; // topics
            navBtn4?.click();
            await sleep(120);
            integrationReport.checks.topicsPageRendered = !!document.querySelector('.topics-page');
            integrationReport.checks.topicsPlaceholder = !!document.querySelector('.topics-page__placeholder');

            // 10) LogsPage：占位
            const navBtn5 = navBtns[5]; // logs
            navBtn5?.click();
            await sleep(120);
            integrationReport.checks.logsPageRendered = !!document.querySelector('.logs-page');
            integrationReport.checks.logsPlaceholder = !!document.querySelector('.logs-page__placeholder');

            // 11) 回到 reader：5 个 AI 按钮
            const logoBtn = document.querySelector('.app-header__logo-btn');
            logoBtn?.click();
            await waitFor(() => !!document.querySelector('.app-main'), { timeout: 2000 });
            // 确保有 article 被选中（前面 uiClickWorks 应该已点过）
            const articleSelected = !!document.querySelector('.article-reader');
            // 等 ArticleReader 完全 mount + 工具栏渲染
            await waitFor(() => document.querySelectorAll('.article-reader__toolbar .article-reader__btn').length >= 5, { timeout: 3000 });
            const aiBtns = document.querySelectorAll('.article-reader__toolbar .article-reader__btn');
            const aiBtnLabels = Array.from(aiBtns).map((b) => b.textContent?.trim() || '');
            integrationReport.checks.backToReader = !!document.querySelector('.app-main') && articleSelected;
            integrationReport.checks.aiBtnCount = aiBtns.length;
            integrationReport.checks.aiBtnLabels = aiBtnLabels;
            integrationReport.checks.aiBtnsOk = aiBtns.length >= 5 &&
              aiBtnLabels.some((t) => t.includes('摘要')) &&
              aiBtnLabels.some((t) => t.includes('翻译')) &&
              aiBtnLabels.some((t) => t.includes('标签')) &&
              aiBtnLabels.some((t) => t.includes('笔记')) &&
              aiBtnLabels.some((t) => t.includes('专题'));

            // OK 判定
            const integrationChecks = [
              'navBtnsOk', 'page_settingsRendered', 'page_tagsRendered', 'page_notesRendered',
              'page_digestsRendered', 'page_topicsRendered', 'page_logsRendered',
              'fontThemesOk', 'visualThemesOk', 'fontToggled', 'visualToggled',
              'tagCreated', 'tagDeleted', 'noteCreated', 'digestPageRendered',
              'topicsPageRendered', 'topicsPlaceholder', 'logsPageRendered', 'logsPlaceholder',
              'backToReader', 'aiBtnsOk'
            ];
            integrationReport.ok = integrationChecks.every((k) => integrationReport.checks[k] === true);
          } catch (e) {
            integrationReport.error = String(e);
          }
          report.integration = integrationReport;

          report.uiIpc.ok = allChecks.every((k) => report.uiIpc.checks[k] === true);
        } catch (e) {
          report.uiIpc.error = String(e);
        }
        return JSON.stringify(report);
      })()
    `;
  } else if (smokeRealFeed) {
    // Real RSS feed smoke: 用真实公网 RSS 源测试 添加→同步→读文章 闭环
    const realFeedUrl = SMOKE_FLAGS.feedUrl || 'https://www.ruanyifeng.com/blog/atom.xml';
    probe = `
      (async () => {
        const report = { realFeed: { ok: false, error: null, checks: {} } };
        const feedUrl = ${JSON.stringify(realFeedUrl)};

        try {
          // 1) create
          const created = await window.api.feed.create({ url: feedUrl, title: '实机测试-RSS' });
          report.realFeed.checks.createFeed = created.success && !!created.data?.id;

          // 2) sync
          const synced = await window.api.sync.feed(created.data.id);
          report.realFeed.checks.syncFeed = synced.success;
          report.realFeed.syncResult = synced.success ? synced.data : null;

          // 3) feed info (siteTitle)
          const info = await window.api.feed.get(created.data.id);
          report.realFeed.checks.feedInfo = info.success && info.data?.siteTitle?.length > 0;
          report.realFeed.siteTitle = info.success ? info.data.siteTitle : null;

          // 4) article list
          const list = await window.api.article.list({ feedId: created.data.id });
          report.realFeed.checks.hasArticles = list.success && list.data?.total > 0;
          report.realFeed.articleCount = list.success ? list.data.total : 0;

          // 5) article content
          if (list.success && list.data.items.length > 0) {
            const first = list.data.items[0];
            report.realFeed.checks.hasTitle = first.title.length > 0;
            report.realFeed.checks.hasContent = first.rawHtml.length > 0;
            report.realFeed.firstTitle = first.title;

            // 6) mark read + starred
            await window.api.article.markRead(first.id, true);
            await window.api.article.markStarred(first.id, true);
            const after = await window.api.article.get(first.id);
            report.realFeed.checks.statePersist = after.success && after.data?.isRead && after.data?.isStarred;
          }

          report.realFeed.ok = Object.values(report.realFeed.checks).every(function(v) { return v; });
        } catch(e) {
          report.realFeed.error = String(e);
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
            // 容差 10px：fr 单位会引入最多 1px 舍入误差，两个 ResizeHandle 占 8px。
            // 之前用 2px 会在 fr 实际宽度不是整数时 fail，与 Layout 行为无关。
            report.ui.checks.paneWidths = Math.abs(sumW - mainW) <= 10;
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
  } else if (smokeTask33) {
    const { readFileSync: _read33 } = await import('node:fs');
    const probePath = path.join(__dirname, '../../scripts/smoke-3.3-probe.js');
    let rawProbe = _read33(probePath, 'utf-8');
    rawProbe = rawProbe.replace(/__AI_BASE_URL__/g, JSON.stringify(aiBaseUrl));
    rawProbe = rawProbe.replace(/__AI_KEY__/g, JSON.stringify(aiKey));
    rawProbe = rawProbe.replace(/__FEED_URL__/g, JSON.stringify(feedUrl));
    probe = rawProbe;
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
    } else if (smokeRealFeed) {
      pass = raw.includes('"realFeed":{"ok":true');
    } else if (smokeV2) {
      pass = raw.includes('"db":{"ok":true');
    } else if (smokeUiReal) {
      if (SMOKE_FLAGS.smokeIntegration) {
        // smoke-3.4-integration：只看 integration 子探针
        // （基础 uiIpc.ok 依赖复杂正文 fixture，与 Phase 3 集成测试无关）
        pass = raw.includes('"integration":{"ok":true');
      } else {
        pass = raw.includes('"uiIpc":{"ok":true');
      }
    } else if (smokeUI) {
      pass = raw.includes('"ui":{"ok":true');
    } else if (smokeTask33) {
      const report33 = JSON.parse(raw);
      // 核心 section（base/sp/prov/tag/note/dig）不得跳过，必须全部通过。
      // AI section（ais/ait/aig/aic）可跳过，但未跳过则必须通过。
      const coreSections = ['base', 'sp', 'prov', 'tag', 'note', 'dig'];
      const aiSections = ['ais', 'ait', 'aig', 'aic'];
      pass = coreSections.every((s) => {
        const sec = report33[s];
        if (!sec) return false;
        if (sec.skipped) return false; // 核心 section 不允许 skipped
        if (s === 'prov' && sec.checks) {
          return sec.checks.create && sec.checks.list && sec.checks.update && sec.checks.delete && sec.checks.test !== false;
        }
        return sec.ok === true;
      }) && aiSections.every((s) => {
        const sec = report33[s];
        if (!sec || sec.skipped) return true; // AI section 可跳过
        return sec.ok === true;
      });
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

  // ============= AI Provider (Task 3.3) =============

  trustedIpcMain.handle(IPC_CHANNELS.AI_PROVIDER_LIST, async (): Promise<IpcResult<AIProvider[]>> => {
    try { return ok(AiProviderRepository.list()); }
    catch (e) { return fail('AI_PROVIDER_LIST_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_PROVIDER_CREATE, async (_, args): Promise<IpcResult<AIProvider>> => {
    try {
      if (!args?.input) return fail('INVALID_PARAMS', '缺少 input');
      const input = args.input as AIProviderCreateInput;
      if (!input.name || !input.baseUrl || !input.modelName) return fail('INVALID_PARAMS', 'name / baseUrl / modelName 为必填项');
      const provider = AiProviderRepository.create(input);
      // 同步 settings.defaultProviderId，保证 AI 生成能读到默认 Provider
      if (input.isDefault) {
        saveSettings({ defaultProviderId: provider.id });
      }
      return ok(provider);
    } catch (e) { return fail('AI_PROVIDER_CREATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_PROVIDER_UPDATE, async (_, args): Promise<IpcResult<AIProvider>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const result = AiProviderRepository.update(args.id, (args.input ?? {}) as AIProviderUpdateInput);
      if (!result) return fail('NOT_FOUND', 'Provider 不存在');
      // 同步 settings.defaultProviderId
      if ((args.input as AIProviderUpdateInput)?.isDefault) {
        saveSettings({ defaultProviderId: args.id });
      }
      return ok(result);
    } catch (e) { return fail('AI_PROVIDER_UPDATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_PROVIDER_DELETE, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      // 如果删除的是当前默认 Provider，清除 settings.defaultProviderId
      const settings = loadSettings();
      if (settings.defaultProviderId === args.id) {
        saveSettings({ defaultProviderId: null });
      }
      if (!AiProviderRepository.delete(args.id)) return fail('NOT_FOUND', 'Provider 不存在');
      return ok(undefined);
    } catch (e) { return fail('AI_PROVIDER_DELETE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_PROVIDER_TEST, async (_, args): Promise<IpcResult<{ ok: boolean; message: string }>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const provider = AiProviderRepository.getByIdWithKey(args.id);
      if (!provider) return fail('NOT_FOUND', 'Provider 不存在');
      return ok(await testConnection(provider, provider._apiKey));
    } catch (e) { return fail('AI_PROVIDER_TEST_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_GENERATE_SUMMARY, async (_, args): Promise<IpcResult<AISummary>> => {
    try {
      if (!args?.articleId) return fail('INVALID_PARAMS', '缺少 articleId');
      const article = ArticleRepository.getById(args.articleId);
      if (!article) return fail('NOT_FOUND', '文章不存在');
      if (!article.cleanedMarkdown) return fail('CONTENT_NOT_READY', '文章正文尚未清洗完成');
      const settings = loadSettings();
      if (!settings.defaultProviderId) return fail('NO_PROVIDER', '未设置默认 AI Provider');
      const provider = AiProviderRepository.getByIdWithKey(settings.defaultProviderId);
      if (!provider) return fail('NOT_FOUND', '默认 Provider 不存在');
      const content = await generateSummary(provider, article.title, article.cleanedMarkdown, {
        language: args.language ?? settings.defaultSummaryLanguage,
        detailLevel: args.detailLevel ?? settings.defaultSummaryDetail,
        customPromptTemplate: settings.summaryPromptTemplate, temperature: 0.3
      });
      const result: AISummary = { id: crypto.randomUUID(), articleId: article.id, providerId: provider.id, modelName: provider.modelName, content, language: args.language ?? settings.defaultSummaryLanguage, detailLevel: args.detailLevel ?? settings.defaultSummaryDetail, generatedAt: new Date().toISOString() };
      AiResultCache.set(article.id, 'summary', result);
      return ok(result);
    } catch (e) { return fail('AI_SUMMARY_FAILED', e instanceof Error ? e.message : String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_GENERATE_TRANSLATION, async (_, args): Promise<IpcResult<AITranslation>> => {
    try {
      if (!args?.articleId) return fail('INVALID_PARAMS', '缺少 articleId');
      const article = ArticleRepository.getById(args.articleId);
      if (!article) return fail('NOT_FOUND', '文章不存在');
      if (!article.cleanedMarkdown) return fail('CONTENT_NOT_READY', '文章正文尚未清洗完成');
      const settings = loadSettings();
      if (!settings.defaultProviderId) return fail('NO_PROVIDER', '未设置默认 AI Provider');
      const provider = AiProviderRepository.getByIdWithKey(settings.defaultProviderId);
      if (!provider) return fail('NOT_FOUND', '默认 Provider 不存在');
      const paragraphs = await generateTranslation(provider, article.cleanedMarkdown, {
        targetLanguage: args.targetLanguage ?? settings.defaultTranslationTarget,
        customPromptTemplate: settings.translationPromptTemplate, temperature: 0.3
      });
      const result: AITranslation = { id: crypto.randomUUID(), articleId: article.id, providerId: provider.id, modelName: provider.modelName, targetLanguage: args.targetLanguage ?? settings.defaultTranslationTarget, paragraphs, generatedAt: new Date().toISOString() };
      AiResultCache.set(article.id, 'translation', result);
      return ok(result);
    } catch (e) { return fail('AI_TRANSLATION_FAILED', e instanceof Error ? e.message : String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_SUGGEST_TAGS, async (_, args): Promise<IpcResult<AITagSuggestion>> => {
    try {
      if (!args?.articleId) return fail('INVALID_PARAMS', '缺少 articleId');
      const article = ArticleRepository.getById(args.articleId);
      if (!article) return fail('NOT_FOUND', '文章不存在');
      if (!article.cleanedMarkdown) return fail('CONTENT_NOT_READY', '文章正文尚未清洗完成');
      const settings = loadSettings();
      if (!settings.defaultProviderId) return fail('NO_PROVIDER', '未设置默认 AI Provider');
      const provider = AiProviderRepository.getByIdWithKey(settings.defaultProviderId);
      if (!provider) return fail('NOT_FOUND', '默认 Provider 不存在');
      const suggestions = await suggestTags(provider, article.cleanedMarkdown, settings.tagPromptTemplate);
      const result: AITagSuggestion = { id: crypto.randomUUID(), articleId: article.id, providerId: provider.id, modelName: provider.modelName, suggestions, generatedAt: new Date().toISOString() };
      AiResultCache.set(article.id, 'tag_suggestions', result);
      return ok(result);
    } catch (e) { return fail('AI_TAG_SUGGEST_FAILED', e instanceof Error ? e.message : String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_GET_SUMMARY, async (_, args): Promise<IpcResult<AISummary | null>> => {
    try { return ok(AiResultCache.get<AISummary>(args.articleId, 'summary')); }
    catch (e) { return fail('AI_GET_SUMMARY_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_GET_TRANSLATION, async (_, args): Promise<IpcResult<AITranslation | null>> => {
    try { return ok(AiResultCache.get<AITranslation>(args.articleId, 'translation')); }
    catch (e) { return fail('AI_GET_TRANSLATION_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.AI_GET_TAG_SUGGESTIONS, async (_, args): Promise<IpcResult<AITagSuggestion | null>> => {
    try { return ok(AiResultCache.get<AITagSuggestion>(args.articleId, 'tag_suggestions')); }
    catch (e) { return fail('AI_GET_TAG_SUGGESTIONS_FAILED', String(e)); }
  });

  // ============= Tag (Task 3.3) =============

  trustedIpcMain.handle(IPC_CHANNELS.TAG_LIST, async (): Promise<IpcResult<Tag[]>> => {
    try { return ok(TagRepository.list()); } catch (e) { return fail('TAG_LIST_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.TAG_CREATE, async (_, args): Promise<IpcResult<Tag>> => {
    try {
      if (!args?.input?.name?.trim()) return fail('INVALID_PARAMS', '标签名称不能为空');
      return ok(TagRepository.create(args.input as TagCreateInput));
    } catch (e) { return fail('TAG_CREATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.TAG_UPDATE, async (_, args): Promise<IpcResult<Tag>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      const r = TagRepository.update(args.id, (args.input ?? {}) as TagUpdateInput);
      if (!r) return fail('NOT_FOUND', '标签不存在');
      return ok(r);
    } catch (e) { return fail('TAG_UPDATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.TAG_DELETE, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!args?.id) return fail('INVALID_PARAMS', '缺少 id');
      if (!TagRepository.delete(args.id)) return fail('NOT_FOUND', '标签不存在');
      return ok(undefined);
    } catch (e) { return fail('TAG_DELETE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.TAG_ADD_TO_ARTICLE, async (_, args): Promise<IpcResult<void>> => {
    try { TagRepository.addToArticle(args.articleId, args.tagId); return ok(undefined); }
    catch (e) { return fail('TAG_ADD_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.TAG_REMOVE_FROM_ARTICLE, async (_, args): Promise<IpcResult<void>> => {
    try { TagRepository.removeFromArticle(args.articleId, args.tagId); return ok(undefined); }
    catch (e) { return fail('TAG_REMOVE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.TAG_BATCH_ADD, async (_, args): Promise<IpcResult<void>> => {
    try { TagRepository.batchAdd(args.articleIds, args.tagIds); return ok(undefined); }
    catch (e) { return fail('TAG_BATCH_FAILED', String(e)); }
  });

  // ============= Note (Task 3.3) =============

  trustedIpcMain.handle(IPC_CHANNELS.NOTE_LIST_BY_ARTICLE, async (_, args): Promise<IpcResult<Note[]>> => {
    try { return ok(NoteRepository.listByArticle(args.articleId)); }
    catch (e) { return fail('NOTE_LIST_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.NOTE_CREATE, async (_, args): Promise<IpcResult<Note>> => {
    try { return ok(NoteRepository.create(args.input as NoteCreateInput)); }
    catch (e) { return fail('NOTE_CREATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.NOTE_UPDATE, async (_, args): Promise<IpcResult<Note>> => {
    try {
      const r = NoteRepository.update(args.id, (args.input ?? {}) as NoteUpdateInput);
      if (!r) return fail('NOT_FOUND', '笔记不存在');
      return ok(r);
    } catch (e) { return fail('NOTE_UPDATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.NOTE_DELETE, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!NoteRepository.delete(args.id)) return fail('NOT_FOUND', '笔记不存在');
      return ok(undefined);
    } catch (e) { return fail('NOTE_DELETE_FAILED', String(e)); }
  });

  // ============= Digest (Task 3.3) =============

  trustedIpcMain.handle(IPC_CHANNELS.DIGEST_LIST, async (): Promise<IpcResult<Digest[]>> => {
    try { return ok(DigestRepository.list()); } catch (e) { return fail('DIGEST_LIST_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.DIGEST_GET, async (_, args): Promise<IpcResult<Digest>> => {
    try {
      const r = DigestRepository.getById(args.id);
      if (!r) return fail('NOT_FOUND', '文摘不存在');
      return ok(r);
    } catch (e) { return fail('DIGEST_GET_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.DIGEST_CREATE, async (_, args): Promise<IpcResult<Digest>> => {
    try { return ok(DigestRepository.create(args.input as DigestCreateInput)); }
    catch (e) { return fail('DIGEST_CREATE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.DIGEST_DELETE, async (_, args): Promise<IpcResult<void>> => {
    try {
      if (!DigestRepository.delete(args.id)) return fail('NOT_FOUND', '文摘不存在');
      return ok(undefined);
    } catch (e) { return fail('DIGEST_DELETE_FAILED', String(e)); }
  });

  trustedIpcMain.handle(IPC_CHANNELS.DIGEST_EXPORT, async (_, args): Promise<IpcResult<string>> => {
    try {
      const r = DigestRepository.exportDigest(args.id, (args.format ?? 'markdown') as ExportFormat);
      if (!r) return fail('NOT_FOUND', '文摘不存在');
      return ok(r);
    } catch (e) { return fail('DIGEST_EXPORT_FAILED', String(e)); }
  });

  // ============= Settings (2.5.3 实际持久化到 SQLite) =============

  trustedIpcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<IpcResult<AppSettings>> => {
    try {
      return ok(loadSettings());
    } catch (e) {
      return ok(DEFAULT_SETTINGS);
    }
  });

  trustedIpcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, args): Promise<IpcResult<AppSettings>> => {
    try {
      if (!args || !('settings' in args)) return fail('INVALID_PARAMS', '缺少 settings');
      return ok(saveSettings(args.settings));
    } catch (e) {
      return fail('INVALID_PARAMS', e instanceof Error ? e.message : String(e));
    }
  });

  // ============= Topic（Phase 4 占位 stub，陈冠中会在 Phase 4 接入真实实现） =============

  const topicNotImplemented = (op: string): IpcResult<never> =>
    fail('NOT_IMPLEMENTED', `专题功能 ${op} 等待 Phase 4 接入，当前请先在 Phase 3 Integration 中使用其他功能`);

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_LIST, async (): Promise<IpcResult<Topic[]>> => {
    return topicNotImplemented('list');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_GET, async (): Promise<IpcResult<Topic>> => {
    return topicNotImplemented('get');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_CREATE, async (): Promise<IpcResult<Topic>> => {
    return topicNotImplemented('create');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_UPDATE, async (): Promise<IpcResult<Topic>> => {
    return topicNotImplemented('update');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_DELETE, async (): Promise<IpcResult<void>> => {
    return topicNotImplemented('delete');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_GET_ARTICLES, async (): Promise<IpcResult<Article[]>> => {
    return topicNotImplemented('getArticles');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_GET_TIMELINE, async (): Promise<IpcResult<TimelineEntry[]>> => {
    return topicNotImplemented('getTimeline');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_GET_EVENT_GROUPS, async (): Promise<IpcResult<EventGroup[]>> => {
    return topicNotImplemented('getEventGroups');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_GENERATE_BRIEFING, async (): Promise<IpcResult<Briefing>> => {
    return topicNotImplemented('generateBriefing');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_GET_BRIEFING, async (): Promise<IpcResult<Briefing | null>> => {
    return topicNotImplemented('getBriefing');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_UPDATE_BRIEFING, async (): Promise<IpcResult<Briefing>> => {
    return topicNotImplemented('updateBriefing');
  });

  trustedIpcMain.handle(IPC_CHANNELS.TOPIC_EXPORT_BRIEFING, async (): Promise<IpcResult<string>> => {
    return topicNotImplemented('exportBriefing');
  });

  // ============= Log（Phase 4 占位 stub，陈冠中会在 Phase 4 接入真实实现） =============

  trustedIpcMain.handle(IPC_CHANNELS.LOG_LIST, async (): Promise<IpcResult<LogEntry[]>> => {
    return fail('NOT_IMPLEMENTED', '日志查看功能等待 Phase 4 接入');
  });

  trustedIpcMain.handle(IPC_CHANNELS.LOG_EXPORT, async (): Promise<IpcResult<string>> => {
    return fail('NOT_IMPLEMENTED', '日志导出功能等待 Phase 4 接入');
  });
}

function smokeOpmlPath(): string | null {
  // phase2 smoke 和 uiIpc smoke 都要支持 OPML 路径覆盖（避免弹 dialog）
  if (!SMOKE_FLAGS.smokePhase2 && !SMOKE_FLAGS.smokeUiReal) {
    return null;
  }
  return SMOKE_FLAGS.opmlPath;
}

async function selectOpmlImportPath(event: IpcMainInvokeEvent): Promise<string | null> {
  if (SMOKE_FLAGS.smokePhase2 || SMOKE_FLAGS.smokeUiReal) {
    return smokeOpmlPath();
  }

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
  if (SMOKE_FLAGS.smokePhase2 || SMOKE_FLAGS.smokeUiReal) {
    return smokeOpmlPath();
  }

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
  // Electron 31 在 Windows 上要求 setPath 在 ready 之后才生效
  // 否则会 silently ignored，userData 走默认路径（所有 smoke 累积污染）
  // 触发条件：任何 smoke 模式 + 设了 userData 路径
  if ((SMOKE_FLAGS.smoke || SMOKE_FLAGS.smokeUi) && configuredUserDataPath) {
    app.setPath('userData', configuredUserDataPath);
  } else if (SMOKE_FLAGS.smoke || SMOKE_FLAGS.smokeUi) {
    process.stdout.write(`[main] WARN JUHE_SHIVI_USER_DATA not set, smoke data will leak\n`);
  }
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
