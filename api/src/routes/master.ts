import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const master = new Hono<{ Bindings: Bindings }>()

master.get('/stores', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.stores WHERE is_active = true ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

master.get('/staff', async (c) => {
  const sql = createDb(c.env)
  try {
    const { store_id } = c.req.query()
    const data = store_id
      ? await sql`SELECT * FROM carwash.staff_members WHERE is_active = true AND store_id = ${store_id} ORDER BY id`
      : await sql`SELECT * FROM carwash.staff_members WHERE is_active = true ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

master.get('/service-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const menus = await sql`SELECT * FROM carwash.service_menu WHERE is_active = true ORDER BY display_order`
    const prices = await sql`SELECT * FROM carwash.service_prices`
    const CAR_SIZES = ['''SS''', '''S''', '''M''', '''L''', '''LL''', '''XL''']
    const priceMap = new Map<string, number>()
    for (const p of prices) priceMap.set(`${p.service_id}_${p.car_size}`, p.price)
    const result = menus.map((m: any) => ({
      ...m,
      prices: m.is_size_based
        ? Object.fromEntries(CAR_SIZES.map(sz => [sz, priceMap.get(`${m.id}_${sz}`) ?? null]))
        : null,
    }))
    return c.json(result)
  } finally { await sql.end() }
})

master.get('/tire-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.tire_menu ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

master.get('/oil-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const grades = await sql`SELECT * FROM carwash.oil_grades WHERE is_active = true ORDER BY display_order`
    const work = await sql`SELECT * FROM carwash.oil_work_price ORDER BY id DESC LIMIT 1`
    const workPrice = work[0]?.work_price ?? 550
    // app.js互換: 配列形式で返す（各gradeにwork_priceを付加）
    const result = grades.map((g: any) => ({ ...g, work_price: workPrice }))
    return c.json(result)
  } finally { await sql.end() }
})

master.get('/all', async (c) => {
  const sql = createDb(c.env)
  try {
    const [stores, staff, menus, prices, tire, grades, work] = await Promise.all([
      sql`SELECT * FROM carwash.stores WHERE is_active = true ORDER BY id`,
      sql`SELECT * FROM carwash.staff_members WHERE is_active = true ORDER BY id`,
      sql`SELECT * FROM carwash.service_menu WHERE is_active = true ORDER BY display_order`,
      sql`SELECT * FROM carwash.service_prices`,
      sql`SELECT * FROM carwash.tire_menu ORDER BY id`,
      sql`SELECT * FROM carwash.oil_grades WHERE is_active = true ORDER BY display_order`,
      sql`SELECT * FROM carwash.oil_work_price ORDER BY id DESC LIMIT 1`,
    ])
    const CAR_SIZES = ['''SS''', '''S''', '''M''', '''L''', '''LL''', '''XL''']
    const priceMap = new Map<string, number>()
    for (const p of prices) priceMap.set(`${p.service_id}_${p.car_size}`, p.price)
    const workPrice = work[0]?.work_price ?? 550
    return c.json({
      stores,
      staff,
      service_menu: menus.map((m: any) => ({
        ...m,
        prices: m.is_size_based
          ? Object.fromEntries(CAR_SIZES.map(sz => [sz, priceMap.get(`${m.id}_${sz}`) ?? null]))
          : null,
      })),
      tire_menu: tire,
      oil: { grades, work_price: workPrice },
    })
  } finally { await sql.end() }
})

export default master
