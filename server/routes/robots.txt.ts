/*
  robots.txt — маршрутом, а не файлом в public: демо-стенд закрывается от
  поиска целиком, а у боевого сайта адрес sitemap берётся из настроек, как и
  в самом sitemap.xml.
*/
export default defineEventHandler((event) => {
  const { siteUrl, demo } = useRuntimeConfig(event).public
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')

  if (demo) return 'User-agent: *\nDisallow: /\n'

  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /login
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`
})
