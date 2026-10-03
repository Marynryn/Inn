/**
 * Chapters used to be linked with raw, unencoded ids ("/chapter/4-06 KM"),
 * which produced invalid canonical/og URLs. Any request whose id segment
 * doesn't already match its normalized slug — old spaces, %20, +, mixed
 * case — gets a permanent redirect to the clean form.
 */
export default defineEventHandler((event) => {
  const { pathname, search } = getRequestURL(event)
  const match = pathname.match(/^\/chapter\/([^/]+)((?:\/comments)?)\/?$/)
  if (!match) return

  const [, rawSegment, suffix] = match
  // A broken escape ("%E0%A4%A") made decodeURIComponent throw, and the
  // request ended as a 500 "Ошибка" page. No chapter can live there: 404.
  let decoded: string
  try {
    decoded = decodeURIComponent(rawSegment.replace(/\+/g, ' '))
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Глава не найдена' })
  }
  const normalized = slugifyChapterId(decoded)
  const encodedNormalized = encodeURIComponent(normalized)

  if (encodedNormalized && encodedNormalized !== rawSegment) {
    sendRedirect(event, `/chapter/${encodedNormalized}${suffix}${search}`, 301)
  }
})
