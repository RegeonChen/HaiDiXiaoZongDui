/**
 * SQLite 持久化应用设置
 * Task 2.5.3: Persistence & IPC
 *
 * 职责：
 *  - key-value 模式在 settings 表中读写 AppSettings
 *  - 启动时加载已保存值，与 DEFAULT_SETTINGS 合并
 *  - 更新时只写变更的 key，未变更的不覆盖
 */

import { getDatabase, saveDatabase } from './connection';
import { DEFAULT_SETTINGS, type AppSettings } from '../../../shared/types';

// ============================================================
// 公共 API
// ============================================================

/**
 * 从 SQLite 加载所有已保存的设置，合并到 DEFAULT_SETTINGS 上。
 * 只覆盖已持久化的 key，未保存的 key 保留默认值。
 */
export function loadSettings(): AppSettings {
  const db = getDatabase();
  const saved: Record<string, string> = {};

  try {
    const rows = db.exec('SELECT key, value FROM settings');
    if (rows.length > 0) {
      const { columns, values } = rows[0];
      const keyIdx = columns.indexOf('key');
      const valIdx = columns.indexOf('value');
      for (const row of values) {
        saved[row[keyIdx] as string] = row[valIdx] as string;
      }
    }
  } catch {
    // settings 表不存在时（极端情况）回退到默认值
    return { ...DEFAULT_SETTINGS };
  }

  return merge(DEFAULT_SETTINGS, saved);
}

/**
 * 保存部分设置项。只更新传入的 key，其余保持不动。
 * 返回合并后的完整 AppSettings。
 */
export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged: AppSettings = { ...current, ...partial };
  const db = getDatabase();

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue;
    stmt.run([k, serialize(v)]);
  }
  stmt.free();

  saveDatabase();
  return merged;
}

// ============================================================
// 内部辅助
// ============================================================

function merge(defaults: AppSettings, saved: Record<string, string>): AppSettings {
  const result: Record<string, unknown> = { ...defaults };

  for (const [key, raw] of Object.entries(saved)) {
    if (!(key in defaults)) continue; // 忽略未知 key（旧版本残留）
    result[key] = deserialize(key, raw, (defaults as Record<string, unknown>)[key]);
  }

  return result as AppSettings;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize(key: string, raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    if (key === 'sidebarPercent' || key === 'listPercent') return typeof fallback === 'number' ? fallback : 0;
    return fallback;
  }
}
