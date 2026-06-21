/**
 * migrate_auth.js
 * ─────────────────────────────────────────────────────────────
 * 初回セットアップ用スクリプト（PostgreSQL版）
 * 店舗・ユーザー・ベッド数の初期データを投入します。
 *
 * 実行方法:
 *   node migrate_auth.js
 *
 * 前提:
 *   - .env に DATABASE_URL が設定されていること
 *   - PostgreSQL サーバーが起動していること
 *   - テーブルはサーバー起動時に自動作成されるが、
 *     このスクリプト単体でも作成します
 * ─────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ─────────────────────────────────────────────
// 初期店舗データ
// ─────────────────────────────────────────────
const shops = [
  { name: '新宿店' },
  { name: '東銀座店' },
  { name: '月島店' },
];

// ─────────────────────────────────────────────
// スタッフ色の候補（color フィールドに設定できる色）
// ─────────────────────────────────────────────
// '#FF6B9D'  ピンク
// '#FF8C42'  オレンジ
// '#FFD166'  イエロー
// '#06D6A0'  グリーン
// '#118AB2'  ブルー
// '#7B2D8B'  パープル
// '#EF476F'  レッド
// '#A8D8EA'  ライトブルー（デフォルト）
// '#B5EAD7'  ミントグリーン
// '#C7B8EA'  ラベンダー

// ─────────────────────────────────────────────
// 初期ユーザーデータ
// role: 'owner' | 'staff' | 'viewer'
// color: 上記の色候補から選択（省略時は '#A8D8EA'）
// ─────────────────────────────────────────────
const users = [
  {
    email: 'shengxiaosong959@gmail.com',
    password: 'salon2024',
    name: '管理者（新宿）',
    role: 'owner',
    shopName: '新宿店',
    color: '#B5EAD7',
  },
  {
    email: 'shengxiaosong960@gmail.com',
    password: 'salon2024',
    name: '管理者（東銀座）',
    role: 'owner',
    shopName: '東銀座店',
    color: '#B5EAD7',
  },
  {
    email: 'shengxiaosong961@gmail.com',
    password: 'salon2024',
    name: '管理者（月島）',
    role: 'owner',
    shopName: '月島店',
    color: '#B5EAD7',
  },
  // ── スタッフを追加する場合はここに追記 ──────────────────────
  // {
  //   email: 'tanaka@example.com',
  //   password: 'password123',
  //   name: '田中 花子',
  //   role: 'staff',
  //   shopName: '新宿店',
  //   color: '#FF6B9D',  // ← 色を指定（上記候補から選択）
  // },
  {
    email: 'zhongshanrina@gmail.com',
    password: 'core1201',
    name: '涌井',
    role: 'owner',
    shopName: '新宿店',
    color: '#FF6B9D',
  },
  {
    email: 'takarabe@gmail.com',
    password: 'higasiginza123',
    name: '財部',
    role: 'owner',
    shopName: '東銀座店',
    color: '#FF6B9D',
  },
  {
    email: 'aya@gmail.com',
    password: 'salon2024',
    name: '鈴木',
    role: 'staff',
    shopName: '新宿店',
    color: '#FF8C42',
  },
];

// ─────────────────────────────────────────────
// 初期ベッド数設定（店舗ごと）
// ─────────────────────────────────────────────
const defaultBedCount = 2; // 1〜5

// ─────────────────────────────────────────────
// メイン処理
// ─────────────────────────────────────────────
async function main() {
  const client = await pool.connect();

  try {
    console.log('🔧 テーブルを作成します...');

    // テーブル作成（べき等）
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

    console.log('✓ テーブル作成完了\n');

    // ── 店舗を登録 ──────────────────────────────────────────────
    console.log('🏪 店舗を登録します...');
    const shopIdMap = {};

    for (const shop of shops) {
      const existing = await client.query('SELECT id FROM shops WHERE name = $1', [shop.name]);
      if (existing.rows.length > 0) {
        shopIdMap[shop.name] = existing.rows[0].id;
        console.log(`  スキップ（既存）: ${shop.name}`);
        continue;
      }

      const id = randomUUID();
      await client.query('INSERT INTO shops (id, name) VALUES ($1, $2)', [id, shop.name]);
      shopIdMap[shop.name] = id;
      console.log(`  ✓ 追加: ${shop.name} (ID: ${id})`);
    }

    // ── ベッド数設定 ────────────────────────────────────────────
    console.log('\n🛏  ベッド数を設定します...');
    for (const [shopName, shopId] of Object.entries(shopIdMap)) {
      await client.query(`
        INSERT INTO settings (key, shop_id, value) VALUES ($1, $2, $3)
        ON CONFLICT (key, shop_id) DO NOTHING
      `, ['bed_count', shopId, String(defaultBedCount)]);
      console.log(`  ✓ ${shopName}: ${defaultBedCount} 台`);
    }

    // ── ユーザーを登録 ──────────────────────────────────────────
    console.log('\n👤 ユーザーを登録します...');
    const now = Date.now();

    for (const user of users) {
      const shopId = shopIdMap[user.shopName];
      if (!shopId) {
        console.warn(`  ⚠ 店舗が見つかりません: ${user.shopName} → スキップ`);
        continue;
      }

      const existing = await client.query('SELECT id FROM users WHERE email = $1', [user.email]);
      if (existing.rows.length > 0) {
        console.log(`  スキップ（既存）: ${user.email}`);
        continue;
      }

      const id = randomUUID();
      const passwordHash = bcrypt.hashSync(user.password, 10);
      const userColor = user.color ?? '#A8D8EA';

      await client.query(`
        INSERT INTO users (id, email, password_hash, name, role, shop_id, color, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [id, user.email, passwordHash, user.name, user.role, shopId, userColor, now, now]);

      console.log(`  ✓ ${user.name} (${user.email}) / ${user.shopName} / ${user.role} / 色: ${userColor}`);
    }

    console.log('\n✅ 初期データの投入が完了しました！');
    console.log('\n📋 ログイン情報:');
    for (const user of users) {
      console.log(`   ${user.email} / ${user.password} (${user.role})`);
    }
    console.log('\n⚠  本番環境では必ずパスワードを変更してください。\n');

  } catch (err) {
    console.error('❌ エラーが発生しました:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();