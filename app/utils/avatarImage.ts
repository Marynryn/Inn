/**
 * Уменьшает картинку до 256×256 прямо в браузере, обрезая по центру. Этим
 * занимался sharp на сервере, но это нативная библиотека: nitro упаковывал её
 * js и терял libvips, и сайт не запускался. Canvas есть у всех и справляется.
 */
export const toSmallSquare = (file: File): Promise<Blob> => new Promise((resolve) => {
  const img = new Image()
  const url = URL.createObjectURL(file)

  img.onload = () => {
    URL.revokeObjectURL(url)
    const side = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256

    const ctx = canvas.getContext('2d')
    if (!ctx) return resolve(file)

    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
    canvas.toBlob(blob => resolve(blob ?? file), 'image/webp', 0.85)
  }

  // Не открылась — отправим как есть, сервер сам проверит, картинка ли это.
  img.onerror = () => {
    URL.revokeObjectURL(url)
    resolve(file)
  }

  img.src = url
})
