import type { Session, WebContents } from 'electron';
import {
  ARTICLE_WEBVIEW_PARTITION,
  isAllowedArticleWebUrl
} from '../../../../shared/article-webview.js';

export interface ArticleWebviewSecurityDependencies {
  host: WebContents;
  articleSession: Session;
  openExternal: (url: string) => void;
}

/**
 * 对加载不可信原站的 <webview> 做主进程级强制隔离。
 * 渲染层上的 webpreferences 属性只是辅助，这里才是不可绕过的安全边界。
 */
export function installArticleWebviewSecurity({
  host,
  articleSession,
  openExternal
}: ArticleWebviewSecurityDependencies): void {
  articleSession.setPermissionCheckHandler(() => false);
  articleSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  articleSession.setDevicePermissionHandler(() => false);
  articleSession.on('will-download', (event) => {
    event.preventDefault();
  });

  host.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isAllowedArticleWebUrl(params['src'] ?? '')) {
      event.preventDefault();
      return;
    }

    // 禁止原站通过属性注入 preload 或 Node 能力。
    delete params['preload'];
    params['partition'] = ARTICLE_WEBVIEW_PARTITION;
    webPreferences.preload = undefined;
    webPreferences.partition = ARTICLE_WEBVIEW_PARTITION;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
  });

  host.on('did-attach-webview', (_event, guest) => {
    const guardNavigation = (event: Electron.Event, url: string): void => {
      if (!isAllowedArticleWebUrl(url)) event.preventDefault();
    };

    guest.on('will-navigate', guardNavigation);
    guest.on('will-redirect', guardNavigation);
    guest.setWindowOpenHandler(({ url }) => {
      if (isAllowedArticleWebUrl(url)) openExternal(url);
      return { action: 'deny' };
    });
  });
}
