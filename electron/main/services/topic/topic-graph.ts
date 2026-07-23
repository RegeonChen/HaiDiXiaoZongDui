import crypto from 'node:crypto';
import type {
  Topic,
  TopicGraph,
  TopicGraphDirection,
  TopicGraphEdge,
  TopicGraphNode
} from '../../../../shared/types';
import type {
  TopicAnalysisBatch,
  TopicAnalysisInput
} from '../content-pipeline/topic-analysis-input';

export interface TopicArticleMatch {
  articleId: string;
  score: number;
  reason: string;
}

interface DirectionRule {
  id: string;
  name: string;
  color: string;
  terms: string[];
}

const DIRECTION_RULES: DirectionRule[] = [
  {
    id: 'capability',
    name: '发布与能力',
    color: '#5b7cfa',
    terms: ['发布', '推出', '模型', '能力', '性能', '评测', '基准', '参数', 'release', 'launch', 'model', 'capability', 'benchmark', 'performance', 'eval']
  },
  {
    id: 'application',
    name: '产品与应用',
    color: '#1f9d72',
    terms: ['应用', '产品', '开发', '编程', '工具', '生态', '接口', '智能体', 'agent', 'api', 'sdk', 'developer', 'product', 'app', 'coding', 'integration', 'tool']
  },
  {
    id: 'safety',
    name: '安全与治理',
    color: '#d46b47',
    terms: ['安全', '风险', '争议', '治理', '监管', '政策', '对齐', '版权', 'security', 'safety', 'risk', 'policy', 'regulation', 'alignment', 'copyright', 'controversy']
  },
  {
    id: 'deployment',
    name: '成本与部署',
    color: '#a56bd4',
    terms: ['价格', '成本', '部署', '推理', '延迟', '算力', '开源', '本地', 'price', 'cost', 'deploy', 'inference', 'latency', 'compute', 'token', 'open source', 'local']
  },
  {
    id: 'insight',
    name: '观点与解读',
    color: '#8a9099',
    terms: []
  }
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'with', 'from',
  'is', 'are', 'was', 'were', 'new', 'about', 'what', 'how', 'why', 'this', 'that',
  '一个', '一种', '关于', '以及', '如何', '什么', '最新', '我们', '他们'
]);

/**
 * 在本地完成候选发现。只读取标题、摘要与清洗正文，不调用模型。
 */
export function matchArticlesToTopic(
  topic: Pick<Topic, 'name' | 'keywords'>,
  items: TopicAnalysisInput[]
): TopicArticleMatch[] {
  const descriptors = [topic.name, ...topic.keywords]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const topicTokens = significantTokens(descriptors.join(' '));

  return items.flatMap((item) => {
    const title = normalizeText(item.title);
    const body = normalizeText(`${item.summary ?? ''} ${item.content.slice(0, 5000)}`);
    const titleCompact = compact(title);
    const bodyCompact = compact(body);
    let score = 0;
    const reasons: string[] = [];

    descriptors.forEach((descriptor, index) => {
      const descriptorCompact = compact(descriptor);
      if (descriptorCompact.length < 2) return;
      const titleHit = titleCompact.includes(descriptorCompact);
      const bodyHit = bodyCompact.includes(descriptorCompact);
      if (titleHit) {
        score += index === 0 ? 0.72 : 0.42;
        reasons.push(index === 0 ? '标题命中专题名称' : `标题命中关键词“${topic.keywords[index - 1]}”`);
      } else if (bodyHit) {
        score += index === 0 ? 0.28 : 0.14;
        reasons.push(index === 0 ? '正文命中专题名称' : `正文命中关键词“${topic.keywords[index - 1]}”`);
      }
    });

    if (topicTokens.size > 0) {
      const titleTokens = significantTokens(title);
      const overlap = intersectionSize(topicTokens, titleTokens) / topicTokens.size;
      if (overlap > 0) {
        score += overlap * 0.45;
        reasons.push(`标题关键词覆盖 ${Math.round(overlap * 100)}%`);
      }
    }

    if (score < 0.28) return [];
    return [{
      articleId: item.articleId,
      score: Math.min(1, Number(score.toFixed(3))),
      reason: [...new Set(reasons)].join('；') || '专题关键词匹配'
    }];
  }).sort((left, right) => right.score - left.score);
}

/**
 * 把已关联文章聚合为“时间 × 发展方向”演化图。
 * 完全确定性、可缓存；相同输入会得到稳定的节点和边 ID。
 */
export function buildTopicGraph(
  topic: Topic,
  batch: TopicAnalysisBatch,
  sourceSignature: string,
  generatedAt = new Date().toISOString()
): TopicGraph {
  const duplicateIdsByPrimary = new Map(
    batch.duplicateGroups.map((group) => [group.primaryArticleId, group.articleIds])
  );
  const itemById = new Map(batch.items.map((item) => [item.articleId, item]));
  const clusters: TopicAnalysisInput[][] = [];

  const ordered = [...batch.uniqueItems].sort(compareByDate);
  for (const item of ordered) {
    const existing = [...clusters].reverse().find((cluster) => {
      const primary = cluster[0];
      return withinDays(primary.publishedAt, item.publishedAt, 7) &&
        titleSimilarity(primary.title, item.title) >= 0.5;
    });
    if (existing) existing.push(item);
    else clusters.push([item]);
  }

  const nodes: TopicGraphNode[] = clusters.map((cluster) => {
    const primary = cluster[0];
    const articleIds = [...new Set(cluster.flatMap((item) =>
      duplicateIdsByPrimary.get(item.articleId) ?? [item.articleId]
    ))];
    const sources = articleIds
      .map((id) => itemById.get(id)?.sourceTitle)
      .filter((value): value is string => !!value);
    const direction = classifyDirection(cluster);
    const id = stableId('topic-node', topic.id, ...articleIds.sort());
    const summary = summarizeCluster(cluster);
    return {
      id,
      topicId: topic.id,
      eventGroupId: stableId('topic-event', topic.id, ...articleIds),
      title: primary.title,
      date: cluster.map((item) => item.publishedAt).sort()[0],
      directionId: direction.id,
      directionName: direction.name,
      summary,
      newInformation: summary,
      articleIds,
      sourceTitles: [...new Set(sources)]
    };
  }).sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  const directions = buildDirections(nodes);
  const edges = buildEdges(nodes);
  addNoveltyLabels(nodes);

  return {
    topicId: topic.id,
    directions,
    nodes,
    edges,
    generatedAt,
    sourceSignature
  };
}

function buildDirections(nodes: TopicGraphNode[]): TopicGraphDirection[] {
  const byId = new Map<string, TopicGraphDirection>();
  for (const node of nodes) {
    const rule = DIRECTION_RULES.find((item) => item.id === node.directionId) ?? DIRECTION_RULES.at(-1)!;
    const existing = byId.get(rule.id);
    if (!existing || Date.parse(node.date) < Date.parse(existing.firstSeenAt)) {
      byId.set(rule.id, {
        id: rule.id,
        name: rule.name,
        color: rule.color,
        firstSeenAt: node.date
      });
    }
  }
  return [...byId.values()].sort((left, right) => Date.parse(left.firstSeenAt) - Date.parse(right.firstSeenAt));
}

function buildEdges(nodes: TopicGraphNode[]): TopicGraphEdge[] {
  const edges: TopicGraphEdge[] = [];
  const latestByDirection = new Map<string, TopicGraphNode>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const previousInDirection = latestByDirection.get(node.directionId);
    const source = previousInDirection ?? nodes[index - 1];
    if (source) {
      const relation = previousInDirection ? 'develops' : 'branches';
      edges.push({
        id: stableId('topic-edge', source.id, node.id, relation),
        sourceNodeId: source.id,
        targetNodeId: node.id,
        relation,
        label: relation === 'develops' ? node.directionName : `转向${node.directionName}`
      });
    }
    latestByDirection.set(node.directionId, node);
  }
  return edges;
}

function addNoveltyLabels(nodes: TopicGraphNode[]): void {
  const previousByDirection = new Map<string, TopicGraphNode>();
  for (const node of nodes) {
    const previous = previousByDirection.get(node.directionId);
    if (!previous) node.newInformation = `该方向首次出现：${node.summary}`;
    else if (textSimilarity(previous.summary, node.summary) >= 0.7) {
      node.newInformation = `延续上一阶段，并补充：${node.summary}`;
    } else {
      node.newInformation = node.summary;
    }
    previousByDirection.set(node.directionId, node);
  }
}

function classifyDirection(cluster: TopicAnalysisInput[]): DirectionRule {
  const text = normalizeText(cluster.map((item) =>
    `${item.title} ${item.summary ?? ''} ${item.content.slice(0, 1200)}`
  ).join(' '));
  let best = DIRECTION_RULES.at(-1)!;
  let bestScore = 0;
  for (const rule of DIRECTION_RULES.slice(0, -1)) {
    const score = rule.terms.reduce((sum, term) => sum + countOccurrences(text, normalizeText(term)), 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

function summarizeCluster(cluster: TopicAnalysisInput[]): string {
  const preferred = cluster.find((item) => item.summary)?.summary ??
    cluster.find((item) => item.content)?.content ?? cluster[0].title;
  const plain = preferred
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_#>|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = plain.match(/^.{1,180}?(?:[。！？.!?](?=\s|$)|$)/)?.[0] ?? plain.slice(0, 180);
  return sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
}

function titleSimilarity(left: string, right: string): number {
  return setSimilarity(significantTokens(normalizeText(left)), significantTokens(normalizeText(right)));
}

function textSimilarity(left: string, right: string): number {
  return setSimilarity(significantTokens(normalizeText(left)), significantTokens(normalizeText(right)));
}

function setSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return compact([...left].join('')) === compact([...right].join('')) ? 1 : 0;
  const intersection = intersectionSize(left, right);
  return intersection / (left.size + right.size - intersection);
}

function significantTokens(value: string): Set<string> {
  const tokens = normalizeText(value).split(/\s+/).filter((token) => {
    if (!token || STOP_WORDS.has(token)) return false;
    if (/^\d+$/.test(token)) return token.length >= 2;
    return token.length >= 2;
  });
  return new Set(tokens);
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return value.replace(/\s+/g, '');
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function compareByDate(left: TopicAnalysisInput, right: TopicAnalysisInput): number {
  return Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
}

function withinDays(left: string, right: string, days: number): boolean {
  return Math.abs(Date.parse(left) - Date.parse(right)) <= days * 86_400_000;
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${crypto.createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 16)}`;
}
