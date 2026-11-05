/**
 * Встроенные скрипты страниц — в одном месте, потому что CSP пропускает их по
 * хэшу содержимого (server/utils/csp.ts). Nonce годится только для того, что
 * пришло в HTML с сервера, а эти скрипты Nuxt вставляет и при переходах внутри
 * сайта — тогда браузер сверяет их текст с хэшем в политике. Поменяли текст —
 * хэш пересчитается сам: политика собирается из этих же строк.
 */

/** Ключ настроек читалки в браузере. Его же читает READER_BOOT. */
export const LS_READER = "tavern:reader";

/**
 * Вид страницы главы применяется ещё до первой отрисовки: скрипт в шапке
 * читает настройки из браузера и ставит переменные на <html>. Иначе читатель
 * с сепией видел бы на каждой главе тёмную вспышку, пока не подхватится
 * клиент. Ключ и переменные — те же, что в useReaderSettings.
 */
export const READER_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(LS_READER)})||'null');if(!s)return;var d=document.documentElement;if(typeof s.theme==='string')d.setAttribute('data-reader-theme',s.theme);if(s.fontSize)d.style.setProperty('--reader-font',s.fontSize+'pt');if(s.lineHeight)d.style.setProperty('--reader-lh',String(s.lineHeight));if(s.width)d.style.setProperty('--reader-width',String(s.width))}catch(e){}})()`;

/** Официальный сниппет Microsoft Clarity: очередь вызовов до загрузки тега. */
export const claritySnippet = (id: string) =>
  `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(id)});`;
