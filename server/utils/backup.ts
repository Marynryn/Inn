import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import JSZip from "jszip";
import { sql } from "drizzle-orm";
import { useDb } from "./db";
import { getStorageDir } from "./storage";

/**
 * Резервные копии. Весь сайт — один файл SQLite на томе Railway плюс папки с
 * картинками и epub рядом с ним. Без копий любая беда с томом уносила бы и
 * перевод, и читателей, и обсуждения.
 *
 * Два вида копий:
 *  - снимок базы раз в сутки в storage/backups, последние BACKUPS_KEEP штук.
 *    Спасает от порчи базы, неудачной миграции, случайного удаления — но лежит
 *    на том же томе, поэтому от потери тома не спасает;
 *  - полный архив (база + все файлы) по кнопке в панели — его хозяйка уносит к
 *    себе, и это копия вне Railway.
 *
 * Как восстановить — docs/backups.md.
 */

export const BACKUPS_KEEP = 7;

/** Папки хранилища с загруженными файлами — всё, кроме самой базы. */
const FILE_DIRS = ["epubs", "avatars", "frames", "skins", "reel"];

const SNAPSHOT_RE = /^db-[\w-]+\.sqlite\.gz$/;

export const backupsDir = () => join(getStorageDir(), "backups");

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Согласованная копия базы без остановки сайта: VACUUM INTO пишет снимок на
 * момент начала, запись в базу при этом не ждёт. Путь — параметром, а не
 * вставкой в текст запроса.
 */
async function vacuumInto(path: string) {
  await useDb().run(sql`VACUUM INTO ${path}`);
}

/** Снимок базы в storage/backups, сжатый gzip. Старые сверх BACKUPS_KEEP удаляются. */
export async function makeSnapshot(): Promise<{ file: string; bytes: number }> {
  const dir = backupsDir();
  await mkdir(dir, { recursive: true });

  const raw = join(dir, `db-${stamp()}.sqlite`);
  const gz = `${raw}.gz`;
  try {
    await vacuumInto(raw);
    await pipeline(createReadStream(raw), createGzip(), createWriteStream(gz));
  } finally {
    await unlink(raw).catch(() => {});
  }

  await pruneSnapshots();
  return { file: basename(gz), bytes: (await stat(gz)).size };
}

/** Оставляет последние BACKUPS_KEEP снимков. Имена с датой сортируются по времени. */
async function pruneSnapshots() {
  const files = (await readdir(backupsDir()))
    .filter((f) => SNAPSHOT_RE.test(f))
    .sort();
  for (const old of files.slice(0, -BACKUPS_KEEP))
    await unlink(join(backupsDir(), old)).catch(() => {});
}

/** Список снимков — новые сверху. */
export async function listSnapshots() {
  const dir = backupsDir();
  const files = await readdir(dir).catch(() => [] as string[]);
  const snapshots = await Promise.all(
    files
      .filter((f) => SNAPSHOT_RE.test(f))
      .map(async (file) => ({
        file,
        bytes: (await stat(join(dir, file))).size,
      })),
  );
  return snapshots.sort((a, b) => b.file.localeCompare(a.file));
}

/** Поток, который открывает файл только когда до него дойдёт очередь: аватарок
 *  тысячи, и открыть их все разом значило бы упереться в лимит дескрипторов. */
function lazyStream(path: string) {
  return Readable.from(
    (async function* () {
      yield* createReadStream(path);
    })(),
  );
}

/**
 * Полный архив: свежий снимок базы (db.sqlite) и все папки с файлами. Файлы
 * идут в zip потоками, а не целиком в память; снимок удаляется, как только
 * архив отдан.
 */
export async function fullArchive(): Promise<{
  stream: Readable;
  filename: string;
  cleanup: () => Promise<void>;
}> {
  const dir = backupsDir();
  await mkdir(dir, { recursive: true });
  const name = stamp();
  const raw = join(dir, `download-${name}.sqlite`);
  await vacuumInto(raw);

  const zip = new JSZip();
  zip.file("db.sqlite", lazyStream(raw));
  for (const sub of FILE_DIRS) {
    const from = join(getStorageDir(), sub);
    const files = await readdir(from, { withFileTypes: true }).catch(() => []);
    // Картинки и epub уже сжаты — жать их второй раз только тратить процессор.
    for (const f of files)
      if (f.isFile())
        zip.file(`${sub}/${f.name}`, lazyStream(join(from, f.name)), {
          compression: "STORE",
        });
  }

  return {
    stream: zip.generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }) as unknown as Readable, // по типам jszip — NodeJS.ReadableStream, на деле Readable
    filename: `taverna-backup-${name}.zip`,
    cleanup: () => unlink(raw).catch(() => {}),
  };
}
