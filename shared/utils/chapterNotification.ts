export interface NotifiableChapter {
  id: string;
  title: string;
}

/** Порядок глав по номеру, а не по дате загрузки: 4.2 идёт раньше 4.10. */
export function sortChaptersForNotification<T extends NotifiableChapter>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const [av = 0, ac = 0] = a.id.split(".").map(Number);
    const [bv = 0, bc = 0] = b.id.split(".").map(Number);
    return av - bv || ac - bc;
  });
}

/**
 * Текст уведомления в телеграм. Одна глава — с названием, несколько — диапазонами
 * по томам ("4.20-4.22 и 5.1"). Пустой список даёт пустую строку.
 */
export function buildChapterNotification(
  list: NotifiableChapter[],
  siteUrl: string,
): string {
  const byNumber = sortChaptersForNotification(list);
  if (byNumber.length === 0) return "";

  const [only] = byNumber;
  if (byNumber.length === 1 && only) {
    return `Добавлена новая глава — ${only.id} «${only.title}»\n${siteUrl}`;
  }

  const volumes = new Map<number, NotifiableChapter[]>();
  for (const ch of byNumber) {
    const vol = Number(ch.id.split(".")[0]);
    if (!volumes.has(vol)) volumes.set(vol, []);
    volumes.get(vol)!.push(ch);
  }

  const ranges = [...volumes.values()].map((group) => {
    const first = group[0]!.id;
    const last = group.at(-1)!.id;
    return first === last ? first : `${first}-${last}`;
  });

  const joined =
    ranges.length > 1
      ? `${ranges.slice(0, -1).join(", ")} и ${ranges[ranges.length - 1]}`
      : ranges[0];

  return `Добавлены новые главы: ${joined}\n${siteUrl}`;
}
