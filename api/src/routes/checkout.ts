import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const checkout = new Hono<{ Bindings: Bindings }>()

checkout.post('/:reservation_id/confirm', async (c) => {
  const sql = createDb(c.env)
  try {
    const reservationId = c.req.param('reservation_id')
    const { items, payment_method, total_price } = await c.req.json()

    const reservation = await sql`SELECT * FROM carwash.reservations WHERE id = ${reservationId}`
    if (!reservation[0]) return c.json({ error: '予約が見つかりません' }, 404)

    await sql`DELETE FROM carwash.reservation_items WHERE reservation_id = ${reservationId}`

    for (const item of items) {
      await sql`
        INSERT INTO carwash.reservation_items
          (reservation_id, item_type, service_id, service_name, car_size,
           tire_menu_id, tire_service_type, tire_size, tire_unit_type,
           oil_grade_id, oil_grade, oil_volume_l, oil_work_price,
           is_custom, custom_name, unit_price, quantity, subtotal, notes)
        VALUES
          (${reservationId}, ${item.item_type},
           ${item.service_id ?? null}, ${item.service_name ?? null}, ${item.car_size ?? null},
           ${item.tire_menu_id ?? null}, ${item.tire_service_type ?? null},
           ${item.tire_size ?? null}, ${item.tire_unit_type ?? null},
           ${item.oil_grade_id ?? null}, ${item.oil_grade ?? null},
           ${item.oil_volume_l ?? null}, ${item.oil_work_price ?? null},
           ${item.is_custom ?? false}, ${item.custom_name ?? null},
           ${item.unit_price}, ${item.quantity ?? 1}, ${item.subtotal}, ${item.notes ?? null})`
    }

    await sql`
      UPDATE carwash.reservations SET
        status = 'completed',
        total_price = ${total_price},
        payment_method = ${payment_method},
        paid_at = NOW()
      WHERE id = ${reservationId}`

    const r = reservation[0]
    if (r.vehicle_id) {
      const serviceNames = items.map((i: any) => {
        if (i.item_type === 'tire') return 'タイヤ交換'
        if (i.item_type === 'oil') return 'オイル交換'
        if (i.is_custom) return i.custom_name
        return i.service_name
      }).filter(Boolean).join('・')

      await sql`
        INSERT INTO carwash.wash_history (vehicle_id, reservation_id, service_name, car_size, price)
        VALUES (${r.vehicle_id}, ${reservationId}, ${serviceNames}, ${r.car_size ?? 'M'}, ${total_price})`
    }

    return c.json({ ok: true, total_price, payment_method })
  } finally { await sql.end() }
})

checkout.post('/:reservation_id/items', async (c) => {
  const sql = createDb(c.env)
  try {
    const reservationId = c.req.param('reservation_id')
    const item = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.reservation_items
        (reservation_id, item_type, service_id, service_name, car_size,
         tire_menu_id, tire_service_type, tire_size, tire_unit_type,
         oil_grade_id, oil_grade, oil_volume_l, oil_work_price,
         is_custom, custom_name, unit_price, quantity, subtotal, notes)
      VALUES
        (${reservationId}, ${item.item_type},
         ${item.service_id ?? null}, ${item.service_name ?? null}, ${item.car_size ?? null},
         ${item.tire_menu_id ?? null}, ${item.tire_service_type ?? null},
         ${item.tire_size ?? null}, ${item.tire_unit_type ?? null},
         ${item.oil_grade_id ?? null}, ${item.oil_grade ?? null},
         ${item.oil_volume_l ?? null}, ${item.oil_work_price ?? null},
         ${item.is_custom ?? false}, ${item.custom_name ?? null},
         ${item.unit_price}, ${item.quantity ?? 1}, ${item.subtotal}, ${item.notes ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

checkout.delete('/:reservation_id/items/:item_id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.reservation_items WHERE id = ${c.req.param('item_id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

export default checkout