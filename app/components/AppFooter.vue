<script setup lang="ts">
defineProps<{
  settings: Record<string, string> | null
  /** Вариант для тёмной подложки — страница игры. По умолчанию светлая, как главная. */
  onDark?: boolean
}>()

const route = useRoute()

const goToChapters = (e: Event) => {
  if (route.path === '/') {
    e.preventDefault()
    const el = document.getElementById('ledger')
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 56
      smoothScrollTo(top)
    }
  }
}
</script>

<template>
  <footer class="site-footer" :class="{ 'on-dark': onDark }">
    <div class="footer-links">
      <a href="/#ledger" @click="goToChapters">Главы</a>
      <NuxtLink v-if="route.path !== '/about'" href="/about">О проекте</NuxtLink>
      <a
        :href="settings?.telegram_url || '#'"
        target="_blank"
        rel="noopener"
      >
        Telegram ↗
      </a>
      <SupportLinks
        :boosty-url="settings?.boosty_url"
        :tribute-url="settings?.tribute_url"
        link-class="footer-support-link"
        open-up
      />
    </div>
    <div class="footer-rule" />
    <span
      class="footer-text"
      v-html="(settings?.footer_text || '').replace(/\n/g, '<br>')"
    />
  </footer>
</template>

<style scoped>
.site-footer {
  text-align: center;
  padding: 48px 24px 36px;
  border-top: 1px solid rgba(43, 30, 22, .1);
  color: var(--ink-soft);
  font-size: 13px;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-bottom: 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
}

.footer-links a {
  transition: color .15s;
}

.footer-links :deep(.footer-support-link) {
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0;
  transition: color .15s;
}

.footer-links :deep(.footer-support-link:hover) {
  color: var(--ember);
}

.footer-links a:hover {
  color: var(--ember);
}

@media (max-width: 480px) {
  .footer-links {
flex-direction: column;
gap:4px;
  }
}

.footer-rule {
  height: 1px;
  background: rgba(43, 30, 22, .1);
  margin-bottom: 20px;
}

.footer-text {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.7;
}

/* На тёмной подложке страницы игры. Пергаментные цвета там сливаются с фоном
   насмерть: --ink по --bg-dark это почти чёрный по почти чёрному. */
.site-footer.on-dark {
  border-top-color: rgba(241, 230, 210, .12);
  color: var(--text-muted);
}

.on-dark .footer-links {
  color: var(--parchment-2);
}

.on-dark .footer-rule {
  background: rgba(241, 230, 210, .12);
}

.on-dark .footer-text {
  color: var(--text-muted);
}
</style>
