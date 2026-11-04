import { makeSnapshot } from "../utils/backup";

/** Ночной снимок базы в storage/backups — см. utils/backup.ts. */
export default defineTask<unknown>({
  meta: {
    name: "backup-db",
    description: "Снимок базы в storage/backups, последние 7",
  },
  async run({ payload }) {
    // В деве незачем копить снимки локальной базы по расписанию. Вручную —
    // /_nitro/tasks/backup-db?force=1 — можно: так его проверяют тесты.
    if (import.meta.dev && !payload?.force)
      return { result: { skipped: "dev" } };

    try {
      const snapshot = await makeSnapshot();
      console.log(
        `[backup] ${snapshot.file}: ${(snapshot.bytes / 1024 / 1024).toFixed(1)} МБ`,
      );
      return { result: snapshot };
    } catch (e: any) {
      console.error(`[backup] снимок не удался: ${e?.message ?? e}`);
      return { result: { error: String(e?.message ?? e) } };
    }
  },
});
