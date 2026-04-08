import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const report = new Hono<{ Bindings: Bindings }>()

report.get('/daily', async (c) => {
  const sql = createDb(c.env)
  try {
    const { date, store_id } = c.req.query()
    if (!date) return c.json({ error: 'date は必須です' }, 400)

    const rows = store_id
      ? await sql`SELECT * FROM carwash.v_daily_report WHERE reservation_date = ${date} ORDER BY start_time, reservation_id, item_order`
      : await sql`SELECT * FROM carwash.v_daily_report WHERE reservation_date = ${date} ORDER BY start_time, reservation_id, item_order`

    const map = new Map<number, any>()
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
        map.get(row.reservation_id).items.push({
          item_id:        row.item_id,
          item_type:      row.item_type,
          service_detail: row.service_detail,
          unit_price:     row.unit_price,
          quantity:       row.quantity,
          subtotal:       row.subtotal,
          notes:          row.item_notes,
        })
      }
    }

    const grouped = Array.from(map.values())
    const completed = grouped.filter(g => g.status === 'completed')
    const totalSales = completed.reduce((s, g) => s + (g.total_price ?? 0), 0)

    return c.json({
      date,
      rows: grouped,
      summary: {
        total_count:     grouped.length,
        completed_count: completed.length,
        total_sales:     totalSales,
        by_payment: {
          cash:   completed.filter(g => g.payment_method === 'cash').reduce((s, g) => s + (g.total_price ?? 0), 0),
          card:   completed.filter(g => g.payment_method === 'card').reduce((s, g) => s + (g.total_price ?? 0), 0),
          emoney: completed.filter(g => g.payment_method === 'emoney').reduce((s, g) => s + (g.total_price ?? 0), 0),
        },
      },
    })
  } finally { await sql.end() }
})

export default report