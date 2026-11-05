<script setup lang="ts">
import type { Component } from "vue";
import type { AdminTab } from "~/utils/adminTabs";
import AdminAccount from "~/components/AdminAccount.vue";
import AdminChapters from "~/components/AdminChapters.vue";
import AdminFrames from "~/components/AdminFrames.vue";
import AdminNotify from "~/components/AdminNotify.vue";
import AdminSettings from "~/components/AdminSettings.vue";
import AdminStats from "~/components/AdminStats.vue";
import AdminUpload from "~/components/AdminUpload.vue";

// Чужих отсеивает middleware ещё на сервере: каркас панели не рендерится никому,
// кроме администратора.
definePageMeta({ middleware: "admin" });

// Шапке — ссылки на телеграм и бусти. Вкладка настроек берёт тот же ответ:
// ключ запроса общий, и сохранённое там сразу видно здесь.
const { data: settings } = await useFetch("/api/settings");

/**
 * Вкладки — каждая своим компонентом. Скины, барабан, сообщения и читатели
 * ниже в шаблоне: они и раньше были отдельными компонентами.
 *
 * Открытая однажды вкладка остаётся смонтированной, только скрытой (v-show):
 * ушёл на другую и вернулся — набранное в форме на месте, как когда всё было
 * одной страницей. Данные вкладка грузит, когда её впервые открыли, а не все
 * разом при входе в панель. KeepAlive для этого не годится: на странице,
 * пришедшей с сервера, он падал при первом же переключении.
 *
 * useFetch во вкладках — без await: вкладка показывается сразу и дорисовывается,
 * когда придёт ответ. На сервере Nuxt всё равно дожидается данных до отрисовки.
 */
const TAB_VIEWS: Partial<Record<AdminTab, Component>> = {
  upload: AdminUpload,
  chapters: AdminChapters,
  settings: AdminSettings,
  notify: AdminNotify,
  stats: AdminStats,
  frames: AdminFrames,
  profile: AdminAccount,
};

// Вкладка живёт в адресе (/admin?tab=reel): перезагрузка оставляет на месте,
// «назад» возвращает на прошлую вкладку, а шторка с любой страницы ведёт сразу
// в нужную.
const route = useRoute();
const activeTab = computed(() => toAdminTab(route.query.tab));
const adminTabs = ADMIN_TABS;
const tabViews = Object.entries(TAB_VIEWS) as [AdminTab, Component][];
const visitedTabs = ref(new Set<AdminTab>([activeTab.value]));
watch(activeTab, (tab) => {
  if (!visitedTabs.value.has(tab))
    visitedTabs.value = new Set(visitedTabs.value).add(tab);
});

// Точка на вкладке «Сообщения»: проверяем при входе и всякий раз, когда сокет
// говорит, что пришло новое или что-то прочитано в другой вкладке.
const { has: unreadMessages, refresh: refreshUnread } = useAdminUnread();
onMounted(refreshUnread);
notifyBus.on((msg) => {
  if (msg?.type === "message" || msg?.type === "notification") refreshUnread();
});

useHead({
  title: "Админ · Странствующая Таверна",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
</script>

<template>
  <div class="admin-wrap" data-clarity-mask="true">
    <div class="admin-layout">
      <AppHeader
        :telegram-url="settings?.telegram_url"
        :boosty-url="settings?.boosty_url"
        :tribute-url="settings?.tribute_url"
      />

      <!-- КОЛОНКА ВКЛАДОК (на телефоне вкладки живут в шторке меню) -->
      <aside class="admin-sidebar thin-scroll">
        <div class="sb-section">Админка</div>
        <SideNavLink
          v-for="t in adminTabs"
          :key="t.key"
          :to="`/admin?tab=${t.key}`"
          :icon="t.icon"
          :label="t.label"
          :active="activeTab === t.key"
          :dot="t.key === 'messages' && unreadMessages"
          compact
          class="sb-tab"
        />
      </aside>

      <!-- КОНТЕНТ -->
      <main class="admin-content">
        <template v-for="[key, view] in tabViews" :key="key">
          <component
            :is="view"
            v-if="visitedTabs.has(key)"
            v-show="activeTab === key"
          />
        </template>
        <section
          v-if="activeTab === 'skins'"
          class="card card--panel card--wide"
        >
          <h2>Скины страницы читателя</h2>
          <AdminSkins />
        </section>

        <section
          v-if="activeTab === 'reel'"
          class="card card--panel card--wide"
        >
          <h2>Барабан</h2>
          <AdminReel />
        </section>

        <section
          v-if="activeTab === 'messages'"
          class="card card--panel card--wide"
        >
          <h2>Сообщения</h2>
          <AdminMessages />
        </section>

        <section
          v-if="activeTab === 'readers'"
          class="card card--panel card--wide"
        >
          <h2>Читатели</h2>
          <AdminReaders />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped src="~/assets/css/admin-panel.css"></style>

<style scoped>
.admin-wrap {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--parchment);
  font-family: var(--font-body);
}

.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-content {
  flex: 1;
  padding: 40px 32px;
  min-width: 0;
}

.admin-layout {
  padding-top: 56px;
}

/* Колонка вкладок слева, под шапкой. Выглядит как шторка меню — те же пункты. */
.admin-sidebar {
  width: 240px;
  flex: 0 0 240px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 24px;
  background: #241c16;
  border-right: 1px solid var(--line-faint);
  position: sticky;
  top: 56px;
  height: calc(100vh - 56px);
  overflow-y: auto;
}

.sb-section {
  padding: 18px 12px 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .admin-sidebar {
    display: none;
  }
  .admin-content {
    padding: 16px;
  }
}
</style>
