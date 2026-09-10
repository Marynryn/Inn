import { grantDefaultToEveryone } from '../../../utils/frames'

/**
 * Раздать рамку новичка тем, кто зарегистрировался до её появления. Отдельной
 * кнопкой, а не само собой при отметке: это подарок задним числом, и решать,
 * делать ли его, должна хозяйка сайта.
 */
export default defineEventHandler(async () => {
  const { granted, dressed } = await grantDefaultToEveryone()

  if (!granted && !dressed) {
    return { ok: true, message: 'Раздавать нечего: она уже у всех' }
  }

  return {
    ok: true,
    message: `Выдана ${granted} чел., надета на ${dressed} — тем, кто ходил без рамки`,
  }
})
