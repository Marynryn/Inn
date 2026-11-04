/**
 * Пароли есть только у админов и аккаунтов, заведённых вручную, — а это ключ к
 * панели. Шесть символов подбирались бы перебором, двенадцать — нет.
 */
export const PASSWORD_MIN = 12;

/** Пароль из запроса — строкой; короткий — 400. */
export function requireStrongPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < PASSWORD_MIN)
    throw createError({
      statusCode: 400,
      message: `Пароль минимум ${PASSWORD_MIN} символов`,
    });
  return password;
}
