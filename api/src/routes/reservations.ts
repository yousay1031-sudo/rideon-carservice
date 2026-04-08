import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const reservations = new Hono<{ Bindings: Bindings }>()

reservations.get('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const { date, store_id, status } = c.req.query()
    let data
    if (date && store_id) {
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.reservation_date = ${date} AND r.store_id = ${store_id}
        GROUP BY r.id, c.name, c.furigana, c.phone, v.car_maker, v.car_model, s.name
        ORDER BY r.start_time`
    } else if (date) {
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.reservation_date = ${date}
        GROUP BY r.id, c.name, c.furigana, c.phone, v.car_maker, v.car_model, s.name
        ORDER BY r.start_time`
    } else {
      data = await sql`SELECT * FROM carwash.reservations ORDER BY reservation_date DESC, start_time LIMIT 100`
    }
    return c.json(data)
  } finally { await sql.end() }
})

reservations.get('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const [reservation, items] = await Promise.all([
      sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model, v.car_number AS vehicle_car_number,
          s.name AS staff_name
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        WHERE r.id = ${id}`,
      sql`SELECT * FROM carwash.reservation_items WHERE reservation_id = ${id} ORDER BY id`,
    ])
    if (!reservation[0]) return c.json({ error: '予約が見つかりません' }, 404)
    return c.json({ ...reservation[0], items })
  } finally { await sql.end() }
})

reservations.post('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.reservations
        (store_id, customer_id, vehicle_id, customer_name, customer_phone,
         car_number, car_size, reservation_date, start_time, end_time,
         work_lane, staff_id, dealer_name, status, notes, booked_via_line, line_user_id)
      VALUES
        (${body.store_id}, ${body.customer_id ?? null}, ${body.vehicle_id ?? null},
         ${body.customer_name ?? null}, ${body.customer_phone ?? null},
         ${body.car_number ?? null}, ${body.car_size ?? 'M'},
         ${body.reservation_date}, ${body.start_time}, ${body.end_time ?? null},
         ${body.work_lane ?? '洗車場'}, ${body.staff_id ?? null},
         ${body.dealer_name ?? null}, 'confirmed', ${body.notes ?? null},
         ${body.booked_via_line ?? false}, ${body.line_user_id ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

reservations.put('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.reservations SET
        customer_id = ${body.customer_id ?? null},
        vehicle_id = ${body.vehicle_id ?? null},
        customer_name = ${body.customer_name ?? null},
        customer_phone = ${body.customer_phone ?? null},
        car_number = ${body.car_number ?? null},
        car_size = ${body.car_size ?? 'M'},
        reservation_date = ${body.reservation_date},
        start_time = ${body.start_time},
        end_time = ${body.end_time ?? null},
        work_lane = ${body.work_lane ?? '洗車場'},
        staff_id = ${body.staff_id ?? null},
        dealer_name = ${body.dealer_name ?? null},
        status = ${body.status ?? 'confirmed'},
        notes = ${body.notes ?? null}
      WHERE id = ${id} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

reservations.delete('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.reservations WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

export default reservations