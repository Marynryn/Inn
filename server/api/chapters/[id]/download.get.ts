import { useDb } from "../../../utils/db";
import {
  chapterDownloadDays,
  chapters,
  chapterStats,
} from "../../../database/schema";
import { eq, sql } from "drizzle-orm";
import { readFile } from "fs/promises";
import { basename, join, resolve } from "path";
import { getStorageDir } from "../../../utils/storage";

export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, "id")!;
  const db = useDb();

  const id = await resolveChapterId(db, param);
  if (!id) throw createError({ statusCode: 404, message: "Глава не найдена" });

  const [chapter] = await db
    .select({
      id: chapters.id,
      title: chapters.title,
      epubPath: chapters.epubPath,
      isPublished: chapters.isPublished,
    })
    .from(chapters)
    .where(eq(chapters.id, id));

  if (!chapter)
    throw createError({ statusCode: 404, message: "Глава не найдена" });

  const session = await getUserSession(event);
  if (!chapter.isPublished && session.user?.role !== "admin") {
    throw createError({ statusCode: 404, message: "Глава не найдена" });
  }

  if (!chapter.epubPath)
    throw createError({
      statusCode: 404,
      message: "epub для этой главы недоступен",
    });

  // Путь в базе абсолютный — каким он был на сервере при загрузке. База,
  // поднятая из копии в другой папке (локальная проверка, переезд тома), его
  // не найдёт; тогда берём файл с тем же именем из epubs/ текущего хранилища.
  const file = await readFile(resolve(chapter.epubPath)).catch(() =>
    readFile(join(getStorageDir(), "epubs", basename(chapter.epubPath!))).catch(
      () => {
        throw createError({
          statusCode: 404,
          message: "epub для этой главы недоступен",
        });
      },
    ),
  );

  const safeName = `chapter-${slugifyChapterId(id)}.epub`;
  setHeader(event, "Content-Type", "application/epub+zip");
  setHeader(event, "Content-Disposition", `attachment; filename="${safeName}"`);

  // Общий счётчик и строка за день — одной транзакцией, как у просмотров.
  // Свои скачивания администратора в дневной список не идут: это проверки, а
  // не читатели. Общую сумму они по-прежнему пополняют — так было всегда.
  if (!isBotRequest(event)) {
    const bumpTotal = db
      .insert(chapterStats)
      .values({ chapterId: id, viewsCount: 0, downloadsCount: 1 })
      .onConflictDoUpdate({
        target: chapterStats.chapterId,
        set: { downloadsCount: sql`downloads_count + 1` },
      });
    if (session.user?.role === "admin") {
      await bumpTotal;
    } else {
      await db.batch([
        bumpTotal,
        db
          .insert(chapterDownloadDays)
          .values({ chapterId: id, day: mskDay(), count: 1 })
          .onConflictDoUpdate({
            target: [chapterDownloadDays.chapterId, chapterDownloadDays.day],
            set: { count: sql`count + 1` },
          }),
      ]);
    }
  }

  return file;
});
