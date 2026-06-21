import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// ─────────────────────────────────────────────
// DB接続プール
// 環境変数 DATABASE_URL を使用（Railway が自動で設定）
// ローカルは .env に DATABASE_URL=postgres://... を設定
// ─────────────────────────────────────────────
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway / Render 本番環境では SSL が必要
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ─────────────────────────────────────────────
// テーブル初期化（べき等・初回起動時に実行）
// ─────────────────────────────────────────────
export async function initializeTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name          TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'staff',
        shop_id       TEXT NOT NULL,
        color         TEXT NOT NULL DEFAULT '#A8D8EA',
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL,
        FOREIGN KEY (shop_id) REFERENCES shops(id)
      )
    `);

    // 既存DBへのマイグレーション：color カラムが無ければ追加
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#A8D8EA'
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key     TEXT NOT NULL,
        shop_id TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (key, shop_id),
        FOREIGN KEY (shop_id) REFERENCES shops(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id            TEXT PRIMARY KEY,
        staff_name    TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        plan          TEXT NOT NULL,
        bed           TEXT NOT NULL,
        start_time    BIGINT NOT NULL,
        end_time      BIGINT NOT NULL,
        memo          TEXT,
        shop_id       TEXT NOT NULL,
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL,
        FOREIGN KEY (shop_id) REFERENCES shops(id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_start_time ON reservations(start_time);
      CREATE INDEX IF NOT EXISTS idx_reservations_bed        ON reservations(bed);
      CREATE INDEX IF NOT EXISTS idx_reservations_shop_id    ON reservations(shop_id);
      CREATE INDEX IF NOT EXISTS idx_users_email             ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_shop_id           ON users(shop_id);
    `);

    console.log('✓ テーブルを初期化しました');
  } catch (error) {
    console.error('テーブル初期化エラー:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// 予約 CRUD ヘルパー
// ─────────────────────────────────────────────

export async function getAllReservations(shopId: string) {
  const result = await pool.query(`
    SELECT r.id,
           r.staff_name    AS "staffName",
           r.customer_name AS "customerName",
           r.plan,
           r.bed,
           r.start_time    AS "startTime",
           r.end_time      AS "endTime",
           r.memo,
           r.shop_id       AS "shopId",
           r.created_at    AS "createdAt",
           r.updated_at    AS "updatedAt",
           u.color
    FROM reservations r
    LEFT JOIN users u ON u.name = r.staff_name AND u.shop_id = r.shop_id
    WHERE r.shop_id = $1
    ORDER BY r.start_time ASC
  `, [shopId]);
  return result.rows;
}

export async function getReservationsByBed(shopId: string, bed: string) {
  const result = await pool.query(`
    SELECT r.id,
           r.staff_name    AS "staffName",
           r.customer_name AS "customerName",
           r.plan,
           r.bed,
           r.start_time    AS "startTime",
           r.end_time      AS "endTime",
           r.memo,
           r.shop_id       AS "shopId",
           r.created_at    AS "createdAt",
           r.updated_at    AS "updatedAt",
           u.color
    FROM reservations r
    LEFT JOIN users u ON u.name = r.staff_name AND u.shop_id = r.shop_id
    WHERE r.shop_id = $1 AND r.bed = $2
    ORDER BY r.start_time ASC
  `, [shopId, bed]);
  return result.rows;
}

export async function addReservation(params: {
  id: string;
  staffName: string;
  customerName: string;
  plan: string;
  bed: string;
  startTime: number;
  endTime: number;
  memo?: string;
  shopId: string;
}) {
  const now = Date.now();
  await pool.query(`
    INSERT INTO reservations
      (id, staff_name, customer_name, plan, bed, start_time, end_time, memo, shop_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    params.id,
    params.staffName,
    params.customerName,
    params.plan,
    params.bed,
    params.startTime,
    params.endTime,
    params.memo ?? null,
    params.shopId,
    now,
    now,
  ]);
}

export async function updateReservation(
  id: string,
  shopId: string,
  params: {
    staffName: string;
    customerName: string;
    plan: string;
    bed: string;
    startTime: number;
    endTime: number;
    memo?: string;
  }
) {
  await pool.query(`
    UPDATE reservations
    SET staff_name = $1, customer_name = $2, plan = $3, bed = $4,
        start_time = $5, end_time = $6, memo = $7, updated_at = $8
    WHERE id = $9 AND shop_id = $10
  `, [
    params.staffName,
    params.customerName,
    params.plan,
    params.bed,
    params.startTime,
    params.endTime,
    params.memo ?? null,
    Date.now(),
    id,
    shopId,
  ]);
}

export async function deleteReservation(id: string, shopId: string) {
  await pool.query('DELETE FROM reservations WHERE id = $1 AND shop_id = $2', [id, shopId]);
}

export async function checkOverlap(
  shopId: string,
  bed: string,
  startTime: number,
  endTime: number,
  excludeId?: string
): Promise<boolean> {
  let result;
  if (excludeId) {
    result = await pool.query(`
      SELECT id FROM reservations
      WHERE shop_id = $1 AND bed = $2 AND id != $3 AND start_time < $4 AND end_time > $5
      LIMIT 1
    `, [shopId, bed, excludeId, endTime, startTime]);
  } else {
    result = await pool.query(`
      SELECT id FROM reservations
      WHERE shop_id = $1 AND bed = $2 AND start_time < $3 AND end_time > $4
      LIMIT 1
    `, [shopId, bed, endTime, startTime]);
  }
  return result.rows.length > 0;
}