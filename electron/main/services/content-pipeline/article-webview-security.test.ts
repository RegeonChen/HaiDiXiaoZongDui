import { describe, expect, it, vi } from 'vitest';
import type { Session, WebContents, WebPreferences } from 'electron';
import {
  ARTICLE_WEBVIEW_PARTITION,
  isAllowedArticleWebUrl
} from '../../../../shared/article-webview';
import { installArticleWebviewSecurity } from './article-webview-security';

type EventLike = { preventDefault: ReturnType<typeof vi.fn> };
type HostListener = (...args: unknown[]) => void;
type NavigationListener = (event: EventLike, url: string) => void;
type WindowOpenHandler = (details: { url: string }) => { action: string };

describe('article webview URL policy', () => {
  it('allows only credential-free HTTP(S) URLs', () => {
    expect(isAllowedArticleWebUrl('https://example.com/article')).toBe(true);
    expect(isAllowedArticleWebUrl('http://localhost:3000/article')).toBe(true);
    expect(isAllowedArticleWebUrl('https://user:pass@example.com/article')).toBe(false);
    expect(isAllowedArticleWebUrl('file:///Users/victim/.zshrc')).toBe(false);
    expect(isAllowedArticleWebUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedArticleWebUrl('data:text/html,unsafe')).toBe(false);
    expect(isAllowedArticleWebUrl('mailto:reader@example.com')).toBe(false);
    expect(isAllowedArticleWebUrl('not a url')).toBe(false);
  });
});

describe('article webview security boundary', () => {
  it('rejects unsafe attachment and strips preload/Node capabilities from safe guests', () => {
    const harness = createHarness();

    const unsafeEvent = { preventDefault: vi.fn() };
    harness.hostListeners.get('will-attach-webview')?.(
      unsafeEvent,
      {},
      { src: 'file:///Users/victim/.zshrc' }
    );
    expect(unsafeEvent.preventDefault).toHaveBeenCalledOnce();

    const safeEvent = { preventDefault: vi.fn() };
    const webPreferences: WebPreferences = {
      preload: '/tmp/attacker-preload.js',
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    };
    const params = {
      src: 'https://example.com/article',
      preload: '/tmp/attacker-preload.js',
      partition: 'persist:attacker'
    };
    harness.hostListeners.get('will-attach-webview')?.(safeEvent, webPreferences, params);

    expect(safeEvent.preventDefault).not.toHaveBeenCalled();
    expect(params).not.toHaveProperty('preload');
    expect(params.partition).toBe(ARTICLE_WEBVIEW_PARTITION);
    expect(webPreferences).toMatchObject({
      preload: undefined,
      partition: ARTICLE_WEBVIEW_PARTITION,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    });
  });

  it('denies permissions/downloads and blocks unsafe guest navigation or popups', () => {
    const harness = createHarness();

    const permissionCheck = harness.permissionCheckHandler;
    const permissionRequest = harness.permissionRequestHandler;
    const devicePermission = harness.devicePermissionHandler;
    if (!permissionCheck || !permissionRequest || !devicePermission) {
      throw new Error('Session permission guards were not installed');
    }
    expect(permissionCheck()).toBe(false);
    expect(devicePermission()).toBe(false);
    const permissionCallback = vi.fn();
    permissionRequest(null, null, permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);

    const downloadEvent = { preventDefault: vi.fn() };
    harness.downloadHandler?.(downloadEvent);
    expect(downloadEvent.preventDefault).toHaveBeenCalledOnce();

    harness.hostListeners.get('did-attach-webview')?.({}, harness.guest);
    const unsafeNavigation = { preventDefault: vi.fn() };
    harness.guestListeners.get('will-navigate')?.(
      unsafeNavigation,
      'javascript:alert(1)'
    );
    expect(unsafeNavigation.preventDefault).toHaveBeenCalledOnce();

    const safeNavigation = { preventDefault: vi.fn() };
    harness.guestListeners.get('will-redirect')?.(
      safeNavigation,
      'https://example.com/next'
    );
    expect(safeNavigation.preventDefault).not.toHaveBeenCalled();

    const windowOpenHandler = harness.windowOpenHandler;
    if (!windowOpenHandler) throw new Error('Guest popup guard was not installed');
    expect(windowOpenHandler({ url: 'https://example.com/new' })).toEqual({ action: 'deny' });
    expect(harness.openExternal).toHaveBeenCalledWith('https://example.com/new');
    expect(windowOpenHandler({ url: 'file:///tmp/private' })).toEqual({ action: 'deny' });
    expect(harness.openExternal).not.toHaveBeenCalledWith('file:///tmp/private');
  });
});

function createHarness(): {
  hostListeners: Map<string, HostListener>;
  guestListeners: Map<string, NavigationListener>;
  guest: WebContents;
  openExternal: (url: string) => void;
  permissionCheckHandler?: (...args: unknown[]) => boolean;
  permissionRequestHandler?: (...args: unknown[]) => void;
  devicePermissionHandler?: (...args: unknown[]) => boolean;
  downloadHandler?: (event: EventLike) => void;
  windowOpenHandler?: WindowOpenHandler;
} {
  const hostListeners = new Map<string, HostListener>();
  const guestListeners = new Map<string, NavigationListener>();
  const result: ReturnType<typeof createHarness> = {
    hostListeners,
    guestListeners,
    guest: {} as WebContents,
    openExternal: vi.fn()
  };

  result.guest = {
    on: vi.fn((eventName: string, listener: NavigationListener) => {
      guestListeners.set(eventName, listener);
    }),
    setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
      result.windowOpenHandler = handler;
    })
  } as unknown as WebContents;

  const host = {
    on: vi.fn((eventName: string, listener: HostListener) => {
      hostListeners.set(eventName, listener);
    })
  } as unknown as WebContents;
  const articleSession = {
    setPermissionCheckHandler: vi.fn((handler: (...args: unknown[]) => boolean) => {
      result.permissionCheckHandler = handler;
    }),
    setPermissionRequestHandler: vi.fn((handler: (...args: unknown[]) => void) => {
      result.permissionRequestHandler = handler;
    }),
    setDevicePermissionHandler: vi.fn((handler: (...args: unknown[]) => boolean) => {
      result.devicePermissionHandler = handler;
    }),
    on: vi.fn((_eventName: string, handler: (event: EventLike) => void) => {
      result.downloadHandler = handler;
    })
  } as unknown as Session;

  installArticleWebviewSecurity({
    host,
    articleSession,
    openExternal: result.openExternal
  });
  return result;
}
