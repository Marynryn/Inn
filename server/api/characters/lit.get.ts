import { myFlames } from "../../utils/character-flames";

/**
 * Кому этот человек зажёг огонёк: вошедший — по аккаунту, гость — по IP.
 * Личный ответ, поэтому отдельно от общего списка карточек: страница
 * спрашивает его из браузера после загрузки.
 */
export default defineEventHandler(async (event) => ({
  ids: await myFlames(event),
}));
