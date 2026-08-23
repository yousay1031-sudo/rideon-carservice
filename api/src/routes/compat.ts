import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const compat = new Hono<{ Bindings: Bindings }>()

const EXPENSE_STORE_MAP: Record<string, string> = {
  '1': '75bf10cc-09f6-48a3-94a7-01252bc04ba2',
  '2': '6b341cb0-972d-4fc8-aefe-d0c1237fbf95',
}

compat.get('/stats', async (c) => {
  const sql = createDb(c.env)
  try {
    const today = new Date().toISOString().split('T')[0]
    const firstOfMonth = today.slice(0, 7) + '-01'

    const [customers, vehicles, thisMonthWashes, thisMonthRevenue, activeAlerts] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM carwash.customers`,
      sql`SELECT COUNT(*) as count FROM carwash.vehicles`,
      sql`SELECT COUNT(*) as count FROM carwash.wash_history WHERE wash_date >= ${firstOfMonth}`,
      sql`SELECT COALESCE(SUM(price), 0) as total FROM carwash.wash_history WHERE wash_date >= ${firstOfMonth}`,
      sql`SELECT COUNT(*) as count FROM carwash.vehicles
          WHERE inspection_date IS NOT NULL
            AND inspection_date BETWEEN ${today} AND ${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}`,
    ])
    return c.json({
      // 旧システム互換キー
      customers: Number(customers[0].count),
      vehicles: Number(vehicles[0].count),
      thisMonthWashes: Number(thisMonthWashes[0].count),
      thisMonthRevenue: Number(thisMonthRevenue[0].total),
      activeAlerts: Number(activeAlerts[0].count),
      // 新システム用キー（後方互換）
      total_customers: Number(customers[0].count),
      total_vehicles: Number(vehicles[0].count),
      today_reservations: 0,
    })
  } finally { await sql.end() }
})

compat.get('/alerts', async (c) => {
  const sql = createDb(c.env)
  try {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const soonStr = soon.toISOString().split('T')[0]
    const data = await sql`
      SELECT v.id, v.car_number, v.car_maker, v.car_model, v.inspection_date, c.name as customer_name, c.phone
      FROM carwash.vehicles v
      JOIN carwash.customers c ON c.id = v.customer_id
      WHERE v.inspection_date IS NOT NULL
        AND v.inspection_date BETWEEN ${today} AND ${soonStr}
      ORDER BY v.inspection_date
      LIMIT 20`
    return c.json(data.map((v: any) => ({ ...v, type: 'inspection', message: `車検期限: ${v.inspection_date}` })))
  } finally { await sql.end() }
})

compat.get('/wash-history', async (c) => {
  const sql = createDb(c.env)
  try {
    const { vehicle_id, limit } = c.req.query()
    const lim = limit ? parseInt(limit) : 50
    const data = vehicle_id
      ? await sql`
          SELECT wh.*, v.car_number, v.car_maker, v.car_model, v.car_size as vehicle_car_size,
                 c.name as customer_name, c.phone as customer_phone,
                 wh.service_name as wash_type
          FROM carwash.wash_history wh
          LEFT JOIN carwash.vehicles v ON v.id = wh.vehicle_id
          LEFT JOIN carwash.customers c ON c.id = v.customer_id
          WHERE wh.vehicle_id = ${vehicle_id}
          ORDER BY wh.wash_date DESC LIMIT ${lim}`
      : await sql`
          SELECT wh.*, v.car_number, v.car_maker, v.car_model, v.car_size as vehicle_car_size,
                 c.name as customer_name, c.phone as customer_phone,
                 wh.service_name as wash_type
          FROM carwash.wash_history wh
          LEFT JOIN carwash.vehicles v ON v.id = wh.vehicle_id
          LEFT JOIN carwash.customers c ON c.id = v.customer_id
          ORDER BY wh.wash_date DESC LIMIT ${lim}`
    return c.json(data)
  } finally { await sql.end() }
})

compat.get('/wash-history/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.wash_history WHERE id = ${c.req.param('id')}`
    return c.json(data[0] ?? null)
  } finally { await sql.end() }
})

compat.post('/wash-history', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.wash_history (vehicle_id, reservation_id, service_name, car_size, price, staff_name, notes)
      VALUES (${body.vehicle_id}, ${body.reservation_id ?? null}, ${body.wash_type ?? body.service_name ?? null},
              ${body.car_size ?? 'M'}, ${body.price ?? null}, ${body.staff_name ?? null}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/wash-history/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.wash_history SET
        service_name = ${body.wash_type ?? body.service_name ?? null},
        price = ${body.price ?? null}, staff_name = ${body.staff_name ?? null}, notes = ${body.notes ?? null}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/wash-history/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.wash_history WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.get('/coating-inspections', async (c) => {
  const sql = createDb(c.env)
  try {
    const { vehicle_id, customer_id } = c.req.query()
    const data = vehicle_id
      ? await sql`SELECT * FROM carwash.coating_inspections WHERE vehicle_id = ${vehicle_id} ORDER BY coating_date DESC`
      : customer_id
      ? await sql`SELECT * FROM carwash.coating_inspections WHERE customer_id = ${customer_id} ORDER BY coating_date DESC`
      : await sql`SELECT * FROM carwash.coating_inspections ORDER BY coating_date DESC LIMIT 100`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/coating-inspections', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.coating_inspections (vehicle_id, customer_id, service_name, coating_date, next_inspection, notes)
      VALUES (${body.vehicle_id}, ${body.customer_id}, ${body.service_name}, ${body.coating_date}, ${body.next_inspection ?? null}, ${body.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/coating-inspections/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.coating-inspections SET
        service_name = ${body.service_name}, coating_date = ${body.coating_date},
        next_inspection = ${body.next_inspection ?? null}, notes = ${body.notes ?? null}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/coating-inspections/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.coating_inspections WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.get('/line/history', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.line_message_log ORDER BY created_at DESC LIMIT 20`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/send-notification', async (c) => c.json({ ok: true }))
compat.post('/line/send-campaign', async (c) => c.json({ ok: true }))
compat.post('/line/send-inspection-alerts', async (c) => c.json({ ok: true }))
compat.post('/line/send-reservation-notification', async (c) => c.json({ ok: true }))

// 旧システム互換エイリアス
compat.get('/stores', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.stores WHERE is_active = true ORDER BY id`
    // 旧システム互換: store_name フィールドを追加
    return c.json(data.map((s: any) => ({ ...s, store_name: s.name })))
  } finally { await sql.end() }
})

compat.get('/staff', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.staff_members WHERE is_active = true ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/staff', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.staff_members (name, store_id, role, is_active)
      VALUES (${body.name}, ${body.store_id ?? 1}, ${body.role ?? 'staff'}, true)
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/staff/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.staff_members SET name = ${body.name}, store_id = ${body.store_id ?? 1}, is_active = ${body.is_active ?? true}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/staff/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`UPDATE carwash.staff_members SET is_active = false WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.get('/oil-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const grades = await sql`SELECT * FROM carwash.oil_grades WHERE is_active = true ORDER BY display_order`
    const work = await sql`SELECT * FROM carwash.oil_work_price ORDER BY id DESC LIMIT 1`
    const workPrice = work[0]?.work_price ?? 550
    return c.json(grades.map((g: any) => ({ ...g, work_price: workPrice })))
  } finally { await sql.end() }
})

compat.get('/tire-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.tire_menu ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

compat.get('/wash-services', async (c) => {
  const sql = createDb(c.env)
  try {
    const { all } = c.req.query()
    const data = all === 'true'
      ? await sql`SELECT * FROM carwash.service_menu ORDER BY display_order, id`
      : await sql`SELECT * FROM carwash.service_menu WHERE is_active = true ORDER BY display_order`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/wash-services', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.service_menu (name, category, description, is_size_based, flat_price, is_active, display_order, show_in_reservation)
      VALUES (${body.name}, ${body.category ?? '洗車コース'}, ${body.description ?? null},
              ${body.is_size_based ?? true}, ${body.flat_price ?? null}, ${body.is_active ?? true},
              ${body.display_order ?? 99}, ${body.show_in_reservation ?? false})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/wash-services/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.service_menu SET
        name = ${body.name}, category = ${body.category ?? '洗車コース'},
        description = ${body.description ?? null}, is_size_based = ${body.is_size_based ?? true},
        flat_price = ${body.flat_price ?? null}, is_active = ${body.is_active ?? true},
        display_order = ${body.display_order ?? 99},
        show_in_reservation = ${body.show_in_reservation ?? false}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/wash-services/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`UPDATE carwash.service_menu SET is_active = false WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.put('/wash-service-prices/service/:service_id', async (c) => {
  const sql = createDb(c.env)
  try {
    const serviceId = c.req.param('service_id')
    const { prices } = await c.req.json()
    await sql`DELETE FROM carwash.service_prices WHERE service_id = ${serviceId}`
    for (const [car_size, price] of Object.entries(prices as Record<string, number>)) {
      if (price != null && String(price) !== '') {
        await sql`INSERT INTO carwash.service_prices (service_id, car_size, price) VALUES (${serviceId}, ${car_size}, ${price})`
      }
    }
    return c.json({ ok: true })
  } finally { await sql.end() }
})

compat.get('/wash-service-prices/all', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.service_prices ORDER BY service_id, car_size`
    return c.json(data)
  } finally { await sql.end() }
})

compat.get('/menu-items', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.wash_menu_items WHERE is_active = true ORDER BY display_order`
    return c.json(data)
  } catch { return c.json([]) } finally { await sql.end() }
})

compat.get('/tire-storage-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.tire_menu WHERE service_type = 'storage' ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

compat.get('/tire-disposal-menu', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.tire_menu WHERE service_type = 'disposal' ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

// タイヤ管理（テーブルがなければ空配列を返す）
compat.get('/tire-storage', async (c) => { return c.json([]) })
compat.post('/tire-storage', async (c) => { return c.json({ ok: true }) })
compat.put('/tire-storage/:id', async (c) => { return c.json({ ok: true }) })
compat.delete('/tire-storage/:id', async (c) => { return c.json({ ok: true }) })

compat.get('/tire-purchases', async (c) => { return c.json([]) })
compat.post('/tire-purchases', async (c) => { return c.json({ ok: true }) })
compat.put('/tire-purchases/:id', async (c) => { return c.json({ ok: true }) })
compat.delete('/tire-purchases/:id', async (c) => { return c.json({ ok: true }) })

// 顧客CSV一括インポート
compat.post('/customers/import', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const customers = body.customers ?? []
    const results = []
    for (const cust of customers) {
      const data = await sql`
        INSERT INTO carwash.customers (name, furigana, phone, email, address, customer_group, primary_store_id, notes)
        VALUES (${cust.name}, ${cust.furigana ?? null}, ${cust.phone ?? null}, ${cust.email ?? null},
                ${cust.address ?? null}, ${cust.customer_group ?? 'general'}, ${cust.primary_store_id ?? 1}, ${cust.notes ?? null})
        ON CONFLICT DO NOTHING RETURNING *`
      if (data[0]) results.push(data[0])
    }
    return c.json({ imported: results.length })
  } finally { await sql.end() }
})

// タイヤ保管現在状況（スタブ）
compat.get('/tire-storage/current/:vehicleId', async (c) => {
  return c.json(null)
})

// 業務日報
compat.get('/daily-report', async (c) => {
  const sql = createDb(c.env)
  try {
    const { date, store_id } = c.req.query()
    const targetDate = date || new Date().toISOString().split('T')[0]

    const [washHistory, reservations] = await Promise.all([
      sql`
        SELECT wh.*, v.car_number, v.car_maker, v.car_model, v.car_size,
               c.name as customer_name
        FROM carwash.wash_history wh
        LEFT JOIN carwash.vehicles v ON v.id = wh.vehicle_id
        LEFT JOIN carwash.customers c ON c.id = v.customer_id
        WHERE DATE(wh.wash_date) = ${targetDate}
        ORDER BY wh.wash_date`,
      sql`
        SELECT r.*, c.name as customer_name_ref, v.car_maker, v.car_model, v.car_number
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        WHERE r.reservation_date::date = ${targetDate}::date
        ${store_id ? sql`AND r.store_id = ${store_id}` : sql``}
        ORDER BY r.start_time`,
    ])

    const completedPaid = (reservations as any[]).filter(r => r.status === 'completed' && r.paid_at != null)
    const totalCount = completedPaid.length
    const totalSales = completedPaid.reduce((sum: number, r: any) => sum + (Number(r.total_price) || 0), 0)
    const byPayment: Record<string, number> = {}
    completedPaid.forEach((r: any) => {
      const m = r.payment_method || 'その他'
      byPayment[m] = (byPayment[m] || 0) + (Number(r.total_price) || 0)
    })

    return c.json({
      date: targetDate,
      wash_history: washHistory,
      reservations: reservations,
      summary: {
        total_count: totalCount,
        total_sales: totalSales,
        by_payment: byPayment,
      }
    })
  } finally { await sql.end() }
})

// ==================== 車種サイズマスター ====================
compat.get('/car-size', async (c) => {
  const sql = createDb(c.env)
  try {
    const { model } = c.req.query()
    if (!model || model.trim().length === 0) return c.json([])
    const data = await sql`
      SELECT car_model, car_size FROM carwash.car_size_master
      WHERE car_model ILIKE ${'%' + model.trim() + '%'}
      ORDER BY car_model
      LIMIT 10`
    return c.json(data)
  } finally { await sql.end() }
})

// ==================== ディーラー管理 ====================
compat.get('/dealers', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.dealers WHERE is_active = true ORDER BY display_order, id`
    return c.json(data)
  } finally { await sql.end() }
})

compat.get('/dealers/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const data = await sql`SELECT * FROM carwash.dealers WHERE id = ${c.req.param('id')}`
    if (!data[0]) return c.json({ error: 'ディーラーが見つかりません' }, 404)
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.post('/dealers', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const presets = Array.isArray(body.service_presets) ? body.service_presets : []
    let data: any[]
    try {
      data = await sql`
        INSERT INTO carwash.dealers (name, contact_name, phone, notes, display_order, is_active, billing_type, payment_due_days, service_presets)
        VALUES (${body.name}, ${body.contact_name ?? null}, ${body.phone ?? null},
                ${body.notes ?? null}, ${body.display_order ?? 99}, true,
                ${body.billing_type ?? 'per_job'}, ${body.payment_due_days ?? 30},
                ${JSON.stringify(presets)}::text::jsonb)
        RETURNING *`
    } catch {
      // service_presets column not yet added — insert without it
      data = await sql`
        INSERT INTO carwash.dealers (name, contact_name, phone, notes, display_order, is_active, billing_type, payment_due_days)
        VALUES (${body.name}, ${body.contact_name ?? null}, ${body.phone ?? null},
                ${body.notes ?? null}, ${body.display_order ?? 99}, true,
                ${body.billing_type ?? 'per_job'}, ${body.payment_due_days ?? 30})
        RETURNING *`
    }
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/dealers/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const id = c.req.param('id')
    // undefined → null に変換し、COALESCE で渡されなかったフィールドは既存値を維持
    const name            = body.name            ?? null
    const contactName     = body.contact_name    ?? null
    const phone           = body.phone           ?? null
    const notes           = body.notes           ?? null
    const displayOrder    = body.display_order   ?? null
    const isActive        = body.is_active       ?? null
    const billingType     = body.billing_type    ?? null
    const paymentDueDays  = body.payment_due_days ?? null
    const presetsJson     = Array.isArray(body.service_presets)
      ? JSON.stringify(body.service_presets)
      : null  // 未送信は null → COALESCE が既存値を維持

    let data: any[]
    try {
      data = await sql`
        UPDATE carwash.dealers SET
          name             = COALESCE(${name},         name),
          contact_name     = COALESCE(${contactName},  contact_name),
          phone            = COALESCE(${phone},        phone),
          notes            = COALESCE(${notes},        notes),
          display_order    = COALESCE(${displayOrder}, display_order),
          is_active        = COALESCE(${isActive},     is_active),
          billing_type     = COALESCE(${billingType},  billing_type),
          payment_due_days = COALESCE(${paymentDueDays}, payment_due_days),
          service_presets  = COALESCE(${presetsJson}::text::jsonb, service_presets)
        WHERE id = ${id}
        RETURNING *`
    } catch {
      // service_presets column not yet added — update without it
      data = await sql`
        UPDATE carwash.dealers SET
          name             = COALESCE(${name},         name),
          contact_name     = COALESCE(${contactName},  contact_name),
          phone            = COALESCE(${phone},        phone),
          notes            = COALESCE(${notes},        notes),
          display_order    = COALESCE(${displayOrder}, display_order),
          is_active        = COALESCE(${isActive},     is_active),
          billing_type     = COALESCE(${billingType},  billing_type),
          payment_due_days = COALESCE(${paymentDueDays}, payment_due_days)
        WHERE id = ${id}
        RETURNING *`
    }
    if (!data[0]) return c.json({ error: 'ディーラーが見つかりません' }, 404)
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/dealers/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`UPDATE carwash.dealers SET is_active = false WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

// ==================== スタッフメンバー管理（指導員・利用者）====================
compat.get('/staff-members', async (c) => {
  const sql = createDb(c.env)
  try {
    const { role } = c.req.query()
    const data = role
      ? await sql`SELECT * FROM carwash.staff_members WHERE is_active = true AND role = ${role} ORDER BY id`
      : await sql`SELECT * FROM carwash.staff_members WHERE is_active = true ORDER BY id`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/staff-members', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.staff_members (name, store_id, role, is_active)
      VALUES (${body.name}, ${body.store_id ?? 1}, ${body.role ?? 'staff'}, true)
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/staff-members/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.staff_members SET
        name = ${body.name}, store_id = ${body.store_id ?? 1},
        role = ${body.role ?? 'staff'}, is_active = ${body.is_active ?? true}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

compat.delete('/staff-members/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`UPDATE carwash.staff_members SET is_active = false WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

// ==================== 来店受付チェックイン ====================
compat.get('/vehicle-checkins', async (c) => {
  const sql = createDb(c.env)
  try {
    const { vehicle_id, reservation_id } = c.req.query()
    const data = vehicle_id
      ? await sql`
          SELECT vc.*, si.name AS instructor_name, sw.name AS worker_name
          FROM carwash.vehicle_checkins vc
          LEFT JOIN carwash.staff_members si ON si.id = vc.instructor_id
          LEFT JOIN carwash.staff_members sw ON sw.id = vc.worker_id
          WHERE vc.vehicle_id = ${vehicle_id}
          ORDER BY vc.checkin_date DESC, vc.created_at DESC`
      : reservation_id
      ? await sql`
          SELECT vc.*, si.name AS instructor_name, sw.name AS worker_name
          FROM carwash.vehicle_checkins vc
          LEFT JOIN carwash.staff_members si ON si.id = vc.instructor_id
          LEFT JOIN carwash.staff_members sw ON sw.id = vc.worker_id
          WHERE vc.reservation_id = ${reservation_id}`
      : await sql`SELECT * FROM carwash.vehicle_checkins ORDER BY checkin_date DESC, created_at DESC LIMIT 100`
    return c.json(data)
  } finally { await sql.end() }
})

compat.post('/vehicle-checkins', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.vehicle_checkins
        (reservation_id, vehicle_id, checkin_date, mileage, prev_mileage,
         inspection_date, oil_level, notes, instructor_id, worker_id)
      VALUES
        (${body.reservation_id ?? null}, ${body.vehicle_id ?? null},
         ${body.checkin_date}, ${body.mileage ?? null}, ${body.prev_mileage ?? null},
         ${body.inspection_date ?? null}, ${body.oil_level ?? null},
         ${body.notes ?? null}, ${body.instructor_id ?? null}, ${body.worker_id ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

compat.put('/vehicle-checkins/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      UPDATE carwash.vehicle_checkins SET
        mileage = ${body.mileage ?? null},
        prev_mileage = ${body.prev_mileage ?? null},
        inspection_date = ${body.inspection_date ?? null},
        oil_level = ${body.oil_level ?? null},
        notes = ${body.notes ?? null},
        instructor_id = ${body.instructor_id ?? null},
        worker_id = ${body.worker_id ?? null}
      WHERE id = ${c.req.param('id')} RETURNING *`
    return c.json(data[0])
  } finally { await sql.end() }
})

// ==================== 経費AI連携 ====================
function extractItemsText(raw: unknown): string {
  if (!raw) return ''
  const arr: unknown[] | null = Array.isArray(raw) ? raw : (() => {
    try { return JSON.parse(String(raw)) as unknown[] } catch { return null }
  })()
  if (Array.isArray(arr)) {
    return arr.map((i) => {
      if (typeof i === 'string') return i
      const o = i as Record<string, unknown>
      return String(o?.name ?? o?.description ?? o?.item ?? '')
    }).filter(Boolean).join('、')
  }
  return typeof raw === 'string' ? raw : ''
}

compat.get('/expenses', async (c) => {
  const sql = createDb(c.env)
  try {
    const { date, store_id } = c.req.query()
    if (!date) return c.json({ error: 'date は必須です' }, 400)
    await sql`SET search_path TO public`
    const storeUuid = store_id ? EXPENSE_STORE_MAP[store_id] : null
    const allUuids = Object.values(EXPENSE_STORE_MAP)
    const data = storeUuid
      ? await sql`
          SELECT e.vendor_name, e.total, e.items, e.payment_method, e.store_id
          FROM public.expenses e
          WHERE (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = ${date}::date
            AND e.store_id = ${storeUuid}
          ORDER BY e.id ASC`
      : await sql`
          SELECT e.vendor_name, e.total, e.items, e.payment_method, e.store_id
          FROM public.expenses e
          WHERE (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = ${date}::date
            AND e.store_id = ANY(${allUuids}::uuid[])
          ORDER BY e.id ASC`
    return c.json((data as any[]).map((e) => ({ ...e, items_text: extractItemsText(e.items) })))
  } catch (err) {
    console.error('[expenses] query error:', err)
    return c.json([])
  } finally { await sql.end() }
})

export default compat
