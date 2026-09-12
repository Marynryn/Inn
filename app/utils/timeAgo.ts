/**
 * «5 мин. назад» из времени, которое отдаёт SQLite: 'YYYY-MM-DD HH:MM:SS' без
 * зоны, но по UTC. Пробел меняем на T и дописываем Z — иначе браузер прочтёт
 * строку как местное время и свежий комментарий окажется «в будущем».
 *
 * «Сейчас» передаётся снаружи (см. useNow), чтобы сервер и гидрация считали от
 * одного момента.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const m = Math.floor(diff / 60000)

  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин. назад`

  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч. назад`

  return `${Math.floor(h / 24)} д. назад`
}
