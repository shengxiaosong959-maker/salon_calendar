import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TOKEN_KEY = 'salon_auth_token';

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'staff' | 'viewer';
  shopId: string;
  shopName: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;           // 自動ログイン確認中
  isAuthenticated: boolean;
  isOwner: boolean;
  isStaff: boolean;             // staff または owner
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

// ─────────────────────────────────────────────
// コンテキスト
// ─────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // 起動時は確認中

  // ─────────────────────────────────────────────
  // 起動時：localStorage のトークンで自動ログイン
  // ─────────────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    // トークンをサーバーで検証してユーザー情報を取得
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('トークン無効');
        return res.json();
      })
      .then((userData: User) => {
        setToken(savedToken);
        setUser(userData);
      })
      .catch(() => {
        // 期限切れ・無効なトークンは削除
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // ─────────────────────────────────────────────
  // ログイン
  // ─────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'ログインに失敗しました');
    }

    // トークンを localStorage に保存（7日間有効）
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  // ─────────────────────────────────────────────
  // ログアウト
  // ─────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // ─────────────────────────────────────────────
  // API 呼び出し用ヘッダー生成
  // ─────────────────────────────────────────────
  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!token) return { 'Content-Type': 'application/json' };
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [token]);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user,
    isOwner: user?.role === 'owner',
    isStaff: user?.role === 'owner' || user?.role === 'staff',
    login,
    logout,
    getAuthHeaders,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────
// カスタムフック
// ─────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の中で使用してください');
  return ctx;
}