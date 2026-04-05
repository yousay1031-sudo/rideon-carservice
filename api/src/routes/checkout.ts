import { Hono } from 'hono'
import { createSupabase, type Bindings } from '../lib/supabase'

const checkout = new Hono<{ Bindings: Bindings }>()

// ==================== 会計確定 ====================
// 明細を受け取り → reservation_items に保存 → reservations を completed に更新
// → wash_history に記録

checkout.post('/:reservation_id/confirm', async (c) => {
  const db = createSupabase(c.env)
  const reservationId = c.req.param('reservation_id')
  const body = await c.req.json()

  // body.items: 明細配列
  // body.payment_method: cash / card / emoney
  // body.total_price: 合計金額（フロント計算済み）

  const { items, payment_method, total_price } = body as {
    items: CheckoutItem[]
    payment_method: string
    total_price: number
  }

  // 1. 予約情報を取得（wash_history 記録用）
  const { data: reservation } = await db.single<Reservation>('reservations', {
    id: `eq.${reservationId}`,
    select: 'id,vehicle_id,car_size,customer_id',
  })
  if (!reservation) return c.json({ error: '予約が見つかりません' }, 404)

  // 2. 既存の明細を削除（再会計に対応）
  await db.remove('reservation_items', { reservation_id: reservationId })

  // 3. 明細を登録
  const itemErrors: string[] = []
  for (const item of items) {
    const { error } = await db.insert('reservation_items', buildItemPayload(reservationId, item))
    if (error) itemErrors.push(error)
  }
  if (itemErrors.length > 0) return c.json({ error: itemErrors.join(', ') }, 500)

  // 4. 予約を completed に更新
  const { error: resErr } = await db.update('reservations', { id: reservationId }, {
    status:         'completed',
    total_price,
    payment_method,
    paid_at:        new Date().toISOString(),
  })
  if (resErr) return c.json({ error: resErr }, 500)

  // 5. 洗車履歴に記録（vehicle_id がある場合のみ）
  if (reservation.vehicle_id) {
    const mainItem = items.find(i => i.item_type === 'service') ?? items[0]
    await db.insert('wash_history', {
      vehicle_id:     reservation.vehicle_id,
      reservation_id: Number(reservationId),
      service_name:   summarizeItems(items),
      car_size:       reservation.car_size ?? 'M',
      price:          total_price,
    })
  }

  return c.json({ ok: true, total_price, payment_method })
})

// ==================== 明細の追加・削除（会計前の編集用）====================

checkout.post('/:reservation_id/items', async (c) => {
  const db = createSupabase(c.env)
  const reservationId = c.req.param('reservation_id')
  const item = await c.req.json() as CheckoutItem

  const { data, error } = await db.insert('reservation_items', buildItemPayload(reservationId, item))
  if (error) return c.json({ error }, 500)
  return c.json(data, 201)
})

checkout.delete('/:reservation_id/items/:item_id', async (c) => {
  const db = createSupabase(c.env)
  const { error } = await db.remove('reservation_items', { id: c.req.param('item_id') })
  if (error) return c.json({ error }, 500)
  return c.json({ ok: true })
})

// ==================== 型・ユーティリティ ====================

type CheckoutItem = {
  item_type: 'service' | 'tire' | 'oil' | 'other'
  // service
  service_id?:   number
  service_name?: string
  car_size?:     string
  // tire
  tire_menu_id?:      number
  tire_service_type?: string
  tire_size?:         string
  tire_unit_type?:    string
  // oil
  oil_grade_id?:   number
  oil_grade?:      string
  oil_volume_l?:   number
  oil_work_price?: number
  // custom
  is_custom?:   boolean
  custom_name?: string
  // common
  unit_price: number
  quantity?:  number
  subtotal:   number
  notes?:     string
}

type Reservation = {
  id: number
  vehicle_id: number | null
  car_size: string | null
  customer_id: number | null
}

function buildItemPayload(reservationId: string, item: CheckoutItem) {
  return {
    reservation_id:    Number(reservationId),
    item_type:         item.item_type,
    service_id:        item.service_id        ?? null,
    service_name:      item.service_name      ?? null,
    car_size:          item.car_size          ?? null,
    tire_menu_id:      item.tire_menu_id      ?? null,
    tire_service_type: item.tire_service_type ?? null,
    tire_size:         item.tire_size         ?? null,
    tire_unit_type:    item.tire_unit_type    ?? null,
    oil_grade_id:      item.oil_grade_id      ?? null,
    oil_grade:         item.oil_grade         ?? null,
    oil_volume_l:      item.oil_volume_l      ?? null,
    oil_work_price:    item.oil_work_price     ?? null,
    is_custom:         item.is_custom         ?? false,
    custom_name:       item.custom_name       ?? null,
    unit_price:        item.unit_price,
    quantity:          item.quantity          ?? 1,
    subtotal:          item.subtotal,
    notes:             item.notes             ?? null,
  }
}

function summarizeItems(items: CheckoutItem[]): string {
  return items.map(i => {
    if (i.item_type === 'tire') return `タイヤ${i.tire_service_type === 'exchange' ? '交換' : i.tire_service_type === 'replacement' ? '組換' : 'バランス'}`
    if (i.item_type === 'oil')  return 'オイル交換'
    if (i.is_custom)            return i.custom_name ?? 'その他'
    return i.service_name ?? ''
  }).filter(Boolean).join('・')
}

export default checkout
