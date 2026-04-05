import { Hono } from 'hono'
import { createSupabase, type Bindings } from '../lib/supabase'

const reservations = new Hono<{ Bindings: Bindings }>()

// 予約一覧（日付・店舗で絞り込み）
reservations.get('/', async (c) => {
  const db = createSupabase(c.env)
  const { date, store_id, status } = c.req.query()

  const params: Record<string, string> = {
    select: [
      'id,store_id,reservation_date,start_time,end_time,work_lane',
      'customer_id,customer_name,customer_phone',
      'vehicle_id,car_number,car_size',
      'staff_id,dealer_name,status,notes',
      'total_price,payment_method,paid_at',
      'booked_via_line',
      // 顧客・車両をJOIN（Supabase PostgREST記法）
      'customers(name,furigana,phone)',
      'vehicles(car_maker,car_model,car_number,car_size)',
      'staff_members(name)',
      // 明細
      'reservation_items(id,item_type,service_name,tire_service_type,tire_size,tire_unit_type,oil_grade,oil_volume_l,custom_name,is_custom,subtotal)',
    ].join(','),
    order: 'start_time.asc',
  }
  if (date)     params['reservation_date'] = `eq.${date}`
  if (store_id) params['store_id']         = `eq.${store_id}`
  if (status)   params['status']           = `eq.${status}`

  const { data, error } = await db.query('reservations', params)
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 予約詳細
reservations.get('/:id', async (c) => {
  const db = createSupabase(c.env)
  const { data, error } = await db.single('reservations', {
    id: `eq.${c.req.param('id')}`,
    select: [
      'id,store_id,reservation_date,start_time,end_time,work_lane',
      'customer_id,customer_name,customer_phone',
      'vehicle_id,car_number,car_size',
      'staff_id,dealer_name,status,notes',
      'total_price,payment_method,paid_at,booked_via_line',
      'customers(id,name,furigana,phone)',
      'vehicles(id,car_maker,car_model,car_number,car_size,inspection_date)',
      'staff_members(name)',
      'reservation_items(id,item_type,service_id,service_name,car_size,tire_menu_id,tire_service_type,tire_size,tire_unit_type,oil_grade_id,oil_grade,oil_volume_l,oil_work_price,is_custom,custom_name,unit_price,quantity,subtotal,notes)',
    ].join(','),
  })
  if (!data) return c.json({ error: '予約が見つかりません' }, 404)
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 予約登録（明細なし・枠だけ先に確保）
reservations.post('/', async (c) => {
  const db = createSupabase(c.env)
  const body = await c.req.json()

  const { data, error } = await db.insert('reservations', {
    store_id:         body.store_id,
    customer_id:      body.customer_id ?? null,
    vehicle_id:       body.vehicle_id ?? null,
    customer_name:    body.customer_name ?? null,
    customer_phone:   body.customer_phone ?? null,
    car_number:       body.car_number ?? null,
    car_size:         body.car_size ?? 'M',
    reservation_date: body.reservation_date,
    start_time:       body.start_time,
    end_time:         body.end_time ?? null,
    work_lane:        body.work_lane ?? '洗車場',
    staff_id:         body.staff_id ?? null,
    dealer_name:      body.dealer_name ?? null,
    status:           'confirmed',
    notes:            body.notes ?? null,
    booked_via_line:  body.booked_via_line ?? false,
    line_user_id:     body.line_user_id ?? null,
  })
  if (error) return c.json({ error }, 500)
  return c.json(data, 201)
})

// 予約更新（ステータス変更など）
reservations.put('/:id', async (c) => {
  const db = createSupabase(c.env)
  const id = c.req.param('id')
  const body = await c.req.json()

  const updateFields: Record<string, unknown> = {}
  const allowed = [
    'customer_id','vehicle_id','customer_name','customer_phone',
    'car_number','car_size','reservation_date','start_time','end_time',
    'work_lane','staff_id','dealer_name','status','notes',
  ]
  allowed.forEach(k => { if (body[k] !== undefined) updateFields[k] = body[k] })

  const { data, error } = await db.update('reservations', { id }, updateFields)
  if (error) return c.json({ error }, 500)
  return c.json(data)
})

// 予約削除
reservations.delete('/:id', async (c) => {
  const db = createSupabase(c.env)
  const { error } = await db.remove('reservations', { id: c.req.param('id') })
  if (error) return c.json({ error }, 500)
  return c.json({ ok: true })
})

export default reservations
