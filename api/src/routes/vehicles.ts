import { Hono } from 'hono'
import { createSupabase, type Bindings } from '../lib/supabase'

const vehicles = new Hono<{ Bindings: Bindings }>()

// 車両一覧（顧客IDで絞り込み）
vehicles.get('/', async (c) => {
  const db = createSupabase(c.env)
  const { customer_id } = c.req.query()

  const params: Record<string, string> = {
    select: 'id,customer_id,car_number,car_maker,car_model,car_color,car_year,car_size,inspection_date,image_url,notes',
    order: 'created_at.desc',
  }
  if (customer_id) params['customer_id'] = `eq.${customer_id}`

  const { data, error } = await db.query('vehicles', params)
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 車両詳細（洗車履歴込み）
vehicles.get('/:id', async (c) => {
  const db = createSupabase(c.env)
  const id = c.req.param('id')

  const [vehicleRes, historyRes] = await Promise.all([
    db.single('vehicles', { id: `eq.${id}` }),
    db.query('wash_history', {
      vehicle_id: `eq.${id}`,
      order: 'wash_date.desc',
      limit: '50',
      select: 'id,wash_date,service_name,car_size,price,staff_name,notes',
    }),
  ])

  if (!vehicleRes.data) return c.json({ error: '車両が見つかりません' }, 404)

  return c.json({
    ...vehicleRes.data,
    wash_history: historyRes.data,
  })
})

// 車両登録
vehicles.post('/', async (c) => {
  const db = createSupabase(c.env)
  const body = await c.req.json()

  const { data, error } = await db.insert('vehicles', {
    customer_id:     body.customer_id,
    car_number:      body.car_number ?? null,
    car_maker:       body.car_maker ?? null,
    car_model:       body.car_model ?? null,
    car_color:       body.car_color ?? null,
    car_year:        body.car_year ?? null,
    car_size:        body.car_size ?? 'M',
    inspection_date: body.inspection_date ?? null,
    notes:           body.notes ?? null,
  })
  if (error) return c.json({ error }, 500)
  return c.json(data, 201)
})

// 車両更新
vehicles.put('/:id', async (c) => {
  const db = createSupabase(c.env)
  const id = c.req.param('id')
  const body = await c.req.json()

  const { data, error } = await db.update('vehicles', { id }, {
    car_number:      body.car_number ?? null,
    car_maker:       body.car_maker ?? null,
    car_model:       body.car_model ?? null,
    car_color:       body.car_color ?? null,
    car_year:        body.car_year ?? null,
    car_size:        body.car_size ?? 'M',
    inspection_date: body.inspection_date ?? null,
    notes:           body.notes ?? null,
  })
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 車両削除
vehicles.delete('/:id', async (c) => {
  const db = createSupabase(c.env)
  const { error } = await db.remove('vehicles', { id: c.req.param('id') })
  if (error) return c.json({ error }, 500)
  return c.json({ ok: true })
})

export default vehicles
