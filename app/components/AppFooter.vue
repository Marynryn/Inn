<script setup lang="ts">
defineProps<{
  settings: Record<string, string> | null
}>()
</script>

<template>
  <footer class="site-footer">
    <div class="footer-links">
      <a href="#ledger">Главы</a>
      <a
        :href="settings?.telegram_url || '#'"
        target="_blank"
        rel="noopener"
      >
        Telegram ↗
      </a>
      <a
        :href="settings?.support_url || '#'"
        target="_blank"
        rel="noopener"
      >
        Поддержать проект ↗
      </a>
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

.footer-links a:hover {
  color: var(--ember);
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
</style>
