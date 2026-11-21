import { requireAdmin } from "../../../../utils/admin-access";
import { deleteTitle } from "../../../../utils/tree";

/** Убрать титул: из коллекции, с доски и с того, кто его носит. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, "id"));
  if (!Number.isInteger(id) || !(await deleteTitle(id)))
    throw createError({ statusCode: 404, message: "Такого титула нет" });
  return { ok: true };
});
