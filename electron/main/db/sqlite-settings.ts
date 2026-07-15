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
export function saveSettings(input: unknown): AppSettings {
  const partial = validateSettingsUpdate(input);
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
  const result: AppSettings = { ...defaults };

  for (const [key, raw] of Object.entries(saved)) {
    if (!isSettingKey(key)) continue; // 忽略未知 key（旧版本残留）
    const value = deserialize(raw, defaults[key]);
    if (isSettingValue(key, value)) {
      Object.assign(result, { [key]: value });
    }
  }

  return result;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const SETTING_KEYS = new Set<keyof AppSettings>(
  Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>
);

function isSettingKey(key: string): key is keyof AppSettings {
  return SETTING_KEYS.has(key as keyof AppSettings);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isSettingValue(key: keyof AppSettings, value: unknown): boolean {
  switch (key) {
    case 'language':
    case 'defaultSummaryLanguage':
    case 'defaultTranslationTarget':
      return value === 'zh' || value === 'en';
    case 'theme':
      return value === 'light' || value === 'dark' || value === 'system';
    case 'defaultSummaryDetail':
      return value === 'brief' || value === 'standard' || value === 'detailed';
    case 'visualTheme':
      return value === 'classic' || value === 'paper';
    case 'fontSize':
      return isNumberInRange(value, 10, 32);
    case 'readingWidth':
      return isNumberInRange(value, 320, 1600);
    case 'sidebarPercent':
      return isNumberInRange(value, 10, 40);
    case 'listPercent':
      return isNumberInRange(value, 15, 50);
    case 'defaultProviderId':
    case 'summaryPromptTemplate':
    case 'translationPromptTemplate':
    case 'tagPromptTemplate':
      return isNullableString(value);
    case 'fontTheme':
      return typeof value === 'string' && value.trim().length > 0 && value.length <= 64;
  }
}

/** Renderer 输入不可信：只接收 AppSettings 已知字段及其合法值。 */
export function validateSettingsUpdate(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('settings 必须是对象');
  }

  const partial: Partial<AppSettings> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isSettingKey(key)) throw new TypeError(`未知设置项：${key}`);
    if (!isSettingValue(key, value)) throw new TypeError(`设置项 ${key} 的值无效`);
    Object.assign(partial, { [key]: value });
  }
  return partial;
}
