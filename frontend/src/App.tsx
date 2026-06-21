import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import WeekCalendar from './components/WeekCalendar';

// ─────────────────────────────────────────────
// 権限ガード：未ログインならログイン画面へ
// ─────────────────────────────────────────────
function ProtectedApp() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  // 自動ログイン確認中はローディング表示
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fdf4ff 0%, #ede9fe 50%, #fce7f3 100%)',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{ fontSize: '2rem' }}>🛏️</div>
        <p style={{ color: '#7c3aed', fontWeight: 600 }}>読み込み中...</p>
      </div>
    );
  }

  // 未ログインならログイン画面
  if (!isAuthenticated) {
    return <Login />;
  }

  // ログイン済み → カレンダー画面
  return (
    <div>
      {/* ヘッダー：店舗名・ユーザー名・ログアウト */}
      <header style={{
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(124,58,237,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>🛏️</span>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>
            {user?.shopName ?? 'サロン予約カレンダー'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
            {user?.name}
            <span style={{
              marginLeft: '6px',
              background: 'rgba(255,255,255,0.25)',
              borderRadius: '6px',
              padding: '1px 7px',
              fontSize: '0.75rem',
            }}>
              {user?.role === 'owner' ? 'オーナー' : user?.role === 'staff' ? 'スタッフ' : '閲覧'}
            </span>
          </span>
          <button
            onClick={logout}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '8px',
              color: '#fff',
              padding: '5px 12px',
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* カレンダー本体 */}
      <WeekCalendar />
    </div>
  );
}

// ─────────────────────────────────────────────
// App ルート：AuthProvider でラップ
// ─────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  );
}

