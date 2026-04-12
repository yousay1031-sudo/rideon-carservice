import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const compat = new Hono<{ Bindings: Bindings }>()

compat.get('/stats', async (c) => {
  const sql = createDb(c.env)
  try {
    const today = new Date().toISOString().split('T')[0]
    const firstOfMonth = today.slice(0, 7) + '-01'

    const [customers, vehicles, thisMonthWashes, thisMonthRevenue, activeAlerts] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM carwash.customers`,
      sql`SELECT COUNT(*) as count FROM carwash.vehicles`,
      sql`SELECT COUNT(*) as count FROM carwash.wash_history WHERE wash_date >= ${firstOfMonth}`,
      sql`SELECT COALESCE(SUM(price), 0) as total FROM carwash.wash_history WHERE wash_date >= ${firstOfMonth}`,
      sql`SELECT COUNT(*) as count FROM carwash.vehicles
          WHERE inspection_date IS NOT NULL
            AND inspection_date BETWEEN ${today} AND ${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}`,
    ])
    return c.json({
      // 旧システム互換キー
      customers: Number(customers[0].count),
      vehicles: Number(vehicles[0].count),
      thisMonthWashes: Number(thisMonthWashes[0].count),
      thisMonthRevenue: Number(thisMonthRevenue[0].total),
      activeAlerts: Number(activeAlerts[0].count),
      // 新システム用キー（後方互換）
      total_customers: Number(customers[0].count),
      total_vehicles: Number(vehicles[0].count),
      today_reservations: 0,
    })
  } finally { await sql.end() }
})

compat.get('/alerts', async (c) => {
  const sql = createDb(c.env)
  try {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const soonStr = soon.toISOString().split('T')[0]
    const data = await sql`
      SELECT v.id, v.car_number, v.car_maker, v.car_model, v.inspection_date, c.name as customer_name, c.phone
      FROM carwash.vehicles v
      JOIN carwash.customers c ON c.id = v.customer_id
      WHERE v.inspection_date IS NOT NULL
        AND v.inspection_date BETWEEN ${today} AND ${soonStr}
      ORDER BY v.inspection_date
      LIMIT 20`
    return c.json(data.map((v: any) => ({ ...v, type: 'inspection', message: `車検期限: ${v.inspection_date}` })))
  } finally { await sql.end() }
})

compat.get('/wash-history', async (c) => {
  const sql = createDb(c.env)
  try {
    const { vehicle_id, limit } = c.req.query()
    const lim = limit ? parseInt(limit) : 50
    const data = vehicle_id
      ? await sql`SELECT * FROM carwash.wash_history WHERE vehicle_id = ${vehicle_id} ORDER BY wash_date DESC LIMIT ${lim}`
      : await sql`SELECT * FROM carwash.wash_history ORDER BY wash_date DESC LIMIT ${lim}`
    return c.json(data)
  } finally { await sql.end() }
})

compat.get('/wash-history/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.wash_history WHERE id = ${c.req.param('id')}`
    return c.json(data[0] ?? null)
  } finally { await sql.end() }
})

compat.post('/wash-history', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.wash_history (vehicle_id, reservation_id, service_name, car_size, price, staff_name, notes)
      VALUES (${body.vehicle_id}, ${body.reservation_id ?? null}, ${body.wash_type ?? body.service_name ?? null},
              ${body.car_size ?? 'M'}, ${body.price ?? null}, ${body.staff_name ?? null}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/wash-history/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.wash_history SET
        service_name = ${body.wash_type ?? body.service_name ?? null},
        price = ${body.price ?? null}, staff_name = ${body.staff_name ?? null}, notes = ${body.notes ?? null}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/wash-history/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.wash_history WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.get('/coating-inspections', async (c) => {
  const sql = createDb(c.env)
  try {
    const { vehicle_id, customer_id } = c.req.query()
    const data = vehicle_id
      ? await sql`SELECT * FROM carwash.coating_inspections WHERE vehicle_id = ${vehicle_id} ORDER BY coating_date DESC`
      : customer_id
      ? await sql`SELECT * FROM carwash.coating_inspections WHERE customer_id = ${customer_id} ORDER BY coating_date DESC`
      : await sql`SELECT * FROM carwash.coating_inspections ORDER BY coating_date DESC LIMIT 100`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/coating-inspections', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.coating_inspections (vehicle_id, customer_id, service_name, coating_date, next_inspection, notes)
      VALUES (${body.vehicle_id}, ${body.customer_id}, ${body.service_name}, ${body.coating_date}, ${body.next_inspection ?? null}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/coating-inspections/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.coating-inspections SET
        service_name = ${body.service_name}, coating_date = ${body.coating_date},
        next_inspection = ${body.next_inspection ?? null}, notes = ${body.notes ?? null}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/coating-inspections/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.coating_inspections WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.get('/line/history', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.line_message_log ORDER BY created_at DESC LIMIT 20`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/send-notification', async (c) => c.json({ ok: true }))
compat.post('/line/send-campaign', async (c) => c.json({ ok: true }))
compat.post('/line/send-inspection-alerts', async (c) => c.json({ ok: true }))
compat.post('/line/send-reservation-notification', async (c) => c.json({ ok: true }))

export default compat
