import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool, initializeTables } from './database.js';
import { createUsersRouter } from './users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'salon-calendar-secret-key-change-in-production';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────
// CORS（開発時のみフロントエンド開発サーバーを許可）
// 本番はバックエンドが静的ファイルを配信するため不要
// ─────────────────────────────────────────────
//if (!IS_PRODUCTION) {
  app.use(cors({
  origin: IS_PRODUCTION
    ? "https://salon-calendar-menard-front.onrender.com"
    : ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  }));
//}

app.use(express.json());

// ─────────────────────────────────────────────
// レートリミット（ログインAPIのブルートフォース対策）
// ─────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 10,                   // 10回まで
  message: { error: 'ログイン試行が多すぎます。15分後に再試行してください' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────
// 起動時にテーブルを初期化
// ─────────────────────────────────────────────
await initializeTables();

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
// 認証ミドルウェア
// ─────────────────────────────────────────────
const authenticate = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'トークンが無効または期限切れです' });
  }
};

// オーナー権限チェック
const requireOwner = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'オーナー権限が必要です' });
  }
  next();
};

// 閲覧以外（staff 以上）チェック
const requireStaff = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role === 'viewer') {
    return res.status(403).json({ error: 'この操作には一般権限以上が必要です' });
  }
  next();
};

// ─────────────────────────────────────────────
// ユーザー管理ルーター（users.ts）をマウント
// ─────────────────────────────────────────────
app.use('/api/users', createUsersRouter(
  authenticate as express.RequestHandler,
  requireOwner as express.RequestHandler
));

// ─────────────────────────────────────────────
// ヘルスチェック
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'サロン予約カレンダー API が起動しています' });
});

// ─────────────────────────────────────────────
// 認証 API
// ─────────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });
  }

  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.password_hash, u.name, u.role, u.shop_id,
             s.name AS shop_name
      FROM users u
      JOIN shops s ON u.shop_id = s.id
      WHERE u.email = $1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const user = result.rows[0];
    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, shopId: user.shop_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shop_id,
        shopName: user.shop_name,
      },
    });
  } catch (err) {
    console.error('ログインエラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.name, u.role, u.shop_id,
             s.name AS shop_name
      FROM users u
      JOIN shops s ON u.shop_id = s.id
      WHERE u.id = $1
    `, [req.user!.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      shopId: user.shop_id,
      shopName: user.shop_name,
    });
  } catch (err) {
    console.error('/api/auth/me エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// ─────────────────────────────────────────────
// 店舗 API
// ─────────────────────────────────────────────

app.get('/api/shops', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM shops WHERE id = $1', [req.user!.shopId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '店舗が見つかりません' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('店舗取得エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// ─────────────────────────────────────────────
// 設定 API（ベッド数）
// ─────────────────────────────────────────────

app.get('/api/settings/bed-count', authenticate, async (req: AuthRequest, res) => {
  const shopId = req.user!.shopId;
  try {
    const result = await pool.query(
      'SELECT value FROM settings WHERE key = $1 AND shop_id = $2',
      ['bed_count', shopId]
    );
    const bedCount = result.rows.length > 0 ? parseInt(result.rows[0].value, 10) : 2;
    const maxBedCount = 5;
    const bedLabels = ['A', 'B', 'C', 'D', 'E'];
    const activeBeds = bedLabels.slice(0, bedCount);
    res.json({ bedCount, activeBeds, maxBedCount, minBedCount: 1 });
  } catch (err) {
    console.error('ベッド数取得エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

app.put('/api/settings/bed-count', authenticate, requireOwner, async (req: AuthRequest, res) => {
  const { bedCount } = req.body;
  const shopId = req.user!.shopId;

  if (typeof bedCount !== 'number' || bedCount < 1 || bedCount > 5) {
    return res.status(400).json({ error: 'ベッド数は1〜5の範囲で指定してください' });
  }

  try {
    await pool.query(`
      INSERT INTO settings (key, shop_id, value) VALUES ($1, $2, $3)
      ON CONFLICT (key, shop_id) DO UPDATE SET value = EXCLUDED.value
    `, ['bed_count', shopId, String(bedCount)]);

    const bedLabels = ['A', 'B', 'C', 'D', 'E'];
    const activeBeds = bedLabels.slice(0, bedCount);
    res.json({ bedCount, activeBeds, maxBedCount: 5, minBedCount: 1 });
  } catch (err) {
    console.error('ベッド数更新エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// ─────────────────────────────────────────────
// 予約 API
// ─────────────────────────────────────────────

// GET /api/reservations
// users テーブルを staff_name + shop_id で LEFT JOIN して color を返す
app.get('/api/reservations', authenticate, async (req: AuthRequest, res) => {
  const shopId = req.user!.shopId;
  try {
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
             COALESCE(u.color, '#A8D8EA') AS color
      FROM reservations r
      LEFT JOIN users u ON u.name = r.staff_name AND u.shop_id = r.shop_id
      WHERE r.shop_id = $1
      ORDER BY r.start_time ASC
    `, [shopId]);
    res.json(result.rows);
  } catch (err) {
    console.error('予約一覧取得エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

app.post('/api/reservations', authenticate, requireStaff, async (req: AuthRequest, res) => {
  const { staffName, customerName, plan, date, startTime, endTime, bed, memo } = req.body;
  const shopId = req.user!.shopId;

  if (!staffName || !customerName || !plan || !date || !startTime || !endTime || !bed) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const startTs = new Date(`${date}T${startTime}:00`).getTime();
  const endTs = new Date(`${date}T${endTime}:00`).getTime();

  if (isNaN(startTs) || isNaN(endTs) || startTs >= endTs) {
    return res.status(400).json({ error: '日時が正しくありません' });
  }

  try {
    const overlap = await pool.query(`
      SELECT id FROM reservations
      WHERE shop_id = $1 AND bed = $2 AND start_time < $3 AND end_time > $4
      LIMIT 1
    `, [shopId, bed, endTs, startTs]);

    if (overlap.rows.length > 0) {
      return res.status(409).json({ error: 'この時間帯はすでに予約が入っています' });
    }

    const id = randomUUID();
    const now = Date.now();

    await pool.query(`
      INSERT INTO reservations
        (id, staff_name, customer_name, plan, bed, start_time, end_time, memo, shop_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, staffName, customerName, plan, bed, startTs, endTs, memo || '', shopId, now, now]);

    // 追加後、color も含めて返す
    const colorResult = await pool.query(
      `SELECT COALESCE(color, '#A8D8EA') AS color FROM users WHERE name = $1 AND shop_id = $2 LIMIT 1`,
      [staffName, shopId]
    );
    const color = colorResult.rows[0]?.color ?? '#A8D8EA';

    console.log(`✅ 予約追加: ${customerName} / ${bed} / ${new Date(startTs).toLocaleString('ja-JP')}`);
    res.status(201).json({ id, staffName, customerName, plan, bed, startTime: startTs, endTime: endTs, memo, shopId, color });
  } catch (err) {
    console.error('予約追加エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

app.put('/api/reservations/:id', authenticate, requireStaff, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { staffName, customerName, plan, date, startTime, endTime, bed, memo } = req.body;
  const shopId = req.user!.shopId;

  try {
    const existingResult = await pool.query(
      'SELECT * FROM reservations WHERE id = $1 AND shop_id = $2',
      [id, shopId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: '予約が見つかりません' });
    }

    const startTs = new Date(`${date}T${startTime}:00`).getTime();
    const endTs = new Date(`${date}T${endTime}:00`).getTime();

    if (isNaN(startTs) || isNaN(endTs) || startTs >= endTs) {
      return res.status(400).json({ error: '日時が正しくありません' });
    }

    const overlap = await pool.query(`
      SELECT id FROM reservations
      WHERE shop_id = $1 AND bed = $2 AND id != $3 AND start_time < $4 AND end_time > $5
      LIMIT 1
    `, [shopId, bed, id, endTs, startTs]);

    if (overlap.rows.length > 0) {
      return res.status(409).json({ error: 'この時間帯はすでに予約が入っています' });
    }

    const now = Date.now();
    await pool.query(`
      UPDATE reservations
      SET staff_name = $1, customer_name = $2, plan = $3, bed = $4,
          start_time = $5, end_time = $6, memo = $7, updated_at = $8
      WHERE id = $9 AND shop_id = $10
    `, [staffName, customerName, plan, bed, startTs, endTs, memo || '', now, id, shopId]);

    // 更新後、color も含めて返す
    const colorResult = await pool.query(
      `SELECT COALESCE(color, '#A8D8EA') AS color FROM users WHERE name = $1 AND shop_id = $2 LIMIT 1`,
      [staffName, shopId]
    );
    const color = colorResult.rows[0]?.color ?? '#A8D8EA';

    console.log(`✅ 予約更新: ${customerName} / ${bed}`);
    res.json({ id, staffName, customerName, plan, bed, startTime: startTs, endTime: endTs, memo, color });
  } catch (err) {
    console.error('予約更新エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

app.delete('/api/reservations/:id', authenticate, requireStaff, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const shopId = req.user!.shopId;

  try {
    const existingResult = await pool.query(
      'SELECT id FROM reservations WHERE id = $1 AND shop_id = $2',
      [id, shopId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: '予約が見つかりません' });
    }

    await pool.query('DELETE FROM reservations WHERE id = $1 AND shop_id = $2', [id, shopId]);
    console.log(`✅ 予約削除: ID=${id}`);
    res.json({ message: '予約を削除しました' });
  } catch (err) {
    console.error('予約削除エラー:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// ─────────────────────────────────────────────
// 本番環境：フロントエンドの静的ファイルを配信
// ─────────────────────────────────────────────
/*/いったんコメントアウト
if (IS_PRODUCTION) {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));

  // SPA 対応（React Router のルートを index.html にフォールバック）
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}
/*/

// ─────────────────────────────────────────────
// サーバー起動
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 サーバー起動: http://localhost:${PORT}`);
  console.log(`   環境: ${IS_PRODUCTION ? '本番' : '開発'}`);
});