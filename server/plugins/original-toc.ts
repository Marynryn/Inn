import { refreshOriginalChaptersIfStale } from '../utils/original-toc'
import { isDemo } from '../utils/demo/seed'

/*
  Число глав оригинала подтягиваем на старте, если оно устарело: будильник
  звонит раз в сутки, а новый сервер мог подняться за минуту до него — и день
  показывал бы пустую карточку. Не ждём ответа, чтобы не задерживать запуск.
  Идёт после migrate (таблица настроек уже есть) и offline-guard (в тестах
  запрос наружу упрётся в заслон и просто запишется в лог).
*/
export default defineNitroPlugin(() => {
  // У выдуманной книги демо-стенда оригинала нет — считать нечего.
  if (isDemo()) return
  refreshOriginalChaptersIfStale()
})
