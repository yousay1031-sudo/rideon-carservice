import { Hono } from 'hono'
import { createDb, type Bindings } from '../lib/supabase'
import ExcelJS from 'exceljs'
import { DELIVERY_NOTE_TEMPLATE_B64, INVOICE_TEMPLATE_B64, SUBARU_TEMPLATE_B64 } from '../lib/templates'

const documents = new Hono<{ Bindings: Bindings }>()

const EXPENSE_STORE_MAP: Record<string, string> = {
  '1': '75bf10cc-09f6-48a3-94a7-01252bc04ba2',
  '2': '6b341cb0-972d-4fc8-aefe-d0c1237fbf95',
}

function toReiwaStr(d: Date) {
  return `令和${d.getFullYear() - 2018}年${d.getMonth() + 1}月${d.getDate()}日`
}

// ExcelJS preserves formula strings but caches old results.
// Update the cached result so viewers that skip recalc show correct values.
function setFormulaResult(ws: ExcelJS.Worksheet, addr: string, result: number) {
  const cell = ws.getCell(addr)
  const v = cell.value as any
  if (v && typeof v === 'object' && v.formula) {
    cell.value = { formula: v.formula, result }
  }
}

// ==================== 納品書 ====================
documents.post('/documents/delivery-note', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const { reservation_id, dealer_id } = body
    const manualServiceName: string | undefined = body.service_name || undefined

    const [resRows, itemRows, dealerRows] = await Promise.all([
      reservation_id
        ? sql`SELECT * FROM carwash.reservations WHERE id = ${reservation_id}`
        : Promise.resolve([]),
      reservation_id
        ? sql`SELECT * FROM carwash.reservation_items WHERE reservation_id = ${reservation_id} ORDER BY id`
        : Promise.resolve([]),
      dealer_id
        ? sql`SELECT * FROM carwash.dealers WHERE id = ${dealer_id}`
        : Promise.resolve([]),
    ])

    const res = (resRows as any[])[0]
    if (!res && !dealer_id && !body.dealer_name) return c.json({ error: '予約またはディーラー情報が必要です' }, 400)

    const rawItems = itemRows as any[]
    const dealer = (dealerRows as any[])[0]

    let totalPrice = Number(res?.total_price) || 0
    if (totalPrice === 0 && rawItems.length > 0) {
      totalPrice = rawItems.reduce((s: number, item: any) => s + (Number(item.subtotal) || 0), 0)
    }
    const subtotalExTax = Math.round(totalPrice / 1.1)
    const taxAmount = totalPrice - subtotalExTax

    const dealerName = dealer?.name || res?.dealer_name || body.dealer_name || ''
    // 商品名: モーダル入力 → items → reservation.service_name の優先順
    const autoServiceInfo = rawItems.length > 0
      ? rawItems.map((i: any) => i.custom_name || i.service_name || '').filter(Boolean).join('・')
      : res?.service_name || 'カーサービス'
    const serviceInfo = manualServiceName || autoServiceInfo
    const resDate = res ? String(res.reservation_date).split('T')[0] : new Date().toISOString().split('T')[0]

    const now = new Date()

    // Load delivery note template (sheet: ラスターS+R)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(DELIVERY_NOTE_TEMPLATE_B64, 'base64'))
    wb.calcProperties.fullCalcOnLoad = true
    const ws = wb.getWorksheet('ラスターS+R')!

    // 日付
    ws.getCell('M2').value = now.getFullYear() - 2018  // 令和年（L2はラベル「令和」のため実際はM2）
    ws.getCell('O2').value = now.getMonth() + 1
    ws.getCell('Q2').value = now.getDate()

    // 宛先
    ws.getCell('A9').value = dealerName

    // 受注欄（E31:Q31 merged）
    ws.getCell('E31').value = `${res.id}　${serviceInfo}　分`

    // 明細1行目（B36:I36 merged）
    ws.getCell('B36').value = serviceInfo   // 商品名
    ws.getCell('J36').value = subtotalExTax // 単価（税抜）J36:L36 merged
    ws.getCell('M36').value = 1             // 数量 M36:N36 merged

    // B37はテンプレートの固定値をクリア
    ws.getCell('B37').value = ''

    // 消費税（O36=J36*M36, O44=SUM, E20=O44+O45 は数式のまま維持）
    ws.getCell('O45').value = taxAmount

    // 数式キャッシュを更新（ビューアで即時正確表示）
    setFormulaResult(ws, 'O36', subtotalExTax)
    setFormulaResult(ws, 'O44', subtotalExTax)
    setFormulaResult(ws, 'E20', totalPrice)

    const buffer = await wb.xlsx.writeBuffer()
    const filename = encodeURIComponent(`納品書_${dealerName}_${resDate}.xlsx`)
    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } finally {
    await sql.end()
  }
})

// ==================== 月次請求書 ====================
documents.post('/documents/invoice', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const { dealer_id, dealer_name: bodyDealerName, year, month } = body

    let dealer: any
    if (dealer_id) {
      const rows = await sql`SELECT * FROM carwash.dealers WHERE id = ${dealer_id}`
      dealer = rows[0] as any
    } else if (bodyDealerName) {
      const rows = await sql`SELECT * FROM carwash.dealers WHERE name = ${bodyDealerName} LIMIT 1`
      dealer = (rows[0] as any) ?? { name: bodyDealerName }
    }
    if (!dealer) return c.json({ error: 'ディーラーが見つかりません' }, 404)

    const monthStr = String(month).padStart(2, '0')
    const dateFrom = `${year}-${monthStr}-01`
    const dateTo = new Date(Number(year), Number(month), 0).toISOString().split('T')[0]

    const reservations = await sql`
      SELECT r.*,
        json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
      FROM carwash.reservations r
      LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
      WHERE r.dealer_name = ${dealer.name}
        AND r.status = 'completed'
        AND r.payment_method = '売掛'
        AND r.reservation_date >= ${dateFrom}
        AND r.reservation_date <= ${dateTo}
      GROUP BY r.id
      ORDER BY r.reservation_date, r.id`

    const resList = reservations as any[]
    const grandTotal = resList.reduce((s: number, r: any) => s + (Number(r.total_price) || 0), 0)
    const subtotalExTax = Math.round(grandTotal / 1.1)
    const taxAmount = grandTotal - subtotalExTax

    // サービス名・受注番号を集約
    const allServiceNames = resList.map((r: any) => {
      const rItems: any[] = Array.isArray(r.items) ? r.items : []
      return rItems.length > 0
        ? rItems.map((i: any) => i.custom_name || i.service_name || '').filter(Boolean).join('・')
        : r.service_name || 'カーサービス'
    }).filter(Boolean).join('・')

    const orderRef = resList.length === 1
      ? `${resList[0].id}　分`
      : `${year}年${month}月分`

    const now = new Date()

    // Load invoice template (sheet: Sheet1シンプル (2))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(INVOICE_TEMPLATE_B64, 'base64'))
    wb.calcProperties.fullCalcOnLoad = true
    const ws = wb.getWorksheet('Sheet1シンプル (2)')!

    // 発行日（D2:H2 merged）
    ws.getCell('D2').value = toReiwaStr(now)

    // 宛先（A9:J10 merged）
    ws.getCell('A9').value = `${dealer.name}　様`

    // 受注欄（A12:F12 merged）
    ws.getCell('A12').value = orderRef

    // 明細（row 22、全列 merged ごとに top-left セルへ書き込み）
    ws.getCell('B22').value = allServiceNames  // 品目 B22:H22
    ws.getCell('I22').value = 1                // 数量 I22:J22
    ws.getCell('M22').value = subtotalExTax    // 単価 M22:O22

    // P22:U22（金額列）は F42=SUM(P22:U41) が参照するため書き込む
    ws.getCell('P22').value = subtotalExTax

    // 消費税（M42:O43 merged）
    ws.getCell('M42').value = taxAmount

    // 数式キャッシュ更新（F42=SUM(P22:U41), R42=F42+M42 は数式のまま維持）
    setFormulaResult(ws, 'F42', subtotalExTax)
    setFormulaResult(ws, 'R42', grandTotal)

    const buffer = await wb.xlsx.writeBuffer()
    const filename = encodeURIComponent(`請求書_${dealer.name}_${year}${monthStr}.xlsx`)
    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } finally {
    await sql.end()
  }
})

// ==================== スバル専用納品書 ====================
const SUBARU_SHEETS = [
  'ラスターのみ',
  'ラスター　センター',
  'ラスターS+R',
  'ラスターSツイン',
  '軽ラスターのみ',
  '軽マフラー有',
  '軽トラ',
  '軽トラ、マフラー有',
  'タイヤ預かり',
  'フレッシュキーパー（Mサイズ）',
  'フレッシュキーパー（Lサイズ） ',
  'フレッシュキーパー（LLサイズ）',
  'ヘッドライト研磨',
] as const

documents.post('/documents/subaru-delivery-note', async (c) => {
  try {
    const { order_number, sheet_name } = await c.req.json()

    if (!order_number) return c.json({ error: '受注番号は必須です' }, 400)
    if (!SUBARU_SHEETS.includes(sheet_name)) {
      return c.json({ error: '無効なシート名です' }, 400)
    }

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(SUBARU_TEMPLATE_B64, 'base64'))
    wb.calcProperties.fullCalcOnLoad = true

    const ws = wb.getWorksheet(sheet_name)
    if (!ws) return c.json({ error: 'シートが見つかりません' }, 400)

    const now = new Date()

    // 日付（TODAY()数式を実際の日付で上書き）
    ws.getCell('N2').value = now

    // 選択シートのみ受注番号を書き込み、他シートのE31はクリア
    for (const name of SUBARU_SHEETS) {
      const sheet = wb.getWorksheet(name)
      if (!sheet) continue
      sheet.getCell('E31').value = name === sheet_name ? order_number : ''
    }

    const month = now.getMonth() + 1
    const day = now.getDate()
    const safeName = sheet_name.trim()
    const filename = encodeURIComponent(`${month}月${day}日_${order_number}_${safeName}.xlsx`)

    const buffer = await wb.xlsx.writeBuffer()
    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (err: any) {
    console.error(err)
    return c.json({ error: err.message }, 500)
  }
})

// ==================== 作業日報 ====================
documents.post('/documents/daily-report', async (c) => {
  const sql = createDb(c.env)
  try {
    const body = await c.req.json()
    const { date, store_id } = body
    if (!date) return c.json({ error: 'date は必須です' }, 400)

    const [storeRows, reservations, expenseRows] = await Promise.all([
      store_id
        ? sql`SELECT name FROM carwash.stores WHERE id = ${store_id}`
        : Promise.resolve([]),
      sql`
        SELECT r.*,
          c.name AS customer_name_ref,
          v.car_maker, v.car_model,
          json_agg(ri.*) FILTER (WHERE ri.id IS NOT NULL) AS items
        FROM carwash.reservations r
        LEFT JOIN carwash.customers c ON c.id = r.customer_id
        LEFT JOIN carwash.vehicles v ON v.id = r.vehicle_id
        LEFT JOIN carwash.reservation_items ri ON ri.reservation_id = r.id
        WHERE r.reservation_date = ${date}
          AND r.status = 'completed'
          AND r.paid_at IS NOT NULL
          ${store_id ? sql`AND r.store_id = ${store_id}` : sql``}
        GROUP BY r.id, c.name, v.car_maker, v.car_model
        ORDER BY r.start_time`,
      (() => {
        const expStoreUuid = store_id ? (EXPENSE_STORE_MAP[String(store_id)] ?? null) : null
        const allUuids = Object.values(EXPENSE_STORE_MAP)
        return (expStoreUuid
          ? sql`
              SELECT vendor_name, total, items, payment_method
              FROM public.expenses
              WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date = ${date}::date
                AND store_id = ${expStoreUuid}
              ORDER BY id ASC`
          : sql`
              SELECT vendor_name, total, items, payment_method
              FROM public.expenses
              WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date = ${date}::date
                AND store_id = ANY(${allUuids}::uuid[])
              ORDER BY id ASC`
        ).catch(() => [] as any[])
      })(),
    ])

    const storeName: string = (storeRows as any[])[0]?.name ?? '全店舗'

    // items(JSONB/text) から全アイテム名を「、」で結合して返す
    function extractItemName(raw: any): string {
      if (!raw) return ''
      const arr: any[] | null = Array.isArray(raw) ? raw : (() => {
        try { return JSON.parse(String(raw)) } catch { return null }
      })()
      if (Array.isArray(arr) && arr.length > 0) {
        const names = arr.map((i: any) => {
          if (typeof i === 'string') return i
          return i?.name || i?.description || i?.item || ''
        }).filter(Boolean)
        return names.length > 0 ? names.join('、') : ''
      }
      return typeof raw === 'string' ? raw : ''
    }

    const expenses = (expenseRows as any[]).map(e => ({
      amount: Number(e.total) || 0,
      vendor: e.vendor_name || '-',
      item:   extractItemName(e.items),
      pm:     e.payment_method || '-',
    }))

    function normPm(raw: string | null): string {
      if (!raw) return 'その他'
      const v = raw.trim()
      if (v === 'cash' || v === '現金') return '現金'
      if (v === 'card' || v === 'credit_card' || v === 'カード') return 'カード'
      if (v === '売掛') return '売掛'
      return 'アプリ'
    }
    function calcFee(pm: string, amount: number): number {
      if (pm === 'カード') return Math.floor(amount * 0.0324)
      if (pm === 'アプリ') return Math.floor(amount * 0.0295 * 1.1)
      return 0
    }

    const rows = (reservations as any[]).map(r => {
      const pm = normPm(r.payment_method)
      const amount = Number(r.total_price) || 0
      const fee = calcFee(pm, amount)
      const items: any[] = Array.isArray(r.items) ? r.items : []
      const service = items.length > 0
        ? items.map((i: any) => i.custom_name || i.service_name || '').filter(Boolean).join('・')
        : r.service_name || '-'
      const car = [r.car_maker, r.car_model].filter(Boolean).join(' ') || '-'
      const name = r.customer_name_ref || r.customer_name || r.dealer_name || '-'
      const genericPm = new Set(['cash', 'card', 'credit_card', 'qr', '現金', 'カード', 'アプリ', '売掛', 'その他'])
      const appName = r.card_brand || (genericPm.has(r.payment_method ?? '') ? '' : (r.payment_method ?? ''))
      return {
        time: r.start_time ? String(r.start_time).slice(0, 5) : '-',
        name, car, service, amount, pm, appName, fee,
        dealer_name: r.dealer_name as string | null,
      }
    })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('作業日報')

    // A列は空白スペース、データは B(2)〜I(9) 列
    const C0 = 2  // 先頭データ列インデックス（B列）
    ws.getColumn('A').width = 3
    ws.getColumn('B').width = 8   // 時間
    ws.getColumn('C').width = 14  // 名前
    ws.getColumn('D').width = 16  // 車種
    ws.getColumn('E').width = 22  // 作業内容
    ws.getColumn('F').width = 11  // 料金
    ws.getColumn('G').width = 11  // 決済方法
    ws.getColumn('H').width = 14  // カード名・アプリ名
    ws.getColumn('I').width = 11  // 手数料

    // ---- ヘッダー ----
    const b1 = ws.getCell('B1')
    b1.value = '作業日報'
    b1.font = { bold: true, size: 16 }

    ws.getCell('E1').value = '店舗'
    ws.getCell('E1').font = { bold: true }
    ws.getCell('E2').value = storeName

    ws.getCell('G1').value = '日付'
    ws.getCell('G1').font = { bold: true }
    const [dy, dm, dd] = date.split('-').map(Number)
    ws.getCell('G2').value = `${dy}年${dm}月${dd}日`

    // ---- 作業記録テーブルヘッダー (row 4, B〜I列) ----
    const COL_HEADERS = ['時間', '名前', '車種', '作業内容', '料金', '決済方法', 'カード名・アプリ名', '手数料']
    const hRow = ws.getRow(4)
    COL_HEADERS.forEach((h, ci) => {
      const cell = hRow.getCell(C0 + ci)
      cell.value = h
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D8E8' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    // ---- データ行（最低20行確保） ----
    const DATA_START = 5
    const numRows = Math.max(rows.length, 20)
    for (let i = 0; i < numRows; i++) {
      const r = rows[i]
      const dRow = ws.getRow(DATA_START + i)
      const vals = r
        ? [r.time, r.name, r.car, r.service, r.amount, r.pm, r.appName, r.fee]
        : ['', '', '', '', '', '', '', '']
      vals.forEach((v, ci) => {
        const cell = dRow.getCell(C0 + ci)
        cell.value = (v === '' || v === null || v === undefined) ? null : v
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (ci === 4 || ci === 7) {  // 料金(F)・手数料(I)
          cell.alignment = { horizontal: 'right' }
          if (typeof v === 'number') cell.numFmt = '#,##0'
        }
        if (ci === 5 || ci === 6) cell.alignment = { horizontal: 'center' }  // 決済方法・アプリ名
      })
    }

    // ---- 集計行（F列ラベル / G列値） ----
    const cashTotal = rows.filter(r => r.pm === '現金').reduce((s, r) => s + r.amount, 0)
    const cardTotal = rows.filter(r => r.pm === 'カード').reduce((s, r) => s + r.amount, 0)
    const cardFee   = rows.filter(r => r.pm === 'カード').reduce((s, r) => s + r.fee, 0)
    const appTotal  = rows.filter(r => r.pm === 'アプリ').reduce((s, r) => s + r.amount, 0)
    const appFee    = rows.filter(r => r.pm === 'アプリ').reduce((s, r) => s + r.fee, 0)
    const totalFee  = rows.reduce((s, r) => s + r.fee, 0)
    const grandTotal = rows.reduce((s, r) => s + r.amount, 0)
    const netSales  = grandTotal - totalFee

    const SUMMARY_START = DATA_START + numRows + 1
    const summaryItems: [string, number][] = [
      ['現金合計', cashTotal],
      ['カード合計', cardTotal],
      ['カード手数料', cardFee],
      ['アプリ合計', appTotal],
      ['アプリ手数料', appFee],
      ['手数料合計', totalFee],
      ['実質売上', netSales],
    ]
    summaryItems.forEach(([label, val], i) => {
      const sr = ws.getRow(SUMMARY_START + i)
      const lc = sr.getCell(6)   // F列
      const vc = sr.getCell(7)   // G列
      lc.value = label
      lc.font = { bold: true }
      vc.value = val
      vc.numFmt = '#,##0'
      vc.alignment = { horizontal: 'right' }
    })

    // ---- 売掛セクション（B〜E列） ----
    const AR_START = SUMMARY_START + summaryItems.length + 2

    // 見出し行
    const arTitleCell = ws.getRow(AR_START).getCell(C0)
    arTitleCell.value = '売掛'
    arTitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    arTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } }
    arTitleCell.alignment = { horizontal: 'left', vertical: 'middle' }
    ws.mergeCells(AR_START, C0, AR_START, C0 + 3)  // B〜E

    // カラムヘッダー
    const arHeaders = ['金額', '支払先', '内容', '支払方法（売掛）']
    const arHRow = ws.getRow(AR_START + 1)
    arHeaders.forEach((h, ci) => {
      const cell = arHRow.getCell(C0 + ci)
      cell.value = h
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center' }
    })

    const arRows = rows.filter(r => r.pm === '売掛')
    arRows.forEach((r, i) => {
      const arRow = ws.getRow(AR_START + 2 + i)
      const vals: (string | number)[] = [r.amount, r.name, r.service, '売掛']
      vals.forEach((v, ci) => {
        const cell = arRow.getCell(C0 + ci)
        cell.value = v
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (ci === 0) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })

    let stRow = AR_START + 2 + arRows.length + 1
    const subaruRows = arRows.filter(r => r.dealer_name && r.dealer_name.includes('スバル'))
    const kuRows     = arRows.filter(r => r.dealer_name && (r.dealer_name.includes('ケーユー') || r.dealer_name.toUpperCase().includes('KU')))
    if (subaruRows.length > 0) {
      const sr = ws.getRow(stRow++)
      sr.getCell(C0).value = 'スバル合計'
      sr.getCell(C0).font = { bold: true }
      sr.getCell(C0 + 1).value = subaruRows.reduce((s, r) => s + r.amount, 0)
      sr.getCell(C0 + 1).numFmt = '#,##0'
    }
    if (kuRows.length > 0) {
      const kr = ws.getRow(stRow)
      kr.getCell(C0).value = 'ケーユー合計'
      kr.getCell(C0).font = { bold: true }
      kr.getCell(C0 + 1).value = kuRows.reduce((s, r) => s + r.amount, 0)
      kr.getCell(C0 + 1).numFmt = '#,##0'
    }

    // ---- 経費セクション（売掛の下）----
    const EXP_SECTION_START = stRow + (kuRows.length > 0 ? 2 : 1)

    const expTitleCell = ws.getRow(EXP_SECTION_START).getCell(C0)
    expTitleCell.value = '経費'
    expTitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    expTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } }
    expTitleCell.alignment = { horizontal: 'left', vertical: 'middle' }
    ws.mergeCells(EXP_SECTION_START, C0, EXP_SECTION_START, C0 + 3)

    const expColHeaders = ['支払先', '内容', '金額', '支払方法']
    const expHRow = ws.getRow(EXP_SECTION_START + 1)
    expColHeaders.forEach((h, ci) => {
      const cell = expHRow.getCell(C0 + ci)
      cell.value = h
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center' }
    })

    const EXP_DATA_ROWS = Math.max(expenses.length, 5)
    for (let i = 0; i < EXP_DATA_ROWS; i++) {
      const eRow = ws.getRow(EXP_SECTION_START + 2 + i)
      const exp = expenses[i]
      const vals: (string | number | null)[] = exp
        ? [exp.vendor, exp.item, exp.amount, exp.pm]
        : [null, null, null, null]
      vals.forEach((v, ci) => {
        const cell = eRow.getCell(C0 + ci)
        cell.value = v
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (ci === 2) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    }

    const expTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const expTotalRow = ws.getRow(EXP_SECTION_START + 2 + EXP_DATA_ROWS)
    expTotalRow.getCell(C0).value = '合計'
    expTotalRow.getCell(C0).font = { bold: true }
    expTotalRow.getCell(C0 + 2).value = expTotal
    expTotalRow.getCell(C0 + 2).numFmt = '#,##0'
    expTotalRow.getCell(C0 + 2).font = { bold: true }
    expTotalRow.getCell(C0 + 2).alignment = { horizontal: 'right' }

    const dateStr = date.replace(/-/g, '')
    const filename = encodeURIComponent(`作業日報_${storeName}_${dateStr}.xlsx`)
    const buffer = await wb.xlsx.writeBuffer()
    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } finally {
    await sql.end()
  }
})

export default documents
