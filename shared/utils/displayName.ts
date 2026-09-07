/**
 * Имя под комментариями — одно на всех: занятое кем-то имя больше никому не
 * достанется, ни вошедшему читателю, ни гостю. Иначе представиться Админом мог
 * бы кто угодно, а по комментариям этого не различить.
 */

export const DISPLAY_NAME_MAX = 40

/** Имя, каким его увидят: без краёв, без сдвоенных пробелов и не длиннее сорока. */
export function normalizeDisplayName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX)
}

/**
 * Ключ, по которому имена считаются одинаковыми. Регистр не в счёт: «Admin» и
 * «admin» под комментариями выглядят одним и тем же человеком. Пустая строка
 * означает «имени нет» — такие ключи не хранятся и никого не занимают.
 */
export function displayNameKey(raw: unknown): string {
  return normalizeDisplayName(raw).toLowerCase()
}

/**
 * Безликие имена, под которыми показываются те, кто своего не назвал. Занять их
 * нельзя, а подписаться ими может любой гость: иначе первый же
 * зарегистрировавшийся «Гость» отобрал бы у всех остальных подпись по умолчанию.
 */
export const GENERIC_NAME_KEYS = ['гость', 'читатель']

export const isGenericName = (raw: unknown) => GENERIC_NAME_KEYS.includes(displayNameKey(raw))

/**
 * Служебные имена. Они не достаются никому, даже если сейчас свободны: назовись
 * гость «Администратором» — и его слово в комментариях весит как хозяйкино.
 * Хозяйке сайта они, наоборот, разрешены: роль admin эту проверку проходит.
 */
export const STAFF_NAME_KEYS = [
  'admin', 'админ', 'administrator', 'администратор',
  'moderator', 'модератор', 'таверна',
]

export const isStaffName = (raw: unknown) => STAFF_NAME_KEYS.includes(displayNameKey(raw))

/** Имя из почты: до собаки. Им подписан тот, кто своего имени не задавал. */
export const nameFromEmail = (email: string | null | undefined) =>
  normalizeDisplayName(email?.split('@')[0])
