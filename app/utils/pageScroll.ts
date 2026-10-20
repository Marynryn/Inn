// Глава с закладкой сама возвращает читателя на его место — иногда раньше, чем
// роутер дождётся показа страницы и прокрутит её наверх. Страница отмечает здесь
// свой адрес, а роутер, увидев отметку, прокрутку пропускает.
let claimedPath: string | null = null

export const claimPageScroll = (path: string) => { claimedPath = path }

// Отметка одноразовая: любой следующий переход её снимает, чтобы старая не
// сработала на другой странице.
export const takePageScrollClaim = (path: string) => {
  const hit = claimedPath === path
  claimedPath = null
  return hit
}
