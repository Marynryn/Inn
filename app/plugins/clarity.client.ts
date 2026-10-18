/**
 * Microsoft Clarity: записи сессий и тепловые карты кликов — чтобы видеть,
 * что читатели нажимают, а не гадать. Грузится только когда задан ID проекта,
 * то есть на боевом сайте; локалка и тестовый стенд в статистику не попадают.
 *
 * Пользовательский текст (комментарии, уведомления, админка) в записях
 * замазан атрибутом data-clarity-mask на самих элементах.
 */
export default defineNuxtPlugin(() => {
  const id = useRuntimeConfig().public.clarityId
  if (!id) return

  // Очередь вызовов — сразу, а не вместе со сниппетом: useHead вставляет скрипт
  // не мгновенно, и метка, поставленная до этого, раньше просто терялась —
  // window.clarity ещё не было. Сниппет ниже видит готовую очередь и не
  // перезаписывает её (c[a]=c[a]||…), а загрузившийся тег разбирает её сам.
  const w = window as unknown as { clarity?: ((...a: unknown[]) => void) & { q?: unknown[][] } }
  if (!w.clarity) {
    const queue = (...a: unknown[]) => { (queue.q = queue.q || []).push(a) }
    queue.q = undefined as unknown[][] | undefined
    w.clarity = queue
  }

  // Официальный сниппет: очередь вызовов clarity() до загрузки тега.
  useHead({
    script: [{
      key: 'clarity',
      innerHTML: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(id)});`,
    }],
  })

  // Метка на сессии, по ней в Clarity фильтруются записи:
  //   no    — гость,
  //   yes   — вошедший читатель,
  //   admin — хозяйка сайта и помощники: их сессии стоит исключать из статистики.
  //
  // Ставится только после ответа /api/auth/me: до него «не вошёл» значит «ещё
  // не знаем», и каждый вошедший успевал бы получить метку гостя.
  const auth = useAuthStore()
  watch(
    () => auth.ready ? (auth.isAdmin ? 'admin' : auth.isAuthed ? 'yes' : 'no') : null,
    (tag) => { if (tag) useClarity().set('authed', tag) },
    { immediate: true },
  )
})
