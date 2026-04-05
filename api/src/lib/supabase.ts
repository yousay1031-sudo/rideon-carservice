// Supabase への生SQL実行クライアント
// supabase-js は Edge Runtime で動作が不安定なため、REST API を直接叩く

export type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  LINE_CHANNEL_ACCESS_TOKEN?: string
}

type QueryResult<T> = {
  data: T[]
  error: string | null
}

type SingleResult<T> = {
  data: T | null
  error: string | null
}

export function createSupabase(env: Bindings) {
  const baseUrl = `${env.SUPABASE_URL}/rest/v1`
  const headers = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Accept-Profile': 'carwash',
    'Content-Profile': 'carwash',
  }

  // テーブルへのGETクエリ（クエリパラメータをそのまま渡す）
  async function query<T>(
    table: string,
    params: Record<string, string> = {}
  ): Promise<QueryResult<T>> {
    const url = new URL(`${baseUrl}/${table}`)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    url.searchParams.set('limit', params.limit ?? '1000')

    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      const err = await res.text()
      return { data: [], error: err }
    }
    const data = await res.json() as T[]
    return { data, error: null }
  }

  // 1件取得
  async function single<T>(
    table: string,
    params: Record<string, string> = {}
  ): Promise<SingleResult<T>> {
    const { data, error } = await query<T>(table, params)
    return { data: data[0] ?? null, error }
  }

  // INSERT（返却あり）
  async function insert<T>(
    table: string,
    body: Record<string, unknown>
  ): Promise<SingleResult<T>> {
    const res = await fetch(`${baseUrl}/${table}`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      return { data: null, error: err }
    }
    const rows = await res.json() as T[]
    return { data: rows[0] ?? null, error: null }
  }

  // UPDATE
  async function update<T>(
    table: string,
    match: Record<string, string>,
    body: Record<string, unknown>
  ): Promise<SingleResult<T>> {
    const url = new URL(`${baseUrl}/${table}`)
    Object.entries(match).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`))
    const res = await fetch(url.toString(), {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      return { data: null, error: err }
    }
    const rows = await res.json() as T[]
    return { data: rows[0] ?? null, error: null }
  }

  // DELETE
  async function remove(
    table: string,
    match: Record<string, string>
  ): Promise<{ error: string | null }> {
    const url = new URL(`${baseUrl}/${table}`)
    Object.entries(match).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`))
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
    })
    if (!res.ok) {
      const err = await res.text()
      return { error: err }
    }
    return { error: null }
  }

  // 生RPC（関数呼び出し）
  async function rpc<T>(
    fn: string,
    body: Record<string, unknown> = {}
  ): Promise<QueryResult<T>> {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      return { data: [], error: err }
    }
    const data = await res.json() as T[]
    return { data, error: null }
  }

  return { query, single, insert, update, remove, rpc }
}
