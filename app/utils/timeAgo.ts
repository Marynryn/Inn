/**
 * «5 мин. назад» из времени, которое отдаёт SQLite: 'YYYY-MM-DD HH:MM:SS' без
 * зоны, но по UTC. Пробел меняем на T и дописываем Z — иначе браузер прочтёт
 * строку как местное время и свежий комментарий окажется «в будущем».
 */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const m = Math.floor(diff / 60000)

  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин. назад`

  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч. назад`

  return `${Math.floor(h / 24)} д. назад`
}
