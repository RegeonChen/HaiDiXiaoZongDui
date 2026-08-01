import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../../shared/types';
import { chatCompletion } from './openai-client';
import {
  TOPIC_RECOMMENDATION_LIMITS,
  buildTopicRecommendationMessages,
  createTopicRecommendationSourceSignature,
  parseTopicRecommendations,
  recommendTopics
} from './topic-recommendation-agent';

vi.mock('./openai-client', () => ({ chatCompletion: vi.fn() }));

const provider = {
  id: 'provider-1',
  name: 'Test',
  baseUrl: 'https://example.test/v1',
  modelName: 'test-model',
  apiKeySet: true,
  isDefault: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  _apiKey: 'secret'
} as AIProvider & { _apiKey: string };

const input = {
  title: 'OpenAI 发布 GPT-5.6，强化智能体编程能力',
  sourceTitle: '技术观察',
  summary: 'GPT-5.6 提升了工具调用和长任务编程能力。',
  content: 'OpenAI 公布 GPT-5.6。新模型关注 coding agent、tool use 和长任务可靠性。'
};

describe('topic recommendation agent', () => {
  beforeEach(() => vi.mocked(chatCompletion).mockReset());

  it('生成四组可直接用于本地匹配的专题草案', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({
      suggestions: [
        {
          name: 'GPT 模型演进',
          description: '追踪 GPT 系列模型的能力、评测与应用变化。',
          keywords: ['GPT-5.6', 'GPT', 'OpenAI', 'coding agent'],
          reason: '可连接后续版本、评测和产品报道。'
        },
        {
          name: '编程智能体进展',
          description: '追踪编程智能体的工具调用与长任务能力。',
          keywords: ['coding agent', '编程智能体', 'tool use'],
          reason: '主题可跨模型和产品持续追踪。'
        },
        {
          name: 'OpenAI 模型能力',
          description: '追踪 OpenAI 模型的能力发布和外部评测。',
          keywords: ['OpenAI', 'GPT-5.6', '模型评测'],
          reason: '聚焦稳定组织主体。'
        },
        {
          name: '大模型工具调用',
          description: '关注大模型使用外部工具完成复杂任务的发展。',
          keywords: ['tool use', '工具调用', 'LLM'],
          reason: '适合跨厂商比较。'
        }
      ]
    }));

    const result = await recommendTopics(provider, input);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      name: 'GPT 模型演进',
      keywords: ['GPT-5.6', 'GPT', 'OpenAI', 'coding agent']
    });
    expect(result[0]?.name).not.toBe(input.title);
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledWith(
      provider,
      expect.any(Array),
      expect.objectContaining({ temperature: 0.35, enableThinking: false })
    );
  });

  it('丢弃复制原标题、纯泛词、未在原文落地的推荐和重复项', () => {
    const result = parseTopicRecommendations(`\`\`\`json
      {"suggestions":[
        {"name":"${input.title}","description":"bad","keywords":["GPT"],"reason":"bad"},
        {"name":"AI","description":"bad","keywords":["AI"],"reason":"bad"},
        {"name":"量子计算演进","description":"bad","keywords":["量子计算","量子芯片"],"reason":"bad"},
        {"name":"GPT 模型演进","description":"ok","keywords":["GPT","GPT","OpenAI"],"reason":"ok"},
        {"name":"GPT 模型演进","description":"dup","keywords":["GPT"],"reason":"dup"}
      ]}
    \`\`\``, input.title, `${input.title}\n${input.content}`);

    expect(result).toEqual([{
      name: 'GPT 模型演进',
      description: 'ok',
      keywords: ['GPT', 'OpenAI'],
      reason: 'ok'
    }]);
  });

  it('限制正文长度并为内容变化生成稳定签名', () => {
    const longInput = {
      ...input,
      content: 'x'.repeat(TOPIC_RECOMMENDATION_LIMITS.articleCharacters + 200)
    };
    const messages = buildTopicRecommendationMessages(longInput);
    const userMessage = messages[1]?.content ?? '';
    expect(userMessage).not.toContain('x'.repeat(TOPIC_RECOMMENDATION_LIMITS.articleCharacters + 1));
    expect(messages[0]?.content).toContain('untrusted data');
    expect(createTopicRecommendationSourceSignature(input))
      .toBe(createTopicRecommendationSourceSignature({ ...input }));
    expect(createTopicRecommendationSourceSignature(input))
      .not.toBe(createTopicRecommendationSourceSignature({ ...input, content: `${input.content}!` }));
  });
});
