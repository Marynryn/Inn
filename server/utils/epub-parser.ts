import JSZip from 'jszip'
import sanitizeHtml from 'sanitize-html'

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'em', 'strong', 'span', 'hr', 'div'],
  allowedAttributes: {
    span: ['style', 'class'],
    p: ['style', 'class'],
  },
  allowedStyles: {
    '*': {
      color: [/.*/],
      'font-style': [/italic/],
      'font-weight': [/bold/, /[6-9]\d\d/, /1000/],
    },
  },
}

export async function parseEpub(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)

  // Найти container.xml → rootfile
  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerXml) throw new Error('Невалидный epub: нет container.xml')

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/)
  if (!rootfileMatch) throw new Error('Невалидный epub: нет rootfile')

  const opfPath = rootfileMatch[1]
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const opfContent = await zip.file(opfPath)?.async('string')
  if (!opfContent) throw new Error('Невалидный epub: нет OPF файла')

  // Извлечь href всех spine-элементов в порядке чтения
  const itemMatches = [...opfContent.matchAll(/id="([^"]+)"[^>]+href="([^"]+)"[^>]+media-type="application\/xhtml/g)]
  const itemMap = new Map(itemMatches.map(m => [m[1], m[2]]))

  const spineMatches = [...opfContent.matchAll(/idref="([^"]+)"/g)]
  const htmlParts: string[] = []

  for (const [, idref] of spineMatches) {
    const href = itemMap.get(idref)
    if (!href) continue
    const filePath = opfDir + href
    const content = await zip.file(filePath)?.async('string')
    if (!content) continue

    // Вырезать содержимое <body>
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) htmlParts.push(bodyMatch[1])
  }

  const raw = htmlParts.join('\n').replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '')
  return sanitizeHtml(raw, SANITIZE_OPTIONS)
}
