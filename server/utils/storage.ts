import { resolve } from 'path'

export const getStorageDir = () =>
  process.env.STORAGE_DIR ? resolve(process.env.STORAGE_DIR) : resolve('storage')
