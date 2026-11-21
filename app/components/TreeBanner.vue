<script setup lang="ts">
import type { BoardEntry, TreeBoard, TreeTexts } from "#shared/utils/tree";

/**
 * Ёлка на главной: приглашение потрясти и доска титулов. Золотые висят
 * сверху весь сезон, ниже — свежие. С именами: титул и так стоит у имени в
 * комментариях, а без хозяина строчка на доске была бы просто фразой.
 */
const props = defineProps<{ texts: TreeTexts; board: TreeBoard }>();
const emit = defineEmits<{ open: [] }>();

// Золотые уже наверху — в ленте свежих их не повторяем.
const recent = computed(() =>
  props.board.recent.filter((e) => e.rarity !== "rare"),
);
const empty = computed(() => !props.board.rare.length && !recent.value.length);

// Имя ведёт на страницу читателя; у кого кода нет — просто подпись.
const NuxtLink = resolveComponent("NuxtLink");
const nameTag = (e: BoardEntry) => (e.code ? NuxtLink : "span");
const readerHref = (e: BoardEntry) =>
  e.code ? `/reader/${e.code}` : undefined;
</script>

<template>
  <section class="tree-banner" aria-labelledby="tree-banner-title">
    <div class="invite">
      <button
        class="invite-tree"
        type="button"
        tabindex="-1"
        aria-hidden="true"
        @click="emit('open')"
      >
        <TreeArt presents />
      </button>
      <div class="invite-body">
        <h2 id="tree-banner-title" class="display invite-title">
          {{ texts.tree_title }}
        </h2>
        <p class="invite-text">{{ texts.tree_text }}</p>
        <button
          class="btn btn--primary btn--lg"
          type="button"
          @click="emit('open')"
        >
          {{ texts.tree_button }}
        </button>
      </div>
    </div>

    <div class="board">
      <h3 class="display board-title">{{ texts.tree_board_title }}</h3>
      <p v-if="empty" class="board-empty">
        Пока пусто — первый титул ещё никто не вытряс.
      </p>

      <!-- Доска прокручивается в своей рамке: строк за сезон наберётся много,
           и раскрытый список растянул бы главную на километр. -->
      <div v-if="!empty" class="board-scroll thin-scroll">
        <ul v-if="board.rare.length" class="board-list is-rare">
          <li v-for="e in board.rare" :key="e.id" class="board-row">
            <UserAvatar
              class="board-face"
              :src="e.avatarUrl"
              :name="e.name"
              :frame="e.avatarFrame"
              :size="26"
              alt=""
            />
            <component
              :is="nameTag(e)"
              :to="readerHref(e)"
              class="board-name"
              >{{ e.name }}</component
            >
            <NameTitle :title="e" class="board-title-text" />
          </li>
        </ul>

        <ul v-if="recent.length" class="board-list">
          <li v-for="e in recent" :key="e.id" class="board-row">
            <UserAvatar
              class="board-face"
              :src="e.avatarUrl"
              :name="e.name"
              :frame="e.avatarFrame"
              :size="26"
              alt=""
            />
            <component
              :is="nameTag(e)"
              :to="readerHref(e)"
              class="board-name"
              >{{ e.name }}</component
            >
            <NameTitle :title="e" class="board-title-text" />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tree-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  color: var(--parchment);
  /* Праздничный красный, по макету: огоньки гирлянды точками по фону,
     сверху светлее, рамка и кнопка — хвойно-зелёные. */
  border: 1px solid rgba(111, 191, 139, 0.55);
  background:
    radial-gradient(circle, rgba(255, 214, 200, 0.3) 1.8px, transparent 2.4px) 0
      0 / 48px 48px,
    radial-gradient(circle, rgba(111, 191, 139, 0.3) 1.8px, transparent 2.4px)
      24px 12px / 48px 48px,
    radial-gradient(circle, rgba(169, 211, 239, 0.34) 1.8px, transparent 2.4px)
      12px 30px / 48px 48px,
    radial-gradient(circle, rgba(233, 199, 102, 0.26) 1.8px, transparent 2.4px)
      36px 36px / 48px 48px,
    radial-gradient(
      70% 90% at 15% 0%,
      rgba(255, 205, 195, 0.2),
      transparent 70%
    ),
    linear-gradient(135deg, #8e2430, #6d1a26);
}

.tree-banner :deep(.btn--primary) {
  background: #62ad80;
  color: #10241a;
}

/* ── Приглашение ───────────────────────────── */
.invite {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
}

.invite-tree {
  flex: none;
  width: 116px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.invite-title {
  margin: 0 0 6px;
  font-size: 21px;
  font-weight: 600;
}

.invite-text {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(241, 230, 210, 0.8);
}

/* ── Доска ─────────────────────────────────── */
.board {
  padding: 18px 22px 16px;
  border-left: 1px solid rgba(241, 230, 210, 0.08);
  min-width: 0;
}

.board-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--parchment-2);
}

.board-empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.board-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.board-list.is-rare {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(233, 199, 102, 0.3);
  border-radius: var(--radius-md);
  background: rgba(233, 199, 102, 0.06);
}

.board-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
  font-size: 13px;
  line-height: 1.35;
  min-width: 0;
}

.board-face {
  flex: none;
}

.board-name {
  font-weight: 600;
  color: var(--parchment);
  text-decoration: none;
}

a.board-name:hover {
  color: #8fd4a8;
}

.board-title-text {
  font-size: 13.5px;
}

.board-scroll {
  max-height: 244px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Рамка аватарки выступает за кружок, а прокрутка обрезает всё, что за
     её краем: поля дают рамке место, отрицательные отступы возвращают
     строки на прежнее место. Справа — ещё и под полосу прокрутки. */
  margin: -6px -14px -6px -8px;
  padding: 6px 14px 6px 8px;
}

@media (max-width: 760px) {
  .tree-banner {
    grid-template-columns: 1fr;
  }

  .board {
    border-left: none;
    border-top: 1px solid rgba(241, 230, 210, 0.08);
  }
}

@media (max-width: 420px) {
  .invite {
    gap: 14px;
    padding: 18px 16px;
  }

  .invite-tree {
    width: 92px;
  }

  .board {
    padding: 16px;
  }
}
</style>
