import type { AvatarFrame } from './avatarFrames'

/**
 * Публичная страница читателя — то, что о нём видно всем. Почта, способы
 * входа и роль сюда не входят никогда: страницу открывает кто угодно.
 */
export type PublicReader = {
  id: number
  name: string
  avatarUrl: string | null
  avatarFrame: AvatarFrame | null
  about: string | null
  /** Дата регистрации — «с нами с…». */
  since: string
  comments: number
  frames: (AvatarFrame & { grantedAt: string })[]
}

export const ABOUT_MAX = 300

/**
 * «О себе», каким его увидят. Переносы строк оставляем — абзац в пару строк
 * читается лучше сплошного, — но не больше одной пустой строки подряд: иначе
 * пустыми строками можно растянуть чужую страницу на экран. Управляющие
 * символы выкидываем: в тексте им делать нечего.
 */
export function normalizeAbout(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, ABOUT_MAX)
    .trim()
}
