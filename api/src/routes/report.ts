import { Hono } from 'hono'
import { createSupabase, type Bindings } from '../lib/supabase'

const report = new Hono<{ Bindings: Bindings }>()

// 日報取得（日付・店舗で絞り込み）
// v_daily_report ビューを使用
report.get('/daily', async (c) => {
  const db = createSupabase(c.env)
  const { date, store_id } = c.req.query()

  if (!date) return c.json({ error: 'date は必須です' }, 400)

  const params: Record<string, string> = {
    reservation_date: `eq.${date}`,
    order: 'start_time.asc,reservation_id.asc,item_order.asc',
  }

  const { data, error } = await db.query('v_daily_report', params)
  if (error) return c.json({ error }, 500)

  // 予約IDでグループ化してフロントが扱いやすい形に整形
  const grouped = groupByReservation(data as DailyReportRow[])

  // 店舗フィルタ（ビューに store_id がないため後処理）
  // ※ 必要なら store_id をビューに追加するか、reservations テーブルと JOIN する
  const result = store_id
    ? grouped  // TODO: store_id フィルタを reservations 側で追加
    : grouped

  // 集計
  const summary = calcSummary(grouped)

  return c.json({ date, rows: result, summary })
})

// ==================== 型・ユーティリティ ====================

type DailyReportRow = {
  reservation_date: string
  start_time:       string
  reservation_id:   number
  customer_name:    string
  furigana:         string
  phone:            string | null
  car_maker:        string
  car_model:        string
  car_number:       string
  car_size:         string
  item_id:          number | null
  item_order:       number | null
  item_type:        string | null
  service_detail:   string | null
  unit_price:       number | null
  quantity:         number | null
  subtotal:         number | null
  total_price:      number | null
  payment_method:   string | null
  status:           string
  work_lane:        string | null
  staff_name:       string | null
  reservation_notes: string | null
  item_notes:       string | null
}

type ReservationGroup = {
  reservation_id:   number
  start_time:       string
  customer_name:    string
  furigana:         string
  phone:            string | null
  car_maker:        string
  car_model:        string
  car_number:       string
  car_size:         string
  status:           string
  work_lane:        string | null
  staff_name:       string | null
  total_price:      number | null
  payment_method:   string | null
  notes:            string | null
  items: {
    item_id:       number
    item_type:     string
    service_detail: string
    unit_price:    number
    quantity:      number
    subtotal:      number
    notes:         string | null
  }[]
}

type Summary = {
  total_count:    number
  completed_count: number
  total_sales:    number
  by_payment: {
    cash:   number
    card:   number
    emoney: number
  }
}

function groupByReservation(rows: DailyReportRow[]): ReservationGroup[] {
  const map = new Map<number, ReservationGroup>()

  for (const row of rows) {
    if (!map.has(row.reservation_id)) {
      map.set(row.reservation_id, {
        reservation_id: row.reservation_id,
        start_time:     row.start_time,
        customer_name:  row.customer_name,
        furigana:       row.furigana,
        phone:          row.phone,
        car_maker:      row.car_maker,
        car_model:      row.car_model,
        car_number:     row.car_number,
        car_size:       row.car_size,
        status:         row.status,
        work_lane:      row.work_lane,
        staff_name:     row.staff_name,
        total_price:    row.total_price,
        payment_method: row.payment_method,
        notes:          row.reservation_notes,
        items:          [],
      })
    }

    if (row.item_id) {
      map.get(row.reservation_id)!.items.push({
        item_id:        row.item_id,
        item_type:      row.item_type ?? '',
        service_detail: row.service_detail ?? '',
        unit_price:     row.unit_price ?? 0,
        quantity:       row.quantity ?? 1,
        subtotal:       row.subtotal ?? 0,
        notes:          row.item_notes,
      })
    }
  }

  return Array.from(map.values())
}

function calcSummary(groups: ReservationGroup[]): Summary {
  const completed = groups.filter(g => g.status === 'completed')
  const totalSales = completed.reduce((sum, g) => sum + (g.total_price ?? 0), 0)

  return {
    total_count:     groups.length,
    completed_count: completed.length,
    total_sales:     totalSales,
    by_payment: {
      cash:   completed.filter(g => g.payment_method === 'cash').reduce((s, g) => s + (g.total_price ?? 0), 0),
      card:   completed.filter(g => g.payment_method === 'card').reduce((s, g) => s + (g.total_price ?? 0), 0),
      emoney: completed.filter(g => g.payment_method === 'emoney').reduce((s, g) => s + (g.total_price ?? 0), 0),
    },
  }
}

export default report
