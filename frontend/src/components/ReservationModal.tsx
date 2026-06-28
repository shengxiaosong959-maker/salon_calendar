import React, { useState } from 'react';
import { EditReservationModal } from './EditReservationModal';
import '../styles/ReservationModal.css';

interface Reservation {
  id: string;
  customerName: string;
  staffName: string;
  plan: string;
  startTime: number | string;  // PostgreSQL BIGINT は文字列で返るため
  endTime: number | string;    // PostgreSQL BIGINT は文字列で返るため
  bed: string;
  memo?: string;
  color?: string;              // スタッフごとの表示色（users.color から JOIN）
}

interface NewReservationForm {
  staffName: string;
  customerName: string;
  plan: string;
  date: string;
  startTime: string;
  endTime: string;
  bed: string;
  memo: string;
}

interface ReservationModalProps {
  isOpen: boolean;
  selectedDate: Date | null;
  reservations: Reservation[];
  activeBeds: string[];
  onClose: () => void;
  onReservationAdded?: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// color が未設定の場合のデフォルト色
const DEFAULT_COLOR = '#A8D8EA';

export function ReservationModal({
  isOpen,
  selectedDate,
  reservations,
  activeBeds,
  onClose,
  onReservationAdded,
}: ReservationModalProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 編集モーダル用
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [formData, setFormData] = useState<NewReservationForm>({
    staffName: '',
    customerName: '',
    plan: '',
    date: '',
    startTime: '',
    endTime: '',
    bed: '',
    memo: '',
  });

  if (!isOpen || !selectedDate) return null;

  const formatDateForInput = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getReservationsForBed = (bedName: string) =>
    reservations.filter(
      (res) =>
        new Date(Number(res.startTime)).toDateString() === selectedDate.toDateString() &&
        res.bed === bedName
    );

  // Number() で確実に数値変換してから計算する
  const getPositionPercent = (timestamp: number | string) => {
    const d = new Date(Number(timestamp));
    const totalMinutes = d.getHours() * 60 + d.getMinutes();
    return ((totalMinutes - 9 * 60) / (12 * 60)) * 100;
  };

  const getWidthPercent = (startTime: number | string, endTime: number | string) => {
    const s = new Date(Number(startTime));
    const e = new Date(Number(endTime));
    const duration =
      (e.getHours() * 60 + e.getMinutes()) - (s.getHours() * 60 + s.getMinutes());
    return (duration / (12 * 60)) * 100;
  };

  const formatTime = (ts: number | string) =>
    new Date(Number(ts)).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const timeMarks = Array.from({ length: 7 }, (_, i) => 9 + i * 2);

  // 予約ブロックをタップ → 編集モーダルを開く
  const handleReservationClick = (e: React.MouseEvent, res: Reservation) => {
    e.stopPropagation();
    setEditTarget(res);
    setShowEditModal(true);
  };

  // 新規追加ボタン
  const handleAddNew = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setFormData({
      staffName: '',
      customerName: '',
      plan: '',
      date: formatDateForInput(selectedDate),
      startTime: '',
      endTime: '',
      bed: activeBeds[0] ?? '',
      memo: '',
    });
    setShowForm(true);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.staffName.trim()) return setErrorMessage('スタッフ名を入力してください');
    if (!formData.customerName.trim()) return setErrorMessage('お客様名を入力してください');
    if (!formData.plan.trim()) return setErrorMessage('プランを入力してください');
    if (!formData.startTime) return setErrorMessage('開始時間を入力してください');
    if (!formData.endTime) return setErrorMessage('終了時間を入力してください');
    if (!formData.bed) return setErrorMessage('ベッドを選択してください');
    if (formData.startTime >= formData.endTime)
      return setErrorMessage('終了時間は開始時間より後にしてください');

    setSubmitting(true);
    try {
      const token = localStorage.getItem('salon_auth_token');
      const response = await fetch(`${API_BASE}/api/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? '予約の追加に失敗しました');
        return;
      }

      setSuccessMessage(`${formData.customerName} 様の予約を追加しました`);
      setShowForm(false);
      if (onReservationAdded) onReservationAdded();
    } catch {
      setErrorMessage('サーバーに接続できませんでした');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setErrorMessage(null);
  };

  // タイムライン（ベッドごと）
  const renderTimeline = (bedName: string) => {
    const bedReservations = getReservationsForBed(bedName);
    return (
      <div key={bedName} className="bed-section">
        <div className="bed-title">🛏️ ベッド {bedName}</div>
        <div className="timeline">
          <div className="time-marks">
            {timeMarks.map((hour) => (
              <div key={hour} className="time-mark">{hour}:00</div>
            ))}
          </div>
          {bedReservations.length > 0 ? (
            <div className="timeline-items">
              {bedReservations.map((res) => {
                // スタッフの color を使用。未設定の場合はデフォルト色
                const bgColor = res.color ?? DEFAULT_COLOR;
                // 背景色に応じてテキスト色を自動判定（明るい色は黒文字、暗い色は白文字）
                const textColor = isLightColor(bgColor) ? '#333333' : '#ffffff';

                return (
                  <div
                    key={res.id}
                    className="timeline-item"
                    style={{
                      left: `calc(10px + ${getPositionPercent(res.startTime)}% * 0.9)`,
                      width: `calc(${getWidthPercent(res.startTime, res.endTime)}% * 0.9)`,
                      backgroundColor: bgColor,
                      color: textColor,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => handleReservationClick(e, res)}
                    title={`タップして編集\n${res.customerName}\n${formatTime(res.startTime)} - ${formatTime(res.endTime)}`}
                  >
                    {res.customerName}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="no-reservation">予約なし</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{selectedDate.toLocaleDateString('ja-JP')}</h2>
            <button className="close-button" onClick={onClose}>✕</button>
          </div>

          {/* 有効なベッドのタイムラインのみ表示 */}
          {activeBeds.map((bed) => renderTimeline(bed))}

          {/* 成功メッセージ */}
          {successMessage && (
            <div className="form-success">{successMessage}</div>
          )}

          {/* 新規追加ボタン */}
          {!showForm && (
            <button className="add-reservation-button" onClick={handleAddNew}>
              ＋ 新規予約を追加
            </button>
          )}

          {/* 新規予約フォーム */}
          {showForm && (
            <div className="reservation-form">
              <h3 className="form-title">新規予約</h3>

              {errorMessage && (
                <div className="form-error">{errorMessage}</div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="staffName">担当スタッフ名</label>
                  <input
                    type="text"
                    id="staffName"
                    name="staffName"
                    value={formData.staffName}
                    onChange={handleInputChange}
                    placeholder="例：田中"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customerName">お客様名</label>
                  <input
                    type="text"
                    id="customerName"
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleInputChange}
                    placeholder="例：山田太郎"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="plan">プラン（施術メニュー）</label>
                  <input
                    type="text"
                    id="plan"
                    name="plan"
                    value={formData.plan}
                    onChange={handleInputChange}
                    placeholder="例：フェイシャル60分"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="date">日付</label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group half">
                    <label htmlFor="startTime">開始時間</label>
                    <input
                      type="time"
                      id="startTime"
                      name="startTime"
                      value={formData.startTime}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group half">
                    <label htmlFor="endTime">終了時間</label>
                    <input
                      type="time"
                      id="endTime"
                      name="endTime"
                      value={formData.endTime}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="bed">使用ベッド</label>
                  <select
                    id="bed"
                    name="bed"
                    value={formData.bed}
                    onChange={handleInputChange}
                    className="form-select"
                  >
                    <option value="">選択してください</option>
                    {activeBeds.map((bedName) => (
                      <option key={bedName} value={bedName}>
                        ベッド {bedName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="memo">メモ（任意）</label>
                  <textarea
                    id="memo"
                    name="memo"
                    value={formData.memo}
                    onChange={handleInputChange}
                    placeholder="例：敏感肌、アレルギー注意"
                    rows={3}
                  />
                </div>

                <div className="form-buttons">
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={handleCancel}
                    disabled={submitting}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="submit-button"
                    disabled={submitting}
                  >
                    {submitting ? '送信中...' : '予約を追加'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <button className="close-modal-button" onClick={onClose}>閉じる</button>
        </div>
      </div>

      {/* 編集専用ポップアップ（ReservationModal の上に重なる） */}
      <EditReservationModal
        isOpen={showEditModal}
        reservation={editTarget}
        activeBeds={activeBeds}
        onClose={() => {
          setShowEditModal(false);
          setEditTarget(null);
        }}
        onUpdated={() => {
          if (onReservationAdded) onReservationAdded();
        }}
        onDeleted={() => {
          if (onReservationAdded) onReservationAdded();
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// ユーティリティ：背景色が明るいかどうかを判定
// 明るい色 → 黒文字、暗い色 → 白文字
// ─────────────────────────────────────────────
function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  // 輝度計算（W3C 基準）
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}