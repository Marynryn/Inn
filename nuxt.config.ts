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
    },
    notifySecret: process.env.NOTIFY_SECRET,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHANNEL_ID,
      threadId: process.env.TELEGRAM_THREAD_ID,
    },
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://taverna-book.com',
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
    },
  },

  routeRules: {
    '/_nuxt/**': {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
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
