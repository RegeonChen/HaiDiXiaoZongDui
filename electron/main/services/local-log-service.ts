import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LogEntry } from '../../../shared/types';

type LogLevel = LogEntry['level'];
type LogDetailValue = string | number | boolean | null;
export type LocalLogDetail = Record<string, LogDetailValue>;

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 500;
const MAX_DETAIL_VALUE_LENGTH = 500;
const FORBIDDEN_DETAIL_KEY = /api.?key|authorization|bearer|token|secret|password|path|url|content|html|markdown/i;
const LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

let activeLogFile: string | null = null;

export function initializeLocalLogService(userDataDirectory: string): void {
  const directory = path.join(userDataDirectory, 'logs');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  activeLogFile = path.join(directory, 'app-events.jsonl');
}

export function appendLocalLog(
  level: LogLevel,
  module: string,
  message: string,
  detail?: LocalLogDetail
): LogEntry {
  const entry: LogEntry = {
    id: randomUUID(),
    level,
    module: sanitizeText(module, 80),
    message: sanitizeText(message, MAX_MESSAGE_LENGTH),
    detail: sanitizeDetail(detail),
    timestamp: new Date().toISOString()
  };
  const filePath = requireActiveLogFile();
  rotateIfNeeded(filePath);
  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  return entry;
}

export function listLocalLogs(limit = 100): LogEntry[] {
  const filePath = requireActiveLogFile();
  if (!existsSync(filePath)) return [];
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(1_000, Math.trunc(limit)))
    : 100;
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const entries: LogEntry[] = [];
  for (let index = lines.length - 1; index >= 0 && entries.length < boundedLimit; index -= 1) {
    try {
      const parsed: unknown = JSON.parse(lines[index]);
      if (isLogEntry(parsed)) entries.push(parsed);
    } catch {
      // 单行损坏不影响其它日志读取。
    }
  }
  return entries;
}

export function formatLocalLogs(entries: readonly LogEntry[]): string {
  const lines = [
    '聚合拾遗本地日志',
    `导出时间：${new Date().toISOString()}`,
    `记录数：${entries.length}`,
    ''
  ];
  for (const entry of [...entries].reverse()) {
    lines.push(`[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}`);
    if (entry.detail) lines.push(`  ${entry.detail}`);
  }
  return `${lines.join('\n')}\n`;
}

function requireActiveLogFile(): string {
  if (!activeLogFile) {
    throw new Error('本地日志服务尚未初始化');
  }
  return activeLogFile;
}

function rotateIfNeeded(filePath: string): void {
  if (!existsSync(filePath) || statSync(filePath).size < MAX_LOG_BYTES) return;
  const previousPath = `${filePath}.previous`;
  if (existsSync(previousPath)) unlinkSync(previousPath);
  renameSync(filePath, previousPath);
}

function sanitizeDetail(detail: LocalLogDetail | undefined): string | null {
  if (!detail) return null;
  const safe: LocalLogDetail = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN_DETAIL_KEY.test(key)) continue;
    safe[key] = typeof value === 'string'
      ? sanitizeText(value, MAX_DETAIL_VALUE_LENGTH)
      : value;
  }
  return Object.keys(safe).length > 0 ? JSON.stringify(safe) : null;
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['level'] === 'string' &&
    LEVELS.has(candidate['level'] as LogLevel) &&
    typeof candidate['module'] === 'string' &&
    typeof candidate['message'] === 'string' &&
    (candidate['detail'] === null || typeof candidate['detail'] === 'string') &&
    typeof candidate['timestamp'] === 'string'
  );
}
