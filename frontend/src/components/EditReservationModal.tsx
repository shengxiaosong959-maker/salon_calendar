import React, { useState, useEffect } from 'react';
import "../styles/EditReservationModal.css";
import { useAuth } from '../contexts/AuthContext';

interface Reservation {
  id: string;
  staffName?: string;
  customerName?: string;
  plan?: string;
  bed: string;
  startTime: number | string;
  endTime: number | string;
  memo?: string;
}

interface EditReservationModalProps {
  isOpen: boolean;
  reservation: Reservation | null;
  activeBeds: string[];
  onClose: () => void;
  onUpdated: () => void;  // 変更後にカレンダーを再取得
  onDeleted: () => void;  // 削除後にカレンダーを再取得
}

const API_BASE = 'http://localhost:3000';

// タイムスタンプ → "YYYY-MM-DD" 形式
// PostgreSQL の BIGINT は文字列で返るため Number() で変換する
const toDateString = (ts: number | string): string => {
  const d = new Date(Number(ts));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// タイムスタンプ → "HH:MM" 形式
// PostgreSQL の BIGINT は文字列で返るため Number() で変換する
const toTimeString = (ts: number | string): string => {
  const d = new Date(Number(ts));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function EditReservationModal({
  isOpen,
  reservation,
  activeBeds,
  onClose,
  onUpdated,
  onDeleted,
}: EditReservationModalProps) {
  const [staffName, setStaffName] = useState('');
  const { getAuthHeaders } = useAuth();
  const [customerName, setCustomerName] = useState('');
  const [plan, setPlan] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [bed, setBed] = useState('');
  const [memo, setMemo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 予約データをフォームに反映
  useEffect(() => {
    if (reservation) {
      setStaffName(reservation.staffName ?? '');
      setCustomerName(reservation.customerName ?? '');
      setPlan(reservation.plan ?? '');
      setDate(toDateString(reservation.startTime));
      setStartTime(toTimeString(reservation.startTime));
      setEndTime(toTimeString(reservation.endTime));
      setBed(reservation.bed);
      setMemo(reservation.memo ?? '');
      setErrorMessage(null);
      setShowDeleteConfirm(false);
    }
  }, [reservation]);

  if (!isOpen || !reservation) return null;

  // 変更を保存
  const handleUpdate = async () => {
    setErrorMessage(null);

    if (!staffName.trim()) return setErrorMessage('スタッフ名を入力してください');
    if (!customerName.trim()) return setErrorMessage('お客様名を入力してください');
    if (!plan.trim()) return setErrorMessage('プランを入力してください');
    if (!startTime) return setErrorMessage('開始時間を入力してください');
    if (!endTime) return setErrorMessage('終了時間を入力してください');
    if (!bed) return setErrorMessage('ベッドを選択してください');
    if (startTime >= endTime) return setErrorMessage('終了時間は開始時間より後にしてください');

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/reservations/${reservation.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ staffName, customerName, plan, date, startTime, endTime, bed, memo }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? '変更に失敗しました');
        return;
      }

      onUpdated();
      onClose();
    } catch {
      setErrorMessage('サーバーに接続できませんでした');
    } finally {
      setSubmitting(false);
    }
  };

  // 削除を実行
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/reservations/${reservation.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? '削除に失敗しました');
        setShowDeleteConfirm(false);
        return;
      }

      onDeleted();
      onClose();
    } catch {
      setErrorMessage('サーバーに接続できませんでした');
    } finally {
      setDeleting(false);
    }
  };

  return (
    // オーバーレイ（背景クリックで閉じる）
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className="edit-modal-content" onClick={(e) => e.stopPropagation()}>

        {/* ヘッダー：タイトル ＋ 変更・削除ボタン */}
        <div className="edit-modal-header">
          <h3 className="edit-modal-title">予約を変更</h3>
          <div className="edit-modal-header-actions">
            <button
              className="edit-modal-btn edit-modal-btn--delete"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting || submitting}
            >
              削除
            </button>
            <button
              className="edit-modal-btn edit-modal-btn--save"
              onClick={handleUpdate}
              disabled={submitting || deleting}
            >
              {submitting ? '保存中...' : '変更'}
            </button>
            <button
              className="edit-modal-btn edit-modal-btn--close"
              onClick={onClose}
              disabled={submitting || deleting}
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        </div>

        {/* エラーメッセージ */}
        {errorMessage && (
          <div className="edit-modal-error">{errorMessage}</div>
        )}

        {/* 削除確認 */}
        {showDeleteConfirm && (
          <div className="edit-modal-confirm">
            <p>「{customerName}」様の予約を削除しますか？</p>
            <div className="edit-modal-confirm-buttons">
              <button
                className="edit-modal-btn edit-modal-btn--cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                キャンセル
              </button>
              <button
                className="edit-modal-btn edit-modal-btn--delete-confirm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        )}

        {/* 入力フォーム */}
        <div className="edit-modal-form">
          <div className="edit-form-group">
            <label>担当スタッフ名</label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="例：田中"
            />
          </div>

          <div className="edit-form-group">
            <label>お客様名</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="例：山田太郎"
            />
          </div>

          <div className="edit-form-group">
            <label>プラン（施術メニュー）</label>
            <input
              type="text"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="例：フェイシャル60分"
            />
          </div>

          <div className="edit-form-group">
            <label>日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="edit-form-row">
            <div className="edit-form-group half">
              <label>開始時間</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="edit-form-group half">
              <label>終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="edit-form-group">
            <label>使用ベッド</label>
            <select
              value={bed}
              onChange={(e) => setBed(e.target.value)}
              className="edit-form-select"
            >
              {activeBeds.map((b) => (
                <option key={b} value={b}>ベッド {b}</option>
              ))}
            </select>
          </div>

          <div className="edit-form-group">
            <label>メモ（任意）</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="例：敏感肌、アレルギー注意"
              rows={3}
            />
          </div>
        </div>

      </div>
    </div>
  );
}