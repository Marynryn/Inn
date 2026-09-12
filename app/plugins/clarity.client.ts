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

  // Официальный сниппет: очередь вызовов clarity() до загрузки тега.
  useHead({
    script: [{
      key: 'clarity',
      innerHTML: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(id)});`,
    }],
  })

  // Метка «гость / вошёл» на сессии: по ней в Clarity фильтруются записи,
  // например «гости, которые кликнули бегущую строку и не зарегистрировались».
  const auth = useAuthStore()
  watch(() => auth.isAuthed, (authed) => {
    useClarity().set('authed', authed ? 'yes' : 'no')
  }, { immediate: true })
})
