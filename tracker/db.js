// Database layer. Locally this is a SQLite file in data/. Set TURSO_DATABASE_URL
// (and TURSO_AUTH_TOKEN) to use a hosted Turso database instead; nothing else changes.
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function localUrl() {
  const dir = path.join(ROOT, 'data');
  mkdirSync(dir, { recursive: true });
  return `file:${path.join(dir, 'tracker.db')}`;
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? localUrl(),
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/** Run a query and return rows as plain objects. */
export async function all(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((c) => [c, row[c]])));
}

export async function get(sql, args = []) {
  return (await all(sql, args))[0];
}

export async function run(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return { changes: rs.rowsAffected, lastId: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null };
}

export async function init() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS posters (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL UNIQUE,
      label      TEXT NOT NULL,
      customer   TEXT NOT NULL DEFAULT '',
      lat        REAL NOT NULL,
      lng        REAL NOT NULL,
      target_url TEXT,
      placed_at  TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      poster_id  INTEGER NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
      scanned_at TEXT NOT NULL,
      visitor    TEXT NOT NULL,
      device     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scans_poster ON scans(poster_id, scanned_at);
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Secret mixed into visitor hashes, so a stored hash can't be matched back to an IP.
  await run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', [
    'visitor_secret',
    randomBytes(32).toString('hex'),
  ]);
  return (await get('SELECT value FROM meta WHERE key = ?', ['visitor_secret'])).value;
}
