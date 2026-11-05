/** Глава без текста — ответ /api/chapters/:id?meta=1. Обработчик отдаёт три
 *  разных формы (текст, мета, всё вместе), и вывести тип по адресу TypeScript
 *  не может — страницы называют его явно. */
export type ChapterMeta = {
  id: string;
  volume: number;
  title: string;
  publishedAt: string;
  isPublished: boolean;
  commentsCount: number;
  description: string;
};
