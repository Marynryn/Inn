// Сайт и его читатели живут по Москве, а сервер — по UTC. Всё, что показывается
// как «сегодня», считается по этому смещению, иначе день переключался бы в 03:00.
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

/** Текущая дата по Москве в виде '2026-08-29'. */
export function mskDay(at: Date | number = Date.now()): string {
  return new Date(new Date(at).getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10)
}
