import type { AvatarFrame } from "../utils/avatarFrames";
import type { NameFigure } from "../utils/nameFigures";

/**
 * Что лежит в сессии (nuxt-auth-utils). Без этого объявления session.user —
 * пустой объект, и всюду приходилось писать `as any` или
 * `as { id?: number }`. Кладёт его toSessionUser (server/utils/identity.ts).
 */
declare module "#auth-utils" {
  interface User {
    id: number;
    email: string | null;
    role: "admin" | "reader";
    displayName: string | null;
    avatarUrl: string | null;
    // Рамка и фигурка целиком, а не id: шапка рисует аватарку из одной сессии.
    avatarFrame: AvatarFrame | null;
    figure: NameFigure | null;
  }
}

export {};
