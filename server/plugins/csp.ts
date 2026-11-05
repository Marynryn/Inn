import { addNonce, contentSecurityPolicy, newNonce } from "../utils/csp";

/**
 * CSP для страниц (политику и зачем она — см. utils/csp.ts). Каждая страница
 * получает свой nonce: он ставится всем <script> в HTML и называется в
 * заголовке. Только в собранном сайте: дев-сервер Vite живёт на встроенных
 * скриптах и eval, ему такая политика не по силам.
 *
 * NUXT_CSP_REPORT_ONLY=true — политика только сообщает о нарушениях (в лог
 * через /api/csp-report), ничего не блокируя. На случай, если после выкатки
 * что-то окажется закрытым: включить, разобраться по логам, выключить.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return;

  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const nonce = newNonce();
    html.head = addNonce(html.head, nonce);
    html.bodyPrepend = addNonce(html.bodyPrepend, nonce);
    html.body = addNonce(html.body, nonce);
    html.bodyAppend = addNonce(html.bodyAppend, nonce);

    const config = useRuntimeConfig(event);
    setResponseHeader(
      event,
      config.cspReportOnly
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy",
      contentSecurityPolicy({ nonce, clarityId: config.public.clarityId }),
    );
  });
});
