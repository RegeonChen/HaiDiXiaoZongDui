/**
 * 数据库连接管理
 * Task 2.3: Local Database
 *
 * 职责：
 *  - 单例管理 sql.js 数据库实例（WASM 内存态）
 *  - 启动时从 userData 加载 .db 文件，不存在则创建空库
 *  - 每次写操作后自动保存到磁盘
 *  - 应用退出时优雅关闭
 *  - PRAGMA 优化（foreign_keys、cache_size 等）
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type initSqlJsModule from 'sql.js';

// ============================================================
// 类型别名
// ============================================================

/** sql.js 初始化后的工厂对象类型 */
type SqlJsFactory = Awaited<ReturnType<typeof initSqlJsModule>>;
/** 数据库实例类型 */
type Db = InstanceType<SqlJsFactory['Database']>;

// ============================================================
// 状态
// ============================================================

let db: Db | null = null;
let dbPath: string | null = null;

/** 是否已完成 initDatabase() */
let initialized = false;

// ============================================================
// 公共 API
// ============================================================

/**
 * 初始化数据库连接。
 * 必须在 app.whenReady() 之后调用。
 * 幂等调用：重复调用不会重复初始化。
 */
export async function initDatabase(): Promise<void> {
  if (initialized) return;

  // 运行时 require（避免 ESM/CJS 混用问题，sql.js 对两种都支持）
  const initSqlJs = require('sql.js') as typeof initSqlJsModule;
  const SQL: SqlJsFactory = await initSqlJs();

  dbPath = path.join(app.getPath('userData'), 'juhe-shivi.db');

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 安全与性能优化
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA cache_size = -8000'); // 约 8 MB 缓存

  initialized = true;
}

/**
 * 获取当前数据库实例。
 * 调用前必须已完成 initDatabase()。
 */
export function getDatabase(): Db {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

/**
 * 将内存数据库写入磁盘。
 * 每次执行写操作（INSERT/UPDATE/DELETE/CREATE/DROP）后调用。
 */
export function saveDatabase(): void {
  if (!db || !dbPath) return;
  const data: Uint8Array = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

/**
 * 将内存数据库写入磁盘并关闭连接。
 * 应在 app.on('will-quit') 中调用。
 */
export function closeDatabase(): void {
  if (!db) return;
  // 先保存到磁盘再关闭
  const data: Uint8Array = db.export();
  fs.writeFileSync(dbPath!, Buffer.from(data));
  db.close();
  db = null;
  initialized = false;
}

/**
 * 获取数据库文件路径（调试用）。
 */
export function getDbPath(): string | null {
  return dbPath;
}
