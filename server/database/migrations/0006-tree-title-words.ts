import { addColumn, type Migration } from "./helpers";

/**
 * Из каких слов собран титул — номера слов ёлки по местам, JSON вида
 * {"adj":3,"noun":17,"tail":40}. Нужен, чтобы в свой титул можно было
 * поставить одно слово из нового: прилагательное тогда перестраивается под
 * род, а это без самих слов не сделать. У титула без них (пусто) слово не
 * заменить — только взять новый целиком.
 */
export const treeTitleWords: Migration = {
  version: 6,
  name: "слова титула с ёлки",
  async up(db) {
    await addColumn(db, "user_titles", "words", "TEXT");
  },
};
