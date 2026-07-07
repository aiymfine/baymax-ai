// ─────────────────────────────────────────────────
// Baymax — SQLite Schema (sql.js / WASM)
// ─────────────────────────────────────────────────

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DEFAULT_DATA_DIR = './data';

let db = null;
let dbPath = null;

async function initDb() {
  const SQL = await initSqlJs();

  dbPath = path.join(process.env.DATA_DIR || DEFAULT_DATA_DIR, 'baymax.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Load existing DB or create new
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-like behavior (sql.js doesn't support WAL, but we save periodically)
  createTables();
  seedDefaults();
  saveDb();

  return db;
}

function saveDb() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

// Save DB to disk periodically (every 30 seconds)
let saveInterval = null;
function startAutoSave() {
  saveInterval = setInterval(saveDb, 30_000);
}

function createTables() {
  db.run(`
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
  const count = queryOne('SELECT COUNT(*) as c FROM personas').c;
  if (count === 0) {
    seedDefaultPersonas();
  }

  const profileCount = queryOne('SELECT COUNT(*) as c FROM user_profile').c;
  if (profileCount === 0) {
    db.run('INSERT INTO user_profile (id) VALUES (1)');
  }
}

function seedDefaultPersonas() {
  const { defaultPersonas } = require('../personas/definitions');
  for (const p of defaultPersonas) {
    db.run(
      'INSERT OR IGNORE INTO personas (name, display_name, description, system_prompt, emoji, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      [p.name, p.displayName, p.description, p.systemPrompt, p.emoji, p.isDefault ? 1 : 0]
    );
  }
}

// ── Query helpers (sql.js compatible) ──────────

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function run(sql, params = []) {
  db.run(sql, params);
  // sql.js doesn't return changes info like better-sqlite3
  // We simulate it with lastInsertRowid
  const result = queryOne('SELECT last_insert_rowid() as lastInsertRowid, changes() as changes');
  return result;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

module.exports = {
  initDb,
  getDb,
  saveDb,
  startAutoSave,
  // sql.js compatible query helpers
  prepare: (sql) => {
    const stmt = db.prepare(sql);
    return {
      bind: (params) => { stmt.bind(params); return this; },
      get: (params) => {
        if (params) stmt.bind(params);
        if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
        stmt.free(); return null;
      },
      all: (params) => {
        if (params) stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free(); return results;
      },
      run: (params) => {
        db.run(sql, params || []);
        return { lastInsertRowid: queryOne('SELECT last_insert_rowid() as id').id, changes: queryOne('SELECT changes() as c').c };
      },
      free: () => stmt.free(),
    };
  },
};
