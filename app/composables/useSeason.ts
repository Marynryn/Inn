/**
 * Праздничное оформление, которое включают в админке («Оформление сайта»).
 * Ключ запроса общий, поэтому сколько бы украшений ни спросило — к серверу
 * уходит один запрос на страницу, а на сервере ответ ждут до отрисовки, и
 * украшения приходят уже в HTML, без мигания после загрузки.
 */
export type Season = '' | 'halloween'

export const useSeason = () => {
  const { data } = useFetch<{ season_theme?: string }>('/api/settings', {
    key: 'season',
    pick: ['season_theme'],
  })
  return computed<Season>(() => (data.value?.season_theme === 'halloween' ? 'halloween' : ''))
}
