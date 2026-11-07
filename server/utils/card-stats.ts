import { sql } from "drizzle-orm";
import { cardGameDays } from "../database/schema";
import { useDb } from "./db";
import { mskDay } from "./msk";

export type CardGameMode = "computer" | "online";

/** Доигранная партия в карты — плюс один к счётчику дня. Ошибку базы
 *  глотаем: из-за статистики партия ломаться не должна. */
export function recordCardGame(mode: CardGameMode) {
  return useDb()
    .insert(cardGameDays)
    .values({ day: mskDay(), mode, finished: 1 })
    .onConflictDoUpdate({
      target: [cardGameDays.day, cardGameDays.mode],
      set: { finished: sql`finished + 1` },
    })
    .catch(() => {});
}
