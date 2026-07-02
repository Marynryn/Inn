<script setup lang="ts">
defineProps<{
  currentId: string
  lastId: string
}>()

const emit = defineEmits<{
  update: []
  keep: []
}>()
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
          <button class="btn-keep" @click="emit('update')">
             Обновить до {{ currentId }}
          </button>
          <button class="btn-update" @click="emit('keep')">
             Оставить {{ lastId }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 10, .7);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fade-in .15s ease;
}

.modal {
  background: var(--bg-dark-2);
  border: 1px solid rgba(241, 230, 210, .12);
  border-radius: var(--radius-md);
  padding: 28px 32px;
  max-width: 380px;
  width: calc(100% - 40px);
  animation: slide-up .2s ease;
}

.modal-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--parchment);
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

.btn-keep {
  background: none;
  border: 1px solid rgba(241, 230, 210, .2);
  color: var(--parchment-2);
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  transition: border-color .15s;
}

.btn-keep:hover {
  border-color: rgba(241, 230, 210, .4);
}

.btn-update {
  background: var(--ember);
  border: none;
  color: var(--bg-dark);
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity .15s;
}

.btn-update:hover {
  opacity: .88;
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
