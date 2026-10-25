import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../database/schema'
import { getStorageDir } from './storage'

let _db: ReturnType<typeof drizzle> | null = null
let _client: ReturnType<typeof createClient> | null = null

/**
 * Отпустить файл базы. Нужно только сбросу демо-стенда: он стирает базу целиком,
 * и следующее useDb() должно открыть уже новый файл, а не держать удалённый.
 */
export function closeDb() {
  _client?.close()
  _client = null
  _db = null
}

export function useDb() {
  if (!_db) {
    const client = createClient({ url: `file:${getStorageDir()}/db.sqlite` })
    _client = client
    // Настройки подключения, а не файла, — ставятся на каждое заново.
    // synchronous = NORMAL: при WAL диск сбрасывается на контрольных точках, а не
    // на каждой записи; пропасть может только последняя запись при отключении
    // питания, но не сама база. busy_timeout: если база занята миграцией или
    // соседней записью, подождать, а не упасть с SQLITE_BUSY.
    client.execute('PRAGMA synchronous = NORMAL').catch(() => {})
    client.execute('PRAGMA busy_timeout = 5000').catch(() => {})
    _db = drizzle(client, { schema })
  }
  return _db
}
