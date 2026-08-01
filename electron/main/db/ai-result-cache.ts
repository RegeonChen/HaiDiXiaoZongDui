/**
 * AI 结果缓存存储层
 * Task 3.3: Database and AI Services
 *
 * 职责：
 *  - 在 ai_results 表中以 JSON 字符串存储 AI 生成结果
 *  - 按 articleId + resultType 查询缓存（同篇文章同类型只存最新）
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';

export type AIResultType = 'summary' | 'translation' | 'tag_suggestions' | 'topic_recommendations';

export const AiResultCache = {
  get<T = unknown>(articleId: string, resultType: AIResultType): T | null {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT data FROM ai_results WHERE article_id = ? AND result_type = ? ORDER BY created_at DESC LIMIT 1',
      [articleId, resultType]
    );
    if (rows.length === 0 || !rows[0].values.length) return null;
    try {
      return JSON.parse(rows[0].values[0][0] as string) as T;
    } catch {
      return null;
    }
  },

  set(articleId: string, resultType: AIResultType, data: unknown): void {
    const db = getDatabase();
    // 先删旧缓存（同篇同类型只保留最新）
    db.run('DELETE FROM ai_results WHERE article_id = ? AND result_type = ?', [articleId, resultType]);
    const id = crypto.randomUUID();
    db.run(
      'INSERT INTO ai_results (id, article_id, result_type, data, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, articleId, resultType, JSON.stringify(data), new Date().toISOString()]
    );
    saveDatabase();
  }
};
