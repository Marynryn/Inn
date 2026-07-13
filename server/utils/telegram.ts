export async function sendTelegramMessage(text: string) {
  const config = useRuntimeConfig()
  const { botToken, chatId, threadId } = config.telegram
  if (!botToken || !chatId) return

  await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    body: {
      chat_id: chatId,
      message_thread_id: threadId ? Number(threadId) : undefined,
      text,
    },
  })
}
