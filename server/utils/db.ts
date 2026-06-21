import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../database/schema'
import { getStorageDir } from './storage'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
  if (!_db) {
    const client = createClient({ url: `file:${getStorageDir()}/db.sqlite` })
    _db = drizzle(client, { schema })
  }
  return _db
}
