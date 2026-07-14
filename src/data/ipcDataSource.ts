/**
 * IpcDataSource — 通过 window.api 走真实 IPC 的 DataSource 实现
 *
 * 适用于 Phase 2 集成及以后：UI 看到的所有数据都来自 SQLite + content-pipeline。
 * 错误处理：把 IpcResult 的 {success: false, error} 翻译成 DataSourceState 的 error；
 * 写入类（markRead/markStarred）抛错由调用方决定如何处理。
 */
import type { Article, Feed } from '@shared/types';
import type { DataSource, DataSourceState } from '../types/dataSource';

type ErrorResponse = { success: false; error: { code: string; message: string; detail?: string } };
type SuccessResponse<T> = { success: true; data: T };
type IpcResponse<T> = SuccessResponse<T> | ErrorResponse;

function toError<T>(r: ErrorResponse): DataSourceState<T> {
  return { kind: 'error', error: `${r.error.code}: ${r.error.message}` };
}

function unwrap<T>(r: IpcResponse<T>): DataSourceState<T> {
  return r.success ? { kind: 'ready', data: r.data } : toError(r);
}

export class IpcDataSource implements DataSource {
  async feeds(): Promise<DataSourceState<Feed[]>> {
    return unwrap(await window.api.feed.list());
  }

  async articles(filter: {
    feedId?: string;
    isRead?: boolean;
    isStarred?: boolean;
  }): Promise<DataSourceState<Article[]>> {
    // preload 把 filter 包成 {filter} 再 invoke；这里直接传 ArticleFilter
    const r = await window.api.article.list(filter);
    if (!r.success) return toError(r);
    // IPC 返回 { items, total }；UI 只用 items
    return { kind: 'ready', data: r.data.items };
  }

  async markRead(articleId: string, isRead: boolean): Promise<void> {
    const r = await window.api.article.markRead(articleId, isRead);
    if (!r.success) throw new Error(`${r.error.code}: ${r.error.message}`);
  }

  async markStarred(articleId: string, isStarred: boolean): Promise<void> {
    const r = await window.api.article.markStarred(articleId, isStarred);
    if (!r.success) throw new Error(`${r.error.code}: ${r.error.message}`);
  }

  async syncFeed(feedId: string): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.sync.feed(feedId);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    const result = r.data;
    if (result.success) {
      return {
        ok: true,
        message: `同步成功（新增 ${result.newArticles}，更新 ${result.updatedArticles}）`
      };
    }
    return { ok: false, message: result.error ?? '同步失败' };
  }

  async createFeed(url: string, title?: string): Promise<DataSourceState<Feed>> {
    return unwrap(await window.api.feed.create({ url, title }));
  }

  async getCleanedHtml(articleId: string): Promise<DataSourceState<string>> {
    return unwrap(await window.api.content.getCleanedHtml(articleId));
  }
}
