import postgres from 'postgres'

export type Bindings = {
  HYPERDRIVE: Hyperdrive
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  LINE_CHANNEL_ACCESS_TOKEN?: string
}

export function createDb(env: Bindings) {
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
  })
  return sql
}

export type Sql = ReturnType<typeof createDb>