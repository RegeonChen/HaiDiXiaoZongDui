import { describe, expect, it, vi } from 'vitest';
import type { FeedPipeline } from './feed-pipeline';
import { ContentPipelineError } from './errors';
import { SyncService, type FeedSyncStore } from './sync-service';
import type { FeedPipelineOutput } from './types';

function pipelineOutput(feedId: string): FeedPipelineOutput {
  const timestamp = '2026-07-14T00:00:00.000Z';
  return {
    feedId,
    feedUrl: `https://example.com/${feedId}`,
    feed: {
      title: feedId,
      siteTitle: feedId,
      description: '',
      link: 'https://example.com',
      feedType: 'rss',
      iconUrl: null,
      articles: []
    },
    articles: [],
    warnings: [],
    startedAt: timestamp,
    finishedAt: timestamp
  };
}

describe('SyncService', () => {
  it('uses the database port for persistence and article counts', async () => {
    const store: FeedSyncStore = {
      listFeedSyncTargets: vi.fn(async () => [{ id: 'a', url: 'https://example.com/a' }]),
      getFeedSyncTarget: vi.fn(async () => ({ id: 'a', url: 'https://example.com/a' })),
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 3, updatedArticles: 1 })),
      recordFeedSyncFailure: vi.fn(async () => undefined)
    };
    const pipeline = {
      syncFeed: vi.fn(async (
        _target: unknown,
        options?: { onStage?: (stage: 'fetching' | 'parsing') => void }
      ) => {
        options?.onStage?.('fetching');
        options?.onStage?.('parsing');
        return pipelineOutput('a');
      })
    } as unknown as FeedPipeline;

    const service = new SyncService(store, pipeline);
    const result = await service.syncFeed('a');

    expect(result).toMatchObject({
      success: true,
      newArticles: 3,
      updatedArticles: 1
    });
    expect(result.stages.map(({ stage }) => stage)).toEqual([
      'fetching',
      'parsing',
      'saving',
      'completed'
    ]);
    expect(service.getProgress()).toMatchObject({
      totalFeeds: 1,
      completedFeeds: 1,
      currentFeedId: 'a',
      currentStage: { stage: 'completed' }
    });
    expect(store.saveFeedPipelineOutput).toHaveBeenCalledOnce();
  });

  it('continues sync-all after one feed fails and exposes progress', async () => {
    const store: FeedSyncStore = {
      listFeedSyncTargets: vi.fn(async () => [
        { id: 'a', url: 'https://example.com/a' },
        { id: 'b', url: 'https://example.com/b' }
      ]),
      getFeedSyncTarget: vi.fn(async () => null),
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 1, updatedArticles: 0 })),
      recordFeedSyncFailure: vi.fn(async () => undefined)
    };
    const pipeline = {
      syncFeed: vi.fn(async (
        { feedId }: { feedId: string },
        options?: { onStage?: (stage: 'fetching' | 'parsing') => void }
      ) => {
        options?.onStage?.('fetching');
        if (feedId === 'a') throw new Error('network failed');
        options?.onStage?.('parsing');
        return pipelineOutput(feedId);
      })
    } as unknown as FeedPipeline;
    const service = new SyncService(store, pipeline);

    const results = await service.syncAll();

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(false);
    expect(results[1]?.success).toBe(true);
    expect(results[0]?.stages.map(({ stage }) => stage)).toEqual(['fetching', 'failed']);
    expect(results[1]?.stages.map(({ stage }) => stage)).toEqual([
      'fetching',
      'parsing',
      'saving',
      'completed'
    ]);
    expect(service.getProgress()).toMatchObject({
      totalFeeds: 2,
      completedFeeds: 2,
      currentFeedId: 'b',
      currentStage: { stage: 'completed' }
    });
    expect(store.recordFeedSyncFailure).toHaveBeenCalledWith('a', 'network failed');
  });

  it('returns both errors when persisting a sync failure also fails', async () => {
    const store: FeedSyncStore = {
      listFeedSyncTargets: vi.fn(async () => []),
      getFeedSyncTarget: vi.fn(async () => ({ id: 'a', url: 'https://example.com/a' })),
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 0, updatedArticles: 0 })),
      recordFeedSyncFailure: vi.fn(async () => { throw new Error('database unavailable'); })
    };
    const pipeline = {
      syncFeed: vi.fn(async () => { throw new Error('network failed'); })
    } as unknown as FeedPipeline;

    const result = await new SyncService(store, pipeline).syncFeed('a');

    expect(result.success).toBe(false);
    expect(result.error).toContain('network failed');
    expect(result.error).toContain('database unavailable');
  });

  it('keeps stable pipeline error codes in sync diagnostics', async () => {
    const store: FeedSyncStore = {
      listFeedSyncTargets: vi.fn(async () => []),
      getFeedSyncTarget: vi.fn(async () => ({ id: 'a', url: 'https://example.com/a' })),
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 0, updatedArticles: 0 })),
      recordFeedSyncFailure: vi.fn(async () => undefined)
    };
    const pipeline = {
      syncFeed: vi.fn(async (
        _target: unknown,
        options?: { onStage?: (stage: 'fetching' | 'parsing') => void }
      ) => {
        options?.onStage?.('fetching');
        throw new ContentPipelineError('HTTP_TIMEOUT', '请求超时：example.com');
      })
    } as unknown as FeedPipeline;

    const result = await new SyncService(store, pipeline).syncFeed('a');

    expect(result.error).toBe('[HTTP_TIMEOUT] 请求超时：example.com');
    expect(result.stages.map(({ stage }) => stage)).toEqual(['fetching', 'failed']);
    expect(store.recordFeedSyncFailure).toHaveBeenCalledWith(
      'a',
      '[HTTP_TIMEOUT] 请求超时：example.com'
    );
  });

  it('reports a missing feed as a completed failed sync', async () => {
    const store: FeedSyncStore = {
      listFeedSyncTargets: vi.fn(async () => []),
      getFeedSyncTarget: vi.fn(async () => null),
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 0, updatedArticles: 0 })),
      recordFeedSyncFailure: vi.fn(async () => undefined)
    };
    const pipeline = {
      syncFeed: vi.fn()
    } as unknown as FeedPipeline;
    const service = new SyncService(store, pipeline);

    const result = await service.syncFeed('missing');

    expect(result).toMatchObject({
      success: false,
      error: '未找到订阅源：missing',
      stages: [{ stage: 'failed' }]
    });
    expect(service.getProgress()).toMatchObject({
      totalFeeds: 1,
      completedFeeds: 1,
      currentFeedId: 'missing',
      currentStage: { stage: 'failed' }
    });
    expect(pipeline.syncFeed).not.toHaveBeenCalled();
  });
});
