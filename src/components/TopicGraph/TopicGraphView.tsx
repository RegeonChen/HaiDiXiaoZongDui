import { useMemo, useState } from 'react';
import type { Article, Feed, TopicGraph, TopicGraphNode } from '@shared/types';
import { EmptyView } from '../StatusView/EmptyView';
import './TopicGraphView.css';

export interface TopicGraphViewProps {
  graph: TopicGraph;
  articles: Article[];
  feeds: Feed[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenArticle: (article: Article) => void;
}

const NODE_WIDTH = 232;
const NODE_HEIGHT = 126;
const LEFT_GUTTER = 170;
const TOP_GUTTER = 58;
const X_STEP = 272;
const Y_STEP = 176;

export function TopicGraphView({
  graph,
  articles,
  feeds,
  refreshing,
  onRefresh,
  onOpenArticle
}: TopicGraphViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph.nodes[0]?.id ?? null);
  const articleById = useMemo(() => new Map(articles.map((article) => [article.id, article])), [articles]);
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const directionIndex = useMemo(
    () => new Map(graph.directions.map((direction, index) => [direction.id, index])),
    [graph.directions]
  );
  const positions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((node, index) => {
      result.set(node.id, {
        x: LEFT_GUTTER + index * X_STEP,
        y: TOP_GUTTER + (directionIndex.get(node.directionId) ?? 0) * Y_STEP
      });
    });
    return result;
  }, [directionIndex, graph.nodes]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null;
  const canvasWidth = Math.max(920, LEFT_GUTTER + Math.max(graph.nodes.length, 1) * X_STEP + 48);
  const canvasHeight = Math.max(260, TOP_GUTTER + Math.max(graph.directions.length, 1) * Y_STEP + 38);

  if (graph.nodes.length === 0) {
    return (
      <div className="topic-graph-empty">
        <EmptyView
          title="还没有匹配到相关文章"
          hint="编辑专题名称或关键词后重新分析。系统会先在本地筛选，不会为了发现候选文章调用模型。"
        />
        <button type="button" className="topic-graph__refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? '分析中…' : '重新分析'}
        </button>
      </div>
    );
  }

  return (
    <section className="topic-graph" aria-label="专题演化图">
      <header className="topic-graph__toolbar">
        <div>
          <h2 className="topic-graph__title">专题演化图</h2>
          <p className="topic-graph__subtitle">
            {graph.nodes.length} 个事件节点 · {graph.directions.length} 条发展方向 · {articles.length} 篇来源文章
          </p>
        </div>
        <div className="topic-graph__legend">
          <span><i className="topic-graph__legend-line" />同方向演进</span>
          <span><i className="topic-graph__legend-line is-branch" />发展分支</span>
          <button type="button" className="topic-graph__refresh" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '分析中…' : '↻ 重新分析'}
          </button>
        </div>
      </header>

      <div className="topic-graph__viewport">
        <div className="topic-graph__canvas" style={{ width: canvasWidth, height: canvasHeight }}>
          {graph.directions.map((direction, index) => {
            const y = TOP_GUTTER + index * Y_STEP;
            return (
              <div
                key={direction.id}
                className="topic-graph__lane"
                style={{ top: y - 18, width: canvasWidth, '--lane-color': direction.color } as React.CSSProperties}
              >
                <span className="topic-graph__lane-label">{direction.name}</span>
              </div>
            );
          })}

          <svg className="topic-graph__edges" width={canvasWidth} height={canvasHeight} aria-hidden="true">
            <defs>
              <marker id="topic-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
              </marker>
            </defs>
            {graph.edges.map((edge) => {
              const source = positions.get(edge.sourceNodeId);
              const target = positions.get(edge.targetNodeId);
              if (!source || !target) return null;
              const startX = source.x + NODE_WIDTH;
              const startY = source.y + NODE_HEIGHT / 2;
              const endX = target.x - 8;
              const endY = target.y + NODE_HEIGHT / 2;
              const bend = Math.max(42, (endX - startX) / 2);
              const d = `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
              return (
                <path
                  key={edge.id}
                  d={d}
                  className={`topic-graph__edge topic-graph__edge--${edge.relation}`}
                  markerEnd="url(#topic-arrow)"
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const position = positions.get(node.id)!;
            const direction = graph.directions.find((item) => item.id === node.directionId);
            return (
              <button
                type="button"
                key={node.id}
                className={`topic-graph__node ${selectedNode?.id === node.id ? 'is-selected' : ''}`}
                style={{
                  left: position.x,
                  top: position.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  '--node-color': direction?.color ?? 'var(--accent)'
                } as React.CSSProperties}
                onClick={() => setSelectedNodeId(node.id)}
                aria-pressed={selectedNode?.id === node.id}
              >
                <span className="topic-graph__node-date">{formatDate(node.date)}</span>
                <strong className="topic-graph__node-title">{node.title}</strong>
                <span className="topic-graph__node-summary">{node.newInformation ?? node.summary}</span>
                <span className="topic-graph__node-sources">{node.articleIds.length} 篇 · {node.sourceTitles.join('、')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          articleById={articleById}
          feedById={feedById}
          onOpenArticle={onOpenArticle}
        />
      )}
      <p className="topic-graph__cache-note">
        本图由本地标题、摘要和清洗正文生成；只有关联文章发生变化时才会重建。
      </p>
    </section>
  );
}

function NodeDetail({
  node,
  articleById,
  feedById,
  onOpenArticle
}: {
  node: TopicGraphNode;
  articleById: Map<string, Article>;
  feedById: Map<string, Feed>;
  onOpenArticle: (article: Article) => void;
}) {
  return (
    <aside className="topic-graph-detail">
      <div className="topic-graph-detail__summary">
        <span className="topic-graph-detail__direction">{node.directionName}</span>
        <h3>{node.title}</h3>
        <p>{node.newInformation ?? node.summary}</p>
      </div>
      <ul className="topic-graph-detail__sources">
        {node.articleIds.map((articleId) => {
          const article = articleById.get(articleId);
          if (!article) return null;
          const feed = feedById.get(article.feedId);
          return (
            <li key={article.id}>
              <button type="button" onClick={() => onOpenArticle(article)}>
                <strong>{article.title}</strong>
                <span>{feed?.siteTitle || feed?.title || '未知来源'} · {formatDate(article.publishedAt ?? article.fetchedAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
