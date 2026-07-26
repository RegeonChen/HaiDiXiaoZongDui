import type {
  SyncProgress,
  SyncResult,
  SyncStage,
  SyncStageEvent
} from '../../../../shared/types';
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
    results: [],
    currentFeedId: null,
    currentStage: null
  };

  constructor(
    private readonly store: FeedSyncStore,
    private readonly pipeline = new FeedPipeline()
  ) {}

  getProgress(): SyncProgress {
    return {
      ...this.progress,
      results: this.progress.results.map(cloneSyncResult),
      currentStage: this.progress.currentStage
        ? { ...this.progress.currentStage }
        : null
    };
  }

  async syncFeed(feedId: string): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    this.progress = {
      totalFeeds: 1,
      completedFeeds: 0,
      results: [],
      currentFeedId: feedId,
      currentStage: null
    };
    const target = await this.store.getFeedSyncTarget(feedId);
    if (!target) {
      const stages = [stageEvent('failed')];
      const result = failedResult(feedId, startedAt, `未找到订阅源：${feedId}`, stages);
      this.progress = {
        totalFeeds: 1,
        completedFeeds: 1,
        results: [result],
        currentFeedId: feedId,
        currentStage: stages[0]
      };
      return result;
    }
    const result = await this.syncTarget(target, startedAt);
    this.progress = {
      totalFeeds: 1,
      completedFeeds: 1,
      results: [result],
      currentFeedId: feedId,
      currentStage: result.stages.at(-1) ?? null
    };
    return result;
  }

  async syncAll(): Promise<SyncResult[]> {
    const targets = await this.store.listFeedSyncTargets();
    this.progress = {
      totalFeeds: targets.length,
      completedFeeds: 0,
      results: [],
      currentFeedId: null,
      currentStage: null
    };

    const results: SyncResult[] = [];
    for (const target of targets) {
      const result = await this.syncTarget(target, new Date().toISOString());
      results.push(result);
      this.progress = {
        totalFeeds: targets.length,
        completedFeeds: results.length,
        results: results.map(cloneSyncResult),
        currentFeedId: target.id,
        currentStage: result.stages.at(-1) ?? null
      };
    }
    return results;
  }

  private async syncTarget(target: FeedSyncTarget, startedAt: string): Promise<SyncResult> {
    const stages: SyncStageEvent[] = [];
    const recordStage = (stage: SyncStage): void => {
      if (stages.at(-1)?.stage === stage) return;
      const event = stageEvent(stage);
      stages.push(event);
      this.progress = {
        ...this.progress,
        currentFeedId: target.id,
        currentStage: event
      };
    };

    try {
      recordStage('fetching');
      const output = await this.pipeline.syncFeed({
        feedId: target.id,
        feedUrl: target.url
      }, {
        onStage: recordStage
      });
      recordStage('saving');
      const saved = await this.store.saveFeedPipelineOutput(output);
      recordStage('completed');
      return {
        feedId: target.id,
        success: true,
        error: null,
        newArticles: saved.newArticles,
        updatedArticles: saved.updatedArticles,
        stages,
        startedAt,
        finishedAt: new Date().toISOString()
      };
    } catch (error) {
      recordStage('failed');
      const message = diagnosticErrorMessage(error);
      try {
        await this.store.recordFeedSyncFailure(target.id, message);
        return failedResult(target.id, startedAt, message, stages);
      } catch (recordError) {
        return failedResult(
          target.id,
          startedAt,
          `${message}；同步状态保存失败：${diagnosticErrorMessage(recordError)}`,
          stages
        );
      }
    }
  }
}

function failedResult(
  feedId: string,
  startedAt: string,
  error: string,
  stages: SyncStageEvent[]
): SyncResult {
  return {
    feedId,
    success: false,
    error,
    newArticles: 0,
    updatedArticles: 0,
    stages,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

function stageEvent(stage: SyncStage): SyncStageEvent {
  return { stage, at: new Date().toISOString() };
}

function cloneSyncResult(result: SyncResult): SyncResult {
  return {
    ...result,
    stages: result.stages.map((stage) => ({ ...stage }))
  };
}
