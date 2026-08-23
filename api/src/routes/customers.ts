import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const customers = new Hono<{ Bindings: Bindings }>()

customers.get('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const { q, search, store_id, group, limit } = c.req.query()
    const searchQuery = q || search
    const parsedLimit = limit ? parseInt(limit, 10) : NaN
    const lim = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1000
    let data

    if (searchQuery) {
      data = await sql`
        SELECT c.*,
          json_agg(v.* ORDER BY v.created_at DESC) FILTER (WHERE v.id IS NOT NULL) AS vehicles
        FROM carwash.customers c
        LEFT JOIN carwash.vehicles v ON v.customer_id = c.id
        WHERE c.name ILIKE ${'%' + searchQuery + '%'}
           OR c.furigana ILIKE ${'%' + searchQuery + '%'}
           OR c.phone ILIKE ${'%' + searchQuery + '%'}
           OR c.line_name ILIKE ${'%' + searchQuery + '%'}
        GROUP BY c.id
        ORDER BY c.furigana, c.name
        LIMIT ${lim}`
    } else if (store_id && group) {
      data = await sql`
        SELECT c.*,
          json_agg(v.* ORDER BY v.created_at DESC) FILTER (WHERE v.id IS NOT NULL) AS vehicles
        FROM carwash.customers c
        LEFT JOIN carwash.vehicles v ON v.customer_id = c.id
        WHERE c.primary_store_id = ${store_id} AND c.customer_group = ${group}
        GROUP BY c.id
        ORDER BY c.furigana, c.name
        LIMIT ${lim}`
    } else if (store_id) {
      data = await sql`
        SELECT c.*,
          json_agg(v.* ORDER BY v.created_at DESC) FILTER (WHERE v.id IS NOT NULL) AS vehicles
        FROM carwash.customers c
        LEFT JOIN carwash.vehicles v ON v.customer_id = c.id
        WHERE c.primary_store_id = ${store_id}
        GROUP BY c.id
        ORDER BY c.furigana, c.name
        LIMIT ${lim}`
    } else {
      data = await sql`
        SELECT c.*,
          json_agg(v.* ORDER BY v.created_at DESC) FILTER (WHERE v.id IS NOT NULL) AS vehicles
        FROM carwash.customers c
        LEFT JOIN carwash.vehicles v ON v.customer_id = c.id
        GROUP BY c.id
        ORDER BY c.furigana, c.name
        LIMIT ${lim}`
    }
    return c.json(data)
  } finally { await sql.end() }
})

customers.get('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const [customer, vehicles] = await Promise.all([
      sql`SELECT * FROM carwash.customers WHERE id = ${id}`,
      sql`SELECT * FROM carwash.vehicles WHERE customer_id = ${id} ORDER BY created_at DESC`,
    ])
    if (!customer[0]) return c.json({ error: '顧客が見つかりません' }, 404)
    return c.json({ ...customer[0], vehicles })
  } finally { await sql.end() }
})

customers.post('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.customers (name, furigana, phone, email, address, customer_group, primary_store_id, notes, line_name)
      VALUES (${body.name}, ${body.furigana ?? null}, ${body.phone ?? null}, ${body.email ?? null},
              ${body.address ?? null}, ${body.customer_group ?? 'general'}, ${body.primary_store_id ?? 1},
              ${body.notes ?? null}, ${body.line_name ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

customers.put('/:id', async (c) => {
  const sql = createDb(c.env)
  const id = c.req.param('id')
  let body: any
  try {
    body = await c.req.json()
    const data = await sql`
      UPDATE carwash.customers SET
        name = ${body.name ?? null}, furigana = ${body.furigana ?? null},
        phone = ${body.phone ?? null}, email = ${body.email ?? null},
        address = ${body.address ?? null}, notes = ${body.notes ?? null},
        line_name = ${body.line_name ?? null},
        customer_group = COALESCE(${body.customer_group ?? null}, customer_group),
        primary_store_id = COALESCE(${body.primary_store_id ?? null}, primary_store_id),
        updated_at = now()
      WHERE id = ${id} RETURNING *`
    return c.json(data[0])
  } catch (err) {
    console.error('[PUT /api/customers/:id]', { id, body }, err)
    throw err
  } finally { await sql.end() }
})

customers.delete('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.customers WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

export default customers
