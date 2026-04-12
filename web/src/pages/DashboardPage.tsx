import { useState, useEffect } from 'react'
import { get } from '../lib/api'
import dayjs from 'dayjs'

type Stats = {
  total_customers: number
  total_vehicles: number
  today_reservations: number
}

type Reservation = {
  id: number
  customer_id: number
  customer_name: string
  car_maker: string | null
  car_model: string | null
  car_number: string | null
  car_size: string
  start_time: string
  end_time: string
  service_name: string
  work_lane: string
  status: string
  notes: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:  { label: '確定',     color: '#2563EB', bg: '#EFF6FF' },
  completed:  { label: '完了',     color: '#16A34A', bg: '#F0FDF4' },
  cancelled:  { label: 'キャンセル', color: '#DC2626', bg: '#FEF2F2' },
  in_progress:{ label: '作業中',   color: '#D97706', bg: '#FFFBEB' },
}

const LANE_COLOR: Record<string, string> = {
  '洗車場': '#2563EB',
  'リフト': '#7C3AED',
  'その他1': '#059669',
  'その他2': '#D97706',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [storeId, setStoreId] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [s, r] = await Promise.all([
          get<Stats>('/api/stats'),
          get<Reservation[]>(`/api/reservations?store_id=${storeId}&date=${date}`),
        ])
        setStats(s)
        setReservations(r)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [date, storeId])

  const todayConfirmed = reservations.filter(r => r.status === 'confirmed').length
  const todayCompleted = reservations.filter(r => r.status === 'completed').length

  return (
    <div style={{ padding: 24, background: '#F8FAFC', minHeight: '100vh' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0F172A' }}>ダッシュボード</h1>
        <div style={{ fontSize: 13, color: '#64748B' }}>{dayjs().format('YYYY年M月D日（ddd）')}</div>
      </div>

      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: '顧客数',     value: stats?.total_customers ?? '-', icon: '👤', color: '#2563EB', bg: '#EFF6FF' },
          { label: '車両数',     value: stats?.total_vehicles ?? '-',  icon: '🚗', color: '#16A34A', bg: '#F0FDF4' },
          { label: '今日の予約', value: stats?.today_reservations ?? '-', icon: '📅', color: '#7C3AED', bg: '#F5F3FF' },
          { label: '確定',       value: todayConfirmed, icon: '✅', color: '#0891B2', bg: '#F0F9FF' },
          { label: '完了',       value: todayCompleted, icon: '🏁', color: '#D97706', bg: '#FFFBEB' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} style={{
            background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
            }}>{icon}</div>
            <div>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>
                {loading ? '…' : value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 本日の予約一覧 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {/* テーブルヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>本日の予約</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ id: 1, label: '帯広店' }, { id: 2, label: '札内店' }].map(s => (
                <button key={s.id} onClick={() => setStoreId(s.id)} style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: storeId === s.id ? '#2563EB' : '#E2E8F0',
                  color: storeId === s.id ? '#fff' : '#64748B',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setDate(dayjs(date).subtract(1,'day').format('YYYY-MM-DD'))}
              style={{ padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>‹</button>
            <input type='date' value={date} onChange={e => setDate(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 600 }} />
            <button onClick={() => setDate(dayjs(date).add(1,'day').format('YYYY-MM-DD'))}
              style={{ padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>›</button>
            <button onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}
              style={{ padding: '5px 10px', border: '1px solid #2563EB', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>今日</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>読み込み中...</div>
        ) : reservations.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <div>この日の予約はありません</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['時刻', '顧客名', '車両', 'サービス', 'レーン', 'ステータス'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...reservations].sort((a,b) => a.start_time.localeCompare(b.start_time)).map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                    {r.start_time.slice(0,5)} – {r.end_time?.slice(0,5)}
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, color: '#1E293B' }}>
                    {r.customer_name || '顧客未設定'}
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', color: '#475569' }}>
                    <div>{[r.car_maker, r.car_model].filter(Boolean).join(' ') || '–'}</div>
                    {r.car_number && <div style={{ fontSize: 11, color: '#94A3B8' }}>{r.car_number}</div>}
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', color: '#475569', maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.service_name || '–'}
                    </div>
                    {r.notes && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{r.notes}</div>}
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: (LANE_COLOR[r.work_lane] ?? '#64748B') + '20',
                      color: LANE_COLOR[r.work_lane] ?? '#64748B',
                    }}>{r.work_lane}</span>
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: (STATUS_LABEL[r.status] ?? STATUS_LABEL.confirmed).bg,
                      color: (STATUS_LABEL[r.status] ?? STATUS_LABEL.confirmed).color,
                    }}>{(STATUS_LABEL[r.status] ?? STATUS_LABEL.confirmed).label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
