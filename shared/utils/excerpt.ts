const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&laquo;': '«',
  '&raquo;': '»',
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, m => HTML_ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cuts plain text at the last word boundary at or before maxLen, adding an ellipsis if it was cut. */
export function excerptFromHtml(html: string, maxLen: number): string {
  const text = htmlToPlainText(html)
  if (text.length <= maxLen) return text

  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

/**
 * TWI chapters don't have real titles (only interludes have POV names, which
 * aren't tracked yet) — so a per-chapter description is built from the first
 * bit of the chapter's own text instead of repeating the chapter number.
 */
export function buildChapterDescription(id: string, contentHtml: string): string {
  const suffix = ` — глава ${id}, фанатский перевод The Wandering Inn на русском.`
  const excerpt = excerptFromHtml(contentHtml, Math.max(60, 160 - suffix.length))
  return `${excerpt}${suffix}`
}
