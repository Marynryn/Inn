import type { H3Event } from "h3";
import { withQuery } from "ufo";
import {
  afterLogin,
  loginWithProvider,
  rememberNext,
} from "../../utils/identity";
import { publicOrigin } from "../../utils/public-origin";

const SCOPE = ["openid", "email", "profile"];

/**
 * Вход через Google. Обмен кода на токен и запрос профиля делает сам
 * nuxt-auth-utils — нам остаётся сверить, что почта подтверждена, и завести
 * сессию. Этот же адрес прописывается в консоли Google как redirect URI.
 *
 * Адрес возврата — по домену, на котором человек открыл сайт: и .com, и
 * зеркало .ru прописаны в консоли Google, и кука сессии нужна там, откуда
 * пришли. Обработчик собирается на каждый домен свой, один раз.
 */
const handlers = new Map<
  string,
  ReturnType<typeof defineOAuthGoogleEventHandler>
>();

const handlerFor = (origin: string) => {
  let handler = handlers.get(origin);
  if (handler) return handler;

  handler = defineOAuthGoogleEventHandler({
    config: {
      scope: SCOPE,
      redirectURL: `${origin}/auth/google`,
    },

    async onSuccess(event, { user }) {
      const { created } = await loginWithProvider(event, "google", {
        id: String(user.sub),
        email: user.email ?? null,
        emailVerified: user.email_verified === true,
        displayName: user.name ?? user.given_name ?? null,
        photoUrl: user.picture ?? null,
      });

      return sendRedirect(event, afterLogin(event, created));
    },

    onError(event, error) {
      return failLogin(event, error);
    },
  });

  handlers.set(origin, handler);
  return handler;
};

/**
 * Вход не удался — на страницу входа с коротким кодом причины, а не голая
 * страница ошибки. Обменять код на токен, спросить профиль, завести сессию —
 * любой из шагов может упасть (истёкший код, отказ Google, бан), и человеку
 * нужно понятное «попробуй ещё раз», а нам в логах — что именно случилось.
 */
function failLogin(event: H3Event, error: unknown) {
  const e = error as {
    statusCode?: number;
    status?: number;
    message?: string;
    data?: any;
  };
  const status = e?.statusCode ?? e?.status;
  const detail = e?.data?.error ?? e?.data?.message ?? e?.message ?? "unknown";
  console.error("[auth] google:", status, detail, e?.data ?? "");

  const reason = String(status ?? "") + ":" + String(detail).slice(0, 60);
  return sendRedirect(
    event,
    `/login?error=google&reason=${encodeURIComponent(reason)}`,
  );
}

export default defineEventHandler(async (event) => {
  const origin = publicOrigin(event);
  const { code } = getQuery(event);

  // Возврат от Google: код на токен, профиль, сессия — всё в обработчике.
  // Что он не поймал сам (ответ Google не с тем статусом, бан), ловим здесь.
  if (code) {
    try {
      return await handlerFor(origin)(event);
    } catch (error) {
      return failLogin(event, error);
    }
  }

  // Первый заход. Куда вернуть человека, знает только он — с возврата от Google
  // никакого «откуда пришёл» уже не видно, поэтому запоминаем в куке.
  rememberNext(event);

  // Адрес к Google собираем сами, теми же параметрами, что и обработчик.
  // Ключи проверяем как он: без них — на страницу входа с ошибкой.
  // Только безобидные поля: имя, почта, аватарка. Просить больше — значит
  // отправить приложение на проверку в Google, а нам этого не нужно.
  const { clientId, clientSecret } = useRuntimeConfig(event).oauth.google;
  if (!clientId || !clientSecret) {
    return failLogin(
      event,
      new Error(
        "нет NUXT_OAUTH_GOOGLE_CLIENT_ID или NUXT_OAUTH_GOOGLE_CLIENT_SECRET",
      ),
    );
  }

  return sendRedirect(
    event,
    withQuery("https://accounts.google.com/o/oauth2/v2/auth", {
      response_type: "code",
      client_id: clientId,
      redirect_uri: `${origin}/auth/google`,
      scope: SCOPE.join(" "),
      state: "",
    }),
  );
});
