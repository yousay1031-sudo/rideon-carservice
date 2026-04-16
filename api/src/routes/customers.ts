import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const customers = new Hono<{ Bindings: Bindings }>()

customers.get('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const { q, search, store_id, group } = c.req.query()
    const searchQuery = q || search
    let data
    if (searchQuery) {
      data = await sql`
        SELECT * FROM carwash.customers
        WHERE name ILIKE ${'%' + searchQuery + '%'}
           OR furigana ILIKE ${'%' + searchQuery + '%'}
           OR phone ILIKE ${'%' + searchQuery + '%'}
        ORDER BY furigana, name LIMIT 200`
    } else if (store_id && group) {
      data = await sql`SELECT * FROM carwash.customers WHERE primary_store_id = ${store_id} AND customer_group = ${group} ORDER BY furigana, name LIMIT 200`
    } else if (store_id) {
      data = await sql`SELECT * FROM carwash.customers WHERE primary_store_id = ${store_id} ORDER BY furigana, name LIMIT 200`
    } else {
      data = await sql`SELECT * FROM carwash.customers ORDER BY furigana, name LIMIT 200`
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
    if (!customer[0]) return c.json({ error: 'é¡§å®¢ãè¦ã¤ããã¾ãã' }, 404)
    return c.json({ ...customer[0], vehicles })
  } finally { await sql.end() }
})

customers.post('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.customers (name, furigana, phone, email, address, customer_group, primary_store_id, notes)
      VALUES (${body.name}, ${body.furigana ?? null}, ${body.phone ?? null}, ${body.email ?? null},
              ${body.address ?? null}, ${body.customer_group ?? 'general'}, ${body.primary_store_id ?? 1}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

customers.put('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.customers SET
        name = ${body.name}, furigana = ${body.furigana ?? null},
        phone = ${body.phone ?? null}, email = ${body.email ?? null},
        address = ${body.address ?? null}, customer_group = ${body.customer_group},
        primary_store_id = ${body.primary_store_id}, notes = ${body.notes ?? null}
      WHERE id = ${id} RETURNING *`
    return c.json(data[0])
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