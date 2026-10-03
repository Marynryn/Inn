<script setup lang="ts">
import { ALL_FIGURES, figureById } from '#shared/utils/nameFigures'
import type { AdminReel } from '#shared/utils/reel'
import type { ReelTextKey } from '#shared/utils/reel'
import {
  REEL_BLUR_DEFAULT, REEL_BLUR_MAX, REEL_DIM_DEFAULT, REEL_DIM_MAX,
  REEL_LABEL_MAX, REEL_SPINS_MAX, REEL_TEXT_KEYS, REEL_TEXT_MAX, REEL_TEXTS, REEL_TITLE_MAX, REEL_WEIGHT_TOTAL,
  percentToWeight, weightToPercent,
} from '#shared/utils/reel'

/**
 * Барабан в панели: сегменты с шансами и тиражом, запуск и завершение ивента,
 * пробная прокрутка и кто что выкрутил. Сегменты правятся у черновика; у
 * запущенного они заморожены, чтобы шансы не менялись посреди ивента.
 */

type CatalogFrame = { id: number; name: string; url: string }
type CatalogSkin = { id: number; name: string; url: string; tint: string }
type LogRow = { id: number; name: string; label: string; outcome: 'won' | 'duplicate' | 'scene'; createdAt: string }

/** Сегмент в редакторе. Шанс — строкой процентов, как его ввели: «2,5». */
type Draft = {
  label: string
  frameId: number | null
  figure: string | null
  skinId: number | null
  image: string | null
  imageUrl: string | null
  text: string
  pct: string
  stock: string
}

const reels = ref<AdminReel[]>([])
const frames = ref<CatalogFrame[]>([])
const skins = ref<CatalogSkin[]>([])
const selectedId = ref<number | null>(null)
const drafts = ref<Draft[]>([])
const title = ref('')
/** Тексты окна в правке: пустое поле — текст по умолчанию, он же в подсказке. */
const texts = ref<Record<ReelTextKey, string>>(Object.fromEntries(REEL_TEXT_KEYS.map(k => [k, ''])) as Record<ReelTextKey, string>)
const textsOpen = ref(false)
/** Фон окна в правке: файл, его адрес для превью, затемнение (%) и размытие (px). */
const bg = ref<string | null>(null)
const bgUrl = ref<string | null>(null)
const bgDim = ref(REEL_DIM_DEFAULT)
const bgBlur = ref(REEL_BLUR_DEFAULT)
const bgOpen = ref(false)
const bgUploading = ref(false)
/** Баннер на главной: картинки для широкого экрана и для телефона. */
const bannerDesk = ref<{ file: string | null; url: string | null }>({ file: null, url: null })
const bannerMob = ref<{ file: string | null; url: string | null }>({ file: null, url: null })
const bannerOpen = ref(false)
const bannerUploading = ref(false)
/** Тексты баннера правятся в его разделе, а не в общем списке текстов окна. */
const BANNER_TEXT_KEYS: ReelTextKey[] = ['bannerTitle', 'bannerText', 'bannerButton']
const windowTextKeys = REEL_TEXT_KEYS.filter(k => !BANNER_TEXT_KEYS.includes(k))
const log = ref<LogRow[]>([])
/** В журнале — только выигрыши: кому какой приз выпал, повторки тоже; без сценок. */
const onlyWon = ref(false)

const newTitle = ref('')
const busy = ref(false)
const msg = ref('')
const err = ref('')
const uploading = ref<number | null>(null)
const confirmFinish = ref(false)
const trialId = ref<number | null>(null)

const selected = computed(() => reels.value.find(r => r.id === selectedId.value) ?? null)
const editable = computed(() => selected.value?.status === 'draft')

const STATUS: Record<AdminReel['status'], string> = { draft: 'черновик', running: 'идёт', finished: 'завершён' }

const toDraft = (r: AdminReel): Draft[] => r.segments.map(s => ({
  label: s.label,
  frameId: s.frameId,
  figure: s.figure,
  skinId: s.skinId,
  image: s.image,
  imageUrl: s.imageUrl,
  text: s.text ?? '',
  pct: String(weightToPercent(s.weight)).replace('.', ','),
  stock: s.stock == null ? '' : String(s.stock),
}))

const pctOf = (d: Draft) => {
  const n = parseFloat(d.pct.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const total = computed(() => drafts.value.reduce((sum, d) => sum + percentToWeight(pctOf(d)), 0))
const totalOk = computed(() => total.value === REEL_WEIGHT_TOTAL)
const fmt = (weight: number) => String(weightToPercent(weight)).replace('.', ',')

/** Рамки, уже стоящие в других барабанах: рамки ивента уникальны. */
const takenElsewhere = computed(() => {
  const map = new Map<number, string>()
  for (const r of reels.value) {
    if (r.id === selectedId.value) continue
    for (const s of r.segments) if (s.frameId) map.set(s.frameId, r.title)
  }
  return map
})

const frameName = (id: number | null) => frames.value.find(f => f.id === id)?.name ?? 'рамка удалена'
const frameUrl = (id: number | null) => frames.value.find(f => f.id === id)?.url ?? null

const skinOf = (id: number | null) => skins.value.find(s => s.id === id) ?? null

/** Приз сегмента одной строкой для выпадающего списка: «f5» — рамка, «gghost» —
 *  фигурка, «s3» — скин, пусто — сценка. */
const prizeKey = (d: Draft) => (d.frameId ? `f${d.frameId}` : d.figure ? `g${d.figure}` : d.skinId ? `s${d.skinId}` : '')
const isPrize = (d: Draft) => Boolean(d.frameId || d.figure || d.skinId)
const picOf = (d: Draft) => d.frameId
  ? frameUrl(d.frameId)
  : d.figure ? figureById(d.figure)?.big ?? null : d.skinId ? skinOf(d.skinId)?.url ?? null : d.imageUrl
const prizeName = (d: Draft) => d.frameId
  ? frameName(d.frameId)
  : d.figure ? figureById(d.figure)?.name ?? '' : skinOf(d.skinId)?.name ?? ''

const load = async () => {
  const [list, catalog, skinList] = await Promise.all([
    $fetch<AdminReel[]>('/api/admin/reels'),
    $fetch<{ frames: CatalogFrame[] }>('/api/admin/frames'),
    $fetch<CatalogSkin[]>('/api/admin/skins'),
  ])
  reels.value = list
  frames.value = catalog.frames
  skins.value = skinList
  if (!list.some(r => r.id === selectedId.value)) selectedId.value = list[0]?.id ?? null
  select(selectedId.value)
}

const select = async (id: number | null) => {
  selectedId.value = id
  confirmFinish.value = false
  const r = selected.value
  drafts.value = r ? toDraft(r) : []
  title.value = r?.title ?? ''
  for (const k of REEL_TEXT_KEYS) texts.value[k] = r?.texts[k] ?? ''
  bg.value = r?.background ?? null
  bgUrl.value = r?.look.background ?? null
  bgDim.value = r?.look.dim ?? REEL_DIM_DEFAULT
  bgBlur.value = r?.look.blur ?? REEL_BLUR_DEFAULT
  bannerDesk.value = { file: r?.bannerDesk ?? null, url: r?.banner.desk ?? null }
  bannerMob.value = { file: r?.bannerMob ?? null, url: r?.banner.mob ?? null }
  await loadLog()
}

const loadLog = async () => {
  const r = selected.value
  log.value = r && r.status !== 'draft'
    ? await $fetch<LogRow[]>(`/api/admin/reels/${r.id}/log`, { query: onlyWon.value ? { won: 1 } : {} }).catch(() => [])
    : []
}

const run = async (action: () => Promise<unknown>, done?: string) => {
  busy.value = true
  msg.value = ''
  err.value = ''
  try {
    await action()
    if (done) msg.value = done
    return true
  } catch (e: any) {
    err.value = e.data?.message || 'Не получилось'
    return false
  } finally {
    busy.value = false
  }
}

const create = () => run(async () => {
  const { id } = await $fetch<{ id: number }>('/api/admin/reels', { method: 'POST', body: { title: newTitle.value } })
  newTitle.value = ''
  selectedId.value = id
  await load()
}, 'Барабан заведён — добавь сегменты')

const addSegment = (kind: 'frame' | 'figure' | 'skin' | 'scene') => {
  const free = frames.value.find(f => !takenElsewhere.value.has(f.id) && !drafts.value.some(d => d.frameId === f.id))
  const freeFigure = ALL_FIGURES.find(g => !drafts.value.some(d => d.figure === g.id))
  const freeSkin = skins.value.find(s => !drafts.value.some(d => d.skinId === s.id))
  const label = kind === 'frame' ? free?.name : kind === 'figure' ? freeFigure?.name : kind === 'skin' ? freeSkin?.name : ''
  drafts.value.push({
    label: (label ?? '').slice(0, REEL_LABEL_MAX),
    frameId: kind === 'frame' ? (free?.id ?? null) : null,
    figure: kind === 'figure' ? (freeFigure?.id ?? null) : null,
    skinId: kind === 'skin' ? (freeSkin?.id ?? null) : null,
    image: null,
    imageUrl: null,
    text: '',
    pct: '0',
    stock: '',
  })
}

/** Выбрали приз — подставляем его имя, если своё ещё не придумано. */
const onPrizePick = (d: Draft, key: string) => {
  const before = prizeName(d).slice(0, REEL_LABEL_MAX)
  d.frameId = key.startsWith('f') ? Number(key.slice(1)) : null
  d.figure = key.startsWith('g') ? key.slice(1) : null
  d.skinId = key.startsWith('s') ? Number(key.slice(1)) : null
  if (isPrize(d) && (!d.label || d.label === before)) d.label = prizeName(d).slice(0, REEL_LABEL_MAX)
}

const uploadImage = async (d: Draft, i: number, e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = i
  err.value = ''
  try {
    const form = new FormData()
    form.append('image', file)
    const res = await $fetch<{ file: string; url: string }>('/api/admin/reel-images', { method: 'POST', body: form })
    d.image = res.file
    d.imageUrl = res.url
  } catch (e: any) {
    err.value = e.data?.message || 'Картинка не загрузилась'
  } finally {
    uploading.value = null
  }
}

const payload = () => ({
  title: title.value,
  texts: texts.value,
  segments: drafts.value.map(d => ({
    label: d.label,
    frameId: d.frameId,
    figure: d.frameId ? null : d.figure,
    skinId: d.frameId || d.figure ? null : d.skinId,
    image: isPrize(d) ? null : d.image,
    text: isPrize(d) ? null : d.text,
    weight: percentToWeight(pctOf(d)),
    stock: isPrize(d) && d.stock ? Number(d.stock) : null,
  })),
})

const save = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: payload() })
  await load()
}, 'Сохранено')

const saveTitle = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: { title: title.value } })
  await load()
}, 'Название сохранено')

/** Тексты окна — отдельной кнопкой: у идущего барабана сегменты заморожены, а слова нет. */
const changedTexts = computed(() => REEL_TEXT_KEYS.filter(k => texts.value[k].trim()).length)
const saveTexts = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: { title: title.value, texts: texts.value } })
  await load()
}, 'Тексты сохранены')

/** Фон ужимаем ещё в браузере: обои с телефона бывают 4096 px и тяжелее
 *  мегабайта, а окну барабана хватает 2000 по длинной стороне. Сервер сам
 *  картинки не пережимает, только проверяет — так через него проходит любая. */
const BG_SIDE = 2000
const shrinkBg = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, BG_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const encode = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.85))
  // Старый Safari webp не пишет и молча отдаёт png — тогда jpeg.
  const webp = await encode('image/webp')
  return webp?.type === 'image/webp' ? webp : (await encode('image/jpeg'))!
}

/** Фон окна — отдельной кнопкой, как и тексты: менять его можно и посреди ивента. */
const uploadBg = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  bgUploading.value = true
  err.value = ''
  try {
    const form = new FormData()
    form.append('image', await shrinkBg(file))
    form.append('kind', 'bg')
    const res = await $fetch<{ file: string; url: string }>('/api/admin/reel-images', { method: 'POST', body: form })
    bg.value = res.file
    bgUrl.value = res.url
  } catch (e: any) {
    err.value = e.data?.message || 'Фон не загрузился'
  } finally {
    bgUploading.value = false
    input.value = ''
  }
}

const removeBg = () => {
  bg.value = null
  bgUrl.value = null
}

const saveBg = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, {
    method: 'PUT',
    body: { title: title.value, background: bg.value, bgDim: bgDim.value, bgBlur: bgBlur.value },
  })
  await load()
}, 'Фон сохранён')

/** Картинка баннера — тем же путём, что фон: ужать в браузере, положить файл. */
const uploadBanner = async (e: Event, target: typeof bannerDesk) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  bannerUploading.value = true
  err.value = ''
  try {
    const form = new FormData()
    form.append('image', await shrinkBg(file))
    form.append('kind', 'banner')
    target.value = await $fetch<{ file: string; url: string }>('/api/admin/reel-images', { method: 'POST', body: form })
  } catch (e: any) {
    err.value = e.data?.message || 'Картинка не загрузилась'
  } finally {
    bannerUploading.value = false
    input.value = ''
  }
}

const saveBanner = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, {
    method: 'PUT',
    body: { title: title.value, texts: texts.value, bannerDesk: bannerDesk.value.file, bannerMob: bannerMob.value.file },
  })
  await load()
}, 'Баннер сохранён')

/** Превью фона: та же картинка под тем же затемнением, что и в окне. */
const bgPreview = computed(() => {
  if (!bgUrl.value) return {}
  const dim = `rgba(20, 14, 10, ${bgDim.value / 100})`
  return { backgroundImage: `linear-gradient(${dim}, ${dim}), url("${bgUrl.value}")` }
})

/** Попыток в день — сохраняется сразу, как и «только для админов». */
const setSpinsPerDay = (raw: string) => {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 1) return
  run(async () => {
    await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: { title: title.value, spinsPerDay: n } })
    await load()
  }, `Попыток в день: ${Math.min(n, REEL_SPINS_MAX)}`)
}

/** «Только для админов» сохраняется сразу — и у идущего барабана тоже. */
const setAdminsOnly = (adminsOnly: boolean) => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: { title: title.value, adminsOnly } })
  await load()
}, adminsOnly ? 'Теперь барабан видят только админы' : 'Барабан открыт читателям')

const start = async () => {
  const adminsOnly = selected.value?.adminsOnly
  await run(async () => {
    await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: payload() })
    await $fetch(`/api/admin/reels/${selectedId.value}/start`, { method: 'POST' })
    await load()
  }, adminsOnly
    ? 'Барабан запущен для админов — читатели его пока не видят'
    : 'Барабан запущен — читатели увидят приглашение в колокольчике')
}

const finish = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}/finish`, { method: 'POST' })
  await load()
}, 'Ивент завершён')

const remove = () => run(async () => {
  await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'DELETE' })
  selectedId.value = null
  await load()
}, 'Черновик удалён')

/** Пробуют то, что сохранено: у черновика сначала сохраняем правки. */
const trial = async () => {
  if (editable.value && !(await run(async () => {
    await $fetch(`/api/admin/reels/${selectedId.value}`, { method: 'PUT', body: payload() })
    await load()
  }))) return
  trialId.value = selectedId.value
}

const OUTCOME: Record<LogRow['outcome'], string> = { won: 'выиграл', duplicate: 'повторка', scene: 'сценка' }
const when = (raw: string) => new Date(`${raw.replace(' ', 'T')}Z`)
  .toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

onMounted(load)
</script>

<template>
  <div class="reel-admin">
    <p class="note">
      Читатель крутит раз в день, пока барабан идёт. Сегмент с рамкой, фигуркой у имени или скином
      страницы — приз, без них — сценка: картинка и пара строк вместо пустоты. Выпал приз, который уже есть, — это
      повторка, тираж она не тратит. Кончился тираж — шанс приза делится между остальными.
    </p>

    <!-- Список барабанов -->
    <div class="reel-list">
      <button
        v-for="r in reels"
        :key="r.id"
        type="button"
        class="reel-chip"
        :class="{ active: r.id === selectedId }"
        @click="select(r.id)"
      >
        <span class="chip-title">{{ r.title }}</span>
        <span class="status" :class="r.status">{{ STATUS[r.status] }}</span>
      </button>

      <form class="new-reel" @submit.prevent="create">
        <input v-model="newTitle" type="text" :maxlength="REEL_TITLE_MAX" placeholder="Осень 2026" aria-label="Название нового барабана">
        <button class="btn" type="submit" :disabled="busy || !newTitle.trim()">+ Новый барабан</button>
      </form>
    </div>

    <p v-if="!reels.length" class="empty">Барабанов пока нет. Заведи первый — он появится черновиком.</p>

    <template v-if="selected">
      <div class="head">
        <input
          v-model="title"
          class="title-in"
          type="text"
          :maxlength="REEL_TITLE_MAX"
          aria-label="Название барабана"
          @change="!editable && saveTitle()"
        >
        <span class="status" :class="selected.status">{{ STATUS[selected.status] }}</span>
      </div>

      <label v-if="selected.status !== 'finished'" class="admins-only">
        <input
          type="checkbox"
          :checked="selected.adminsOnly"
          :disabled="busy"
          @change="setAdminsOnly(($event.target as HTMLInputElement).checked)"
        >
        <span>
          Только для админов — проба. Читатели барабана не видят: ни приглашения, ни окна.
          Сними галочку, когда захочешь открыть его всем.
        </span>
      </label>

      <p v-if="selected.status === 'running'" class="note">
        Барабан идёт: сегменты заморожены, чтобы шансы не менялись для тех, кто крутит позже.
      </p>
      <p v-else-if="selected.status === 'finished'" class="note">
        Ивент завершён. Выигранные призы остались у читателей.
      </p>

      <!-- Сегменты -->
      <div class="segs">
        <div v-for="(d, i) in drafts" :key="i" class="seg" :class="{ scene: !isPrize(d) }">
          <div class="seg-pic">
            <img v-if="picOf(d)" :src="picOf(d)!" alt="">
            <span v-else class="no-pic">нет картинки</span>
          </div>

          <div class="seg-main">
            <div class="seg-row">
              <label class="fld grow">
                <span>Название</span>
                <input v-model="d.label" type="text" :maxlength="REEL_LABEL_MAX" :disabled="!editable">
              </label>

              <label class="fld">
                <span>Приз</span>
                <select :value="prizeKey(d)" :disabled="!editable" @change="onPrizePick(d, ($event.target as HTMLSelectElement).value)">
                  <option value="">Сценка — без приза</option>
                  <optgroup label="Рамки">
                    <option
                      v-for="f in frames"
                      :key="f.id"
                      :value="`f${f.id}`"
                      :disabled="takenElsewhere.has(f.id) || drafts.some((o, j) => j !== i && o.frameId === f.id)"
                    >
                      {{ f.name }}{{ takenElsewhere.has(f.id) ? ` — в «${takenElsewhere.get(f.id)}»` : '' }}
                    </option>
                  </optgroup>
                  <optgroup v-if="skins.length" label="Скины страницы">
                    <option
                      v-for="sk in skins"
                      :key="sk.id"
                      :value="`s${sk.id}`"
                      :disabled="drafts.some((o, j) => j !== i && o.skinId === sk.id)"
                    >
                      {{ sk.name }}
                    </option>
                  </optgroup>
                  <optgroup label="Фигурки у имени">
                    <option
                      v-for="g in ALL_FIGURES"
                      :key="g.id"
                      :value="`g${g.id}`"
                      :disabled="drafts.some((o, j) => j !== i && o.figure === g.id)"
                    >
                      {{ g.name }}
                    </option>
                  </optgroup>
                </select>
              </label>

              <label class="fld num">
                <span>Шанс, %</span>
                <input v-model="d.pct" type="text" inputmode="decimal" :disabled="!editable">
              </label>

              <label v-if="isPrize(d)" class="fld num">
                <span>Тираж</span>
                <input v-model="d.stock" type="number" min="1" step="1" placeholder="∞" :disabled="!editable">
              </label>

              <button
                v-if="editable"
                class="rm"
                type="button"
                aria-label="Убрать сегмент"
                @click="drafts.splice(i, 1)"
              >×</button>
            </div>

            <div v-if="!isPrize(d)" class="seg-row">
              <label class="fld grow">
                <span>Текст сценки</span>
                <input
                  v-model="d.text"
                  type="text"
                  :maxlength="REEL_TEXT_MAX"
                  placeholder="Эрин налила тебе супа. Рамки нет, но суп правда хороший."
                  :disabled="!editable"
                >
              </label>
              <label v-if="editable" class="fld">
                <span>{{ uploading === i ? 'Грузим…' : 'Картинка' }}</span>
                <input type="file" accept="image/*" @change="uploadImage(d, i, $event)">
              </label>
            </div>

            <p v-if="selected.status !== 'draft'" class="seg-stat">
              выпал {{ selected.segments[i]?.landed ?? 0 }} раз
              <template v-if="isPrize(d)">
                · выдано {{ selected.segments[i]?.won ?? 0 }}{{ d.stock ? ` из ${d.stock}` : '' }}
                · повторок {{ selected.segments[i]?.duplicates ?? 0 }}
              </template>
            </p>
          </div>
        </div>
      </div>

      <div v-if="editable" class="add-row">
        <button class="link" type="button" @click="addSegment('frame')">+ Рамка</button>
        <button class="link" type="button" @click="addSegment('figure')">+ Фигурка</button>
        <button v-if="skins.length" class="link" type="button" @click="addSegment('skin')">+ Скин</button>
        <button class="link" type="button" @click="addSegment('scene')">+ Сценка</button>
      </div>

      <p class="sum" :class="totalOk ? 'ok' : 'bad'">
        Итого {{ fmt(total) }}%
        <template v-if="totalOk">✓</template>
        <template v-else-if="total < REEL_WEIGHT_TOTAL"> — не хватает {{ fmt(REEL_WEIGHT_TOTAL - total) }}%</template>
        <template v-else> — лишние {{ fmt(total - REEL_WEIGHT_TOTAL) }}%</template>
      </p>

      <label v-if="selected.status !== 'finished'" class="per-day">
        <span>Попыток в день у читателя</span>
        <input
          type="number"
          min="1"
          :max="REEL_SPINS_MAX"
          step="1"
          :value="selected.spinsPerDay"
          :disabled="busy"
          @change="setSpinsPerDay(($event.target as HTMLInputElement).value)"
        >
      </label>

      <!-- Тексты окна -->
      <details v-if="selected.status !== 'finished'" class="texts" :open="textsOpen" @toggle="textsOpen = ($event.target as HTMLDetailsElement).open">
        <summary>
          Тексты окна и приглашения
          <span v-if="changedTexts" class="texts-count">изменено: {{ changedTexts }}</span>
        </summary>
        <p class="note">Пустое поле — текст по умолчанию, он виден серым. Править можно и у идущего барабана.</p>
        <div class="texts-grid">
          <label v-for="k in windowTextKeys" :key="k" class="fld">
            <span>{{ REEL_TEXTS[k].label }}</span>
            <input v-model="texts[k]" type="text" :maxlength="REEL_TEXT_MAX" :placeholder="REEL_TEXTS[k].value">
          </label>
        </div>
        <button class="btn ghost" type="button" :disabled="busy" @click="saveTexts">Сохранить тексты</button>
      </details>

      <!-- Фон окна -->
      <details v-if="selected.status !== 'finished'" class="texts" :open="bgOpen" @toggle="bgOpen = ($event.target as HTMLDetailsElement).open">
        <summary>
          Фон окна
          <span v-if="selected.background" class="texts-count">есть</span>
        </summary>
        <p class="note">Картинка во всё окно барабана, лучше вертикальная. Большую админка сама уменьшит перед загрузкой. Без фона окно тёмное. Менять можно и у идущего барабана.</p>
        <div class="bg-row">
          <div class="bg-preview" :class="{ empty: !bgUrl }" :style="bgPreview">
            <span v-if="!bgUrl">нет фона</span>
          </div>
          <div class="bg-controls">
            <label class="btn ghost bg-upload">
              {{ bgUploading ? 'Загружаем…' : bgUrl ? 'Заменить картинку' : 'Загрузить картинку' }}
              <input type="file" accept="image/*" :disabled="bgUploading" @change="uploadBg">
            </label>
            <button v-if="bgUrl" class="link danger" type="button" @click="removeBg">Убрать фон</button>
            <label class="bg-range" for="reel-bg-dim">
              <span>Затемнение</span>
              <input id="reel-bg-dim" v-model.number="bgDim" type="range" min="0" :max="REEL_DIM_MAX" step="5">
              <output>{{ bgDim }} %</output>
            </label>
            <label class="bg-range" for="reel-bg-blur">
              <span>Размытие под линией</span>
              <input id="reel-bg-blur" v-model.number="bgBlur" type="range" min="0" :max="REEL_BLUR_MAX" step="1">
              <output>{{ bgBlur }} px</output>
            </label>
          </div>
        </div>
        <button class="btn ghost" type="button" :disabled="busy || bgUploading" @click="saveBg">Сохранить фон</button>
      </details>

      <!-- Баннер на главной -->
      <details v-if="selected.status !== 'finished'" class="texts" :open="bannerOpen" @toggle="bannerOpen = ($event.target as HTMLDetailsElement).open">
        <summary>
          Баннер на главной
          <span v-if="selected.bannerDesk || selected.bannerMob" class="texts-count">есть</span>
        </summary>
        <p class="note">
          Пока барабан идёт, баннер стоит на главной вместо плашки игры; у барабана «только для админов» его видят только админы.
          Широкая картинка — для компьютера (около 2000 × 280), вторая — для телефона. Без картинки для телефона там будет широкая.
        </p>
        <div class="banner-row">
          <div v-for="b in [{ key: 'desk', label: 'Компьютер', ref: bannerDesk }, { key: 'mob', label: 'Телефон', ref: bannerMob }]" :key="b.key" class="banner-slot">
            <span class="banner-label">{{ b.label }}</span>
            <div class="banner-preview" :class="[b.key, { empty: !b.ref.value.url }]" :style="b.ref.value.url ? { backgroundImage: `url(&quot;${b.ref.value.url}&quot;)` } : {}">
              <span v-if="!b.ref.value.url">нет картинки</span>
            </div>
            <label class="btn ghost bg-upload">
              {{ bannerUploading ? 'Загружаем…' : b.ref.value.url ? 'Заменить' : 'Загрузить' }}
              <input type="file" accept="image/*" :disabled="bannerUploading" @change="uploadBanner($event, b.ref)">
            </label>
            <button v-if="b.ref.value.url" class="link danger" type="button" @click="b.ref.value = { file: null, url: null }">Убрать</button>
          </div>
        </div>
        <div class="texts-grid">
          <label v-for="k in BANNER_TEXT_KEYS" :key="k" class="fld">
            <span>{{ REEL_TEXTS[k].label }}</span>
            <input v-model="texts[k]" type="text" :maxlength="REEL_TEXT_MAX" :placeholder="REEL_TEXTS[k].value">
          </label>
        </div>
        <button class="btn ghost" type="button" :disabled="busy || bannerUploading" @click="saveBanner">Сохранить баннер</button>
      </details>

      <div class="actions">
        <template v-if="editable">
          <button class="btn ghost" type="button" :disabled="busy" @click="save">Сохранить</button>
          <button class="btn ghost" type="button" :disabled="busy || drafts.length < 1" @click="trial">Пробная прокрутка</button>
          <button class="btn" type="button" :disabled="busy || !totalOk || drafts.length < 2" @click="start">Запустить</button>
          <button class="link danger" type="button" :disabled="busy" @click="remove">Удалить черновик</button>
        </template>
        <template v-else-if="selected.status === 'running'">
          <button class="btn ghost" type="button" @click="trial">Пробная прокрутка</button>
          <button v-if="!confirmFinish" class="btn ghost" type="button" @click="confirmFinish = true">Завершить ивент</button>
          <template v-else>
            <span class="confirm">Завершить? Крутить больше будет нельзя.</span>
            <button class="btn danger" type="button" :disabled="busy" @click="finish">Да, завершить</button>
            <button class="link" type="button" @click="confirmFinish = false">Отмена</button>
          </template>
        </template>
      </div>

      <p v-if="msg" class="msg">{{ msg }}</p>
      <p v-if="err" class="err">{{ err }}</p>

      <!-- Кто что выкрутил -->
      <div v-if="selected.status !== 'draft'" class="log">
        <div class="log-head">
          <h3>Попытки · {{ selected.spins }} от {{ selected.players }} чел.</h3>
          <label class="log-filter">
            <input v-model="onlyWon" type="checkbox" @change="loadLog">
            <span>Только выигрыши</span>
          </label>
        </div>
        <p v-if="!log.length" class="empty">{{ onlyWon ? 'Выигрышей пока нет.' : 'Пока никто не крутил.' }}</p>
        <p v-else-if="onlyWon" class="note">Выигрышей: {{ log.length }}{{ log.length >= 500 ? ' (показаны последние 500)' : '' }}</p>
        <div v-for="row in log" :key="row.id" class="log-row">
          <span class="log-who">{{ row.name }}</span>
          <span class="log-what">{{ row.label }} <em :class="row.outcome">{{ OUTCOME[row.outcome] }}</em></span>
          <span class="log-when">{{ when(row.createdAt) }}</span>
        </div>
      </div>
    </template>

    <ReelModal v-if="trialId" :trial-id="trialId" @close="trialId = null" />
  </div>
</template>

<style scoped>
.reel-admin {
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

.empty {
  margin: 0;
  font-size: 13px;
  color: rgba(241, 230, 210, .5);
}

/* ── Барабаны ───────────────────────────────── */
.reel-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.reel-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid rgba(241, 230, 210, .14);
  border-radius: var(--radius-md);
  background: none;
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}

.reel-chip.active {
  border-color: var(--ember-soft);
  background: rgba(241, 230, 210, .05);
}

.status {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.status.draft { color: var(--ember-soft); background: rgba(232, 176, 122, .12); }
.status.running { color: #8fb07a; background: rgba(143, 176, 122, .13); }
.status.finished { color: rgba(241, 230, 210, .5); background: rgba(241, 230, 210, .07); }

.new-reel {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* ── Поля ───────────────────────────────────── */
input,
select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(241, 230, 210, .18);
  border-radius: var(--radius-sm);
  background: rgba(241, 230, 210, .05);
  color: var(--parchment);
  font-family: var(--font-body);
  font-size: 13px;
}

input:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--ember-soft);
}

input:disabled,
select:disabled {
  border-color: transparent;
  background: transparent;
  padding-left: 0;
  opacity: 1;
}

input[type="file"] {
  border: none;
  padding: 4px 0;
  background: none;
  font-size: 12px;
}

select option { background: var(--bg-dark-2); }

.new-reel input { width: 180px; }

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-in {
  max-width: 340px;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
}

/* ── Сегменты ───────────────────────────────── */
.segs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.seg {
  display: flex;
  gap: 14px;
  padding: 12px;
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
  background: rgba(241, 230, 210, .02);
}

.texts {
  margin: 4px 0 16px;
  padding: 10px 14px;
  border: 1px solid rgba(241, 230, 210, .1);
  border-radius: var(--radius-md);
}

.texts summary {
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
}

.texts-count {
  margin-left: 6px;
  font-weight: 400;
  color: var(--ember-soft);
}

.texts[open] summary { margin-bottom: 8px; }

.texts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 10px 14px;
  margin-bottom: 12px;
}

.texts-grid input { width: 100%; min-width: 0; }

.bg-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}

/* Окно барабана в миниатюре: пропорция и затемнение как у настоящего. */
.bg-preview {
  width: 120px;
  aspect-ratio: 9 / 14;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  border: 1px solid rgba(241, 230, 210, .15);
  background-color: var(--bg-dark-2);
  background-size: cover;
  background-position: center;
}

.banner-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}

.banner-slot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.banner-slot:first-child {
  flex: 1 1 320px;
  min-width: 0;
}

.banner-label {
  font-size: 12px;
  color: rgba(241, 230, 210, .6);
}

/* Миниатюры в пропорциях настоящих плашек: широкая и телефонная. */
.banner-preview {
  border-radius: var(--radius-md);
  border: 1px solid rgba(241, 230, 210, .15);
  background-color: var(--bg-dark-2);
  background-size: cover;
  background-position: center;
}

.banner-preview.desk {
  width: 100%;
  aspect-ratio: 50 / 7;
}

.banner-preview.mob {
  width: 180px;
  aspect-ratio: 16 / 9;
}

.banner-preview.empty,
.bg-preview.empty {
  display: grid;
  place-items: center;
  font-size: 12px;
  color: rgba(241, 230, 210, .45);
}

.bg-controls {
  flex: 1 1 220px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.bg-upload {
  position: relative;
  cursor: pointer;
}

.bg-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.bg-range {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 10px;
  width: 100%;
  max-width: 320px;
  font-size: 13px;
  color: rgba(241, 230, 210, .75);
}

.bg-range span { grid-column: 1 / -1; }
.bg-range input { min-width: 0; accent-color: var(--ember); }
.bg-range output { font-variant-numeric: tabular-nums; color: var(--parchment); }

.per-day {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  font-size: 13px;
  color: rgba(241, 230, 210, .75);
}

.per-day input {
  width: 72px;
  flex: none;
}

.admins-only {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0 14px;
  font-size: 13px;
  color: rgba(241, 230, 210, .75);
  cursor: pointer;
}

.admins-only input {
  flex: none;
  width: auto;
  margin: 3px 0 0;
  accent-color: var(--ember);
}

.admins-only span {
  flex: 1;
  max-width: 60ch;
}

.seg.scene {
  border-style: dashed;
}

.seg-pic {
  flex: 0 0 64px;
  height: 64px;
  display: grid;
  place-items: center;
}

.seg-pic img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.no-pic {
  font-size: 10.5px;
  line-height: 1.2;
  text-align: center;
  color: #e07070;
}

.seg-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.seg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 10px;
}

.fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
}

.fld > span {
  font-size: 11px;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: rgba(241, 230, 210, .45);
}

.fld.grow { flex: 1 1 180px; }
.fld.num { flex: 0 0 84px; min-width: 84px; }
.fld.num input { font-variant-numeric: tabular-nums; }

.rm {
  width: 32px;
  height: 34px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: rgba(241, 230, 210, .45);
  font-size: 18px;
  cursor: pointer;
}

.rm:hover { color: #e07070; background: rgba(224, 112, 112, .1); }

.seg-stat {
  margin: 0;
  font-size: 12px;
  color: rgba(241, 230, 210, .55);
  font-variant-numeric: tabular-nums;
}

.add-row {
  display: flex;
  gap: 18px;
}

.sum {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.sum.ok { color: #8fb07a; }
.sum.bad { color: #e07070; }

/* ── Кнопки ─────────────────────────────────── */
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.btn {
  padding: 9px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--ember);
  color: var(--bg-dark);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.btn:disabled { opacity: .45; cursor: not-allowed; }

.btn.ghost {
  border: 1px solid rgba(241, 230, 210, .22);
  background: none;
  color: var(--parchment);
}

.btn.danger { background: #c0574a; color: var(--parchment); }

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

.confirm {
  font-size: 13px;
  color: var(--ember-soft);
}

.msg,
.err {
  margin: 0;
  font-size: 13px;
}

.msg { color: var(--ember-soft); }
.err { color: #e07070; }

/* ── Журнал ─────────────────────────────────── */
.log {
  padding-top: 14px;
  border-top: 1px solid rgba(241, 230, 210, .1);
}

.log-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 14px;
  margin-bottom: 10px;
}

.log-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(241, 230, 210, .75);
  cursor: pointer;
}

.log-filter input {
  flex: none;
  width: auto;
  margin: 0;
  accent-color: var(--ember);
}

.log h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.log-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 7px 0;
  border-top: 1px solid rgba(241, 230, 210, .06);
  font-size: 13px;
}

.log-who { font-weight: 500; }
.log-what { color: rgba(241, 230, 210, .7); }

.log-what em {
  margin-left: 6px;
  font-style: normal;
  font-size: 11.5px;
}

.log-what em.won { color: #8fb07a; }
.log-what em.duplicate { color: var(--ember-soft); }
.log-what em.scene { color: rgba(241, 230, 210, .45); }

.log-when {
  margin-left: auto;
  color: rgba(241, 230, 210, .45);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 600px) {
  .new-reel { margin-left: 0; width: 100%; }
  /* Без min-width: 0 поле держит свою ширину по умолчанию и выталкивает кнопку за край. */
  .new-reel input { flex: 1; width: auto; min-width: 0; }
  .new-reel .btn { flex: none; }
  .head { flex-wrap: wrap; }
  .title-in { min-width: 0; flex: 1; }
  .seg { flex-direction: column; }
}
</style>
