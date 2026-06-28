import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, addWeeks } from "date-fns";
import { ja } from "date-fns/locale";
import { ReservationModal } from "./ReservationModal";
import "../styles/WeekCalendar.css";
import { useBedSettings } from '../hooks/useBedSettings';
import { BedControls } from '../components/BedControls';

interface Reservation {
  id: string;
  customerName: string;
  staffName: string;
  plan: string;
  bed: string;
  startTime: number;
  endTime: number;
  memo?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function WeekCalendar() {
  const { bedSettings } = useBedSettings();     // ← コンポーネントの中に移動
  const activeBeds = bedSettings?.activeBeds ?? ['A', 'B'];

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  //const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backend から予約データを取得
  const fetchReservations = async () => {
  try {
      const token = localStorage.getItem('salon_auth_token');  // JWT を取得
      const response = await fetch(`${API_BASE}/api/reservations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      } );

      if (!response.ok) {
        throw new Error("予約データの取得に失敗しました");
      }
      const data = await response.json();
      console.log("取得した予約データ", data);
      setReservations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
      console.error("エラー:", err);
    } finally {
      setLoading(false);
    }
  };



  // 初回マウント時に予約データを取得
  useEffect(() => {
    fetchReservations();
  }, []);

  // 現在の週を計算
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const displayWeekStart = addWeeks(currentWeekStart, weekOffset);

  // 7日分の日付を生成
  const days = Array.from({ length: 7 }, (_, i) => addDays(displayWeekStart, i));

  // 月を取得
  const monthDisplay = format(displayWeekStart, "M月", { locale: ja });

  const getReservationsForDay = (day: Date) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    return reservations.filter(
      (r) => r.startTime >= dayStart.getTime() && r.endTime <= dayEnd.getTime()
    );
  };

  if (error) {
    return (
      <div className="week-calendar-container">
        <h1 className="calendar-title">エステ予約カレンダー</h1>
        <div style={{ color: "red", textAlign: "center", padding: "20px" }}>
          エラー: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="week-calendar-container">
      <h1 className="calendar-title">エステ予約カレンダー</h1>
      <BedControls />

      {/* 月表示 */}
      <div className="month-display">{monthDisplay}</div>

      {/* ナビゲーション */}
      <div className="navigation">
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          className="nav-button"
        >
         {"< 先週"}
        </button>
        <span className="date-range">
          {format(displayWeekStart, "M月d日", { locale: ja })} ～{" "}
          {format(addDays(displayWeekStart, 6), "M月d日", { locale: ja })}
        </span>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          className="nav-button"
        >
           {"来週 >"}
        </button>
      </div>

      {/* ローディング表示 */}
      {loading && (
        <div style={{ textAlign: "center", padding: "20px" }}>
          読み込み中...
        </div>
      )}

      {/* カレンダー */}
      {!loading && (
        <div className="calendar-grid">
          {days.map((day, idx) => {
            const dayReservations = getReservationsForDay(day);

            return (
              <div
                key={idx}
                className="calendar-day"
                onClick={() => setSelectedDate(day)}
                style={{ cursor: "pointer" }}
              >
                {/* 曜日と日付 */}
                <div className="day-header">
                  <div className="day-name">
                    {format(day, "EEE", { locale: ja })}
                  </div>
                  <div className="day-number">{format(day, "d")}</div>
                </div>

                {/* 予約一覧 */}
                <div className="reservations">
                  {dayReservations.length === 0 ? (
                    <div className="no-reservation">予約なし</div>
                  ) : (
                    dayReservations.map((res) => (
                      <div
                        key={res.id}
                        className={`reservation-block bed-${res.bed}`}
                      >
                        <div className="reservation-name">{res.customerName}</div>
                        <div className="reservation-time">
                          {format(new Date(Number(res.startTime)), "HH:mm")} -{" "}
                          {format(new Date(Number(res.endTime)), "HH:mm")}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ポップアップ */}
      <ReservationModal
        isOpen={selectedDate !== null}
        selectedDate={selectedDate}
        reservations={reservations}
        onClose={() => setSelectedDate(null)}
        activeBeds={activeBeds} 
        onReservationAdded={fetchReservations}  // ← この行を追加
      />
    </div>
  );
}




