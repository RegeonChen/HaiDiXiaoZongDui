// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article, ArticleFilter, Tag } from '@shared/types';
import type { FullDataSource } from '../../data/ipcDataSource';
import { DataSourceProvider } from '../../context/DataSourceContext';
import { TagsPage } from './TagsPage';

const tag: Tag = {
  id: 'tag-pagination',
  name: '分页标签',
  color: '#3b82f6',
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z'
};

const articles: Article[] = Array.from({ length: 55 }, (_, index) => ({
  id: `article-${index + 1}`,
  feedId: 'feed-1',
  title: `文章 ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  author: null,
  publishedAt: `2026-07-27T00:${String(index).padStart(2, '0')}:00.000Z`,
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

function createDataSource(): FullDataSource {
  return {
    tagList: vi.fn(async () => ({ kind: 'ready', data: [tag] })),
    feeds: vi.fn(async () => ({ kind: 'ready', data: [] })),
    articles: vi.fn(async (filter: ArticleFilter) => {
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 50;
      return { kind: 'ready', data: articles.slice(offset, offset + limit) };
    }),
    articleCount: vi.fn(async () => ({ kind: 'ready', data: articles.length }))
  } as unknown as FullDataSource;
}

const flushEffects = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('TagsPage pagination', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
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

  it('shows the exact total and loads articles after the first 50', async () => {
    const ds = createDataSource();
    await act(async () => {
      root.render(
        createElement(
          DataSourceProvider,
          { value: ds },
          createElement(TagsPage, { onToast: () => undefined })
        )
      );
      await flushEffects();
    });

    const tagButton = container.querySelector<HTMLButtonElement>('.tags-page__item-pick');
    expect(tagButton).not.toBeNull();
    await act(async () => {
      tagButton?.click();
      await flushEffects();
    });

    expect(container.querySelector('[data-testid="tags-page__article-count"]')?.textContent)
      .toContain('50 / 55');
    expect(container.querySelectorAll('.tags-page__article-item')).toHaveLength(50);

    const loadMore = container.querySelector<HTMLButtonElement>('[data-testid="tags-page__load-more"]');
    expect(loadMore).not.toBeNull();
    await act(async () => {
      loadMore?.click();
      await flushEffects();
    });

    expect(container.querySelector('[data-testid="tags-page__article-count"]')?.textContent)
      .toContain('55 / 55');
    expect(container.querySelectorAll('.tags-page__article-item')).toHaveLength(55);
    expect(container.querySelector('[data-testid="tags-page__load-more"]')).toBeNull();
    expect(ds.articles).toHaveBeenNthCalledWith(2, {
      tagIds: ['tag-pagination'],
      offset: 50,
      limit: 50
    });
  });
});
