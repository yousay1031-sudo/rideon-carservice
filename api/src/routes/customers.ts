import { Hono } from 'hono'
import { createSupabase, type Bindings } from '../lib/supabase'

const customers = new Hono<{ Bindings: Bindings }>()

// 顧客一覧（検索・店舗フィルタ対応）
customers.get('/', async (c) => {
  const db = createSupabase(c.env)
  const { q, store_id, group } = c.req.query()

  const params: Record<string, string> = {
    select: 'id,name,furigana,phone,email,customer_group,primary_store_id,line_user_id,notes,created_at',
    order: 'furigana.asc,name.asc',
    limit: '200',
  }
  if (store_id) params['primary_store_id'] = `eq.${store_id}`
  if (group)    params['customer_group']   = `eq.${group}`
  if (q) {
    // 名前・ふりがな・電話番号で部分一致
    params['or'] = `name.ilike.*${q}*,furigana.ilike.*${q}*,phone.ilike.*${q}*`
  }

  const { data, error } = await db.query('customers', params)
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 顧客詳細（車両・洗車履歴込み）
customers.get('/:id', async (c) => {
  const db = createSupabase(c.env)
  const id = c.req.param('id')

  const [customerRes, vehiclesRes] = await Promise.all([
    db.single('customers', { id: `eq.${id}` }),
    db.query('vehicles', {
      customer_id: `eq.${id}`,
      order: 'created_at.desc',
      select: 'id,car_number,car_maker,car_model,car_color,car_year,car_size,inspection_date,image_url,notes',
    }),
  ])

  if (!customerRes.data) return c.json({ error: '顧客が見つかりません' }, 404)

  return c.json({
    ...customerRes.data,
    vehicles: vehiclesRes.data,
  })
})

// 顧客登録
customers.post('/', async (c) => {
  const db = createSupabase(c.env)
  const body = await c.req.json()

  const { data, error } = await db.insert('customers', {
    name:             body.name,
    furigana:         body.furigana ?? null,
    phone:            body.phone ?? null,
    email:            body.email ?? null,
    address:          body.address ?? null,
    customer_group:   body.customer_group ?? 'general',
    primary_store_id: body.primary_store_id ?? 1,
    notes:            body.notes ?? null,
  })
  if (error) return c.json({ error }, 500)
  return c.json(data, 201)
})

// 顧客更新
customers.put('/:id', async (c) => {
  const db = createSupabase(c.env)
  const id = c.req.param('id')
  const body = await c.req.json()

  const { data, error } = await db.update('customers', { id }, {
    name:             body.name,
    furigana:         body.furigana ?? null,
    phone:            body.phone ?? null,
    email:            body.email ?? null,
    address:          body.address ?? null,
    customer_group:   body.customer_group,
    primary_store_id: body.primary_store_id,
    notes:            body.notes ?? null,
  })
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 顧客削除
customers.delete('/:id', async (c) => {
  const db = createSupabase(c.env)
  const { error } = await db.remove('customers', { id: c.req.param('id') })
  if (error) return c.json({ error }, 500)
  return c.json({ ok: true })
})

export default customers
