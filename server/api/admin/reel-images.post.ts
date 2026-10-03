import { reelImageUrl, saveReelImage } from '../../utils/reel'

/** Картинка сценки, фона окна (kind=bg) или баннера на главной (kind=banner). Грузится отдельно от барабана:
 *  панель сперва кладёт файл, а в барабан записывает уже его имя. */
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const part = form?.find(f => f.name === 'image' && f.data?.length)
  if (!part) throw createError({ statusCode: 400, message: 'Нет картинки' })

  const asked = form?.find(f => f.name === 'kind')?.data?.toString()
  const kind = asked === 'bg' || asked === 'banner' ? asked : 'scene'
  const file = await saveReelImage(part.data, kind)
  return { file, url: reelImageUrl(file) }
})
