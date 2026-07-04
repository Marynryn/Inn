import JSZip from 'jszip'

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function buildEpub({ id, title, contentHtml }: { id: string; title: string; contentHtml: string }): Promise<Buffer> {
  const zip = new JSZip()
  const uid = `urn:uuid:tavern-chapter-${id.replace(/[^a-zA-Z0-9.-]/g, '')}`

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>ru</dc:language>
    <dc:identifier id="BookId">${uid}</dc:identifier>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter"/>
  </spine>
</package>`)

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uid}"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`)

  zip.file('OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title></head>
<body>
<h1>${escapeXml(title)}</h1>
${contentHtml}
</body>
</html>`)

  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' })
}
