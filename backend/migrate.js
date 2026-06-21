import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'salon.db'));

db.exec(`
  DROP TABLE IF EXISTS reservations;
  DROP TABLE IF EXISTS sync_log;

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    staff_name TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    plan TEXT NOT NULL,
    bed TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    memo TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_start_time ON reservations(start_time);
  CREATE INDEX IF NOT EXISTS idx_reservations_bed ON reservations(bed);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('bed_count', '2');
`);

console.log('✅ マイグレーション完了');
db.close();


