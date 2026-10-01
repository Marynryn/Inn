<script setup lang="ts">
import type { ProfileSkin, SkinEffect } from '#shared/utils/profileSkins'
import { SKIN_EFFECTS, SKIN_NAME_MAX } from '#shared/utils/profileSkins'

/**
 * Скины публичной страницы в панели: завести, поправить, выдать и забрать —
 * как рамки. Картинка — левый верхний угол, остальные углы код отражает сам.
 */

type AdminSkin = ProfileSkin & { owners: { id: number; name: string; wearing: boolean }[] }
type FoundUser = { id: number; name: string; email: string | null; avatarUrl: string | null }

const skins = ref<AdminSkin[]>([])
const msg = ref('')
const err = ref('')
const busy = ref(false)

const load = async () => {
  skins.value = await $fetch<AdminSkin[]>('/api/admin/skins')
}

const run = async (action: () => Promise<unknown>, done?: string) => {
  busy.value = true
  msg.value = ''
  err.value = ''
  try {
    await action()
    if (done) msg.value = done
    await load()
  } catch (e: any) {
    err.value = e.data?.message || 'Не получилось'
  } finally {
    busy.value = false
  }
}

// ── Новый скин ──────────────────────────────────
const fresh = reactive({ name: '', accent: '#c9b8e6', tint: '#24212a', effects: ['spider', 'dust'] as SkinEffect[] })
const freshFile = ref<File | null>(null)
const freshPreview = ref<string | null>(null)

const onFreshFile = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  freshFile.value = file
  freshPreview.value = file ? URL.createObjectURL(file) : null
}

const create = () => run(async () => {
  if (!freshFile.value) throw { data: { message: 'Выбери картинку угла' } }
  const form = new FormData()
  form.append('name', fresh.name)
  form.append('accent', fresh.accent)
  form.append('tint', fresh.tint)
  form.append('effects', fresh.effects.join(','))
  form.append('image', freshFile.value)
  await $fetch('/api/admin/skins', { method: 'POST', body: form })
  fresh.name = ''
  freshFile.value = null
  freshPreview.value = null
}, 'Скин заведён')

// ── Правка ──────────────────────────────────────
const save = (s: AdminSkin, fields: Record<string, string>, file?: File) => run(async () => {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  if (file) form.append('image', file)
  await $fetch(`/api/admin/skins/${s.id}`, { method: 'PUT', body: form })
}, 'Сохранено')

const toggleEffect = (s: AdminSkin, effect: SkinEffect, on: boolean) => {
  const next = on ? [...s.effects, effect] : s.effects.filter(e => e !== effect)
  return save(s, { effects: next.join(',') })
}

const confirmDelete = ref<number | null>(null)
const remove = (s: AdminSkin) => run(async () => {
  await $fetch(`/api/admin/skins/${s.id}`, { method: 'DELETE' })
  confirmDelete.value = null
}, 'Скин удалён')

// ── Выдача ──────────────────────────────────────
const grantSkinId = ref<number | null>(null)
const userQuery = ref('')
const found = ref<FoundUser[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(userQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (q.trim().length < 2) return void (found.value = [])
  searchTimer = setTimeout(async () => {
    found.value = await $fetch<FoundUser[]>('/api/admin/users', { query: { q: q.trim() } }).catch(() => [])
  }, 250)
})

const grant = (u: FoundUser) => run(async () => {
  const res = await $fetch<{ message: string }>('/api/admin/skins/grant', { method: 'POST', body: { userId: u.id, skinId: grantSkinId.value } })
  msg.value = res.message
  userQuery.value = ''
  found.value = []
})

const revoke = (s: AdminSkin, userId: number) => run(async () => {
  await $fetch('/api/admin/skins/grant', { method: 'POST', body: { userId, skinId: s.id, revoke: true } })
}, 'Скин забран')

watch(skins, (list) => {
  if (!list.some(s => s.id === grantSkinId.value)) grantSkinId.value = list[0]?.id ?? null
})

onMounted(load)
</script>

<template>
  <div class="skins-admin">
    <p class="note">
      Скин — оформление публичной страницы читателя. Картинка — это левый верхний угол
      с прозрачным фоном: остальные углы код отражает сам. Паучка и пылинки рисует код,
      здесь их только включают. Скин виден, только когда его выдали и надели, — читатели
      без скинов раздела в профиле даже не увидят.
    </p>

    <!-- Новый -->
    <div class="new">
      <div class="preview" :style="{ background: fresh.tint }">
        <img v-if="freshPreview" :src="freshPreview" alt="">
        <span v-else>угол</span>
      </div>
      <div class="new-fields">
        <label class="fld">
          <span>Название</span>
          <input v-model="fresh.name" type="text" :maxlength="SKIN_NAME_MAX" placeholder="Паутина">
        </label>
        <label class="fld">
          <span>Картинка угла (png или webp с прозрачностью)</span>
          <input type="file" accept="image/*" @change="onFreshFile">
        </label>
        <div class="row">
          <label class="color"><input v-model="fresh.tint" type="color"> фон</label>
          <label class="color"><input v-model="fresh.accent" type="color"> акцент</label>
          <label v-for="(label, key) in SKIN_EFFECTS" :key="key" class="check">
            <input v-model="fresh.effects" type="checkbox" :value="key"> {{ label }}
          </label>
        </div>
        <button class="btn" type="button" :disabled="busy || !fresh.name.trim()" @click="create">Добавить скин</button>
      </div>
    </div>

    <p v-if="msg" class="msg">{{ msg }}</p>
    <p v-if="err" class="err">{{ err }}</p>

    <!-- Каталог -->
    <h3 class="sub">Каталог ({{ skins.length }})</h3>
    <p v-if="!skins.length" class="empty">Скинов пока нет.</p>

    <div v-for="s in skins" :key="s.id" class="skin">
      <div class="preview" :style="{ background: s.tint }"><img :src="s.url" alt=""></div>
      <div class="skin-main">
        <input
          class="name-in"
          :value="s.name"
          type="text"
          :maxlength="SKIN_NAME_MAX"
          aria-label="Название скина"
          @change="save(s, { name: ($event.target as HTMLInputElement).value })"
        >
        <div class="row">
          <label class="color"><input :value="s.tint" type="color" @change="save(s, { tint: ($event.target as HTMLInputElement).value })"> фон</label>
          <label class="color"><input :value="s.accent" type="color" @change="save(s, { accent: ($event.target as HTMLInputElement).value })"> акцент</label>
          <label v-for="(label, key) in SKIN_EFFECTS" :key="key" class="check">
            <input
              type="checkbox"
              :checked="s.effects.includes(key)"
              @change="toggleEffect(s, key, ($event.target as HTMLInputElement).checked)"
            > {{ label }}
          </label>
          <label class="replace">
            заменить картинку
            <input type="file" accept="image/*" hidden @change="($event.target as HTMLInputElement).files?.[0] && save(s, {}, ($event.target as HTMLInputElement).files![0])">
          </label>
        </div>
        <div class="owners">
          <span class="owners-label">У кого: {{ s.owners.length || 'ни у кого' }}</span>
          <span v-for="o in s.owners" :key="o.id" class="owner">
            {{ o.name }}<template v-if="o.wearing"> · носит</template>
            <button class="x" type="button" :aria-label="`Забрать у ${o.name}`" @click="revoke(s, o.id)">×</button>
          </span>
        </div>
        <div class="row">
          <button v-if="confirmDelete !== s.id" class="link danger" type="button" @click="confirmDelete = s.id">Удалить</button>
          <template v-else>
            <span class="confirm">Удалить скин и забрать у всех?</span>
            <button class="link danger" type="button" :disabled="busy" @click="remove(s)">Да, удалить</button>
            <button class="link" type="button" @click="confirmDelete = null">Отмена</button>
          </template>
        </div>
      </div>
    </div>

    <!-- Выдача -->
    <template v-if="skins.length">
      <h3 class="sub">Выдать скин</h3>
      <div class="row">
        <label class="fld">
          <span>Какой</span>
          <select v-model="grantSkinId">
            <option v-for="s in skins" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="fld grow">
          <span>Кому</span>
          <input v-model="userQuery" type="text" placeholder="имя или почта — от двух букв">
        </label>
      </div>
      <div v-if="found.length" class="found">
        <button v-for="u in found" :key="u.id" class="hit" type="button" :disabled="busy" @click="grant(u)">
          <UserAvatar :src="u.avatarUrl" :name="u.name" :frame="null" :size="26" alt="" />
          <span>{{ u.name }}</span>
          <span class="hit-mail">{{ u.email }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.skins-admin {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.note {
  margin: 0;
  max-width: 70ch;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(241, 230, 210, .6);
}

.empty { margin: 0; font-size: 13px; color: rgba(241, 230, 210, .5); }

.sub {
  margin: 8px 0 0;
  font-size: 14px;
  font-weight: 500;
}

.new,
.skin {
  display: flex;
  gap: 16px;
  padding: 14px;
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
}

.preview {
  position: relative;
  flex: 0 0 120px;
  height: 80px;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid rgba(241, 230, 210, .14);
  display: grid;
  place-items: center;
  font-size: 11px;
  color: rgba(241, 230, 210, .4);
}

.preview img {
  position: absolute;
  left: 0;
  top: 0;
  width: 76px;
  height: 76px;
  object-fit: contain;
}

.new-fields,
.skin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

.fld.grow { flex: 1 1 200px; }

.fld > span {
  font-size: 11px;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: rgba(241, 230, 210, .45);
}

input[type="text"],
select {
  padding: 8px 10px;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  background: rgba(241, 230, 210, .05);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
}

input[type="text"]:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

select option { background: var(--bg-dark-2); }

input[type="file"] {
  font-size: 12px;
  color: rgba(241, 230, 210, .7);
}

.name-in {
  max-width: 320px;
  font-weight: 500;
}

.color,
.check,
.replace {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(241, 230, 210, .75);
  cursor: pointer;
}

.color input {
  width: 28px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.replace { color: var(--ember-soft); }
.replace:hover { text-decoration: underline; }

.owners {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 12.5px;
}

.owners-label { color: rgba(241, 230, 210, .5); }

.owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 10px;
  border-radius: 12px;
  background: rgba(241, 230, 210, .06);
}

.x {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: none;
  color: rgba(241, 230, 210, .5);
  cursor: pointer;
}

.x:hover { color: #e07070; background: rgba(224, 112, 112, .12); }

.btn {
  align-self: flex-start;
  padding: 9px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--ember);
  color: var(--bg-dark);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn:disabled { opacity: .5; cursor: not-allowed; }

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--ember-soft);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}

.link:hover { text-decoration: underline; }
.link.danger { color: #e07070; }
.confirm { font-size: 13px; color: var(--ember-soft); }

.msg, .err { margin: 0; font-size: 13px; }
.msg { color: var(--ember-soft); }
.err { color: #e07070; }

.found {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.hit:hover { background: rgba(241, 230, 210, .05); }
.hit-mail { margin-left: auto; font-size: 12px; color: rgba(241, 230, 210, .45); }

@media (max-width: 600px) {
  .new,
  .skin { flex-direction: column; }
}
</style>
