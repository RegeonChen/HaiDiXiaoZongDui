// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '@shared/types';
import { ArticleList } from './ArticleList';

const articles: Article[] = Array.from({ length: 51 }, (_, index) => ({
  id: `article-${index + 1}`,
  feedId: 'feed-1',
  title: `文章 ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  author: null,
  publishedAt: `2026-07-27T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
  fetchedAt: '2026-07-27T01:00:00.000Z',
  rawHtml: '',
  rawText: null,
  cleanedHtml: '',
  cleanedMarkdown: '',
  cleaningStatus: 'done',
  isRead: false,
  isStarred: false,
  summary: null,
  translatedParagraphs: null,
  guid: `guid-${index + 1}`,
  createdAt: '2026-07-27T01:00:00.000Z',
  updatedAt: '2026-07-27T01:00:00.000Z'
}));

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;
  private readonly callback: IntersectionObserverCallback;
  private target: Element | null = null;

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.callback = callback;
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }

  disconnect(): void {
    this.target = null;
  }

  observe(target: Element): void {
    this.target = target;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(target: Element): void {
    if (this.target === target) this.target = null;
  }

  trigger(isIntersecting: boolean): void {
    if (!this.target) throw new Error('observer target is missing');
    this.callback(
      [{
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRectReadOnly,
        isIntersecting,
        rootBounds: null,
        target: this.target,
        time: 0
      }],
      this
    );
  }
}

describe('ArticleList automatic pagination', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
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

  it('observes a sentinel inside the scroll container and de-duplicates load requests', async () => {
    const onLoadMore = vi.fn();
    const renderList = async (visibleArticles: Article[], loadingMore: boolean) => {
      await act(async () => {
        root.render(
          createElement(ArticleList, {
            feeds: [],
            articles: visibleArticles,
            selectedArticleId: null,
            onSelect: () => undefined,
            filterLabel: '所有订阅源',
            total: 101,
            hasMore: true,
            onLoadMore,
            loadingMore
          })
        );
      });
    };

    await renderList(articles.slice(0, 50), false);

    const list = container.querySelector('.article-list__items');
    const sentinel = container.querySelector('[data-testid="article-list__sentinel"]');
    const firstObserver = MockIntersectionObserver.instances.at(-1);
    expect(list).not.toBeNull();
    expect(sentinel?.parentElement).toBe(list);
    expect(firstObserver?.root).toBe(list);
    expect(container.querySelector('[data-testid="article-list__load-more"]')).toBeNull();
    expect(onLoadMore).not.toHaveBeenCalled();

    firstObserver?.trigger(false);
    expect(onLoadMore).not.toHaveBeenCalled();
    firstObserver?.trigger(true);
    firstObserver?.trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await renderList(articles.slice(0, 50), true);
    await renderList(articles, false);
    const nextObserver = MockIntersectionObserver.instances.at(-1);
    nextObserver?.trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});
