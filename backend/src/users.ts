import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { pool } from './database.js';

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────
interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  shopId: string;
}

interface AuthRequest extends express.Request {
  user?: JwtPayload;
}

// ─────────────────────────────────────────────
// スタッフ色の候補（オーナーがコードを直接編集して設定する用メモ）
// ─────────────────────────────────────────────
// #FF6B9D  ピンク
// #FF8C42  オレンジ
// #FFD166  イエロー
// #06D6A0  グリーン
// #118AB2  ブルー
// #7B2D8B  パープル
// #EF476F  レッド
// #A8D8EA  ライトブルー（デフォルト）
// #B5EAD7  ミントグリーン
// #C7B8EA  ラベンダー

// ─────────────────────────────────────────────
// ユーザー管理ルーター
// ─────────────────────────────────────────────
export function createUsersRouter(
  authenticate: express.RequestHandler,
  requireOwner: express.RequestHandler
) {
  const router = express.Router();

  // ───────────────────────────────────────────
  // GET /api/users  → 全ユーザー一覧（owner専用）
  // ───────────────────────────────────────────
  router.get('/', authenticate, requireOwner, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.email, u.name, u.role, u.color, u.shop_id AS "shopId",
               s.name AS "shopName", u.created_at AS "createdAt", u.updated_at AS "updatedAt"
        FROM users u
        JOIN shops s ON u.shop_id = s.id
        ORDER BY s.name ASC, u.name ASC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('ユーザー一覧取得エラー:', err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ───────────────────────────────────────────
  // POST /api/users  → ユーザー追加（owner専用）
  // ───────────────────────────────────────────
  router.post('/', authenticate, requireOwner, async (req: AuthRequest, res) => {
    const { email, password, name, role, shopId, color } = req.body;

    if (!email || !password || !name || !role || !shopId) {
      return res.status(400).json({ error: '必須項目が不足しています（email, password, name, role, shopId）' });
    }

    if (!['owner', 'staff', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role は owner / staff / viewer のいずれかを指定してください' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'パスワードは6文字以上で設定してください' });
    }

    // color が指定されていない場合はデフォルト色を使用
    const userColor = color ?? '#A8D8EA';

    try {
      // メールアドレス重複チェック
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'このメールアドレスはすでに使用されています' });
      }

      // 店舗存在チェック
      const shopResult = await pool.query('SELECT id, name FROM shops WHERE id = $1', [shopId]);
      if (shopResult.rows.length === 0) {
        return res.status(404).json({ error: '指定された店舗が見つかりません' });
      }
      const shop = shopResult.rows[0];

      const id = randomUUID();
      const passwordHash = bcrypt.hashSync(password, 10);
      const now = Date.now();

      await pool.query(`
        INSERT INTO users (id, email, password_hash, name, role, shop_id, color, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [id, email, passwordHash, name, role, shopId, userColor, now, now]);

      console.log(`✅ ユーザー追加: ${name} (${email}) / ${shop.name} / ${role} / 色: ${userColor}`);

      res.status(201).json({
        id,
        email,
        name,
        role,
        color: userColor,
        shopId,
        shopName: shop.name,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      console.error('ユーザー追加エラー:', err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ───────────────────────────────────────────
  // PUT /api/users/:id  → ユーザー編集（owner専用）
  // ───────────────────────────────────────────
  router.put('/:id', authenticate, requireOwner, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { email, password, name, role, shopId, color } = req.body;

    try {
      const existingResult = await pool.query(`
        SELECT u.id, u.email, u.name, u.role, u.color, u.shop_id AS "shopId"
        FROM users u WHERE u.id = $1
      `, [id]);

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'ユーザーが見つかりません' });
      }
      const existing = existingResult.rows[0];

      if (role && !['owner', 'staff', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'role は owner / staff / viewer のいずれかを指定してください' });
      }

      if (password && password.length < 6) {
        return res.status(400).json({ error: 'パスワードは6文字以上で設定してください' });
      }

      // メールアドレス重複チェック（自分以外）
      if (email && email !== existing.email) {
        const dup = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: 'このメールアドレスはすでに使用されています' });
        }
      }

      // 店舗存在チェック
      const targetShopId = shopId ?? existing.shopId;
      const shopResult = await pool.query('SELECT id, name FROM shops WHERE id = $1', [targetShopId]);
      if (shopResult.rows.length === 0) {
        return res.status(404).json({ error: '指定された店舗が見つかりません' });
      }

      // 更新フィールドを組み立てる（PostgreSQL は $N プレースホルダー）
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (email)    { updates.push(`email = $${idx++}`);         values.push(email); }
      if (name)     { updates.push(`name = $${idx++}`);          values.push(name); }
      if (role)     { updates.push(`role = $${idx++}`);          values.push(role); }
      if (shopId)   { updates.push(`shop_id = $${idx++}`);       values.push(shopId); }
      if (color)    { updates.push(`color = $${idx++}`);         values.push(color); }
      if (password) { updates.push(`password_hash = $${idx++}`); values.push(bcrypt.hashSync(password, 10)); }

      if (updates.length === 0) {
        return res.status(400).json({ error: '更新するフィールドがありません' });
      }

      const now = Date.now();
      updates.push(`updated_at = $${idx++}`);
      values.push(now);
      values.push(id); // WHERE id = $N

      await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );

      console.log(`✅ ユーザー更新: ID=${id}`);

      // 更新後のデータを返す
      const updated = await pool.query(`
        SELECT u.id, u.email, u.name, u.role, u.color, u.shop_id AS "shopId",
               s.name AS "shopName", u.created_at AS "createdAt", u.updated_at AS "updatedAt"
        FROM users u JOIN shops s ON u.shop_id = s.id
        WHERE u.id = $1
      `, [id]);

      res.json(updated.rows[0]);
    } catch (err) {
      console.error('ユーザー更新エラー:', err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ───────────────────────────────────────────
  // DELETE /api/users/:id  → ユーザー削除（owner専用）
  // ───────────────────────────────────────────
  router.delete('/:id', authenticate, requireOwner, async (req: AuthRequest, res) => {
    const { id } = req.params;

    // 自分自身は削除不可
    if (id === (req as AuthRequest).user?.userId) {
      return res.status(400).json({ error: '自分自身は削除できません' });
    }

    try {
      const existingResult = await pool.query('SELECT id, name FROM users WHERE id = $1', [id]);
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'ユーザーが見つかりません' });
      }
      const existing = existingResult.rows[0];

      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      console.log(`✅ ユーザー削除: ${existing.name} (ID=${id})`);

      res.json({ message: `${existing.name} を削除しました` });
    } catch (err) {
      console.error('ユーザー削除エラー:', err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  return router;
}