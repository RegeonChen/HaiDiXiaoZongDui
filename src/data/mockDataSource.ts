/**
 * MockDataSource — Task 2.1 阶段的本地数据源
 *
 * 与真 IPC 的差距：返回 mock 数据；markRead/markStarred/syncFeed 走
 * 内存态更新并通过 console 留下可见轨迹，便于 debug。
 */
import type { Article, Feed } from '@shared/types';
import type { DataSource, DataSourceState } from '../types/dataSource';
import { MOCK_ARTICLES, MOCK_FEEDS } from './mockData';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 浅拷贝 + 数组复制，避免外部 mutate mock
const cloneFeeds = (): Feed[] => MOCK_FEEDS.map((f) => ({ ...f }));
const cloneArticles = (): Article[] => MOCK_ARTICLES.map((a) => ({ ...a }));

export class MockDataSource implements DataSource {
  private feedsState: Feed[] = cloneFeeds();
  private articlesState: Article[] = cloneArticles();

  async feeds(): Promise<DataSourceState<Feed[]>> {
    await delay(150);
    return { kind: 'ready', data: this.feedsState };
  }

  async articles(filter: {
    feedId?: string;
    isRead?: boolean;
    isStarred?: boolean;
  }): Promise<DataSourceState<Article[]>> {
    await delay(150);
    let items = this.articlesState;
    if (filter.feedId) {
      items = items.filter((a) => a.feedId === filter.feedId);
    }
    if (filter.isRead !== undefined) {
      items = items.filter((a) => a.isRead === filter.isRead);
    }
    if (filter.isStarred !== undefined) {
      items = items.filter((a) => a.isStarred === filter.isStarred);
    }
    // 按 publishedAt 倒序
    items = [...items].sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    });
    return { kind: 'ready', data: items };
  }

  async markRead(articleId: string, isRead: boolean): Promise<void> {
    this.articlesState = this.articlesState.map((a) =>
      a.id === articleId ? { ...a, isRead } : a
    );
    // eslint-disable-next-line no-console
    console.log('[mock:ds] markRead', { articleId, isRead });
  }

  async markStarred(articleId: string, isStarred: boolean): Promise<void> {
    this.articlesState = this.articlesState.map((a) =>
      a.id === articleId ? { ...a, isStarred } : a
    );
    // eslint-disable-next-line no-console
    console.log('[mock:ds] markStarred', { articleId, isStarred });
  }

  async syncFeed(feedId: string): Promise<{ ok: boolean; message: string }> {
    // 36kr 是 mock 中标记为同步失败的源，保持一致
    if (feedId === 'feed-36kr') {
      return { ok: false, message: '远程服务器返回错误: 503' };
    }
    return { ok: true, message: '同步成功（mock）' };
  }
}
