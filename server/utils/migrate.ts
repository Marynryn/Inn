import { createClient } from "@libsql/client";
import { maintenance } from "../database/maintenance";
import { MIGRATIONS } from "../database/migrations";

/**
 * Миграции и уборка на старте. Миграции нумерованные (server/database/
 * migrations): номер последней выполненной хранится в самой базе, в PRAGMA
 * user_version, и каждая идёт один раз. Ошибка не глотается: миграция
 * откатывается целиком, в лог уходит, на чём упало, а версия остаётся
 * прежней — следующий старт попробует снова.
 */
export async function runMigrations() {
  const storageDir = process.env.STORAGE_DIR || "storage";
  const client = createClient({ url: `file:${storageDir}/db.sqlite` });
  // Nitro не ждёт плагин миграций: сайт уже отвечает, пока они идут, и запросы
  // держат базу. Без ожидания соседнее чтение роняло бы миграцию с SQLITE_BUSY.
  await client.execute("PRAGMA busy_timeout = 5000");

  try {
    let version = await userVersion(client);
    const latest = MIGRATIONS.at(-1)?.version ?? 0;
    if (version > latest)
      console.warn(
        `[migrate] база новее кода: версия ${version}, код знает до ${latest}`,
      );

    for (const m of MIGRATIONS) {
      if (m.version <= version) continue;
      console.log(`[migrate] ${m.version}: ${m.name}`);

      if (m.transaction === false) {
        await m.up(client, { storageDir });
        await client.execute(`PRAGMA user_version = ${m.version}`);
      } else {
        const tx = await client.transaction("write");
        try {
          await m.up(tx, { storageDir });
          await tx.execute(`PRAGMA user_version = ${m.version}`);
          await tx.commit();
        } catch (e) {
          await tx.rollback();
          throw e;
        } finally {
          tx.close();
        }
      }
      version = m.version;
    }

    await maintenance(client);
  } catch (e) {
    console.error(
      "[migrate] ОШИБКА: база не доведена до текущей схемы. Сайт работает на прежней, миграция повторится при следующем старте.",
      e,
    );
    throw e;
  } finally {
    client.close();
  }
}

async function userVersion(client: ReturnType<typeof createClient>) {
  const res = await client.execute("PRAGMA user_version");
  return Number(res.rows[0]?.user_version ?? 0);
}
