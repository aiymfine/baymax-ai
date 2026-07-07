// ─────────────────────────────────────────────────
// Baymax — SQLite Schema (sql.js / WASM, better-sqlite3 compatible API)
// ─────────────────────────────────────────────────

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DEFAULT_DATA_DIR = './data';

let _db = null;
let dbPath = null;

async function initDb() {
  const SQL = await initSqlJs();

  dbPath = path.join(process.env.DATA_DIR || DEFAULT_DATA_DIR, 'baymax.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  createTables();
  seedDefaults();
  saveDb();

  // Return wrapped db for compatibility
  return wrapDb(_db);
}

function saveDb() {
  if (!_db || !dbPath) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

let saveInterval = null;
function startAutoSave() {
  saveInterval = setInterval(saveDb, 30_000);
}

function createTables() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      persona TEXT NOT NULL DEFAULT 'baymax',
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT DEFAULT 'text',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      person_name TEXT,
      confidence REAL DEFAULT 1.0,
      source_message_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      embedding TEXT
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      summary TEXT DEFAULT '',
      mention_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      name TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      preferences TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      summary TEXT,
      mood TEXT,
      topics TEXT DEFAULT '[]',
      message_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT NOT NULL,
      emoji TEXT,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function seedDefaults() {
  const stmt = _db.prepare('SELECT COUNT(*) as c FROM personas');
  stmt.step();
  const count = stmt.getAsObject().c;
  stmt.free();

  if (count === 0) seedDefaultPersonas();

  const stmt2 = _db.prepare('SELECT COUNT(*) as c FROM user_profile');
  stmt2.step();
  const profileCount = stmt2.getAsObject().c;
  stmt2.free();

  if (profileCount === 0) {
    _db.run('INSERT INTO user_profile (id) VALUES (1)');
  }
}

function seedDefaultPersonas() {
  const { defaultPersonas } = require('../personas/definitions');
  const insert = _db.prepare(
    'INSERT OR IGNORE INTO personas (name, display_name, description, system_prompt, emoji, is_default) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const p of defaultPersonas) {
    insert.run([p.name, p.displayName, p.description, p.systemPrompt, p.emoji, p.isDefault ? 1 : 0]);
  }
  insert.free();
}

// ── Wrapper: makes sql.js look like better-sqlite3 ──

function wrapDb(rawDb) {
  return {
    /**
     * prepare(sql) — returns a statement with .get(), .all(), .run()
     * Compatible with better-sqlite3 API
     */
    prepare(sql) {
      return {
        // .get(params) — returns first row as object, or null
        get(...params) {
          const stmt = rawDb.prepare(sql);
          if (params.length > 0 && params[0] !== undefined) stmt.bind(params);
          let row = null;
          if (stmt.step()) row = stmt.getAsObject();
          stmt.free();
          return row;
        },
        // .all(params) — returns all rows as array
        all(...params) {
          const stmt = rawDb.prepare(sql);
          if (params.length > 0 && params[0] !== undefined) stmt.bind(params);
          const results = [];
          while (stmt.step()) results.push(stmt.getAsObject());
          stmt.free();
          return results;
        },
        // .run(params) — execute INSERT/UPDATE/DELETE, returns { lastInsertRowid, changes }
        run(...params) {
          if (params.length > 0 && params[0] !== undefined) {
            rawDb.run(sql, params);
          } else {
            rawDb.run(sql);
          }
          return _dbInfo(rawDb);
        },
      };
    },

    // Top-level run for convenience (used by extractor)
    run(sql, params) {
      if (params && params.length > 0) {
        rawDb.run(sql, params);
      } else {
        rawDb.run(sql);
      }
      return _dbInfo(rawDb);
    },

    // Raw exec for DDL / multi-statement
    exec(sql) {
      rawDb.run(sql);
    },
  };
}

function _dbInfo(rawDb) {
  try {
    const stmt = rawDb.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    const stmt2 = rawDb.prepare('SELECT changes() as c');
    stmt2.step();
    const row2 = stmt2.getAsObject();
    stmt2.free();
    return { lastInsertRowid: row.id, changes: row2.c };
  } catch {
    return { lastInsertRowid: 0, changes: 0 };
  }
}

function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.');
  return wrapDb(_db);
}

module.exports = { initDb, getDb, saveDb, startAutoSave };
