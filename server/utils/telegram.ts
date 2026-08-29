/** Шлёт сообщение в канал. Возвращает false, если бот не настроен — тогда главы нельзя считать оповещёнными. */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const config = useRuntimeConfig()
  const { botToken, chatId, threadId } = config.telegram
  if (!botToken || !chatId) return false

  await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    body: {
      chat_id: chatId,
      message_thread_id: threadId ? Number(threadId) : undefined,
      text,
    },
  })

  return true
}
