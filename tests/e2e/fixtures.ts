import JSZip from 'jszip'

/*
  Тестовый мир. Администратора заводит миграция при пустой базе, остальных —
  посев в global-setup через обычное API: так проверяется и оно само.
*/
export const ADMIN = { email: 'admin@tavern.local', password: 'admin123', name: 'admin' }
export const READER = { email: 'reader@test.local', password: 'reader123', name: 'reader' }
export const SECOND = { email: 'second@test.local', password: 'second123', name: 'second' }

export const CHAPTERS = [
  { id: '1.01', volume: 1, title: 'Первая глава', paragraphs: 40 },
  { id: '1.02', volume: 1, title: 'Вторая глава', paragraphs: 30 },
  { id: '2.01', volume: 2, title: 'Новый том', paragraphs: 25 },
]

/** Адрес главы — как его строит сайт: точки в id становятся дефисами. */
export const chapterUrl = (id: string) => `/chapter/${id.replace(/\./g, '-')}`

/**
 * Минимальный epub, который понимает парсер сайта: container.xml → OPF →
 * spine → xhtml. Собирается на лету, чтобы не держать бинарники в репозитории.
 */
export async function makeEpub(title: string, paragraphs: number): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:identifier id="uid">e2e</dc:identifier></metadata>
  <manifest><item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="ch"/></spine>
</package>`)

  const body = Array.from({ length: paragraphs }, (_, i) =>
    `<p>Абзац ${i + 1}. Трактирщица вытерла стойку и посмотрела на дверь: гости в это время года редки, а ${
      i % 2 ? '<em>сегодняшний</em>' : '<strong>сегодняшний</strong>'
    } явно не из местных.</p>`
  ).join('\n')

  zip.file('OEBPS/chapter.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body><h1>${title}</h1>${body}</body></html>`)

  return zip.generateAsync({ type: 'nodebuffer' })
}
