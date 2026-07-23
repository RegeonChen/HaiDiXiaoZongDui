import { describe, expect, it } from 'vitest';
import type { Article, Feed, Topic } from '../../../../shared/types';
import { prepareTopicAnalysisInputs } from '../content-pipeline/topic-analysis-input';
import { buildTopicGraph, matchArticlesToTopic } from './topic-graph';

describe('topic evolution graph', () => {
  it('matches related articles locally without including unrelated content', () => {
    const topic = topicFixture();
    const batch = prepareTopicAnalysisInputs([
      article({ id: 'release', title: 'OpenAI releases GPT-5.6', cleanedMarkdown: 'The GPT-5.6 model is now available.' }),
      article({ id: 'coding', title: 'Coding with GPT-5.6 API', cleanedMarkdown: 'A developer integration guide.' }),
      article({ id: 'unrelated', title: 'A new SQLite release', cleanedMarkdown: 'Database migration notes.' })
    ], [feed()]);

    expect(matchArticlesToTopic(topic, batch.items).map((match) => match.articleId))
      .toEqual(['release', 'coding']);
  });

  it('builds stable chronological nodes, direction lanes and traceable edges', () => {
    const topic = topicFixture();
    const sharedBody = 'GPT-5.6 benchmark results and capability details. '.repeat(4);
    const articles = [
      article({
        id: 'release', title: 'GPT-5.6 model released', publishedAt: '2026-07-09T00:00:00.000Z',
        cleanedMarkdown: 'OpenAI released the GPT-5.6 model with new capabilities.'
      }),
      article({
        id: 'benchmark', title: 'GPT-5.6 benchmark results', publishedAt: '2026-07-10T00:00:00.000Z',
        cleanedMarkdown: sharedBody
      }),
      article({
        id: 'benchmark-copy', feedId: 'feed-b', title: 'GPT-5.6 benchmark results',
        url: 'https://mirror.example/gpt56-benchmark', publishedAt: '2026-07-10T06:00:00.000Z',
        cleanedMarkdown: sharedBody
      }),
      article({
        id: 'api', title: 'Developers adopt the GPT-5.6 API', publishedAt: '2026-07-12T00:00:00.000Z',
        cleanedMarkdown: 'Developer tools, SDK integration and coding agents use the API.'
      }),
      article({
        id: 'safety', title: 'GPT-5.6 safety debate', publishedAt: '2026-07-13T00:00:00.000Z',
        cleanedMarkdown: 'Researchers discuss model safety, risk and regulation.'
      })
    ];
    const feeds = [feed(), feed({ id: 'feed-b', title: 'Source B', siteTitle: 'Source B' })];
    const batch = prepareTopicAnalysisInputs(articles, feeds);

    const graph = buildTopicGraph(topic, batch, 'signature', '2026-07-14T00:00:00.000Z');

    expect(graph.nodes.map((node) => node.date)).toEqual([...graph.nodes.map((node) => node.date)].sort());
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.find((node) => node.articleIds.includes('benchmark'))?.articleIds)
      .toEqual(expect.arrayContaining(['benchmark', 'benchmark-copy']));
    expect(graph.directions.map((direction) => direction.name))
      .toEqual(expect.arrayContaining(['发布与能力', '产品与应用', '安全与治理']));
    expect(graph.edges).toHaveLength(graph.nodes.length - 1);
    expect(graph.edges.some((edge) => edge.relation === 'branches')).toBe(true);
    expect(graph.nodes.every((node) => node.sourceTitles.length > 0 && !!node.newInformation)).toBe(true);

    const again = buildTopicGraph(topic, batch, 'signature', '2026-07-15T00:00:00.000Z');
    expect(again.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(again.edges.map((edge) => edge.id)).toEqual(graph.edges.map((edge) => edge.id));
  });
});

function topicFixture(): Topic {
  return {
    id: 'topic-gpt56',
    name: 'GPT-5.6',
    description: 'Track GPT-5.6 development',
    keywords: ['GPT-5.6'],
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z'
  };
}

function article(overrides: Partial<Article> = {}): Article {
  const timestamp = '2026-07-09T00:00:00.000Z';
  return {
    id: 'article-id', feedId: 'feed-a', title: 'Article',
    url: `https://example.test/${overrides.id ?? 'article'}`, author: null,
    publishedAt: timestamp, fetchedAt: timestamp, rawHtml: '<p>Raw</p>', rawText: 'Raw',
    cleanedHtml: '<p>Cleaned</p>', cleanedMarkdown: 'Cleaned', cleaningStatus: 'done',
    isRead: false, isStarred: false, summary: null, translatedParagraphs: null,
    guid: `guid-${overrides.id ?? 'article'}`, createdAt: timestamp, updatedAt: timestamp,
    ...overrides
  };
}

function feed(overrides: Partial<Feed> = {}): Feed {
  const timestamp = '2026-07-09T00:00:00.000Z';
  return {
    id: 'feed-a', title: 'Source A', url: 'https://example.test/feed.xml',
    siteTitle: 'Source A', description: '', link: 'https://example.test', feedType: 'rss',
    groupName: null, iconUrl: null, lastSyncAt: timestamp, lastSyncSuccess: true,
    lastSyncError: null, syncIntervalMin: null, createdAt: timestamp, updatedAt: timestamp,
    ...overrides
  };
}
