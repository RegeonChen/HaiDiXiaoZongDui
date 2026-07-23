import crypto from 'node:crypto';
import type { SqlValue } from 'sql.js';
import type {
  Article,
  Briefing,
  EventGroup,
  ExportFormat,
  TimelineEntry,
  Topic,
  TopicCreateInput,
  TopicGraph,
  TopicUpdateInput
} from '../../../shared/types';
import { getDatabase, saveDatabase } from './connection';
import { ArticleRepository } from './article-repository';
import { FeedRepository } from './feed-repository';
import { prepareTopicAnalysisInputs } from '../services/content-pipeline/topic-analysis-input';
import { buildTopicGraph, matchArticlesToTopic } from '../services/topic/topic-graph';

function now(): string {
  return new Date().toISOString();
}

export const TopicRepository = {
  list(): Topic[] {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM topics ORDER BY updated_at DESC');
    if (!rows.length) return [];
    return rows[0].values.map((row) => rowToTopic(rows[0].columns, row));
  },

  getById(id: string): Topic | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM topics WHERE id = ?', [id]);
    if (!rows.length || !rows[0].values.length) return null;
    return rowToTopic(rows[0].columns, rows[0].values[0]);
  },

  create(input: TopicCreateInput): Topic {
    const name = input.name.trim();
    if (!name) throw new TypeError('专题名称不能为空');
    const db = getDatabase();
    const id = crypto.randomUUID();
    const timestamp = now();
    const keywords = normalizeKeywords(input.keywords ?? []);
    db.run(
      `INSERT INTO topics (id, name, description, keywords, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, input.description.trim(), JSON.stringify(keywords), timestamp, timestamp]
    );
    if (input.seedArticleId && ArticleRepository.getById(input.seedArticleId)) {
      db.run(
        `INSERT INTO topic_articles
         (topic_id, article_id, match_score, match_reason, match_source, created_at)
         VALUES (?, ?, 1, ?, 'seed', ?)`,
        [id, input.seedArticleId, '用户从该文章创建专题', timestamp]
      );
    }
    saveDatabase();
    this.refreshAssociations(id);
    return this.getById(id)!;
  },

  update(id: string, input: TopicUpdateInput): Topic | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const name = input.name === undefined ? existing.name : input.name.trim();
    if (!name) throw new TypeError('专题名称不能为空');
    const description = input.description === undefined ? existing.description : input.description.trim();
    const keywords = input.keywords === undefined ? existing.keywords : normalizeKeywords(input.keywords);
    const db = getDatabase();
    db.run(
      `UPDATE topics SET name = ?, description = ?, keywords = ?, updated_at = ? WHERE id = ?`,
      [name, description, JSON.stringify(keywords), now(), id]
    );
    db.run('DELETE FROM topic_graph_cache WHERE topic_id = ?', [id]);
    db.run('DELETE FROM topic_briefings WHERE topic_id = ?', [id]);
    saveDatabase();
    this.refreshAssociations(id);
    return this.getById(id);
  },

  delete(id: string): boolean {
    if (!this.getById(id)) return false;
    const db = getDatabase();
    db.run('DELETE FROM topics WHERE id = ?', [id]);
    saveDatabase();
    return true;
  },

  /**
   * 重新运行低成本本地候选匹配。seed/manual 关联会保留，auto 关联会重算。
   * 只有文章集合变化时才失效演化图与简报缓存。
   */
  refreshAssociations(topicId: string): number {
    const topic = this.getById(topicId);
    if (!topic) throw new Error(`专题 ${topicId} 不存在`);
    const before = this.getAssociationIds(topicId).join('|');
    const allArticles = ArticleRepository.list({ limit: Math.max(ArticleRepository.countAll(), 1) }).items;
    const batch = prepareTopicAnalysisInputs(allArticles, FeedRepository.list());
    const matches = matchArticlesToTopic(topic, batch.items);
    const db = getDatabase();
    const timestamp = now();

    db.run('BEGIN TRANSACTION');
    try {
      db.run(`DELETE FROM topic_articles WHERE topic_id = ? AND match_source = 'auto'`, [topicId]);
      const statement = db.prepare(`
        INSERT OR IGNORE INTO topic_articles
        (topic_id, article_id, match_score, match_reason, match_source, created_at)
        VALUES (?, ?, ?, ?, 'auto', ?)
      `);
      for (const match of matches) {
        statement.run([topicId, match.articleId, match.score, match.reason, timestamp]);
      }
      statement.free();
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }

    const afterIds = this.getAssociationIds(topicId);
    if (before !== afterIds.join('|')) {
      db.run('DELETE FROM topic_graph_cache WHERE topic_id = ?', [topicId]);
      db.run('DELETE FROM topic_briefings WHERE topic_id = ?', [topicId]);
    }
    saveDatabase();
    return afterIds.length;
  },

  getArticles(topicId: string): Article[] {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT article_id FROM topic_articles
       WHERE topic_id = ?
       ORDER BY match_score DESC, created_at ASC`,
      [topicId]
    );
    if (!rows.length) return [];
    return rows[0].values
      .map((row) => ArticleRepository.getById(row[0] as string))
      .filter((article): article is Article => article !== null);
  },

  getGraph(topicId: string): TopicGraph {
    const topic = this.getById(topicId);
    if (!topic) throw new Error(`专题 ${topicId} 不存在`);
    this.refreshAssociations(topicId);
    const articles = this.getArticles(topicId);
    const batch = prepareTopicAnalysisInputs(articles, FeedRepository.list());
    const signature = graphSignature(topic, batch.items.map((item) => ({
      id: item.articleId,
      publishedAt: item.publishedAt,
      fingerprint: item.contentFingerprint,
      summary: item.summary
    })));
    const cached = this.getCachedGraph(topicId, signature);
    if (cached) return cached;

    const graph = buildTopicGraph(topic, batch, signature);
    const db = getDatabase();
    db.run(
      `INSERT INTO topic_graph_cache (topic_id, source_signature, graph_json, generated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(topic_id) DO UPDATE SET
         source_signature = excluded.source_signature,
         graph_json = excluded.graph_json,
         generated_at = excluded.generated_at`,
      [topicId, signature, JSON.stringify(graph), graph.generatedAt]
    );
    saveDatabase();
    return graph;
  },

  getTimeline(topicId: string): TimelineEntry[] {
    return this.getGraph(topicId).nodes.map((node) => ({
      date: node.date,
      title: node.title,
      articleId: node.articleIds[0],
      feedTitle: node.sourceTitles.join('、'),
      newInformation: node.newInformation
    }));
  },

  getEventGroups(topicId: string): EventGroup[] {
    return this.getGraph(topicId).nodes.map((node) => ({
      id: node.eventGroupId,
      topicId,
      name: node.title,
      articleIds: node.articleIds,
      startDate: node.date,
      endDate: node.date
    }));
  },

  generateBriefing(topicId: string): Briefing {
    const topic = this.getById(topicId);
    if (!topic) throw new Error(`专题 ${topicId} 不存在`);
    const graph = this.getGraph(topicId);
    const articles = new Map(this.getArticles(topicId).map((article) => [article.id, article]));
    const timestamp = now();
    const lines = [
      `# ${topic.name}：专题脉络`,
      '',
      `共关联 ${articles.size} 篇文章，形成 ${graph.nodes.length} 个事件节点和 ${graph.directions.length} 条发展方向。`,
      ''
    ];
    const conclusions: Briefing['conclusions'] = [];
    let conclusionIndex = 1;

    for (const direction of graph.directions) {
      lines.push(`## ${direction.name}`, '');
      for (const node of graph.nodes.filter((item) => item.directionId === direction.id)) {
        lines.push(`### ${formatDate(node.date)} · ${node.title}`, '', `${node.newInformation ?? node.summary} [${conclusionIndex}]`, '');
        const sourceLinks = node.articleIds.flatMap((articleId) => {
          const article = articles.get(articleId);
          return article ? [`[来源：${article.title}](${article.url})`] : [];
        });
        if (sourceLinks.length) lines.push(sourceLinks.join(' · '), '');
        conclusions.push({
          index: conclusionIndex,
          text: node.newInformation ?? node.summary,
          supportingArticleIds: node.articleIds,
          viewpointDiff: null
        });
        conclusionIndex += 1;
      }
    }

    const previous = this.getBriefing(topicId);
    const briefing: Briefing = {
      id: previous?.id ?? crypto.randomUUID(),
      topicId,
      title: `${topic.name}：专题脉络`,
      content: lines.join('\n'),
      conclusions,
      sourceArticleIds: [...articles.keys()],
      generatedAt: timestamp,
      editedContent: null,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    this.saveBriefing(briefing);
    return briefing;
  },

  getBriefing(topicId: string): Briefing | null {
    const db = getDatabase();
    const rows = db.exec('SELECT briefing_json FROM topic_briefings WHERE topic_id = ?', [topicId]);
    if (!rows.length || !rows[0].values.length) return null;
    try {
      return JSON.parse(rows[0].values[0][0] as string) as Briefing;
    } catch {
      return null;
    }
  },

  updateBriefing(topicId: string, editedContent: string): Briefing | null {
    const briefing = this.getBriefing(topicId);
    if (!briefing) return null;
    const updated = { ...briefing, editedContent, updatedAt: now() };
    this.saveBriefing(updated);
    return updated;
  },

  exportBriefing(topicId: string, format: ExportFormat): string | null {
    const briefing = this.getBriefing(topicId);
    if (!briefing) return null;
    const markdown = briefing.editedContent ?? briefing.content;
    if (format === 'markdown') return markdown;
    return markdownToSafeHtml(briefing.title, markdown);
  },

  getAssociationIds(topicId: string): string[] {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT article_id FROM topic_articles WHERE topic_id = ? ORDER BY article_id',
      [topicId]
    );
    if (!rows.length) return [];
    return rows[0].values.map((row) => row[0] as string);
  },

  getCachedGraph(topicId: string, signature: string): TopicGraph | null {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT graph_json FROM topic_graph_cache WHERE topic_id = ? AND source_signature = ?`,
      [topicId, signature]
    );
    if (!rows.length || !rows[0].values.length) return null;
    try {
      return JSON.parse(rows[0].values[0][0] as string) as TopicGraph;
    } catch {
      return null;
    }
  },

  saveBriefing(briefing: Briefing): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO topic_briefings (topic_id, briefing_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(topic_id) DO UPDATE SET
         briefing_json = excluded.briefing_json,
         updated_at = excluded.updated_at`,
      [briefing.topicId, JSON.stringify(briefing), briefing.updatedAt]
    );
    saveDatabase();
  }
};

function normalizeKeywords(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function rowToTopic(columns: string[], row: SqlValue[]): Topic {
  const value: Record<string, SqlValue> = {};
  columns.forEach((column, index) => { value[column] = row[index]; });
  let keywords: string[] = [];
  try {
    const parsed = JSON.parse(value.keywords as string) as unknown;
    if (Array.isArray(parsed)) keywords = parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    keywords = [];
  }
  return {
    id: value.id as string,
    name: value.name as string,
    description: value.description as string,
    keywords,
    createdAt: value.created_at as string,
    updatedAt: value.updated_at as string
  };
}

function graphSignature(topic: Topic, items: Array<{
  id: string;
  publishedAt: string;
  fingerprint: string | null;
  summary: string | null;
}>): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    topic: { name: topic.name, description: topic.description, keywords: topic.keywords, updatedAt: topic.updatedAt },
    items: [...items].sort((left, right) => left.id.localeCompare(right.id))
  })).digest('hex');
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString().slice(0, 10);
}

function markdownToSafeHtml(title: string, markdown: string): string {
  const body = escapeHtml(markdown)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.7;color:#222}a{color:#315efb}h1,h2,h3{line-height:1.3}</style></head><body><p>${body}</p></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
