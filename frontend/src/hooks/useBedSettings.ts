import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface BedSettings {
  bedCount: number;
  activeBeds: string[];
  maxBedCount: number;
  minBedCount: number;
}

export function useBedSettings() {
  const { getAuthHeaders, isAuthenticated } = useAuth();
  const [bedSettings, setBedSettings] = useState<BedSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBedSettings = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/bed-count`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('ベッド設定の取得に失敗しました');
      const data: BedSettings = await res.json();
      setBedSettings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAuthHeaders]);

  useEffect(() => {
    fetchBedSettings();
  }, [fetchBedSettings]);

  const updateBedCount = useCallback(async (newCount: number): Promise<BedSettings | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/bed-count`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ bedCount: newCount }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'ベッド数の更新に失敗しました');
      }
      const data: BedSettings = await res.json();
      setBedSettings(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [getAuthHeaders]);

  const increaseBed = useCallback(async () => {
    if (!bedSettings || bedSettings.bedCount >= bedSettings.maxBedCount) return null;
    return updateBedCount(bedSettings.bedCount + 1);
  }, [bedSettings, updateBedCount]);

  const decreaseBed = useCallback(async () => {
    if (!bedSettings || bedSettings.bedCount <= bedSettings.minBedCount) return null;
    return updateBedCount(bedSettings.bedCount - 1);
  }, [bedSettings, updateBedCount]);

  return { bedSettings, isLoading, error, increaseBed, decreaseBed, refetch: fetchBedSettings };
}