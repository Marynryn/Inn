import { reelImageUrl, saveReelImage } from '../../utils/reel'

/** Картинка сценки. Грузится отдельно от сегментов: панель сперва кладёт
 *  файл, а в сегмент записывает уже его имя. */
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const part = form?.find(f => f.name === 'image' && f.data?.length)
  if (!part) throw createError({ statusCode: 400, message: 'Нет картинки' })

  const file = await saveReelImage(part.data)
  return { file, url: reelImageUrl(file) }
})
