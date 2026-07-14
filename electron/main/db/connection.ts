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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJsModule from 'sql.js';

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

  // electron-vite 的 externalizeDepsPlugin 把 sql.js 标为 external，
  // 运行时由 Node 解析。这里用 ESM dynamic import（避免 require 在 ESM 产物里
  // 拿到的是 CJS shim 而非真正模块）。
  const sqlJsModule = await import('sql.js');
  const initSqlJs = sqlJsModule.default ?? (sqlJsModule as unknown as typeof initSqlJsModule);
  const SQL: SqlJsFactory = await initSqlJs();

  dbPath = path.join(app.getPath('userData'), 'juhe-shivi.db');

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  configureDatabase(db);

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
  // sql.js export() 会重建内部 SQLite 连接，连接级 PRAGMA 需要重新设置。
  configureDatabase(db);
  writeDatabaseAtomically(dbPath, data);
}

/**
 * 将内存数据库写入磁盘并关闭连接。
 * 应在 app.on('will-quit') 中调用。
 */
export function closeDatabase(): void {
  if (!db) return;
  const databaseToClose = db;
  try {
    saveDatabase();
  } finally {
    databaseToClose.close();
    db = null;
    dbPath = null;
    initialized = false;
  }
}

/**
 * 获取数据库文件路径（调试用）。
 */
export function getDbPath(): string | null {
  return dbPath;
}

/**
 * 先将完整的 sql.js 快照写入同目录临时文件，再用 rename 原子替换。
 * 直接覆盖正式文件会先截断旧库，应用崩溃或断电时可能丢失整个数据库。
 */
function writeDatabaseAtomically(targetPath: string, data: Uint8Array): void {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  let fileDescriptor: number | null = null;
  try {
    fileDescriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(fileDescriptor, Buffer.from(data));
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (fileDescriptor !== null) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // 保留原始写入错误。
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // 保留原始写入错误。
    }
    throw error;
  }
}

function configureDatabase(database: Db): void {
  database.run('PRAGMA foreign_keys = ON');
  database.run('PRAGMA cache_size = -8000'); // 约 8 MB 缓存
}
