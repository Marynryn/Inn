import { fullArchive } from "../../utils/backup";

/**
 * Полная резервная копия одним zip: база и все загруженные файлы. Её
 * скачивают к себе — это единственная копия, которая переживёт потерю тома.
 * Права проверяет admin-guard.
 */
export default defineEventHandler(async (event) => {
  const { stream, filename, cleanup } = await fullArchive();

  setResponseHeaders(event, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });

  // Временный снимок базы убираем, когда архив отдан — или связь оборвалась.
  event.node.res.on("close", () => void cleanup());
  stream.on("error", () => void cleanup());

  return sendStream(event, stream);
});
