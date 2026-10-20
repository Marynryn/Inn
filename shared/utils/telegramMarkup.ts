/**
 * Разметка своего сообщения в телеграм — та же, что в самом телеграме:
 * **жирный**, ~~зачёркнутый~~, ||спойлер||. Превращаем её в HTML телеграма,
 * а всё прочее экранируем: одиночная звёздочка или «<» в тексте остаются
 * просто символами и не ломают отправку.
 */
export const TELEGRAM_MARKS = [
  { mark: '**', tag: 'b' },
  { mark: '~~', tag: 's' },
  { mark: '||', tag: 'tg-spoiler' },
] as const

const escapeHtml = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function telegramMarkupToHtml(text: string): string {
  let html = escapeHtml(text)
  for (const { mark, tag } of TELEGRAM_MARKS) {
    const m = escapeRe(mark)
    // Внутри пары — хоть что-то, кроме пробелов, иначе «** **» тоже стал бы тегом.
    html = html.replace(new RegExp(`${m}(?=\\S)([\\s\\S]*?\\S)${m}`, 'g'), `<${tag}>$1</${tag}>`)
  }
  return html
}
