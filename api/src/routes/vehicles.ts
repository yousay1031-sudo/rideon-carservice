import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const vehicles = new Hono<{ Bindings: Bindings }>()

vehicles.get('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const { customer_id } = c.req.query()
    const data = customer_id
      ? await sql`
          SELECT v.*, c.name as customer_name, c.furigana, c.phone as customer_phone
          FROM carwash.vehicles v
          LEFT JOIN carwash.customers c ON c.id = v.customer_id
          WHERE v.customer_id = ${customer_id}
          ORDER BY v.created_at DESC`
      : await sql`
          SELECT v.*, c.name as customer_name, c.furigana, c.phone as customer_phone
          FROM carwash.vehicles v
          LEFT JOIN carwash.customers c ON c.id = v.customer_id
          ORDER BY v.created_at DESC`
    return c.json(data)
  } finally { await sql.end() }
})

vehicles.get('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const [vehicle, history] = await Promise.all([
      sql`
        SELECT v.*, c.name as customer_name, c.furigana, c.phone as customer_phone
        FROM carwash.vehicles v
        LEFT JOIN carwash.customers c ON c.id = v.customer_id
        WHERE v.id = ${id}`,
      sql`SELECT * FROM carwash.wash_history WHERE vehicle_id = ${id} ORDER BY wash_date DESC LIMIT 50`,
    ])
    if (!vehicle[0]) return c.json({ error: '車両が見つかりません' }, 404)
    return c.json({ ...vehicle[0], wash_history: history })
  } finally { await sql.end() }
})

vehicles.post('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.vehicles (customer_id, car_number, car_maker, car_model, car_color, car_year, car_size, inspection_date, notes)
      VALUES (${body.customer_id}, ${body.car_number ?? null}, ${body.car_maker ?? null},
              ${body.car_model ?? null}, ${body.car_color ?? null}, ${body.car_year ?? null},
              ${body.car_size ?? 'M'}, ${body.inspection_date ?? null}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

vehicles.put('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.vehicles SET
        car_number = ${body.car_number ?? null}, car_maker = ${body.car_maker ?? null},
        car_model = ${body.car_model ?? null}, car_color = ${body.car_color ?? null},
        car_year = ${body.car_year ?? null}, car_size = ${body.car_size ?? 'M'},
        inspection_date = ${body.inspection_date ?? null}, notes = ${body.notes ?? null}
      WHERE id = ${id} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

vehicles.delete('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.vehicles WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

export default vehicles
