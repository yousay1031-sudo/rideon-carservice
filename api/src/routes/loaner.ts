import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const loaner = new Hono<{ Bindings: Bindings }>()

// 代車一覧
loaner.get('/loaner-cars', async (c) => {
  const sql = createDb(c.env)
  try {
    const { store_id } = c.req.query()
    const data = store_id
      ? await sql`SELECT * FROM carwash.loaner_cars WHERE store_id = ${store_id} AND is_active = true ORDER BY id`
      : await sql`SELECT * FROM carwash.loaner_cars WHERE is_active = true ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

loaner.get('/loaner-cars/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.loaner_cars WHERE id = ${c.req.param('id')}`
    if (!data[0]) return c.json({ error: '代車が見つかりません' }, 404)
    return c.json(data[0])
  } finally { await sql.end() }
})

loaner.post('/loaner-cars', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.loaner_cars (store_id, car_number, car_maker, car_model, car_color, car_year, notes)
      VALUES (${body.store_id ?? 1}, ${body.car_number ?? null}, ${body.car_maker ?? null},
              ${body.car_model ?? null}, ${body.car_color ?? null}, ${body.car_year ?? null}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

loaner.put('/loaner-cars/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.loaner_cars SET
        car_number = ${body.car_number ?? null}, car_maker = ${body.car_maker ?? null},
        car_model = ${body.car_model ?? null}, car_color = ${body.car_color ?? null},
        car_year = ${body.car_year ?? null}, notes = ${body.notes ?? null},
        is_active = ${body.is_active ?? true}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

loaner.delete('/loaner-cars/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`UPDATE carwash.loaner_cars SET is_active = false WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

// 代車貸出一覧
loaner.get('/loaner-rentals', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`
      SELECT lr.*, lc.car_number, lc.car_maker, lc.car_model, c.name as customer_name
      FROM carwash.loaner_rentals lr
      LEFT JOIN carwash.loaner_cars lc ON lc.id = lr.loaner_car_id
      LEFT JOIN carwash.customers c ON c.id = lr.customer_id
      ORDER BY lr.created_at DESC LIMIT 100`
    return c.json(data)
  } finally { await sql.end() }
})

loaner.post('/loaner-rentals', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.loaner_rentals (loaner_car_id, customer_id, reservation_id, rental_start, rental_end, status, notes)
      VALUES (${body.loaner_car_id}, ${body.customer_id ?? null}, ${body.reservation_id ?? null},
              ${body.rental_start ?? null}, ${body.rental_end ?? null}, ${body.status ?? 'active'}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

loaner.put('/loaner-rentals/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.loaner_rentals SET
        rental_end = ${body.rental_end ?? null}, status = ${body.status ?? 'active'}, notes = ${body.notes ?? null}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

loaner.delete('/loaner-rentals/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.loaner_rentals WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

export default loaner
