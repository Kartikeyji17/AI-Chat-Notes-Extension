const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "cache.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS note_cache (
    hash TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    provider TEXT,
    created_at INTEGER NOT NULL
  );
`);

function getCached(hash) {
  const row = db.prepare("SELECT content FROM note_cache WHERE hash = ?").get(hash);
  return row ? row.content : null;
}

function setCached(hash, content, provider) {
  db.prepare(
    "INSERT OR REPLACE INTO note_cache (hash, content, provider, created_at) VALUES (?, ?, ?, ?)"
  ).run(hash, content, provider, Date.now());
}

module.exports = { getCached, setCached };