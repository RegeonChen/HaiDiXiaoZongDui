/**
 * 聚合拾遗 — Electron 主进程入口
 * Task 1.1: Application Scaffold
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
import { IPC_CHANNELS, type IpcResult } from '../../shared/ipc.js';
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types.js';

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
      // —— 安全基线：Renderer 拿不到完整 Node API ——
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
      // 禁止 webview / 旧 webkit 行为
      webviewTag: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // 外部链接走系统浏览器，不在应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 开发模式加载 Vite dev server，生产模式加载构建产物
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 烟雾测试模式：JUHE_SHIVI_SMOKE=1 时执行隔离自检 + IPC 自检并打印报告后退出
  if (process.env['JUHE_SHIVI_SMOKE'] === '1') {
    void runSmokeTest(win);
  }
}

/**
 * 烟雾测试脚本（仅当 JUHE_SHIVI_SMOKE=1 触发）。
 * 在 Renderer 端做三件事：
 *   1) 探测 window 上是否泄漏了 require / process / module / Buffer
 *   2) 通过 window.api.settings.get() 走一次 IPC
 *   3) 把结果以 SMOKE_REPORT_JSON {...} 一行打回 Main stdout
 */
async function runSmokeTest(win: BrowserWindow): Promise<void> {
  // 等到 React 把 #root 渲染完
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  const probe = `
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

  try {
    const raw = await win.webContents.executeJavaScript(probe);
    const pass =
      !raw.includes('"hasRequire":true') &&
      !raw.includes('"hasProcess":true') &&
      !raw.includes('"hasModule":true') &&
      !raw.includes('"hasBuffer":true') &&
      raw.includes('"ipc":{"ok":true');

    console.log(`SMOKE_REPORT_JSON ${raw}`);
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

/**
 * Phase 1.1 阶段只注册最小链路验证用的通道。
 * 后续 Phase 接入业务时按 IPC_CHANNELS 逐个补齐，每个 handler 都要：
 *   1. 校验入参（类型 + 业务合法性）
 *   2. 返回 IpcResult<T>，错误也要带 code/message
 */
function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (): Promise<IpcResult<AppSettings>> => {
      // Phase 1.1：尚未接入 SQLite，直接返回共享协议里定义的默认值
      return { success: true, data: DEFAULT_SETTINGS };
    }
  );
}

// ============================================================
// App 生命周期
// ============================================================

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 习惯：所有窗口关闭后应用保持运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
