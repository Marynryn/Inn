/**
 * Есть ли у админа непрочитанные личные сообщения — для точки на вкладке
 * «Сообщения» в колонке админки и в шторке меню. Состояние общее, поэтому обе
 * точки гаснут разом, когда разговор открыли.
 */
export const useAdminUnread = () => {
  const has = useState('admin-messages-unread', () => false)

  const refresh = async () => {
    try {
      const people = await $fetch<{ unread: boolean }[]>('/api/admin/messages')
      has.value = people.some(p => p.unread)
    }
    catch {
      // Не узнали — точку не трогаем: лучше старое знание, чем мигание.
    }
  }

  return { has, refresh }
}
