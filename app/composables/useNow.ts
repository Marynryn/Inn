/**
 * «Сейчас» для относительного времени («5 мин. назад»). Одно и то же на сервере
 * и при гидрации: сервер кладёт свой момент в payload, клиент первый раз рисует
 * с ним же — иначе на границе минуты страница рендерилась бы как «7 мин.», а
 * гидрировалась как «8 мин.», и Vue ругался бы на несовпадение. После монтирования
 * время начинает идти и обновляется раз в минуту, чтобы подписи не застывали.
 */
export const useNow = () => {
  const now = useState<number>('now', () => Date.now())

  if (import.meta.client) {
    onMounted(() => {
      now.value = Date.now()
      const timer = setInterval(() => { now.value = Date.now() }, 60_000)
      onUnmounted(() => clearInterval(timer))
    })
  }

  return now
}
