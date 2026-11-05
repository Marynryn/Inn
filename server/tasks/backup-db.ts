import { makeSnapshot } from "../utils/backup";

/** Ночной снимок базы в storage/backups — см. utils/backup.ts. */
export default defineTask<unknown>({
  meta: {
    name: "backup-db",
    description: "Снимок базы в storage/backups, последние 7",
  },
  async run() {
    // В деве незачем копить снимки локальной базы. Снять снимок руками можно
    // всегда — кнопкой в панели (POST /api/admin/backups).
    if (import.meta.dev) return { result: { skipped: "dev" } };

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
