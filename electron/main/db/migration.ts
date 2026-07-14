/**
 * 数据库迁移机制
 * Task 2.3: Local Database
 *
 * 设计：
 *  - 使用 db_version 表记录当前 Schema 版本
 *  - 每个迁移是 { version: number, up: (db) => void } 的函数
 *  - initDatabase 调用后执行 runMigrations()
 *  - 符合 agents.md 要求：Schema 变更通过迁移完成，不直接改表
 */

import { getDatabase, saveDatabase } from './connection';

// ============================================================
// 迁移注册表
// ============================================================

/** 迁移定义 */
interface Migration {
  version: number;
  up: (db: ReturnType<typeof getDatabase>) => void;
}

/**
 * 所有迁移按版本号排序。
 * 新增迁移时在数组末尾追加即可，不得修改已有的迁移。
 */
const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      // ---- feeds 表 ----
      db.run(`
        CREATE TABLE IF NOT EXISTS feeds (
          id              TEXT PRIMARY KEY,
          title           TEXT NOT NULL DEFAULT '',
          url             TEXT NOT NULL,
          site_title      TEXT NOT NULL DEFAULT '',
          description     TEXT NOT NULL DEFAULT '',
          link            TEXT NOT NULL DEFAULT '',
          feed_type       TEXT NOT NULL DEFAULT 'rss',
          group_name      TEXT,
          icon_url        TEXT,
          last_sync_at    TEXT,
          last_sync_success INTEGER NOT NULL DEFAULT 0,
          last_sync_error TEXT,
          sync_interval_min INTEGER,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        )
      `);

      // 按 url 查重索引（忽略末尾 / 和 www 前缀的差异在 Repository 层处理）
      db.run(`CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)`);

      // ---- articles 表 ----
      db.run(`
        CREATE TABLE IF NOT EXISTS articles (
          id              TEXT PRIMARY KEY,
          feed_id         TEXT NOT NULL,
          title           TEXT NOT NULL DEFAULT '',
          url             TEXT NOT NULL,
          author          TEXT,
          published_at    TEXT,
          fetched_at      TEXT NOT NULL,
          raw_html        TEXT NOT NULL DEFAULT '',
          raw_text        TEXT,
          cleaned_html    TEXT,
          cleaned_markdown TEXT,
          cleaning_status TEXT NOT NULL DEFAULT 'pending',
          is_read         INTEGER NOT NULL DEFAULT 0,
          is_starred      INTEGER NOT NULL DEFAULT 0,
          summary         TEXT,
          translated_paragraphs TEXT,
          guid            TEXT NOT NULL,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL,
          FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
        )
      `);

      // guid 唯一索引 —— 重复同步去重的关键
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_guid ON articles(guid)`);

      // 按 feed + 发布时间查询用的复合索引
      db.run(`CREATE INDEX IF NOT EXISTS idx_articles_feed_published ON articles(feed_id, published_at DESC)`);

      // 按已读/星标筛选用的索引
      db.run(`CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_articles_starred ON articles(is_starred)`);
    }
  }
];

// ============================================================
// 迁移执行
// ============================================================

/**
 * 初始化 db_version 表（若不存在）。
 */
function ensureVersionTable(db: ReturnType<typeof getDatabase>): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS db_version (
      version INTEGER NOT NULL
    )
  `);
}

/**
 * 获取当前数据库 Schema 版本。
 * db_version 表为空时返回 0（表示尚未执行任何迁移）。
 */
function getCurrentVersion(db: ReturnType<typeof getDatabase>): number {
  const rows = db.exec('SELECT MAX(version) AS v FROM db_version');
  if (!rows.length || !rows[0].values.length || rows[0].values[0][0] === null) {
    return 0;
  }
  return rows[0].values[0][0] as number;
}

/**
 * 执行所有待执行的迁移。
 * 在 initDatabase() 之后调用，幂等。
 */
export function runMigrations(): void {
  const db = getDatabase();

  ensureVersionTable(db);
  const currentVersion = getCurrentVersion(db);

  let ranAny = false;
  for (const m of migrations) {
    if (m.version <= currentVersion) continue;

    m.up(db);
    db.run('INSERT INTO db_version (version) VALUES (?)', [m.version]);

    ranAny = true;
  }

  if (ranAny) {
    saveDatabase();
  }
}
