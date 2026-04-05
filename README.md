# RIDE ON!! Carwash API

Hono + Cloudflare Workers + Supabase（carwash スキーマ）

## セットアップ

```bash
cd api
npm install
```

## シークレット設定（デプロイ前に必須）

```bash
wrangler secret put SUPABASE_URL
# → https://nwkigrnqqctuhlvkakxx.supabase.co を入力

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# → Supabase > Settings > API > service_role key を入力
```

## ローカル開発

```bash
# .dev.vars ファイルを作成（gitignore済み）
cp .dev.vars.example .dev.vars
# SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .dev.vars に記入

npm run dev
# → http://localhost:8787 で起動
```

## デプロイ

```bash
npm run deploy
```

## API エンドポイント一覧

### マスター
| Method | Path | 説明 |
|---|---|---|
| GET | /api/master/all | 全マスター一括取得（画面初期化用）|
| GET | /api/master/stores | 店舗一覧 |
| GET | /api/master/staff | 担当者一覧 |
| GET | /api/master/service-menu | 洗車・コーティングメニュー |
| GET | /api/master/tire-menu | タイヤメニュー |
| GET | /api/master/oil-menu | オイルグレード＋工賃 |

### 顧客
| Method | Path | 説明 |
|---|---|---|
| GET | /api/customers | 一覧（?q=検索&store_id=1&group=vip）|
| GET | /api/customers/:id | 詳細（車両込み）|
| POST | /api/customers | 登録 |
| PUT | /api/customers/:id | 更新 |
| DELETE | /api/customers/:id | 削除 |

### 車両
| Method | Path | 説明 |
|---|---|---|
| GET | /api/vehicles | 一覧（?customer_id=1）|
| GET | /api/vehicles/:id | 詳細（洗車履歴込み）|
| POST | /api/vehicles | 登録 |
| PUT | /api/vehicles/:id | 更新 |
| DELETE | /api/vehicles/:id | 削除 |

### 予約
| Method | Path | 説明 |
|---|---|---|
| GET | /api/reservations | 一覧（?date=2026-04-05&store_id=1）|
| GET | /api/reservations/:id | 詳細（明細込み）|
| POST | /api/reservations | 登録 |
| PUT | /api/reservations/:id | 更新 |
| DELETE | /api/reservations/:id | 削除 |

### 会計
| Method | Path | 説明 |
|---|---|---|
| POST | /api/checkout/:reservation_id/confirm | 会計確定（明細＋支払方法）|
| POST | /api/checkout/:reservation_id/items | 明細追加 |
| DELETE | /api/checkout/:reservation_id/items/:item_id | 明細削除 |

### 日報
| Method | Path | 説明 |
|---|---|---|
| GET | /api/report/daily?date=2026-04-05 | 日報取得（集計込み）|
