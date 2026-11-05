/*
  Запуск сайта для тестов. Хранилище вычищается перед стартом, чтобы каждый
  прогон начинался с одной и той же пустой базы, а переменные окружения
  выставляются здесь же — .env проекта их не перебьёт: Nuxt не трогает то, что
  уже есть в process.env.

  По умолчанию тесты идут на продакшен-сборке — той же, что уезжает на
  Railway: собираем (`nuxt build`) и запускаем .output/server/index.mjs. Так
  проверяется то, что видят читатели, — заголовки, CSP, чанки, шрифты, — а
  не дев-сервер, который вдобавок сам падал посреди прогона на ECONNRESET.

    E2E_SKIP_BUILD=1  — не собирать, взять готовую .output (CI собирает отдельным шагом);
    E2E_SERVER=dev    — по-старому, на `nuxt dev`: быстрее, когда правишь и
                        гоняешь один тест.
*/
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const PORT = process.env.E2E_PORT || "3100";
const storage = resolve(".data/e2e");
const dev = process.env.E2E_SERVER === "dev";
const nuxt = resolve("node_modules/nuxt/bin/nuxt.mjs");
const server = resolve(".output/server/index.mjs");

rmSync(storage, { recursive: true, force: true });
mkdirSync(storage, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: dev ? "development" : "production",
  PORT,
  STORAGE_DIR: storage,
  NUXT_SESSION_PASSWORD:
    "e2e-session-password-not-secret-but-long-enough-0123456789",
  // Тесты ходят по http — «secure»-куку браузер бы не принял.
  NUXT_SESSION_COOKIE_SECURE: "false",
  NUXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
  // Внешние сервисы выключены дважды: ключи пустые, и сверх того сервер под
  // E2E_OFFLINE не выпускает наружу ни одного запроса (server/plugins/offline-guard.ts).
  // Чтобы прогон не написал живым читателям в канал, даже если в .env что-то есть.
  E2E_OFFLINE: "1",
  // Токен бота выдуманный, без chat id: рассылка по-прежнему «не настроена», а
  // вход через телеграм можно проверить целиком — подпись считается по токену.
  TELEGRAM_BOT_TOKEN: "123456:e2e-telegram-token",
  TELEGRAM_CHANNEL_ID: "",
  TELEGRAM_THREAD_ID: "",
  // Ключи Google — выдуманные: с ними видно, куда сервер отправляет к Google и
  // с каким redirect_uri, а сам Google при этом недостижим (E2E_OFFLINE), и
  // браузер тестов наружу не ходит.
  NUXT_OAUTH_GOOGLE_CLIENT_ID: "e2e-google-client",
  NUXT_OAUTH_GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  NOTIFY_SECRET: "e2e",
  // Пароль первого админа: без переменной миграция завела бы случайный.
  ADMIN_PASSWORD: "admin123",
  // Dev-сервер Vite отбрасывает запросы с чужим Host. Тесты про зеркало
  // приходят с Host taverna-book.ru — пускаем его (в бою этой проверки нет).
  __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: "taverna-book.ru",
  GAME_SECRET: "e2e-game",
  // Аналитика в тестах не нужна, даже если в окружении есть ID.
  NUXT_PUBLIC_CLARITY_ID: "",
};

// Собранный сервер читает runtimeConfig из переменных NUXT_*: TELEGRAM_BOT_TOKEN
// и прочие без префикса nuxt.config подхватывает только при сборке (и в деве).
// Дублируем тестовые значения под NUXT_-именами — они перекрывают и то, что
// сборка могла взять из .env разработчика.
Object.assign(env, {
  NUXT_TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  NUXT_TELEGRAM_CHAT_ID: env.TELEGRAM_CHANNEL_ID,
  NUXT_TELEGRAM_THREAD_ID: env.TELEGRAM_THREAD_ID,
  NUXT_NOTIFY_SECRET: env.NOTIFY_SECRET,
  NUXT_GAME_SECRET: env.GAME_SECRET,
});

if (!dev && !process.env.E2E_SKIP_BUILD) {
  // Сборка — без тестовых переменных: она та же, что для боя, а всё
  // тестовое приходит при запуске. Вывод — в stderr, его Playwright показывает.
  const build = spawnSync(process.execPath, [nuxt, "build"], {
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", process.stderr, process.stderr],
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

if (!dev && !existsSync(server)) {
  console.error(`[e2e] нет ${server} — сначала npm run build`);
  process.exit(1);
}

// Сервер зовём напрямую через node, без npx и оболочки: иначе при остановке
// умирала бы только оболочка, а сервер оставался висеть на порту.
const child = spawn(
  process.execPath,
  dev ? [nuxt, "dev", "--port", PORT] : [server],
  { env, stdio: "inherit" },
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill();
    process.exit(0);
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
