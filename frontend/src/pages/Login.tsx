import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Login.css';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) return setError('メールアドレスを入力してください');
    if (!password) return setError('パスワードを入力してください');

    setLoading(true);
    try {
      await login(email.trim(), password);
      // ログイン成功 → AuthContext が状態を更新 → App.tsx がカレンダーへリダイレクト
    } catch (err: any) {
      setError(err.message ?? 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* ロゴ・タイトル */}
        <div className="login-header">
          <div className="login-logo">🛏️</div>
          <h1 className="login-title">サロン予約カレンダー</h1>
          <p className="login-subtitle">アカウントにログインしてください</p>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="login-error">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">メールアドレス</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">パスワード</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="login-note">
          アカウントをお持ちでない方は管理者にお問い合わせください
        </p>
      </div>
    </div>
  );
}