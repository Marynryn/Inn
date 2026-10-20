<script setup lang="ts">
defineProps<{
  currentId: string
  lastId: string
}>()

const emit = defineEmits<{
  update: []
  keep: []
}>()

useScrollLock()
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('keep')">
      <div class="modal">
        <p class="modal-title">Обновить прогресс?</p>
        <p class="modal-body">
          Вы вернулись к прочитанной ранее главе <b>{{ currentId }}</b>.
          Обновить прогресс или оставить закладку на главе <b>{{ lastId }}</b>?
        </p>
        <div class="modal-actions">
          <button class="btn btn--ghost" @click="emit('update')">
             Обновить до {{ currentId }}
          </button>
          <button class="btn btn--primary" @click="emit('keep')">
             Оставить {{ lastId }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  z-index: var(--z-modal);
  animation: fade-in .15s ease;
}

.modal {
  padding: var(--space-24);
  max-width: 380px;
  width: calc(100% - 40px);
  animation: slide-up .2s ease;
}

.modal-title {
  margin-bottom: 10px;
}

.modal-body {
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--parchment-2);
  opacity: .85;
}

.modal-body b {
  color: var(--ember-soft);
  font-weight: 600;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
