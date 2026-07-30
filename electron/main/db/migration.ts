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
  },
  {
    version: 2,
    up(db) {
      // Feed 原文与按需抓取的文章页分层保存，避免覆盖同步得到的内容。
      db.run(`ALTER TABLE articles ADD COLUMN source_html TEXT`);
      db.run(`ALTER TABLE articles ADD COLUMN source_kind TEXT`);
      db.run(`ALTER TABLE articles ADD COLUMN content_title TEXT`);
      db.run(`ALTER TABLE articles ADD COLUMN content_byline TEXT`);
      db.run(`ALTER TABLE articles ADD COLUMN content_excerpt TEXT`);
      db.run(`ALTER TABLE articles ADD COLUMN cleaning_error TEXT`);

      // GUID 只在所属 Feed 内保证唯一；不同 Feed 可能使用相同的通用 GUID。
      db.run(`DROP INDEX IF EXISTS idx_articles_guid`);
      db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_feed_guid
        ON articles(feed_id, guid)
      `);
    }
  },
  {
    version: 3,
    up(db) {
      // 应用设置持久化表（key-value 模式，启动时加载覆盖默认值）
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    }
  },
  {
    version: 4,
    up(db) {
      // AI Provider 配置表。早期版本写入明文；Phase 5 启动流程会在
      // safeStorage 可用时把 api_key 原地迁移为带版本前缀的密文。
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_providers (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          base_url   TEXT NOT NULL,
          model_name TEXT NOT NULL,
          api_key    TEXT NOT NULL DEFAULT '',
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    }
  },
  {
    version: 5,
    up(db) {
      // 文章标签关联表
      db.run(`
        CREATE TABLE IF NOT EXISTS tags (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL UNIQUE,
          color      TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS article_tags (
          article_id TEXT NOT NULL,
          tag_id     TEXT NOT NULL,
          PRIMARY KEY (article_id, tag_id),
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
      `);
      // 笔记/摘录表
      db.run(`
        CREATE TABLE IF NOT EXISTS notes (
          id              TEXT PRIMARY KEY,
          article_id      TEXT NOT NULL,
          excerpt_text    TEXT,
          excerpt_offset  INTEGER,
          markdown_content TEXT NOT NULL DEFAULT '',
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL,
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notes_article ON notes(article_id)`);
      // 文摘表
      db.run(`
        CREATE TABLE IF NOT EXISTS digests (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          note_ids   TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      // AI 结果缓存表
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_results (
          id         TEXT PRIMARY KEY,
          article_id TEXT NOT NULL,
          result_type TEXT NOT NULL,
          data       TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ai_results_article_type ON ai_results(article_id, result_type)`);
    }
  },
  {
    version: 6,
    up(db) {
      // Cleaner v2 removes in-article navigation/TOC noise before Readability.
      // Invalidate only derived content; keep the persisted source HTML so the
      // next open can rebuild locally without another network request.
      db.run(`
        UPDATE articles
        SET content_title = NULL,
            content_byline = NULL,
            content_excerpt = NULL,
            cleaned_html = NULL,
            cleaned_markdown = NULL,
            cleaning_status = 'pending',
            cleaning_error = NULL
        WHERE cleaned_html IS NOT NULL OR cleaned_markdown IS NOT NULL
      `);
    }
  },
  {
    version: 7,
    up(db) {
      // Phase 4：专题、自动关联文章、演化图缓存与来源可追溯简报。
      db.run(`
        CREATE TABLE IF NOT EXISTS topics (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          keywords    TEXT NOT NULL DEFAULT '[]',
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS topic_articles (
          topic_id    TEXT NOT NULL,
          article_id  TEXT NOT NULL,
          match_score REAL NOT NULL DEFAULT 0,
          match_reason TEXT NOT NULL DEFAULT '',
          match_source TEXT NOT NULL DEFAULT 'auto',
          created_at  TEXT NOT NULL,
          PRIMARY KEY (topic_id, article_id),
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_topic_articles_article ON topic_articles(article_id)`);
      db.run(`
        CREATE TABLE IF NOT EXISTS topic_graph_cache (
          topic_id        TEXT PRIMARY KEY,
          source_signature TEXT NOT NULL,
          graph_json      TEXT NOT NULL,
          generated_at    TEXT NOT NULL,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS topic_briefings (
          topic_id      TEXT PRIMARY KEY,
          briefing_json TEXT NOT NULL,
          updated_at    TEXT NOT NULL,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        )
      `);
    }
  },
  {
    version: 8,
    up(db) {
      // Cleaner v3 normalizes lazy/srcset/picture images and preserves multi-
      // image figures. Invalidate derived content once so existing users get
      // the same image behavior as newly synchronized users. Persisted source
      // HTML remains available, so rebuilding does not require deleting feeds.
      db.run(`
        UPDATE articles
        SET content_title = NULL,
            content_byline = NULL,
            content_excerpt = NULL,
            cleaned_html = NULL,
            cleaned_markdown = NULL,
            cleaning_status = 'pending',
            cleaning_error = NULL
        WHERE source_kind = 'article_page'
          AND source_html IS NOT NULL
          AND (cleaned_html IS NOT NULL OR cleaned_markdown IS NOT NULL)
      `);
    }
  },
  {
    version: 9,
    up(db) {
      // Cleaner v4 preserves complex table/list semantics, emits safe Markdown
      // fences for code that contains backticks, and distinguishes prose stored
      // in `<pre>` from source code. Rebuild only derived article-page content;
      // the persisted source HTML remains local.
      db.run(`
        UPDATE articles
        SET content_title = NULL,
            content_byline = NULL,
            content_excerpt = NULL,
            cleaned_html = NULL,
            cleaned_markdown = NULL,
            cleaning_status = 'pending',
            cleaning_error = NULL
        WHERE source_kind = 'article_page'
          AND source_html IS NOT NULL
          AND (cleaned_html IS NOT NULL OR cleaned_markdown IS NOT NULL)
      `);
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

    db.run('BEGIN TRANSACTION');
    try {
      m.up(db);
      db.run('INSERT INTO db_version (version) VALUES (?)', [m.version]);
      db.run('COMMIT');
      ranAny = true;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  if (ranAny) {
    saveDatabase();
  }
}
