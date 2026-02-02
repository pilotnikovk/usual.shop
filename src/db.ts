import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL || '', {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined
})

export default sql

// Хелперы для совместимости с D1 API
export const queryAll = async (query: any) => {
  const results = await query
  return { results, success: true }
}

export const queryFirst = async (query: any) => {
  const results = await query
  return results[0] || null
}

export const queryRun = async (query: any) => {
  const result = await query
  return {
    success: true,
    meta: {
      last_row_id: result[0]?.id || null,
      changes: result.count || 0
    }
  }
}
