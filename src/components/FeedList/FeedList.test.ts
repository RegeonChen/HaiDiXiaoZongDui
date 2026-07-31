// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_ARTICLES, MOCK_FEEDS } from '../../data/mockData';
import { FeedList, type FeedListProps } from './FeedList';

describe('FeedList', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('groups feed creation and OPML actions under the primary-directory plus button', async () => {
    const onAddFeed = vi.fn();
    const onImportOpml = vi.fn();
    const onExportOpml = vi.fn();
    const onAddGroup = vi.fn();
    const props: FeedListProps = {
      feeds: [],
      articles: [],
      selected: 'all',
      onSelect: vi.fn(),
      onDeleteFeed: vi.fn(),
      onAddFeed,
      onImportOpml,
      onExportOpml,
      onAddGroup
    };

    await act(async () => {
      root.render(createElement(FeedList, props));
    });

    const openMenu = async () => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-testid="feed-list__create"]')?.click();
      });
    };
    const clickMenuItem = async (testId: string) => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
      });
    };

    await openMenu();
    expect(container.querySelector('[data-testid="feed-list__create-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="feed-list__add-feed"]')?.textContent).toContain('添加订阅源');
    expect(container.querySelector('[data-testid="feed-list__import-opml"]')?.textContent).toContain('导入 OPML');
    expect(container.querySelector('[data-testid="feed-list__export-opml"]')?.textContent).toContain('导出 OPML');
    expect(container.querySelector('[data-testid="feed-list__add-group"]')?.textContent).toContain('添加订阅源组');

    await clickMenuItem('feed-list__add-feed');
    expect(onAddFeed).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="feed-list__create-menu"]')).toBeNull();

    await openMenu();
    await clickMenuItem('feed-list__import-opml');
    expect(onImportOpml).toHaveBeenCalledOnce();

    await openMenu();
    await clickMenuItem('feed-list__export-opml');
    expect(onExportOpml).toHaveBeenCalledOnce();

    await openMenu();
    await clickMenuItem('feed-list__add-group');
    expect(onAddGroup).toHaveBeenCalledOnce();
  });

  it('uses the shared, two-line empty state for an empty tag directory', async () => {
    const props: FeedListProps = {
      feeds: [],
      articles: [],
      selected: 'all',
      onSelect: vi.fn(),
      onDeleteFeed: vi.fn(),
      tags: []
    };

    await act(async () => {
      root.render(createElement(FeedList, props));
    });
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('.feed-list__tab')[1]?.click();
    });

    const empty = container.querySelector('.feed-list__empty');
    expect(empty?.classList.contains('status-view')).toBe(true);
    expect(empty?.querySelector('.status-title')?.textContent).toBe('还没有标签');
    expect(empty?.querySelector('.status-hint')?.textContent).toBe(
      '在文章阅读区点击“标签”创建或应用。'
    );
    expect(empty?.querySelector('br')).toBeNull();
  });

  it('prefers the exact unread count for each feed over the loaded article page', async () => {
    const feed = MOCK_FEEDS[0];
    const props: FeedListProps = {
      feeds: [feed],
      articles: MOCK_ARTICLES.filter((article) => article.feedId === feed.id).slice(0, 1),
      selected: 'all',
      onSelect: vi.fn(),
      onDeleteFeed: vi.fn(),
      feedUnreadCounts: { [feed.id]: 73 }
    };

    await act(async () => {
      root.render(createElement(FeedList, props));
    });

    expect(
      container.querySelector(`[data-feed-id="${feed.id}"] .feed-list__count`)?.textContent
    ).toBe('73');
  });

  it('offers select all for a partial batch selection and cancel only after all are selected', async () => {
    const feeds = MOCK_FEEDS.slice(0, 3);
    const props: FeedListProps = {
      feeds,
      articles: [],
      selected: 'all',
      onSelect: vi.fn(),
      onDeleteFeed: vi.fn()
    };

    await act(async () => {
      root.render(createElement(FeedList, props));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="feed-list__more"]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="feed-list__enter-batch"]')?.click();
    });

    const toggleSelectAll = () => (
      container.querySelector<HTMLButtonElement>(
        '[data-testid="feed-list__batch-toggle-select-all"]'
      )
    );
    const batchLabel = () => container.querySelector('.feed-list__batch-toolbar-label');
    const batchCheckboxes = () => (
      Array.from(
        container.querySelectorAll<HTMLInputElement>('[data-testid^="feed-list__batch-checkbox-"]')
      )
    );

    expect(toggleSelectAll()?.textContent).toBe('全选');

    await act(async () => {
      batchCheckboxes()[0]?.click();
    });
    expect(batchLabel()?.textContent).toContain('已选 1 个');
    expect(toggleSelectAll()?.textContent).toBe('全选');
    expect(toggleSelectAll()?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      toggleSelectAll()?.click();
    });
    expect(batchCheckboxes()).toHaveLength(feeds.length);
    expect(batchCheckboxes().every((checkbox) => checkbox.checked)).toBe(true);
    expect(batchLabel()?.textContent).toContain(`已选 ${feeds.length} 个`);
    expect(toggleSelectAll()?.textContent).toBe('取消全选');
    expect(toggleSelectAll()?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      toggleSelectAll()?.click();
    });
    expect(batchCheckboxes().every((checkbox) => !checkbox.checked)).toBe(true);
    expect(batchLabel()?.textContent).toContain('已选 0 个');
    expect(toggleSelectAll()?.textContent).toBe('全选');
  });
});
