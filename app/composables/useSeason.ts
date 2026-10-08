/**
 * Праздничное оформление, которое включают в админке («Оформление сайта»).
 * Ключ запроса общий, поэтому сколько бы украшений ни спросило — к серверу
 * уходит один запрос на страницу, а на сервере ответ ждут до отрисовки, и
 * украшения приходят уже в HTML, без мигания после загрузки.
 */
export type Season = '' | 'halloween'

export const useSeason = () => {
  const { data } = useFetch<{ season_theme?: string, halloween_reader_bg?: string }>('/api/settings', {
    key: 'season',
    pick: ['season_theme', 'halloween_reader_bg'],
  })
  return computed<Season>(() => (data.value?.season_theme === 'halloween' ? 'halloween' : ''))
}

/** Фон читалки, выбранный на Хеллоуин в админке; null — оставить обычный. */
export const useSeasonReaderBg = () => {
  const season = useSeason()
  const { data } = useNuxtData<{ halloween_reader_bg?: string }>('season')
  return computed(() => (season.value === 'halloween' ? safeHex(data.value?.halloween_reader_bg) : null))
}
