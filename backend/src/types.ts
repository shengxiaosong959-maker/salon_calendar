// 予約データの型定義
export interface Reservation {
  id: number;                    // 予約ID
  customerName: string;          // 顧客名
  bed: 'A' | 'B';               // ベッド（A または B）
  startTime: number;             // 開始時間（ミリ秒）
  endTime: number;               // 終了時間（ミリ秒）
  createdAt: Date;               // 作成日時
  updatedAt: Date;               // 更新日時
}

// 新規予約作成時の入力型
export interface CreateReservationInput {
  customerName: string;
  bed: 'A' | 'B';
  startTime: number;
  endTime: number;
}

// 予約更新時の入力型
export interface UpdateReservationInput {
  customerName?: string;
  bed?: 'A' | 'B';
  startTime?: number;
  endTime?: number;
}