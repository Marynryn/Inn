import type { Character } from "#shared/utils/characters";

/**
 * Огонёк на карточке персонажа — общий для страницы персонажей и игры: обе
 * открывают одну и ту же карточку. Зажигаем сразу, не дожидаясь сервера, —
 * ответ только сверяет счётчик. Не вышло — откатываем.
 */
export function useCharacterFlame() {
  const busy = new Set<string>();

  return async (c: Character) => {
    if (busy.has(c.id)) return;
    busy.add(c.id);
    const before = { lit: c.lit, flames: c.flames };
    c.lit = !c.lit;
    c.flames += c.lit ? 1 : -1;
    try {
      const res = await $fetch<{ lit: boolean; flames: number }>(
        `/api/characters/${c.id}/flame`,
        { method: "POST" },
      );
      c.lit = res.lit;
      c.flames = res.flames;
    } catch {
      Object.assign(c, before);
    } finally {
      busy.delete(c.id);
    }
  };
}

/**
 * Чьи огоньки зажёг этот человек — отдельным запросом из браузера. В общем
 * списке карточек их нет, чтобы список был одинаков для всех и годился для
 * общего кеша. Не вышло — все огоньки просто остаются погашенными.
 */
export async function loadMyFlames(): Promise<Set<string>> {
  try {
    const { ids } = await $fetch<{ ids: string[] }>("/api/characters/lit");
    return new Set(ids);
  } catch {
    return new Set();
  }
}
