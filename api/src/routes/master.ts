import { Hono } from 'hono'
import { createSupabase, type Bindings } from '../lib/supabase'

const master = new Hono<{ Bindings: Bindings }>()

// 店舗一覧
master.get('/stores', async (c) => {
  const db = createSupabase(c.env)
  const { data, error } = await db.query('stores', {
    is_active: 'eq.true',
    order: 'id.asc',
  })
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 担当者一覧
master.get('/staff', async (c) => {
  const db = createSupabase(c.env)
  const { store_id } = c.req.query()
  const params: Record<string, string> = {
    is_active: 'eq.true',
    order: 'id.asc',
  }
  if (store_id) params['store_id'] = `eq.${store_id}`
  const { data, error } = await db.query('staff_members', params)
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// サービスメニュー一覧（サイズ別料金込み）
master.get('/service-menu', async (c) => {
  const db = createSupabase(c.env)
  const [menuRes, pricesRes] = await Promise.all([
    db.query('service_menu', {
      is_active: 'eq.true',
      order:     'display_order.asc',
    }),
    db.query('service_prices', {}),
  ])
  if (menuRes.error) return c.json({ error: menuRes.error }, 500)

  type Menu = { id: number; category: string; name: string; is_size_based: boolean; flat_price: number | null; display_order: number }
  type Price = { service_id: number; car_size: string; price: number }

  const priceMap = new Map<string, number>()
  for (const p of pricesRes.data as Price[]) {
    priceMap.set(`${p.service_id}_${p.car_size}`, p.price)
  }

  const CAR_SIZES = ['SS', 'S', 'M', 'L', 'LL', 'XL']

  const menus = (menuRes.data as Menu[]).map(m => ({
    ...m,
    prices: m.is_size_based
      ? Object.fromEntries(CAR_SIZES.map(sz => [sz, priceMap.get(`${m.id}_${sz}`) ?? null]))
      : null,
  }))

  return c.json(menus)
})

// タイヤメニュー一覧
master.get('/tire-menu', async (c) => {
  const db = createSupabase(c.env)
  const { data, error } = await db.query('tire_menu', { order: 'id.asc' })
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// オイルグレード一覧（単価）＋工賃
master.get('/oil-menu', async (c) => {
  const db = createSupabase(c.env)
  const [gradesRes, workRes] = await Promise.all([
    db.query('oil_grades', { is_active: 'eq.true', order: 'display_order.asc' }),
    db.single('oil_work_price', { order: 'id.desc' }),
  ])
  if (gradesRes.error) return c.json({ error: gradesRes.error }, 500)
  return c.json({
    grades:     gradesRes.data,
    work_price: (workRes.data as { work_price: number } | null)?.work_price ?? 550,
  })
})

// 全マスターを1回で取得（画面初期化用）
master.get('/all', async (c) => {
  const db = createSupabase(c.env)

  const [storesRes, staffRes, menuRes, pricesRes, tireRes, gradesRes, workRes] =
    await Promise.all([
      db.query('stores',        { is_active: 'eq.true', order: 'id.asc' }),
      db.query('staff_members', { is_active: 'eq.true', order: 'id.asc' }),
      db.query('service_menu',  { is_active: 'eq.true', order: 'display_order.asc' }),
      db.query('service_prices', {}),
      db.query('tire_menu',     { order: 'id.asc' }),
      db.query('oil_grades',    { is_active: 'eq.true', order: 'display_order.asc' }),
      db.single('oil_work_price', { order: 'id.desc' }),
    ])

  type Price = { service_id: number; car_size: string; price: number }
  type Menu  = { id: number; is_size_based: boolean; flat_price: number | null }

  const priceMap = new Map<string, number>()
  for (const p of pricesRes.data as Price[]) {
    priceMap.set(`${p.service_id}_${p.car_size}`, p.price)
  }
  const CAR_SIZES = ['SS', 'S', 'M', 'L', 'LL', 'XL']

  return c.json({
    stores: storesRes.data,
    staff:  staffRes.data,
    service_menu: (menuRes.data as Menu[]).map(m => ({
      ...m,
      prices: m.is_size_based
        ? Object.fromEntries(CAR_SIZES.map(sz => [sz, priceMap.get(`${m.id}_${sz}`) ?? null]))
        : null,
    })),
    tire_menu: tireRes.data,
    oil: {
      grades:     gradesRes.data,
      work_price: (workRes.data as { work_price: number } | null)?.work_price ?? 550,
    },
  })
})

export default master
