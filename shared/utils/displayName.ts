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
 * нельзя: иначе первый же зарегистрировавшийся «Гость» отобрал бы у всех гостей
 * подпись по умолчанию.
 */
export const RESERVED_NAME_KEYS = ['гость', 'читатель']

export const isReservedName = (raw: unknown) => RESERVED_NAME_KEYS.includes(displayNameKey(raw))

/** Имя из почты: до собаки. Им подписан тот, кто своего имени не задавал. */
export const nameFromEmail = (email: string | null | undefined) =>
  normalizeDisplayName(email?.split('@')[0])
