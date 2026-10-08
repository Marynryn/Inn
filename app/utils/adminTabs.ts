// Вкладки админки. Один список на двоих: колонка в самой админке и шторка
// меню, где на телефоне эти вкладки и живут. Вкладка хранится в адресе
// (/admin?tab=reel), поэтому из шторки можно прыгнуть сразу в нужную.
export const ADMIN_TABS = [
  { key: 'upload', label: 'Добавить главу', icon: 'plus' },
  { key: 'chapters', label: 'Список глав', icon: 'list' },
  { key: 'settings', label: 'Настройки сайта', icon: 'sliders' },
  { key: 'notify', label: 'Уведомления', icon: 'bell' },
  { key: 'stats', label: 'Статистика', icon: 'bars' },
  { key: 'frames', label: 'Рамки', icon: 'ring' },
  { key: 'skins', label: 'Скины', icon: 'spark' },
  { key: 'reel', label: 'Барабан', icon: 'wheel' },
  { key: 'readers', label: 'Читатели', icon: 'users' },
  { key: 'messages', label: 'Сообщения', icon: 'chat' },
  { key: 'profile', label: 'Аккаунт', icon: 'user' },
] as const

export type AdminTab = typeof ADMIN_TABS[number]['key']

export const DEFAULT_ADMIN_TAB: AdminTab = 'upload'

export const toAdminTab = (v: unknown): AdminTab =>
  ADMIN_TABS.some(t => t.key === v) ? v as AdminTab : DEFAULT_ADMIN_TAB
