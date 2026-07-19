/**
 * DataSource — UI 与后端之间的数据契约
 * Task 2.1: UI Shell
 *
 * 设计目的：
 *   - Phase 2.1 用 mock 实现，等 Task 2.3 + 2.2 完成后切换到真实 IPC
 *   - 切换时只换 Provider，不改组件代码
 *   - 所有方法都返回 Result 风格（成功/失败/加载），统一错误处理
 */
import type { Article, ArticleFilter, Feed } from '@shared/types';

export type DataSourceState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; error: string };

export interface DataSource {
  /** 拉取所有订阅源 */
  feeds(): Promise<DataSourceState<Feed[]>>;
  /** 按筛选条件拉取文章 */
  articles(filter: ArticleFilter): Promise<DataSourceState<Article[]>>;
  /** 标记已读/未读 */
  markRead(articleId: string, isRead: boolean): Promise<void>;
  /** 标记星标/取消 */
  markStarred(articleId: string, isStarred: boolean): Promise<void>;
  /**
   * Phase 3.6.3：获取侧栏三个分类的精确计数。
   * 返回 { all, unread, starred }，分别对应所有文章、未读文章、星标文章的总数。
   */
  articleCounts(): Promise<DataSourceState<{ all: number; unread: number; starred: number }>>;
  /** 同步一个 feed */
  syncFeed(feedId: string): Promise<{ ok: boolean; message: string }>;
  /**
   * 新增订阅源。
   * - IPC 模式：调 window.api.feed.create({ url, title })
   * - Mock 模式：返回一个内存中的假 Feed
   */
  createFeed(url: string, title?: string): Promise<DataSourceState<Feed>>;
  /**
   * 按需拉取文章的 Cleaned HTML。
   * - IPC 模式：调 window.api.content.getCleanedHtml(articleId)，可能触发服务端清洗
   * - Mock 模式：直接返回 article.cleanedHtml
   * - 选 article 时 ArticleReader 会用这个来填正文
   */
  getCleanedHtml(articleId: string): Promise<DataSourceState<string>>;
}
