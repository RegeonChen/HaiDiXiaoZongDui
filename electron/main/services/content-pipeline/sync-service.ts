import type { SyncProgress, SyncResult } from '../../../../shared/types';
import { diagnosticErrorMessage } from './errors';
import { FeedPipeline } from './feed-pipeline';
import type { FeedPipelineOutput } from './types';

export interface FeedSyncTarget {
  id: string;
  url: string;
}

export interface PipelineSaveResult {
  newArticles: number;
  updatedArticles: number;
}

/** Implemented by Task 2.3 without exposing database internals to this module. */
export interface FeedSyncStore {
  listFeedSyncTargets(): Promise<FeedSyncTarget[]>;
  getFeedSyncTarget(feedId: string): Promise<FeedSyncTarget | null>;
  saveFeedPipelineOutput(output: FeedPipelineOutput): Promise<PipelineSaveResult>;
  recordFeedSyncFailure(feedId: string, error: string): Promise<void>;
}

export class SyncService {
  private progress: SyncProgress = {
    totalFeeds: 0,
    completedFeeds: 0,
    results: []
  };

  constructor(
    private readonly store: FeedSyncStore,
    private readonly pipeline = new FeedPipeline()
  ) {}

  getProgress(): SyncProgress {
    return {
      ...this.progress,
      results: [...this.progress.results]
    };
  }

  async syncFeed(feedId: string): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const target = await this.store.getFeedSyncTarget(feedId);
    if (!target) {
      return failedResult(feedId, startedAt, `未找到订阅源：${feedId}`);
    }
    return this.syncTarget(target, startedAt);
  }

  async syncAll(): Promise<SyncResult[]> {
    const targets = await this.store.listFeedSyncTargets();
    this.progress = {
      totalFeeds: targets.length,
      completedFeeds: 0,
      results: []
    };

    const results: SyncResult[] = [];
    for (const target of targets) {
      const result = await this.syncTarget(target, new Date().toISOString());
      results.push(result);
      this.progress = {
        totalFeeds: targets.length,
        completedFeeds: results.length,
        results: [...results]
      };
    }
    return results;
  }

  private async syncTarget(target: FeedSyncTarget, startedAt: string): Promise<SyncResult> {
    try {
      const output = await this.pipeline.syncFeed({
        feedId: target.id,
        feedUrl: target.url
      });
      const saved = await this.store.saveFeedPipelineOutput(output);
      return {
        feedId: target.id,
        success: true,
        error: null,
        newArticles: saved.newArticles,
        updatedArticles: saved.updatedArticles,
        startedAt,
        finishedAt: new Date().toISOString()
      };
    } catch (error) {
      const message = diagnosticErrorMessage(error);
      try {
        await this.store.recordFeedSyncFailure(target.id, message);
        return failedResult(target.id, startedAt, message);
      } catch (recordError) {
        return failedResult(
          target.id,
          startedAt,
          `${message}；同步状态保存失败：${diagnosticErrorMessage(recordError)}`
        );
      }
    }
  }
}

function failedResult(feedId: string, startedAt: string, error: string): SyncResult {
  return {
    feedId,
    success: false,
    error,
    newArticles: 0,
    updatedArticles: 0,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}
