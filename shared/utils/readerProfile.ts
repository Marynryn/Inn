import type { AvatarFrame } from './avatarFrames'
import type { ProfileSkin } from './profileSkins'

/**
 * Публичная страница читателя — то, что о нём видно всем. Почта, способы
 * входа, роль и номер сюда не входят никогда: страницу открывает кто угодно, а
 * по номеру видно, сколько на сайте читателей.
 */
export type PublicReader = {
  /** Публичный код — он же в адресе страницы. */
  code: string
  /** Смотрит ли читатель на свою же страницу. */
  isMe: boolean
  name: string
  avatarUrl: string | null
  avatarFrame: AvatarFrame | null
  about: string | null
  /** Дата регистрации — «с нами с…». */
  since: string
  comments: number
  frames: (AvatarFrame & { grantedAt: string })[]
  /** Надетый скин страницы. У хозяйки сайта на своей странице — и примерка. */
  skin: ProfileSkin | null
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
