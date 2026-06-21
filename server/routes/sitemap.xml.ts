import { useDb } from '../utils/db'
import { chapters } from '../database/schema'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const rows = await db
    .select({ id: chapters.id, publishedAt: chapters.publishedAt })
    .from(chapters)
    .orderBy(desc(chapters.publishedAt))

  const base = 'https://stranstvuyushchaya-taverna.ru'

  const urls = [
    `<url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...rows.map(c => {
      const slug = c.id.replace('.', '-')
      const lastmod = c.publishedAt ? c.publishedAt.slice(0, 10) : ''
      return `<url><loc>${base}/chapter/${slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>never</changefreq><priority>0.8</priority></url>`
    }),
  ]

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=3600')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
})
