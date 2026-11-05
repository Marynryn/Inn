import { runMigrations } from "../utils/migrate";
import { refreshOriginalChaptersIfStale } from "../utils/original-toc";

/*
  Число глав оригинала подтягиваем на старте, если оно устарело: будильник
  звонит раз в сутки, а новый сервер мог подняться за минуту до него — и день
  показывал бы пустую карточку. Не ждём ответа, чтобы не задерживать запуск.
  Сначала дожидается миграций (на пустой базе таблицы настроек до них нет);
  идёт после offline-guard — в тестах запрос наружу упрётся в заслон и просто
  запишется в лог.
*/
export default defineNitroPlugin(() => {
  // Сначала миграции: на пустой базе таблицы настроек до них ещё нет.
  runMigrations()
    .then(() => refreshOriginalChaptersIfStale())
    .catch((e) =>
      console.warn(
        `[original] не удалось обновить на старте: ${e?.message ?? e}`,
      ),
    );
});
