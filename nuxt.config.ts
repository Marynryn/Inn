import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Отпечаток картинки превью ссылок. Телеграм, ВК и прочие кэшируют превью по
// адресу картинки — сколько угодно долго, — и новая og.jpg под старым адресом
// до них не доходит. С отпечатком в адресе новая картинка — это новый адрес.
const ogImageVersion = createHash('sha1').update(readFileSync('public/og.jpg')).digest('hex').slice(0, 8)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['nuxt-auth-utils', '@pinia/nuxt', '@nuxt/image'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/fav.png' },
        { rel: 'apple-touch-icon', href: '/fav.png' },
      ],
    },
  },
 
  runtimeConfig: {
    sessionPassword: process.env.NUXT_SESSION_PASSWORD,
    session: {
      maxAge: 60 * 60 * 24 * 30, // 30 дней — не разлогинивать при каждом закрытии браузера
      cookie: {
        // Куку сессии по http браузер не примет — и это правильно: боевой сайт
        // работает по https. Ключ прописан явно, чтобы его можно было снять
        // переменной NUXT_SESSION_COOKIE_SECURE=false: без неё собранный сайт,
        // запущенный в домашней сети по адресу вида 192.168.x.x, не пускает
        // войти вообще. Переменную ставим только там.
        secure: true,
      },
    },
    notifySecret: process.env.NOTIFY_SECRET,
    // Ключи входа через Google. Пустые — кнопка на странице входа не появится.
    oauth: {
      google: {
        clientId: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET,
      },
    },
    // Семя для персонажа дня. Без него порядок вычисляется по паролю сессии —
    // работает, но при смене пароля порядок дней перетасуется.
    gameSecret: process.env.GAME_SECRET,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHANNEL_ID,
      threadId: process.env.TELEGRAM_THREAD_ID,
    },
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://taverna-book.com',
      ogImageVersion,
      // Проект Microsoft Clarity (записи сессий, карты кликов). Пустой — скрипт
      // не подключается вовсе: локалка и тесты не должны попадать в статистику.
      clarityId: process.env.NUXT_PUBLIC_CLARITY_ID || '',
    },
  },

  vue: {
    compilerOptions: {
      isCustomElement: (tag) => tag === 'emoji-picker',
    },
  },

  vite: {
    optimizeDeps: {
      include: ['@tiptap/vue-3', '@tiptap/starter-kit'],
    },
  },

  nitro: {
    experimental: {
      database: false,
      websocket: true,
      tasks: true,
    },
    // Время в UTC: контейнер Railway живёт по UTC, МСК = UTC+3. Ставить
    // TZ=Europe/Moscow нельзя — msk.ts прибавляет три часа к UTC вручную,
    // и смена пояса перекосит счётчики «за сегодня».
    scheduledTasks: {
      '7 9 * * *': ['notify-chapters'], // 12:07 МСК — основной звонок
      '7 12 * * *': ['notify-chapters'], // 15:07 МСК — на случай деплоя в момент первого
      '17 3 * * *': ['refresh-original'], // 06:17 МСК — число глав оригинала для трекера
    },
  },

  routeRules: {
    '/_nuxt/**': {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
    // Картинки через NuxtImg. Без своего правила их ловило '/**' с no-store, и на
    // каждое обновление страницы таверна и логотип качались заново — пока
    // шли, на их месте было пусто. Имя у картинки бывает прежним и после
    // замены (hero.webp), поэтому сутки, а не год.
    '/_ipx/**': {
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    },
    // Картинки из public. Под '/**' с no-store портреты, фигурки и иконки
    // качались заново на каждом заходе. Имена у них после замены прежние
    // (ryoka.webp, hero.webp), поэтому, как и у '/_ipx/**', сутки, а не год.
    ...Object.fromEntries([
      '/characters/**', '/figures/**', '/avatars/**',
      '/403.webp', '/404.webp', '/500.webp', '/bee.webp', '/header.webp', '/hearth.webp',
      '/hero.webp', '/hero-halloween.webp', '/pumpkin.webp', '/pumpkin-laugh.mp3', '/login.webp', '/login-mobile.webp', '/orb.webp', '/reader-book.webp',
      '/sign-characters.webp', '/toren-smoke.webp', '/og.jpg',
      '/fav.png', '/favicon.ico', '/favicon-16x16.png', '/favicon-32x32.png', '/favicon-192x192.png',
    ].map(path => [path, { headers: { 'Cache-Control': 'public, max-age=86400' } }])),
    '/api/**': {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    '/_ws': {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    '/**': {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  },
})
