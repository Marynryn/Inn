import { shake } from "../../utils/tree";

/** Встряска на сегодня. Что выпадет, решает сервер — подарки в окне лишь
 *  падают к ответу, иначе титул можно было бы подделать из браузера. */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const user = session.user as { id?: number; role?: string } | undefined;
  if (!user?.id)
    throw createError({
      statusCode: 401,
      message: "Трясти ёлку могут только вошедшие",
    });

  return shake(user.id, user.role);
});
