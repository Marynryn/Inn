import { ADMIN, CHAPTERS, READER, SECOND, makeEpub } from './fixtures.ts'

/*
  Посев тестового мира. Сервер к этому моменту уже поднят на пустой базе, где
  есть только admin@tavern.local. Через API, как это сделал бы администратор,
  заводим двух читателей и три главы в двух томах.

  На встроенном fetch, а не на Playwright: тот же посев нужен стенду для
  исследователя, который поднимается обычным node без тестового раннера.
*/
export async function seed(baseURL: string) {
  let cookie = ''
  const call = async (path: string, init: RequestInit) => {
    const res = await fetch(baseURL + path, { ...init, headers: { ...(init.headers ?? {}), cookie } })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]!
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
    return res
  }

  await call('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  })

  for (const user of [READER, SECOND]) {
    await call('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password, role: 'reader' }),
    })
  }

  for (const [i, ch] of CHAPTERS.entries()) {
    const form = new FormData()
    form.set('id', ch.id)
    form.set('title', ch.title)
    form.set('volume', String(ch.volume))
    form.set('publishedAt', new Date(Date.UTC(2026, 0, 1 + i)).toISOString())
    form.set('isPublished', '1')
    form.set('epub', new Blob([await makeEpub(ch.title, ch.paragraphs)], { type: 'application/epub+zip' }), `${ch.id}.epub`)
    await call('/api/admin/chapters', { method: 'POST', body: form })
  }
}

/** Дождаться, пока сервер начнёт отвечать. */
export async function waitForServer(baseURL: string, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(`${baseURL}/api/settings`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Сервер ${baseURL} не поднялся за ${timeoutMs / 1000} с`)
}
