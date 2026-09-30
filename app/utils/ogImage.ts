/** Адрес картинки превью ссылок — с отпечатком файла, см. nuxt.config. */
export const ogImageUrl = () => {
  const { siteUrl, ogImageVersion } = useRuntimeConfig().public
  return `${siteUrl}/og.jpg?v=${ogImageVersion}`
}
