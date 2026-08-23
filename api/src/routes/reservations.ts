import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'

const reservations = new Hono<{ Bindings: Bindings }>()

// 請求書採番用（/:id より前に定義必須）
reservations.get('/invoice-count', async (c) => {
  const sql = createDb(c.env)
  try {
    const { year, month } = c.req.query()
    if (!year || !month) return c.json({ error: 'year, month は必須です' }, 400)
    const monthStr = String(month).padStart(2, '0')
    const dateFrom = `${year}-${monthStr}-01`
    const dateTo = new Date(Number(year), Number(month), 0).toISOString().split('T')[0]
    const result = await sql`
      SELECT COUNT(*) AS cnt FROM carwash.reservations
      WHERE payment_method = '売掛' AND status = 'completed'
        AND reservation_date >= ${dateFrom} AND reservation_date <= ${dateTo}
        AND invoice_number IS NOT NULL`
    return c.json({ count: Number((result[0] as any)?.cnt || 0) })
  } finally { await sql.end() }
})

// 売掛一括入金確認（/:id より前に定義必須）
reservations.put('/bulk-received', async (c) => {
  const sql = createDb(c.env)
  try {
    const { dealer_name, year, month } = await c.req.json()
    if (!dealer_name || !year || !month) return c.json({ error: 'dealer_name, year, month は必須です' }, 400)
    const monthStr = String(month).padStart(2, '0')
    const dateFrom = `${year}-${monthStr}-01`
    const dateTo = new Date(Number(year), Number(month), 0).toISOString().split('T')[0]
    const result = await sql`
      UPDATE carwash.reservations SET payment_received_at = NOW()
      WHERE dealer_name = ${dealer_name}
        AND payment_method = '売掛'
        AND status = 'completed'
        AND payment_received_at IS NULL
        AND reservation_date >= ${dateFrom}
        AND reservation_date <= ${dateTo}
      RETURNING id`
    return c.json({ ok: true, updated: result.length })
  } finally { await sql.end() }
})

reservations.get('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const { date, store_id, status, pending, dealer_name, payment_method, year, month, unpaid } = c.req.query()
    let data
    if (pending === 'true') {
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        WHERE r.is_pending = true
        ORDER BY r.reservation_date DESC, r.start_time`
    } else if (payment_method && year && month) {
      const monthStr = String(month).padStart(2, '0')
      const dateFrom = `${year}-${monthStr}-01`
      const dateTo = new Date(Number(year), Number(month), 0).toISOString().split('T')[0]
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.payment_method = ${payment_method}
          AND r.status = 'completed'
          AND r.reservation_date >= ${dateFrom}
          AND r.reservation_date <= ${dateTo}
          ${dealer_name ? sql`AND r.dealer_name = ${dealer_name}` : sql``}
          ${unpaid === 'true' ? sql`AND r.payment_received_at IS NULL` : sql``}
        GROUP BY r.id, c.name, c.furigana, c.phone, v.car_maker, v.car_model, s.name
        ORDER BY r.reservation_date, r.start_time`
    } else if (date && store_id) {
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.reservation_date = ${date} AND r.store_id = ${store_id}
        GROUP BY r.id, c.name, c.furigana, c.phone, v.car_maker, v.car_model, s.name
        ORDER BY r.start_time`
    } else if (date) {
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.reservation_date = ${date}
        GROUP BY r.id, c.name, c.furigana, c.phone, v.car_maker, v.car_model, s.name
        ORDER BY r.start_time`
    } else if (dealer_name) {
      data = await sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model,
          s.name AS staff_name,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.dealer_name LIKE ${'%' + dealer_name + '%'}
        ${status ? sql`AND r.status = ${status}` : sql``}
        GROUP BY r.id, c.name, c.furigana, c.phone, v.car_maker, v.car_model, s.name
        ORDER BY r.reservation_date DESC, r.start_time`
    } else {
      data = await sql`SELECT * FROM carwash.reservations ORDER BY reservation_date DESC, start_time LIMIT 100`
    }
    return c.json(data)
  } finally { await sql.end() }
})

reservations.get('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    const id = c.req.param('id')
    const [reservation, items] = await Promise.all([
      sql`
        SELECT r.*,
          c.name AS customer_name_ref, c.furigana, c.phone AS customer_phone_ref,
          v.car_maker, v.car_model, v.car_number AS vehicle_car_number,
          s.name AS staff_name
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.staff_members s ON s.id = r.staff_id
        WHERE r.id = ${id}`,
      sql`SELECT * FROM carwash.reservation_items WHERE reservation_id = ${id} ORDER BY id`,
    ])
    if (!reservation[0]) return c.json({ error: '予約が見つかりません' }, 404)
    return c.json({ ...reservation[0], items })
  } finally { await sql.end() }
})

reservations.post('/', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const data = await sql`
      INSERT INTO carwash.reservations
        (store_id, customer_id, vehicle_id, customer_name, customer_phone,
         car_number, car_size, reservation_date, start_time, end_time,
         service_name, work_lane, staff_id, dealer_name, status, notes,
         total_price, booked_via_line, line_user_id)
      VALUES
        (${body.store_id}, ${body.customer_id ?? null}, ${body.vehicle_id ?? null},
         ${body.customer_name ?? null}, ${body.customer_phone ?? null},
         ${body.car_number ?? null}, ${body.car_size ?? 'M'},
         ${body.reservation_date}, ${body.start_time}, ${body.end_time ?? null},
         ${body.service_type ?? body.service_name ?? null},
         ${body.work_lane ?? '洗車場'}, ${body.staff_id ?? null},
         ${body.dealer_name ?? null}, 'confirmed', ${body.notes ?? null},
         ${body.total_price ?? null}, ${body.booked_via_line ?? false}, ${body.line_user_id ?? null})
      RETURNING *`
    return c.json(data[0], 201)
  } finally { await sql.end() }
})

reservations.put('/:id', async (c) => {
  const sql = createDb(c.env)
  const id = c.req.param('id')
  let body: any
  try {
    body = await c.req.json()

    // is_pending のみの部分更新
    if (body.is_pending !== undefined && !body.reservation_date && !('payment_received_at' in body) && !('total_price' in body)) {
      const data = await sql`
        UPDATE carwash.reservations SET is_pending = ${body.is_pending}, updated_at = now()
        WHERE id = ${id} RETURNING *`
      return c.json(data[0])
    }

    // payment_received_at / invoice_number のみの部分更新
    if ('payment_received_at' in body && !body.reservation_date) {
      const data = await sql`
        UPDATE carwash.reservations SET
          payment_received_at = ${body.payment_received_at ?? null},
          invoice_number = COALESCE(${body.invoice_number ?? null}, invoice_number),
          updated_at = now()
        WHERE id = ${id} RETURNING *`
      return c.json(data[0])
    }

    // total_price のみの部分更新（帳票生成後の金額反映など、reservation_dateを伴わない単独更新）
    if ('total_price' in body && !body.reservation_date) {
      const data = await sql`
        UPDATE carwash.reservations SET total_price = ${body.total_price ?? null}, updated_at = now()
        WHERE id = ${id} RETURNING *`
      return c.json(data[0])
    }

    // ここから下はフォーム全体からの更新（予約編集フォーム、ドラッグ&ドロップでの
    // 移動・リサイズ、キャンセルなど）を前提とする。これらは常に予約の現在値を
    // spread して送るか、フォームの全項目を送るため、基本は送信値でそのまま上書きする。
    // ただし customer_name/customer_phone/car_number/car_size はどの送信元も
    // 値を持たせないことがあるため、未送信時に上書きで消さないようCOALESCEで保護する
    // （car_sizeは以前 'M' 固定で毎回上書きしてしまっていたため特に注意）。
    const data = await sql`
      UPDATE carwash.reservations SET
        store_id = COALESCE(${body.store_id ?? null}, store_id),
        customer_id = ${body.customer_id ?? null},
        vehicle_id = ${body.vehicle_id ?? null},
        customer_name = COALESCE(${body.customer_name ?? null}, customer_name),
        customer_phone = COALESCE(${body.customer_phone ?? null}, customer_phone),
        car_number = COALESCE(${body.car_number ?? null}, car_number),
        car_size = COALESCE(${body.car_size ?? null}, car_size),
        reservation_date = ${body.reservation_date},
        start_time = ${body.start_time},
        end_time = ${body.end_time ?? null},
        service_name = ${body.service_type ?? body.service_name ?? null},
        work_lane = ${body.work_lane ?? '洗車場'},
        staff_id = ${body.staff_id ?? null},
        dealer_name = ${body.dealer_name ?? null},
        status = ${body.status ?? 'confirmed'},
        notes = ${body.notes ?? null},
        total_price = COALESCE(${body.total_price ?? null}, total_price),
        is_pending = COALESCE(${body.is_pending != null ? body.is_pending : null}, is_pending),
        payment_received_at = COALESCE(${body.payment_received_at ?? null}, payment_received_at),
        invoice_number = COALESCE(${body.invoice_number ?? null}, invoice_number),
        updated_at = now()
      WHERE id = ${id} RETURNING *`
    return c.json(data[0])
  } catch (err) {
    console.error('[PUT /api/reservations/:id]', { id, body }, err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  } finally {
    try { await sql.end() } catch (endErr) {
      console.error('[PUT /api/reservations/:id] sql.end() failed', endErr)
    }
  }
})

reservations.delete('/:id', async (c) => {
  const sql = createDb(c.env)
  try {
    await sql`DELETE FROM carwash.reservations WHERE id = ${c.req.param('id')}`
    return c.json({ ok: true })
  } finally { await sql.end() }
})

export default reservations
