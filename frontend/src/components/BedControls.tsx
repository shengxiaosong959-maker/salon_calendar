import React from 'react';
import { useBedSettings } from '../hooks/useBedSettings';
import { useAuth } from '../contexts/AuthContext';
import '../styles/BedControls.css';

interface BedControlsProps {
  onBedsChange?: (activeBeds: string[]) => void;
}

export function BedControls({ onBedsChange }: BedControlsProps) {
  const { bedSettings, increaseBed, decreaseBed, isLoading } = useBedSettings();
  const { isOwner } = useAuth();

  // ─────────────────────────────────────────────
  // オーナー以外には表示しない
  // ─────────────────────────────────────────────
  if (!isOwner) return null;

  if (isLoading) {
    return <div className="bed-controls-loading">ベッド設定を読み込み中...</div>;
  }

  if (!bedSettings) return null;

  const { bedCount, maxBedCount, minBedCount, activeBeds } = bedSettings;

  const handleIncrease = async () => {
    const updated = await increaseBed();
    if (updated && onBedsChange) onBedsChange(updated.activeBeds);
  };

  const handleDecrease = async () => {
    const updated = await decreaseBed();
    if (updated && onBedsChange) onBedsChange(updated.activeBeds);
  };

  return (
    <div className="bed-controls">
      <span className="bed-controls-label">ベッド数</span>
      <div className="bed-controls-buttons">
        <button
          className="bed-btn bed-btn-minus"
          onClick={handleDecrease}
          disabled={bedCount <= minBedCount}
          title="ベッドを減らす"
        >
          −
        </button>
        <span className="bed-count-display">
          {bedCount} <span className="bed-count-unit">台</span>
        </span>
        <button
          className="bed-btn bed-btn-plus"
          onClick={handleIncrease}
          disabled={bedCount >= maxBedCount}
          title="ベッドを増やす"
        >
          ＋
        </button>
      </div>
      <span className="bed-active-label">
        {activeBeds.map(b => `ベッド${b}`).join(' / ')}
      </span>
    </div>
  );
}