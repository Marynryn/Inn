/**
 * Normalizes a chapter id ("4.06 KM", "1.55", "4-06 KM") into a clean URL slug
 * ("4-06-km", "1-55", "4-06-km"). Idempotent: slugifying an already-normalized
 * slug returns it unchanged, which lets it double as a matching key.
 */
export function slugifyChapterId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[.\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
