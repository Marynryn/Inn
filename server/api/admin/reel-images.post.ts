import { reelImageUrl, saveReelImage } from '../../utils/reel'

/** Картинка сценки или фона окна (kind=bg). Грузится отдельно от барабана:
 *  панель сперва кладёт файл, а в барабан записывает уже его имя. */
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const part = form?.find(f => f.name === 'image' && f.data?.length)
  if (!part) throw createError({ statusCode: 400, message: 'Нет картинки' })

  const kind = form?.find(f => f.name === 'kind')?.data?.toString() === 'bg' ? 'bg' : 'scene'
  const file = await saveReelImage(part.data, kind)
  return { file, url: reelImageUrl(file) }
})
