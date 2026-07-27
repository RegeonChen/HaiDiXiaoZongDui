/**
 * DataSource — UI 与后端之间的数据契约
 * Task 2.1: UI Shell
 *
 * 设计目的：
 *   - Phase 2.1 用 mock 实现，等 Task 2.3 + 2.2 完成后切换到真实 IPC
 *   - 切换时只换 Provider，不改组件代码
 *   - 所有方法都返回 Result 风格（成功/失败/加载），统一错误处理
 */
import type {
  Article,
  ArticleFilter,
  Feed,
  SyncProgress,
  SyncStageEvent
} from '@shared/types';

export type DataSourceState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; error: string };

export interface FeedSyncOutcome {
  ok: boolean;
  message: string;
  newArticles: number;
  updatedArticles: number;
  error: string | null;
  stages: SyncStageEvent[];
}

export interface DataSource {
  /** 拉取所有订阅源 */
  feeds(): Promise<DataSourceState<Feed[]>>;
  /** 按筛选条件拉取文章 */
  articles(filter: ArticleFilter): Promise<DataSourceState<Article[]>>;
  /**
   * 按筛选条件获取精确文章总数，不受 articles 默认分页大小影响。
   * 用于确认文案、分页总数等不能从当前内存页推导的场景。
   */
  articleCount(filter: ArticleFilter): Promise<DataSourceState<number>>;
  /**
   * Phase 3.7.3：按 ID 获取单篇文章。
   * 用于搜索跳转等场景——搜索结果文章可能不在当前分页列表中，
   * 通过此方法直接按 ID 获取完整 Article，作为搜索解耦的保底手段。
   */
  getArticle(id: string): Promise<DataSourceState<Article>>;
  /**
   * Phase 3.7.1:上次 articles 查询的匹配总数(分页 "加载更多" 按钮判断 hasMore 用)。
   * 实现说明:IPC 后端 article:list result 已经包含 total 字段,实现内部从 IPC 拿;
   * Mock 模式在 articlesState 里按 filter 数。同步返回,无需额外调用。
   */
  lastArticleTotal(): number;
  /** 标记已读/未读 */
  markRead(articleId: string, isRead: boolean): Promise<void>;
  /** 标记星标/取消 */
  markStarred(articleId: string, isStarred: boolean): Promise<void>;
  /**
   * Phase 4.1.3：将指定订阅源下所有未读文章批量标为已读。
   * 返回实际更新的文章数。
   */
  markAllReadByFeed(feedId: string): Promise<number>;
  /**
   * Phase 3.6.3：获取侧栏三个分类的精确计数。
   * 返回 { all, unread, starred }，分别对应所有文章、未读文章、星标文章的总数。
   */
  articleCounts(): Promise<DataSourceState<{ all: number; unread: number; starred: number }>>;
  /**
   * Phase 3.5.x：按 tag 统计文章数（侧栏 tab=tags 展示每个 tag 名下的文章数）。
   * 返回 Record<tagId, count>。tags 表里没有任何文章的 tag 不会出现在结果里，调用方在
   * 聚合后用 0 补全以保持 tag 列表完整。
   */
  articleCountsByTag(): Promise<DataSourceState<Record<string, number>>>;
  /** 同步一个 feed，并返回可供 UI 展示的阶段与最终计数 */
  syncFeed(feedId: string): Promise<FeedSyncOutcome>;
  /** 查询当前单源或批量同步进度 */
  syncProgress(): Promise<DataSourceState<SyncProgress>>;
  /**
   * 新增订阅源。
   * - IPC 模式：调 window.api.feed.create({ url, title })
   * - Mock 模式：返回一个内存中的假 Feed
   */
  createFeed(url: string, title?: string): Promise<DataSourceState<Feed>>;
  /**
   * Phase 3.5.x：更新订阅源的部分字段（title / groupName / syncIntervalMin）。
   * 侧栏"移动到组" / "重命名组"功能依赖此方法。
   */
  updateFeed(id: string, input: { title?: string; groupName?: string | null; syncIntervalMin?: number | null }): Promise<DataSourceState<Feed>>;
  /**
   * Phase 3.5.x：列出所有订阅源组名（去重、按字典序排序）。用于侧栏"添加组 / 移动到组"。
   * groupName 为 null（未分组）的订阅源不计入。
   */
  feedListGroups(): Promise<DataSourceState<string[]>>;
  /**
   * Phase 3.5.x：把指定组的所有订阅源移到"未分组"（groupName = null）。
   * 用于侧栏"删除组"操作。返回被更新的订阅源数量。
   */
  feedClearGroup(groupName: string): Promise<DataSourceState<number>>;
  /**
   * 按需拉取文章的 Cleaned HTML。
   * - IPC 模式：调 window.api.content.getCleanedHtml(articleId)，可能触发服务端清洗
   * - Mock 模式：直接返回 article.cleanedHtml
   * - 选 article 时 ArticleReader 会用这个来填正文
   */
  getCleanedHtml(articleId: string): Promise<DataSourceState<string>>;
}
