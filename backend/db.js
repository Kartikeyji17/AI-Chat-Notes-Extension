const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "cache.sqlite"));
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 2;

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS note_cache (
    hash TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    provider TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_snapshots (
    account_id TEXT PRIMARY KEY,
    notes TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS usage_windows (
    account_id TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    character_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, window_start)
  );
  CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(SCHEMA_VERSION)) {
  db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(SCHEMA_VERSION, Date.now());
}

function getCached(hash) {
  const row = db.prepare("SELECT content, created_at FROM note_cache WHERE hash = ?").get(hash);
  if (row && Date.now() - row.created_at > CACHE_TTL_MS) {
    db.prepare("DELETE FROM note_cache WHERE hash = ?").run(hash);
    return null;
  }
  return row ? row.content : null;
}

function setCached(hash, content, provider) {
  db.prepare(
    "INSERT OR REPLACE INTO note_cache (hash, content, provider, created_at) VALUES (?, ?, ?, ?)"
  ).run(hash, content, provider, Date.now());
}

function getSyncSnapshot(accountId) {
  const row = db.prepare("SELECT notes, updated_at FROM sync_snapshots WHERE account_id = ?").get(accountId);
  if (!row) return null;
  try { return { notes: JSON.parse(row.notes), updatedAt: row.updated_at }; } catch { return null; }
}

function setSyncSnapshot(accountId, notes) {
  const updatedAt = Date.now();
  db.prepare("INSERT INTO sync_history (account_id, notes, updated_at) VALUES (?, ?, ?)")
    .run(accountId, JSON.stringify(notes), updatedAt);
  db.prepare("INSERT OR REPLACE INTO sync_snapshots (account_id, notes, updated_at) VALUES (?, ?, ?)")
    .run(accountId, JSON.stringify(notes), updatedAt);
  db.prepare("DELETE FROM sync_history WHERE account_id = ? AND id NOT IN (SELECT id FROM sync_history WHERE account_id = ? ORDER BY id DESC LIMIT 20)")
    .run(accountId, accountId);
  return updatedAt;
}

function createAccount(accountId, tokenHash) {
  db.prepare("INSERT INTO accounts (account_id, token_hash, created_at) VALUES (?, ?, ?)")
    .run(accountId, tokenHash, Date.now());
}

function getAccountByTokenHash(tokenHash) {
  return db.prepare("SELECT account_id FROM accounts WHERE token_hash = ?").get(tokenHash) || null;
}

function consumeUsage(accountId, maxRequests, maxCharacters, characterCount) {
  const windowStart = Math.floor(Date.now() / 86400000) * 86400000;
  const row = db.prepare("SELECT request_count, character_count FROM usage_windows WHERE account_id = ? AND window_start = ?")
    .get(accountId, windowStart);
  if (row && (row.request_count >= maxRequests || row.character_count + characterCount > maxCharacters)) return false;
  db.prepare(`INSERT INTO usage_windows (account_id, window_start, request_count, character_count)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(account_id, window_start) DO UPDATE SET
      request_count = request_count + 1,
      character_count = character_count + excluded.character_count`)
    .run(accountId, windowStart, characterCount);
  return true;
}

function getSyncHistory(accountId, limit = 20) {
  return db.prepare("SELECT id, updated_at AS updatedAt FROM sync_history WHERE account_id = ? ORDER BY id DESC LIMIT ?")
    .all(accountId, limit);
}

function exportState() {
  return {
    cache: db.prepare("SELECT hash, content, provider, created_at AS createdAt FROM note_cache").all(),
    snapshots: db.prepare("SELECT account_id AS account, notes, updated_at AS updatedAt FROM sync_snapshots").all(),
    exportedAt: Date.now(),
  };
}

function importState(state) {
  if (!state || !Array.isArray(state.cache) || !Array.isArray(state.snapshots)) throw new Error("Invalid backup");
  const transaction = db.transaction(() => {
    db.exec("DELETE FROM note_cache; DELETE FROM sync_snapshots;");
    const cacheInsert = db.prepare("INSERT INTO note_cache (hash, content, provider, created_at) VALUES (?, ?, ?, ?)");
    for (const row of state.cache) cacheInsert.run(row.hash, row.content, row.provider || null, row.createdAt || Date.now());
    const snapshotInsert = db.prepare("INSERT INTO sync_snapshots (account_id, notes, updated_at) VALUES (?, ?, ?)");
    for (const row of state.snapshots) snapshotInsert.run(row.account, row.notes, row.updatedAt || Date.now());
  });
  transaction();
}

module.exports = {
  getCached, setCached, getSyncSnapshot, setSyncSnapshot, exportState, importState,
  createAccount, getAccountByTokenHash, consumeUsage, getSyncHistory,
};