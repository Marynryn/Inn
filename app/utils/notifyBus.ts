/**
 * Сокет уведомлений держит колокольчик (он висит на всех страницах), а слышать
 * его нужно и другим: вкладке «Сообщения» в админке — чтобы новое сообщение
 * появлялось сразу. Колокольчик пересказывает сюда всё, что пришло, а кому
 * нужно — подписываются. Второго сокета ради этого не открываем.
 */
type Listener = (msg: any) => void

const listeners = new Set<Listener>()

export const notifyBus = {
  emit(msg: unknown) {
    for (const fn of listeners) {
      try { fn(msg) } catch {}
    }
  },
  /** Подписка до размонтирования компонента. */
  on(fn: Listener) {
    listeners.add(fn)
    onUnmounted(() => listeners.delete(fn))
  },
}
