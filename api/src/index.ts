import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Bindings } from './lib/supabase'

import customers    from './routes/customers'
import vehicles     from './routes/vehicles'
import reservations from './routes/reservations'
import checkout     from './routes/checkout'
import report       from './routes/report'
import master       from './routes/master'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'https://rideon-carwash.pages.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.get('/', c => c.json({ ok: true, service: 'RIDE ON!! Carwash API' }))

app.get('/debug', async (c) => {
  const { createDb } = await import('./lib/supabase')
  const sql = createDb(c.env)
  const result = await sql`SELECT name FROM carwash.stores LIMIT 5`
  await sql.end()
  return c.json({ stores: result })
})

app.route('/api/customers',    customers)
app.route('/api/vehicles',     vehicles)
app.route('/api/reservations', reservations)
app.route('/api/checkout',     checkout)
app.route('/api/report',       report)
app.route('/api/master',       master)

app.notFound(c => c.json({ error: 'Not Found' }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

export default app