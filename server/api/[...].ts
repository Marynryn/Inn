/**
 * Всё под /api, для чего нет своего обработчика (/api/actuator/env от
 * сканеров, опечатка в адресе), — короткий 404. Без этого запрос проваливался
 * в общий маршрут рендера страниц, тот прогонял адрес через Vue Router и
 * отвечал страницей «Page not found». Настоящие маршруты точнее и стоят
 * впереди этого.
 */
export default defineEventHandler((event) => {
  setResponseStatus(event, 404);
  setResponseHeader(event, "Content-Type", "text/plain; charset=utf-8");
  return "Not Found";
});
