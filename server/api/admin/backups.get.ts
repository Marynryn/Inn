import { BACKUPS_KEEP, listSnapshots } from "../../utils/backup";

/** Ночные снимки базы — чтобы в панели было видно, что они делаются. */
export default defineEventHandler(async () => ({
  keep: BACKUPS_KEEP,
  snapshots: await listSnapshots(),
}));
