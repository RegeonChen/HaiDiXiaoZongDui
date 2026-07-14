import { describe, expect, it, vi } from 'vitest';
import type { FeedPipeline } from './feed-pipeline';
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
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 3, updatedArticles: 1 }))
    };
    const pipeline = {
      syncFeed: vi.fn(async () => pipelineOutput('a'))
    } as unknown as FeedPipeline;

    const result = await new SyncService(store, pipeline).syncFeed('a');

    expect(result).toMatchObject({
      success: true,
      newArticles: 3,
      updatedArticles: 1
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
      saveFeedPipelineOutput: vi.fn(async () => ({ newArticles: 1, updatedArticles: 0 }))
    };
    const pipeline = {
      syncFeed: vi.fn(async ({ feedId }: { feedId: string }) => {
        if (feedId === 'a') throw new Error('network failed');
        return pipelineOutput(feedId);
      })
    } as unknown as FeedPipeline;
    const service = new SyncService(store, pipeline);

    const results = await service.syncAll();

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(false);
    expect(results[1]?.success).toBe(true);
    expect(service.getProgress()).toMatchObject({ totalFeeds: 2, completedFeeds: 2 });
  });
});
