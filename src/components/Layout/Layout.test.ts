// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../hooks/useTheme';
import { pinWorkbenchTab } from '../../utils/workbench-tabs';
import { Layout, nextDirectoryMode, type LayoutProps } from './Layout';

const matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => true)
});

describe('Layout fixed directory structure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('matchMedia', matchMedia);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('keeps both directory columns mounted while pages switch only inside the flexible editor', async () => {
    const onTabPin = vi.fn();
    const props: LayoutProps = {
      sidebarSlot: createElement('div', { 'data-testid': 'primary-directory' }, '一级目录'),
      articlesSlot: createElement('div', { 'data-testid': 'secondary-directory' }, '二级目录'),
      readerSlot: createElement('div', { 'data-testid': 'reader-view' }, '文章界面'),
      sidebarPercent: 24,
      listPercent: 28,
      onResizeSidebar: vi.fn(),
      onResizeList: vi.fn(),
      currentPage: 'settings',
      onPageChange: vi.fn(),
      pageSlot: createElement('div', { 'data-testid': 'settings-view' }, '设置界面'),
      tabs: [{
        id: 'page:settings',
        label: '设置',
        page: 'settings',
        icon: 'settings',
        closeable: true,
        preview: true
      }],
      activeTabId: 'page:settings',
      onTabSelect: vi.fn(),
      onTabPin,
      onTabClose: vi.fn(),
      aiDockOpen: false,
      aiAvailable: false,
      onToggleAiDock: vi.fn(),
      onOpenSettings: vi.fn(),
      directoryMode: 'both',
      onReaderAction: vi.fn(),
      onEditorInteraction: vi.fn()
    };

    await act(async () => {
      root.render(
        createElement(
          ThemeProvider,
          null,
          createElement(Layout, props)
        )
      );
    });

    const primary = container.querySelector('[data-testid="primary-directory"]');
    const secondary = container.querySelector('[data-testid="secondary-directory"]');
    const editor = container.querySelector('.app-editor');
    const workbenchContent = container.querySelector<HTMLElement>('.app-workbench__content');
    const appMain = container.querySelector<HTMLElement>('.app-main');
    const tabbar = container.querySelector('.app-page__tabbar');
    const settings = container.querySelector('[data-testid="settings-view"]');

    expect(primary?.closest('.pane-feeds')).not.toBeNull();
    expect(secondary?.closest('.pane-list')).not.toBeNull();
    expect(editor?.contains(tabbar)).toBe(true);
    expect(editor?.contains(settings)).toBe(true);
    expect(editor?.contains(secondary)).toBe(false);
    expect(container.querySelector('[data-testid="reader-view"]')).toBeNull();
    expect(container.querySelector('.app-header__logo-btn')).toBeNull();
    expect(container.querySelector('.app-header__sync-btn')).toBeNull();
    expect(workbenchContent?.style.gridTemplateColumns).toContain('minmax(218px');
    expect(appMain?.style.gridTemplateColumns).toContain('minmax(260px');
    expect(appMain?.style.gridTemplateColumns).toContain('minmax(320px');

    const previewTab = container.querySelector<HTMLElement>('[data-tab-id="page:settings"]');
    expect(previewTab?.getAttribute('data-preview')).toBe('true');
    expect(previewTab?.classList.contains('is-preview')).toBe(true);
    await act(async () => {
      previewTab?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onTabPin).toHaveBeenCalledWith('page:settings');
  });

  it('cycles both directories to secondary-only, then none, then both', async () => {
    expect(nextDirectoryMode('both')).toBe('secondary');
    expect(nextDirectoryMode('secondary')).toBe('none');
    expect(nextDirectoryMode('none')).toBe('both');

    const onReaderAction = vi.fn();
    const baseProps: LayoutProps = {
      sidebarSlot: createElement('div', { 'data-testid': 'primary-directory' }, '一级目录'),
      articlesSlot: createElement('div', { 'data-testid': 'secondary-directory' }, '二级目录'),
      readerSlot: createElement('div', { 'data-testid': 'reader-view' }, '文章界面'),
      sidebarPercent: 24,
      listPercent: 28,
      onResizeSidebar: vi.fn(),
      onResizeList: vi.fn(),
      currentPage: 'reader',
      onPageChange: vi.fn(),
      tabs: [],
      activeTabId: 'reader',
      onTabSelect: vi.fn(),
      onTabPin: vi.fn(),
      onTabClose: vi.fn(),
      aiDockOpen: false,
      aiAvailable: false,
      onToggleAiDock: vi.fn(),
      onOpenSettings: vi.fn(),
      directoryMode: 'both',
      onReaderAction,
      onEditorInteraction: vi.fn()
    };
    const renderMode = async (directoryMode: LayoutProps['directoryMode']) => {
      await act(async () => {
        root.render(
          createElement(
            ThemeProvider,
            null,
            createElement(Layout, { ...baseProps, directoryMode })
          )
        );
      });
    };

    await renderMode('both');
    expect(container.querySelector('.pane-feeds')).not.toBeNull();
    expect(container.querySelector('.pane-list')).not.toBeNull();
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);

    await renderMode('secondary');
    expect(container.querySelector('.pane-feeds')).toBeNull();
    expect(container.querySelector('.pane-list')).not.toBeNull();
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);

    await renderMode('none');
    expect(container.querySelector('.pane-feeds')).toBeNull();
    expect(container.querySelector('.pane-list')).toBeNull();
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(container.querySelector('.app-editor')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-page-key="reader"]')?.click();
    });
    expect(onReaderAction).toHaveBeenCalledOnce();
  });

  it('reports content actions but ignores ordinary tab selection', async () => {
    const onEditorInteraction = vi.fn();
    const onTabSelect = vi.fn();
    const props: LayoutProps = {
      sidebarSlot: createElement('div'),
      articlesSlot: createElement('div'),
      readerSlot: createElement(
        'button',
        { type: 'button', 'data-testid': 'reader-action' },
        '翻译'
      ),
      sidebarPercent: 24,
      listPercent: 28,
      onResizeSidebar: vi.fn(),
      onResizeList: vi.fn(),
      currentPage: 'reader',
      onPageChange: vi.fn(),
      tabs: [{
        id: 'article:1',
        label: '文章',
        page: 'reader',
        articleId: '1',
        icon: 'article',
        closeable: true,
        preview: true
      }],
      activeTabId: 'article:1',
      onTabSelect,
      onTabPin: vi.fn(),
      onTabClose: vi.fn(),
      aiDockOpen: false,
      aiAvailable: true,
      onToggleAiDock: vi.fn(),
      onOpenSettings: vi.fn(),
      directoryMode: 'both',
      onReaderAction: vi.fn(),
      onEditorInteraction
    };

    await act(async () => {
      root.render(
        createElement(
          ThemeProvider,
          null,
          createElement(Layout, props)
        )
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="reader-action"]')?.click();
    });
    expect(onEditorInteraction).toHaveBeenCalledOnce();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-tab-id="article:1"]')?.click();
    });
    expect(onTabSelect).toHaveBeenCalledWith('article:1');
    expect(onEditorInteraction).toHaveBeenCalledOnce();
  });

  it('keeps controlled editor inputs editable while pinning a preview tab', async () => {
    function ControlledInputHarness() {
      const [value, setValue] = useState('');
      const [tabs, setTabs] = useState<LayoutProps['tabs']>([{
        id: 'page:notes',
        label: '笔记',
        page: 'notes',
        icon: 'notes',
        closeable: true,
        preview: true
      }]);
      const props: LayoutProps = {
        sidebarSlot: createElement('div'),
        articlesSlot: createElement('div'),
        readerSlot: createElement('div'),
        sidebarPercent: 24,
        listPercent: 28,
        onResizeSidebar: vi.fn(),
        onResizeList: vi.fn(),
        currentPage: 'notes',
        onPageChange: vi.fn(),
        pageSlot: createElement('textarea', {
          'data-testid': 'controlled-editor-input',
          value,
          onChange: (event: Event) => {
            setValue((event.target as HTMLTextAreaElement).value);
          }
        }),
        tabs,
        activeTabId: 'page:notes',
        onTabSelect: vi.fn(),
        onTabPin: vi.fn(),
        onTabClose: vi.fn(),
        aiDockOpen: false,
        aiAvailable: false,
        onToggleAiDock: vi.fn(),
        onOpenSettings: vi.fn(),
        directoryMode: 'both',
        onReaderAction: vi.fn(),
        onEditorInteraction: () => {
          setTabs((current) => pinWorkbenchTab(current, 'page:notes'));
        }
      };
      return createElement(
        ThemeProvider,
        null,
        createElement(Layout, props)
      );
    }

    await act(async () => {
      root.render(createElement(ControlledInputHarness));
    });

    const input = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="controlled-editor-input"]'
    );
    expect(input).not.toBeNull();

    await act(async () => {
      input?.focus();
    });
    expect(container.querySelector('[data-tab-id="page:notes"]')?.getAttribute('data-preview'))
      .toBe('false');

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(input, '现在可以输入');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(input?.value).toBe('现在可以输入');
    expect(document.activeElement).toBe(input);
  });
});
