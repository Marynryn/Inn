/*
  Название сайта и книги — из nuxt.config (runtimeConfig.public.brand). По
  умолчанию там Таверна; другой сайт на этом же коде — демо для покупателей или
  сайт самого покупателя — подменяет их переменными окружения, без пересборки.

  Брать в настройке страницы, а не в колбэках меты: те пересчитываются позже,
  вне контекста Nuxt, и useRuntimeConfig там падает.
*/
const splitList = (value: string) => value.split('|').map(s => s.trim()).filter(Boolean)

export function useBrand() {
  const { brand, demo } = useRuntimeConfig().public
  return {
    ...brand,
    /** Демо-стенд для покупателей (NUXT_PUBLIC_DEMO=true). */
    demo: demo === true,
    /** Короткое описание сайта — превью ссылок и разметка schema.org. */
    description: `Фанатский перевод ${brand.bookName} на русский язык.`,
    altNames: splitList(brand.bookAltNames),
    genres: splitList(brand.bookGenres),
  }
}
