/**
 * AIProviderRepository — AI 模型配置数据访问层
 * Task 3.3: Database and AI Services
 *
 * 职责：
 *  - ai_providers 表的 CRUD
 *  - is_default 唯一性管理（设置一个 default 时其余清零）
 */

import crypto from 'node:crypto';
import { getDatabase, saveDatabase } from './connection';
import {
  canProtectApiKeys,
  getCredentialBackendName,
  isProtectedApiKey,
  protectApiKey,
  revealApiKey
} from './ai-provider-credentials.js';
import type { AIProvider, AIProviderCreateInput, AIProviderUpdateInput } from '../../../shared/types';

function now(): string {
  return new Date().toISOString();
}

export const AiProviderRepository = {
  list(): AIProvider[] {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM ai_providers ORDER BY created_at DESC');
    if (rows.length === 0 || !rows[0].values.length) return [];
    return rows[0].values.map((row) => rowToProvider(rows[0].columns, row));
  },

  getById(id: string): AIProvider | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM ai_providers WHERE id = ?', [id]);
    if (rows.length === 0 || !rows[0].values.length) return null;
    return rowToProvider(rows[0].columns, rows[0].values[0]);
  },

  getDefault(): AIProvider | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM ai_providers WHERE is_default = 1 LIMIT 1');
    if (rows.length === 0 || !rows[0].values.length) return null;
    return rowToProvider(rows[0].columns, rows[0].values[0]);
  },

  create(input: AIProviderCreateInput): AIProvider {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const timestamp = now();

    if (input.isDefault) {
      db.run('UPDATE ai_providers SET is_default = 0');
    }

    db.run(
      `INSERT INTO ai_providers (id, name, base_url, model_name, api_key, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.baseUrl,
        input.modelName,
        protectApiKey(input.apiKey),
        input.isDefault ? 1 : 0,
        timestamp,
        timestamp
      ]
    );

    saveDatabase();
    return this.getById(id)!;
  },

  update(id: string, input: AIProviderUpdateInput): AIProvider | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    if (input.isDefault === true) {
      db.run('UPDATE ai_providers SET is_default = 0');
    }

    const name = input.name ?? existing.name;
    const baseUrl = input.baseUrl ?? existing.baseUrl;
    const modelName = input.modelName ?? existing.modelName;
    const apiKey = input.apiKey !== undefined ? protectApiKey(input.apiKey) : undefined;
    const isDefault = input.isDefault !== undefined ? input.isDefault : existing.isDefault;
    const timestamp = now();

    if (apiKey !== undefined) {
      db.run(
        `UPDATE ai_providers SET name=?, base_url=?, model_name=?, api_key=?, is_default=?, updated_at=? WHERE id=?`,
        [name, baseUrl, modelName, apiKey, isDefault ? 1 : 0, timestamp, id]
      );
    } else {
      db.run(
        `UPDATE ai_providers SET name=?, base_url=?, model_name=?, is_default=?, updated_at=? WHERE id=?`,
        [name, baseUrl, modelName, isDefault ? 1 : 0, timestamp, id]
      );
    }

    saveDatabase();
    return this.getById(id);
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return false;
    db.run('DELETE FROM ai_providers WHERE id = ?', [id]);
    saveDatabase();
    return true;
  },

  /**
   * 内部使用：获取 Provider 并附带原始 API Key。
   * 返回的 AIProvider 额外携带 _apiKey 字段供 Agent 调用用。
   */
  getByIdWithKey(id: string): (AIProvider & { _apiKey: string }) | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM ai_providers WHERE id = ?', [id]);
    if (rows.length === 0 || !rows[0].values.length) return null;
    const o = rowToRaw(rows[0].columns, rows[0].values[0]);
    return {
      ...rowToProvider(rows[0].columns, rows[0].values[0]),
      _apiKey: revealApiKey(o.api_key as string)
    };
  },

  /**
   * 内部使用：获取默认 Provider 并附带原始 API Key。
   */
  getDefaultWithKey(): (AIProvider & { _apiKey: string }) | null {
    const db = getDatabase();
    const rows = db.exec('SELECT * FROM ai_providers WHERE is_default = 1 LIMIT 1');
    if (rows.length === 0 || !rows[0].values.length) return null;
    const o = rowToRaw(rows[0].columns, rows[0].values[0]);
    return {
      ...rowToProvider(rows[0].columns, rows[0].values[0]),
      _apiKey: revealApiKey(o.api_key as string)
    };
  },

  /**
   * 应用启动时把 v0.3.1 及更早版本留下的明文 API Key 原地改写为
   * Electron safeStorage 密文。迁移幂等：带版本前缀的值不会重复加密。
   */
  migrateLegacyApiKeys(): {
    migrated: number;
    skipped: number;
    backend: string;
  } {
    const db = getDatabase();
    const rows = db.exec(
      `SELECT id, api_key FROM ai_providers
       WHERE api_key IS NOT NULL AND api_key <> ''`
    );
    const result = {
      migrated: 0,
      skipped: 0,
      backend: getCredentialBackendName()
    };
    if (rows.length === 0 || rows[0].values.length === 0) return result;

    const idIndex = rows[0].columns.indexOf('id');
    const keyIndex = rows[0].columns.indexOf('api_key');
    const legacyRows = rows[0].values.filter((row) => {
      const stored = String(row[keyIndex] ?? '');
      return stored.length > 0 && !isProtectedApiKey(stored);
    });
    if (legacyRows.length === 0) return result;

    if (!canProtectApiKeys()) {
      result.skipped = legacyRows.length;
      return result;
    }

    db.run('BEGIN TRANSACTION');
    try {
      for (const row of legacyRows) {
        const id = String(row[idIndex]);
        const plainText = String(row[keyIndex]);
        db.run(
          'UPDATE ai_providers SET api_key = ?, updated_at = ? WHERE id = ?',
          [protectApiKey(plainText), now(), id]
        );
        result.migrated += 1;
      }
      db.run('COMMIT');
      saveDatabase();
      return result;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }
};

function rowToProvider(columns: string[], row: unknown[]): AIProvider {
  const o = rowToRaw(columns, row);
  return {
    id: o.id as string,
    name: o.name as string,
    baseUrl: o.base_url as string,
    modelName: o.model_name as string,
    apiKeySet: typeof o.api_key === 'string' && o.api_key.length > 0,
    isDefault: o.is_default === 1,
    createdAt: o.created_at as string,
    updatedAt: o.updated_at as string
  };
}

function rowToRaw(columns: string[], row: unknown[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }
  return o;
}
